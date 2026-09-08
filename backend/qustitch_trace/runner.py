"""Trace runner: OpenQASM -> XQsim compile -> cycle-accurate simulation -> patch trace.

Purpose:
    Provide only the input/output interface that connects an external QASM
    input to the existing XQsim pipeline (compiler + simulator), observes the
    PIU (patch information unit) state and serialises it as JSON, without
    re-implementing any XQsim logic.

Important:
    The XQsim core processing/logic is not modified. This layer observes and
    formats (I/O) only.

Operational notes:
    - Intercepting ``sys.exit`` affects the whole process.
    - Concurrent runs are unsafe; the API layer serialises them.
    - Running uvicorn with ``--workers 1`` is recommended.

Returned data (top level):
    - ``input`` (the QASM as given)
    - ``compiled`` (Clifford+T QASM, the full QISA listing)
    - ``patch.initial`` (all patches) and ``patch.events``
      (PREP_INFO / MERGE_INFO / SPLIT_INFO as deltas at the moment the PIU accepts them)
    - instruction trace, derived surgery views, physical layout, logical qubit
      mapping and the Clifford+T execution trace
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

from .emulation import install_done_fix, install_emulate_mode_extensions, install_quiet_cycle_tick
from .execution_trace import build_clifford_t_execution_trace, build_logical_qubit_mapping
from .instructions import EVENT_INSTS, build_instruction_trace_entry, opcode_to_inst_name
from .json_utils import to_json_safe
from .oracle import LogicalOutcomeOracle
from .physical import build_physical_layout, capture_physical_schedule_frame
from .snapshots import PatchSnapshot, diff_patch_snapshots_with_before, take_full_patch_snapshot
from .stability import TraceMetadata, get_unit_states, intercept_sys_exit
from .summary import build_trace_summary
from .surgery import build_surgery_views
from .xqsim_bridge import ArtifactPaths, XqsimModules, artifact_paths, load_xqsim, make_job_name

logger = logging.getLogger(__name__)

TRACE_SCHEMA_VERSION = "1.1.0"
DEFAULT_CONFIG_NAME = "example_cmos_d5"
DEFAULT_MAX_CYCLES = 10_000_000
DEFAULT_MAX_PHYSICAL_SCHEDULE_FRAMES = 1000

# How often (in cycles) the wall-clock timeout is checked.
TIMEOUT_CHECK_INTERVAL = 100


@dataclass(frozen=True)
class _TraceOptions:
    """All keyword options of :func:`trace_patches_from_qasm`."""

    config_name: str
    skip_pqsim: bool
    num_shots: int
    keep_artifacts: bool
    debug_logging: bool
    max_cycles: int
    timeout_seconds: int | None
    include_physical_schedule: bool
    physical_schedule_start_cycle: int | None
    physical_schedule_end_cycle: int | None
    max_physical_schedule_frames: int
    force_logical_oracle: bool


@dataclass(frozen=True)
class _PreparedCircuit:
    """The parsed input circuit and its Clifford+T decomposition."""

    num_qasm_qubits: int
    num_compile_qubits: int
    padding_applied: bool
    qasm_for_compile: str
    clifford_t_qasm: str
    clifford_t_qasm_padded: str

    @property
    def num_lq(self) -> int:
        """Number of logical qubits: the compiled qubits plus the two ancillas."""
        return int(self.num_compile_qubits + 2)


@dataclass(frozen=True)
class _CompiledCircuit:
    """Result of running the XQsim compiler pipeline on one job."""

    job_name: str
    paths: ArtifactPaths
    compiler: Any
    qisa_lines: list[str]


@dataclass
class _CycleLoopResult:
    """Everything collected while stepping the simulator cycle by cycle."""

    events: list[dict[str, Any]] = field(default_factory=list)
    instruction_trace: list[dict[str, Any]] = field(default_factory=list)
    physical_schedule: list[dict[str, Any]] = field(default_factory=list)
    physical_schedule_truncated: bool = False
    termination_reason: str = "normal"


def _prepare_circuit(
    xq: XqsimModules, qasm_str: str, trace_meta: TraceMetadata
) -> _PreparedCircuit:
    """Parse the QASM, pad to an odd qubit count if needed and derive the Clifford+T form."""
    # 1) Parse QASM (input)
    qc_in = xq.quantum_circuit_cls.from_qasm_str(qasm_str)
    num_qasm_qubits = int(qc_in.num_qubits)

    # XQsim simulator (PIU) requires num_lq to be odd.
    num_compile_qubits = num_qasm_qubits if (num_qasm_qubits % 2 == 1) else (num_qasm_qubits + 1)
    padding_applied = num_compile_qubits != num_qasm_qubits

    if padding_applied:
        qc_compile = xq.quantum_circuit_cls(num_compile_qubits, qc_in.num_clbits)
        qc_compile.compose(qc_in, qubits=list(range(num_qasm_qubits)), inplace=True)
        qasm_for_compile = qc_compile.qasm()
        trace_meta.warnings.append(
            f"Padding applied: original {num_qasm_qubits} qubits -> {num_compile_qubits} "
            "qubits for compilation. "
            f"The last qubit (index {num_compile_qubits - 1}) is unused."
        )
    else:
        qc_compile = qc_in
        qasm_for_compile = qasm_str

    # 2) Produce "2A" Clifford+T circuit (reuse existing function)
    qc_clifford_t = xq.decompose_qc_to_clifford_t(qc_in)
    clifford_t_qasm = qc_clifford_t.qasm()

    # Clifford+T form of the padded circuit as well
    if padding_applied:
        qc_clifford_t_padded = xq.decompose_qc_to_clifford_t(qc_compile)
        clifford_t_qasm_padded = qc_clifford_t_padded.qasm()
    else:
        clifford_t_qasm_padded = clifford_t_qasm

    return _PreparedCircuit(
        num_qasm_qubits=num_qasm_qubits,
        num_compile_qubits=num_compile_qubits,
        padding_applied=padding_applied,
        qasm_for_compile=qasm_for_compile,
        clifford_t_qasm=clifford_t_qasm,
        clifford_t_qasm_padded=clifford_t_qasm_padded,
    )


def _compile_circuit(
    xq: XqsimModules,
    prepared: _PreparedCircuit,
    *,
    job_name: str,
    paths: ArtifactPaths,
) -> _CompiledCircuit:
    """3) Generate file-based artifacts using the existing compiler pipeline."""
    paths.qasm.parent.mkdir(parents=True, exist_ok=True)
    with open(paths.qasm, "w", encoding="utf-8") as f:
        f.write(prepared.qasm_for_compile)

    compiler = xq.gsc_compiler_cls()
    compiler.setup(qc_name=job_name, compile_mode=["transpile", "qisa_compile", "assemble"])
    compiler.run()

    with open(paths.qisa, encoding="utf-8") as f:
        qisa_lines = [line.rstrip("\n") for line in f.readlines() if line.strip()]

    return _CompiledCircuit(
        job_name=job_name, paths=paths, compiler=compiler, qisa_lines=qisa_lines
    )


def _setup_simulator(
    xq: XqsimModules, *, job_name: str, num_lq: int, options: _TraceOptions
) -> Any:
    """4) Instantiate the simulator for ``job_name``."""
    sim = xq.xq_simulator_cls()
    sim.setup(
        config=options.config_name,
        qbin=job_name,
        num_lq=num_lq,
        skip_pqsim=options.skip_pqsim,
        num_shots=options.num_shots,
        dump=False,
        regen=True,
        debug=False,
    )

    # Some code paths read ``emulate``; mirror ``skip_pqsim`` if it is missing.
    if not hasattr(sim, "emulate"):
        sim.emulate = bool(options.skip_pqsim)
    return sim


def _install_workarounds(
    sim: Any,
    trace_meta: TraceMetadata,
    *,
    qisa_lines: list[str],
    num_lq: int,
    options: _TraceOptions,
) -> LogicalOutcomeOracle | None:
    """Install the interface-layer workarounds in their required order.

    The quiet ``run_cycle_tick`` (unless debug logging), then the QIF/LMU
    done-fix, then (emulate mode only) the extensions that wrap the done-fixed
    LMU/PFU transfers again.
    """
    if not options.debug_logging:
        install_quiet_cycle_tick(sim)

    install_done_fix(sim, trace_meta)

    oracle: LogicalOutcomeOracle | None = None
    if options.skip_pqsim:
        oracle = install_emulate_mode_extensions(
            sim,
            trace_meta,
            qisa_lines=qisa_lines,
            num_lq=num_lq,
            force_logical_oracle=options.force_logical_oracle,
        )
    return oracle


def _check_timeout(
    sim: Any,
    trace_meta: TraceMetadata,
    result: _CycleLoopResult,
    *,
    start_time: float,
    timeout_seconds: int,
) -> None:
    elapsed = time.time() - start_time
    if elapsed > timeout_seconds:
        result.termination_reason = "timeout"
        trace_meta.warnings.append(
            f"Trace timed out after {elapsed:.1f} seconds at cycle {sim.cycle}"
        )
        trace_meta.forced_terminations.append(
            {
                "unit": "global",
                "cycle": sim.cycle,
                "reason": "timeout",
                "elapsed_seconds": elapsed,
                "states": get_unit_states(sim),
            }
        )
        raise TimeoutError(f"Trace operation timed out after {elapsed:.1f} seconds")


def _capture_physical_schedule(sim: Any, result: _CycleLoopResult, options: _TraceOptions) -> None:
    in_start = (
        options.physical_schedule_start_cycle is None
        or sim.cycle >= options.physical_schedule_start_cycle
    )
    in_end = (
        options.physical_schedule_end_cycle is None
        or sim.cycle <= options.physical_schedule_end_cycle
    )
    if in_start and in_end:
        if len(result.physical_schedule) < options.max_physical_schedule_frames:
            frame = capture_physical_schedule_frame(sim)
            if frame is not None:
                result.physical_schedule.append(frame)
        else:
            result.physical_schedule_truncated = True


def _record_accepted_instruction(
    sim: Any, result: _CycleLoopResult, *, qisa_idx: int, qisa_lines: list[str]
) -> int | None:
    """Record the instruction the PIU just accepted; return the new event seq, if any."""
    inst_name = opcode_to_inst_name(sim.param, sim.piu.input_opcode)
    instruction_entry = build_instruction_trace_entry(
        sim,
        qisa_idx=qisa_idx,
        qisa_lines=qisa_lines,
        inst_name=inst_name,
    )
    result.instruction_trace.append(instruction_entry)
    if inst_name not in EVENT_INSTS:
        return None

    event_seq = len(result.events)
    event = {
        "seq": event_seq,
        "cycle": int(sim.cycle),
        "accepted_cycle": int(sim.cycle),
        "effect_cycle_start": None,
        "effect_cycle_end": None,
        "qisa_idx": int(qisa_idx),
        "instruction_trace_idx": len(result.instruction_trace) - 1,
        "inst": inst_name,
        "qisa_raw": instruction_entry.get("raw_line"),
        "source": "xqsim",
        "patch_delta": [],
    }
    result.events.append(event)
    instruction_entry["patch_event_seq"] = event_seq
    return event_seq


def _attribute_patch_delta(
    sim: Any,
    trace_meta: TraceMetadata,
    events: list[dict[str, Any]],
    active_event_seq: int | None,
    patch_delta: list[dict[str, Any]],
) -> None:
    """Attach a patch delta to the active event, or warn if no event is active."""
    if active_event_seq is not None and 0 <= active_event_seq < len(events):
        event = events[active_event_seq]
        if event.get("effect_cycle_start") is None:
            event["effect_cycle_start"] = int(sim.cycle)
        event["effect_cycle_end"] = int(sim.cycle)
        event["cycle"] = int(sim.cycle)
        event["patch_delta"].extend(patch_delta)
    else:
        trace_meta.warnings.append(
            f"Unattributed patch state update at cycle {sim.cycle}; "
            "state advanced but no EVENT_INST was active."
        )


def _run_cycle_loop(
    sim: Any,
    trace_meta: TraceMetadata,
    *,
    options: _TraceOptions,
    start_time: float,
    qisa_lines: list[str],
    patch_initial: PatchSnapshot,
) -> _CycleLoopResult:
    """Step the simulator cycle by cycle and observe the PIU."""
    result = _CycleLoopResult()
    prev_snapshot = patch_initial
    accepted_inst_count = 0
    active_event_seq: int | None = None

    # Debug log interval (cycles)
    debug_log_interval = int(os.environ.get("XQSIM_DEBUG_LOG_INTERVAL", "1000"))

    with intercept_sys_exit():
        while not sim.sim_done:
            # Timeout check
            if options.timeout_seconds is not None and sim.cycle % TIMEOUT_CHECK_INTERVAL == 0:
                _check_timeout(
                    sim,
                    trace_meta,
                    result,
                    start_time=start_time,
                    timeout_seconds=options.timeout_seconds,
                )

            sim.run_cycle_transfer()

            if options.include_physical_schedule:
                _capture_physical_schedule(sim, result, options)

            # PIU acceptance moment
            accepted = bool(sim.piu.take_input) and (not bool(sim.piu.input_stall))
            if accepted:
                qisa_idx = accepted_inst_count
                accepted_inst_count += 1
                event_seq = _record_accepted_instruction(
                    sim, result, qisa_idx=qisa_idx, qisa_lines=qisa_lines
                )
                if event_seq is not None:
                    active_event_seq = event_seq

            sim.run_cycle_update()

            cur_snapshot = take_full_patch_snapshot(sim)
            patch_delta = diff_patch_snapshots_with_before(prev_snapshot, cur_snapshot)
            if patch_delta:
                _attribute_patch_delta(
                    sim, trace_meta, result.events, active_event_seq, patch_delta
                )
                prev_snapshot = cur_snapshot

            sim.run_cycle_tick()

            # Debug logging (optional)
            if options.debug_logging and sim.cycle % debug_log_interval == 0:
                states = get_unit_states(sim)
                logger.info(f"Cycle {sim.cycle}: {states}")
                print(f"Cycle {sim.cycle}: sim_done={sim.sim_done}", flush=True)

            # max_cycles safety net
            if sim.cycle > options.max_cycles:
                result.termination_reason = "max_cycles"
                trace_meta.warnings.append(
                    f"Simulation exceeded {options.max_cycles} cycles; terminated early."
                )
                trace_meta.forced_terminations.append(
                    {
                        "unit": "global",
                        "cycle": sim.cycle,
                        "reason": "max_cycles_exceeded",
                        "states": get_unit_states(sim),
                    }
                )
                break

    return result


def _build_response(
    sim: Any,
    trace_meta: TraceMetadata,
    *,
    options: _TraceOptions,
    qasm_str: str,
    prepared: _PreparedCircuit,
    compiled: _CompiledCircuit,
    patch_initial: PatchSnapshot,
    loop: _CycleLoopResult,
    oracle: LogicalOutcomeOracle | None,
    elapsed_time: float,
) -> dict[str, Any]:
    """5) Build the response JSON (key order is part of the output contract)."""
    events = loop.events
    instruction_trace = loop.instruction_trace
    qisa_lines = compiled.qisa_lines
    compiler = compiled.compiler

    logical_qubit_mapping = build_logical_qubit_mapping(sim, prepared.num_qasm_qubits)
    surgery_faces, surgery_seams = build_surgery_views(
        patch_initial.patches,
        events,
        instruction_trace,
    )
    trace_summary = build_trace_summary(
        patch_initial.patches,
        events,
        instruction_trace,
        surgery_seams,
    )
    physical_layout = build_physical_layout(sim)

    response: dict[str, Any] = {
        "schema_version": TRACE_SCHEMA_VERSION,
        "meta": {
            "version": 3,
            "schema_version": TRACE_SCHEMA_VERSION,
            "config": options.config_name,
            "block_type": to_json_safe(sim.param.block_type),
            "code_distance": int(sim.param.code_dist),
            "patch_grid": {
                "rows": int(sim.param.num_pchrow),
                "cols": int(sim.param.num_pchcol),
            },
            "num_patches": int(sim.param.num_pch),
            "total_cycles": int(sim.cycle),
            "elapsed_seconds": round(elapsed_time, 2),
            "termination_reason": loop.termination_reason,
            "generation_mode": {
                "skip_pqsim": bool(options.skip_pqsim),
                "physical_schedule_included": bool(options.include_physical_schedule),
                "physical_schedule_window": {
                    "start_cycle": options.physical_schedule_start_cycle,
                    "end_cycle": options.physical_schedule_end_cycle,
                    "max_frames": int(options.max_physical_schedule_frames),
                }
                if options.include_physical_schedule
                else None,
            },
            "logical_oracle": (
                {"enabled": True, "samples": oracle.samples}
                if (options.skip_pqsim and oracle is not None)
                else {"enabled": False}
            ),
            "provenance": {
                "patch": "xqsim",
                "instruction_trace": "xqsim",
                "surgery_faces": "derived",
                "surgery_seams": "derived",
                "physical_layout": "xqsim",
                "physical_schedule": (
                    "xqsim" if options.include_physical_schedule else "unavailable"
                ),
                "stabilizer_support": "unavailable",
                "syndrome": "unavailable" if options.skip_pqsim else "xqsim",
            },
            "truncation": {
                "physical_schedule": bool(loop.physical_schedule_truncated),
                "reason": (
                    "physical_schedule exceeded "
                    f"max_physical_schedule_frames={options.max_physical_schedule_frames}"
                    if loop.physical_schedule_truncated
                    else None
                ),
            },
            "trace_summary": trace_summary,
            "forced_terminations": trace_meta.forced_terminations,
            "stability_check_failures": trace_meta.stability_check_failures[:10],  # at most 10
            "warnings": trace_meta.warnings,
        },
        "input": {
            "qasm": qasm_str,
            "num_qasm_qubits": prepared.num_qasm_qubits,
            "num_compile_qubits": int(prepared.num_compile_qubits),
            "padding_applied": prepared.padding_applied,
        },
        "compiled": {
            "clifford_t_qasm": prepared.clifford_t_qasm,
            "clifford_t_qasm_padded": (
                prepared.clifford_t_qasm_padded if prepared.padding_applied else None
            ),
            "qisa": qisa_lines,
            "qbin_name": compiled.job_name,
        },
        "patch": {
            "initial": patch_initial.patches,
            "events": events,
        },
        "instruction_trace": instruction_trace,
        "surgery_faces": surgery_faces,
        "surgery_seams": surgery_seams,
        "physical_layout": physical_layout,
        "logical_qubit_mapping": logical_qubit_mapping,
        "clifford_t_execution_trace": build_clifford_t_execution_trace(
            compiler.compilation_trace,
            events,
            qisa_lines,
            int(sim.cycle),
            logical_qubit_mapping,
        )
        if hasattr(compiler, "compilation_trace")
        else {},
    }

    if options.include_physical_schedule:
        response["physical_schedule"] = loop.physical_schedule

    return response


def _cleanup_artifacts(
    paths: ArtifactPaths,
    trace_meta: TraceMetadata,
    response: dict[str, Any] | None,
) -> None:
    """6) Remove the generated qasm/qtrp/qisa/qbin files, recording any failure in ``meta``."""
    for p in paths:
        try:
            os.remove(p)
        except FileNotFoundError:
            pass
        except Exception as e:
            trace_meta.cleanup_failed = True
            trace_meta.cleanup_errors.append(f"{p}: {e}")
            logger.warning(f"Failed to cleanup {p}: {e}")

    if trace_meta.cleanup_failed and response is not None:
        response["meta"]["cleanup_failed"] = True
        response["meta"]["cleanup_errors"] = trace_meta.cleanup_errors


def trace_patches_from_qasm(
    qasm_str: str,
    *,
    config_name: str = DEFAULT_CONFIG_NAME,
    skip_pqsim: bool = True,
    num_shots: int = 1,
    keep_artifacts: bool = False,
    debug_logging: bool = False,
    max_cycles: int = DEFAULT_MAX_CYCLES,
    timeout_seconds: int | None = None,
    include_physical_schedule: bool = False,
    physical_schedule_start_cycle: int | None = None,
    physical_schedule_end_cycle: int | None = None,
    max_physical_schedule_frames: int = DEFAULT_MAX_PHYSICAL_SCHEDULE_FRAMES,
    force_logical_oracle: bool = False,
) -> dict[str, Any]:
    """Main entry: run the existing XQsim pipeline on a QASM string and return the patch trace.

    Args:
        qasm_str: Quantum circuit in OpenQASM 2.0 format.
        config_name: Config file name under ``xqsim/configs`` (without ``.json``).
        skip_pqsim: Skip the physical-qubit simulation (emulate mode).
        num_shots: Number of simulation shots.
        keep_artifacts: Keep the generated compiler files.
        debug_logging: Enable verbose debug logging.
        max_cycles: Maximum number of cycles (guards against infinite loops).
        timeout_seconds: Wall-clock timeout in seconds; ``None`` disables the check.
        include_physical_schedule: Include a sparse trace of the PSU ``output_cwdarray``.
        physical_schedule_start_cycle: First cycle of the physical-schedule window.
        physical_schedule_end_cycle: Last cycle of the physical-schedule window.
        max_physical_schedule_frames: Maximum number of physical-schedule frames.
        force_logical_oracle: Enable the logical-outcome oracle even for Clifford circuits.

    Returns:
        The patch trace as a JSON-serialisable dict.

    Raises:
        TimeoutError: If the wall-clock timeout is exceeded.
        RuntimeError: If the simulator reports an error (``sys.exit``).
    """
    start_time = time.time()
    trace_meta = TraceMetadata()
    options = _TraceOptions(
        config_name=config_name,
        skip_pqsim=skip_pqsim,
        num_shots=num_shots,
        keep_artifacts=keep_artifacts,
        debug_logging=debug_logging,
        max_cycles=max_cycles,
        timeout_seconds=timeout_seconds,
        include_physical_schedule=include_physical_schedule,
        physical_schedule_start_cycle=physical_schedule_start_cycle,
        physical_schedule_end_cycle=physical_schedule_end_cycle,
        max_physical_schedule_frames=max_physical_schedule_frames,
        force_logical_oracle=force_logical_oracle,
    )

    paths: ArtifactPaths | None = None
    response: dict[str, Any] | None = None
    try:
        # Path bootstrap and imports of the existing modules (their code is untouched)
        xq = load_xqsim()

        prepared = _prepare_circuit(xq, qasm_str, trace_meta)
        job_name = make_job_name(prepared.num_compile_qubits)
        paths = artifact_paths(job_name)
        compiled = _compile_circuit(
            xq,
            prepared,
            job_name=job_name,
            paths=paths,
        )
        sim = _setup_simulator(
            xq,
            job_name=compiled.job_name,
            num_lq=prepared.num_lq,
            options=options,
        )
        oracle = _install_workarounds(
            sim,
            trace_meta,
            qisa_lines=compiled.qisa_lines,
            num_lq=prepared.num_lq,
            options=options,
        )

        # The initial snapshot is taken after all wrappers are installed.
        patch_initial = take_full_patch_snapshot(sim)

        loop = _run_cycle_loop(
            sim,
            trace_meta,
            options=options,
            start_time=start_time,
            qisa_lines=compiled.qisa_lines,
            patch_initial=patch_initial,
        )

        elapsed_time = time.time() - start_time
        response = _build_response(
            sim,
            trace_meta,
            options=options,
            qasm_str=qasm_str,
            prepared=prepared,
            compiled=compiled,
            patch_initial=patch_initial,
            loop=loop,
            oracle=oracle,
            elapsed_time=elapsed_time,
        )
        return response
    finally:
        if paths is not None and not keep_artifacts:
            _cleanup_artifacts(paths, trace_meta, response)
