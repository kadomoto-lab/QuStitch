"""Interface-layer workarounds installed on a live XQsim simulator instance.

Nothing here modifies the vendored XQsim modules. The functions wrap unit
``transfer`` methods and ``run_cycle_tick`` on a concrete simulator object so
that (a) the simulation terminates reliably and (b) emulate mode
(``skip_pqsim``) can run circuits with T gates, which otherwise deadlock.

Emulate-mode background (T-gate feedback path starvation)
---------------------------------------------------------
For T-derived QISA (magic-state merge + LQM_FB), emulate mode stops the EDU's
decode output (``output_valid``) during the merge window; the PFU can then never
leave ``"waiting"``, the LMU's PPM_INTERPRET start condition
(aqmeas AND dqmeas AND pf) never becomes complete, and the QID keeps holding
LQM_FB while waiting for ``input_xorz`` -- a chained deadlock (it does not occur
in Clifford-only circuits). A starvation watchdog in the same style as the
done-fix force-completes the ready signals with error-free defaults
(measurement value zero, identity Pauli frame) so that interpretation finishes,
but only once the stall exceeds twice the length of a normal merge window
(about 5,600 cycles). The patch event sequence and the QISA are unaffected, but
the stubbed logical measurement values are not faithful; the logical-outcome
oracle replaces them with values sampled from an ideal logical state.
"""

from __future__ import annotations

import logging
import types
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from .oracle import LogicalOutcomeOracle
from .stability import TraceMetadata, check_system_stable, get_unit_states, safe_getattr

logger = logging.getLogger(__name__)

# Even in a normal Clifford window the LMU waits about 10,400 cycles between
# receiving the instruction (start of the window) and the data arriving
# (MEAS_INTMD at the end of the window), so the first threshold is a little
# under twice that: 20,000. In feedback circuits the upstream deadlock is
# certain, so the watchdog starts in the "engaged" state (3,000) right away.
STARVATION_FIRST_THRESHOLD = 20000
STARVATION_ENGAGED_THRESHOLD = 3000

OracleOverride = Callable[[Any], None]


def install_quiet_cycle_tick(sim: Any) -> None:
    """Replace ``run_cycle_tick`` with a print-free copy of the upstream done check."""

    def _run_cycle_tick_quiet(self: Any) -> None:
        done_cond = self.qif.done
        done_cond = done_cond and self.qid.done
        done_cond = done_cond and (self.pdu.state == "empty")
        done_cond = done_cond and (self.piu.state == "ready")
        done_cond = done_cond and (
            self.psu.state == "ready" and not self.psu.pchinfo_srmem.output_notempty
        )
        done_cond = done_cond and self.tcu.output_timebuf_empty
        done_cond = done_cond and not (bool(self.qxu.dq_meas_mem) or bool(self.qxu.aq_meas_mem))
        done_cond = done_cond and (self.pfu.state == "ready")
        done_cond = done_cond and self.lmu.done

        if done_cond:
            self.sim_done = True
        self.cycle += 1

    sim.run_cycle_tick = types.MethodType(_run_cycle_tick_quiet, sim)


def install_done_fix(sim: Any, trace_meta: TraceMetadata) -> None:
    """Interface-layer workaround: ensure simulator termination.

    The QIF and LMU ``done`` flags are forced once every instruction has been
    fetched and the whole system is observed to be stable. Each forced
    termination is recorded in ``trace_meta``.
    """
    orig_qif_transfer = sim.qif.transfer
    orig_lmu_transfer = sim.lmu.transfer

    def _qif_transfer_with_done_fix(self: Any) -> None:
        orig_qif_transfer()
        try:
            qif_all_fetched, obs = safe_getattr(self, "all_fetched", False)
            if obs and bool(qif_all_fetched):
                if check_system_stable(sim, trace_meta):
                    if not getattr(self, "done", False):
                        trace_meta.forced_terminations.append(
                            {
                                "unit": "qif",
                                "cycle": sim.cycle,
                                "reason": "system_stable",
                                "states": get_unit_states(sim),
                            }
                        )
                    self.done = True
        except Exception as e:
            logger.debug(f"QIF done fix error: {e}")

    def _lmu_transfer_with_done_fix(self: Any) -> None:
        orig_lmu_transfer()
        try:
            state, obs = safe_getattr(self, "state", None)
            if obs and state == "ready" and check_system_stable(sim, trace_meta):
                if not getattr(self, "done", False):
                    trace_meta.forced_terminations.append(
                        {
                            "unit": "lmu",
                            "cycle": sim.cycle,
                            "reason": "system_stable",
                            "states": get_unit_states(sim),
                        }
                    )
                self.done = True
        except Exception as e:
            logger.debug(f"LMU done fix error: {e}")

    sim.qif.transfer = types.MethodType(_qif_transfer_with_done_fix, sim.qif)
    sim.lmu.transfer = types.MethodType(_lmu_transfer_with_done_fix, sim.lmu)


def is_feedback_circuit(qisa_lines: list[str]) -> bool:
    """Return True if the QISA contains a feedback measurement (LQM_FB), i.e. T gates.

    For Clifford circuits the Level A/B extensions below all stay disabled and
    the behaviour is exactly the same as without them.
    """
    return any(line.strip().startswith("LQM_FB") for line in qisa_lines)


def enable_sticky_pulse_latching(sim: Any) -> None:
    """Level A: tolerate missed single-cycle valid pulses.

    Enables the opt-in extensions on the core side (``pauliframe_unit`` and
    ``logical_measurement_unit``). Unless these flags are set the core behaves
    identically to upstream.
    """
    sim.pfu.sticky_error_pulse = True
    sim.lmu.ungated_dqmeas_latch = True


def create_logical_oracle(
    trace_meta: TraceMetadata,
    num_lq: int,
    *,
    feedback_circuit: bool,
    force_logical_oracle: bool,
) -> LogicalOutcomeOracle | None:
    """Level B: create the logical-outcome oracle and record a warning.

    Measurement values are sampled from an ideal logical state and supplied to
    ``final_meas`` (the X/Z branch of LQM_FB is then decided by the true value).
    Required for feedback circuits; can also be enabled for Clifford circuits via
    ``force_logical_oracle`` (demo use, giving measurement values physical
    meaning). Returns ``None`` when the oracle is not enabled.
    """
    if not (feedback_circuit or force_logical_oracle):
        return None
    oracle = LogicalOutcomeOracle(num_lq)
    trace_meta.warnings.append(
        ("Feedback circuit detected (LQM_FB): " if feedback_circuit else "force_logical_oracle: ")
        + "emulate-mode extensions enabled — "
        + ("sticky pulse latching (PFU/LMU) and " if feedback_circuit else "")
        + "logical-outcome oracle (measurement values sampled from an "
        "ideal logical-state simulation, deterministic seed)."
    )
    return oracle


def make_oracle_override(sim: Any, oracle: LogicalOutcomeOracle | None) -> OracleOverride:
    """Build the hook that feeds oracle-sampled outcomes into the LMU.

    The returned callable is invoked after every LMU ``transfer``. While the LMU
    is interpreting an instruction it decodes the measured Pauli string from the
    instruction info (explicit X/Y/Z operators, or "T"/"1" target masks combined
    with the LQM_X/Y/Z opcode), samples it once per instruction and writes the
    bit to ``final_meas``. A no-op when ``oracle`` is ``None``.
    """
    lqm_opcode_basis: dict[str, str] = {}
    for basis_name in ("X", "Y", "Z"):
        opcode_bits = getattr(sim.param, f"LQM_{basis_name}_opcode", None)
        if opcode_bits is not None:
            lqm_opcode_basis[opcode_bits] = basis_name
    cache: dict[str, Any] = {"key": None, "bit": None}

    def oracle_override(lmu_self: Any) -> None:
        if oracle is None:
            return
        try:
            if lmu_self.state != "interpreting" or not lmu_self.instinfo_valid:
                return
            data = (lmu_self.instinfo or {}).get("data") or {}
            lpplist = [str(p) for p in (data.get("lpplist") or [])]
            if not lpplist:
                return
            key = (id(lmu_self.instinfo), "".join(lpplist))
            if cache["key"] != key:
                if any(p in ("X", "Y", "Z") for p in lpplist):
                    paulis = [p if p in ("X", "Y", "Z") else "I" for p in lpplist]
                elif any(p in ("T", "1") for p in lpplist):
                    basis = lqm_opcode_basis.get(lmu_self.measop)
                    if basis is None:
                        return
                    paulis = [basis if p in ("T", "1") else "I" for p in lpplist]
                else:
                    return
                paulis = (paulis + ["I"] * oracle.num_lq)[: oracle.num_lq]
                cache["key"] = key
                cache["bit"] = oracle.measure(paulis)
            lmu_self.final_meas = cache["bit"]
        except Exception as e:
            logger.debug(f"Logical oracle override error: {e}")

    return oracle_override


@dataclass
class _StarvationState:
    """Counters shared by the LMU and PFU starvation wrappers."""

    lmu: int = 0
    pfu: int = 0
    engaged: bool = False
    warned: bool = False
    pfu_warned: bool = False
    lmu_key: int | None = None
    lmu_last_cycle: int = -1
    pfu_last_cycle: int = -1

    @property
    def threshold(self) -> int:
        return STARVATION_ENGAGED_THRESHOLD if self.engaged else STARVATION_FIRST_THRESHOLD


def install_starvation_watchdog(
    sim: Any,
    trace_meta: TraceMetadata,
    *,
    feedback_circuit: bool,
    oracle_override: OracleOverride,
) -> None:
    """Wrap LMU/PFU ``transfer`` with the starvation watchdog (see module docstring).

    NOTE: ``run_cycle_transfer`` calls ``lmu.transfer()`` several times within one
    cycle, so the counters only advance when ``sim.cycle`` advances. Starvation is
    detected as "the same instinfo has been held for N cycles". (Counting
    consecutive ``state == ready`` cycles has a hole: the per-ESM-round state
    cycling resets the counter, so the watchdog would never fire even though the
    instruction is not progressing.)

    Must be installed after :func:`install_done_fix`, because it wraps whatever
    ``transfer`` is bound at install time.
    """
    state = _StarvationState(engaged=bool(feedback_circuit))
    orig_lmu_transfer = sim.lmu.transfer
    orig_pfu_transfer = sim.pfu.transfer

    def _lmu_transfer_with_starvation_fix(self: Any) -> None:
        try:
            info = getattr(self, "instinfo", None)
            held = bool(getattr(self, "instinfo_valid", False)) and info is not None
            key = id(info) if held else None
            if sim.cycle != state.lmu_last_cycle:
                state.lmu_last_cycle = sim.cycle
                if key is not None and key == state.lmu_key:
                    state.lmu += 1
                else:
                    state.lmu_key = key
                    state.lmu = 1 if key is not None else 0
            threshold = state.threshold
            if key is not None and state.lmu >= threshold:
                # Keep assisting every cycle until the instruction resolves (not one-shot).
                if not state.warned:
                    state.warned = True
                    state.engaged = True
                    trace_meta.warnings.append(
                        f"Emulate-mode workaround engaged at cycle {sim.cycle}: "
                        "LMU measurement inputs are force-completed with "
                        "error-free defaults while an instruction is held. "
                        "Oracle-sampled values (if enabled) replace them."
                    )
                self.aqmeas_ready = True
                self.dqmeas_ready = True
                self.pf_ready = True
        except Exception as e:
            logger.debug(f"LMU starvation fix error: {e}")
        orig_lmu_transfer()
        oracle_override(self)

    def _pfu_transfer_with_starvation_fix(self: Any) -> None:
        try:
            # Treat it as starvation when the unit stays stuck in a non-ready
            # state (waiting/updating) and never returns to ready. In normal
            # operation it passes through ready every ESM round (a non-ready
            # streak is at most one round, i.e. a few hundred cycles).
            stuck = getattr(self, "state", None) != "ready" and not bool(
                getattr(self, "input_error_valid", False)
            )
            if sim.cycle != state.pfu_last_cycle:
                state.pfu_last_cycle = sim.cycle
                state.pfu = state.pfu + 1 if stuck else 0
            threshold = state.threshold
            if state.pfu >= threshold:
                state.pfu = 0
                self.state = "ready"
                # Unless the leftover RUN_ESM opcode is cleared, the unit falls
                # straight back from ready to updating on the next cycle and the
                # termination condition never holds.
                opcode_bw = getattr(getattr(self, "config", None), "opcode_bw", None)
                if opcode_bw:
                    self.tcu_opcode_reg = "1" * int(opcode_bw)
                if not state.pfu_warned:
                    state.pfu_warned = True
                    trace_meta.warnings.append(
                        f"Emulate-mode workaround: PFU forced to ready at cycle "
                        f"{sim.cycle} (stale RUN_ESM opcode cleared) to allow "
                        "simulation termination."
                    )
        except Exception as e:
            logger.debug(f"PFU starvation fix error: {e}")
        orig_pfu_transfer()

    sim.lmu.transfer = types.MethodType(_lmu_transfer_with_starvation_fix, sim.lmu)
    sim.pfu.transfer = types.MethodType(_pfu_transfer_with_starvation_fix, sim.pfu)


def install_emulate_mode_extensions(
    sim: Any,
    trace_meta: TraceMetadata,
    *,
    qisa_lines: list[str],
    num_lq: int,
    force_logical_oracle: bool,
) -> LogicalOutcomeOracle | None:
    """Install every emulate-mode (``skip_pqsim``) workaround in the required order.

    Order matters: the sticky-pulse flags and the oracle are set up first, then
    the starvation watchdog wraps the (already done-fixed) LMU/PFU ``transfer``
    methods and calls the oracle override after each LMU transfer.

    Returns the oracle instance when one was enabled, otherwise ``None``.
    """
    feedback_circuit = is_feedback_circuit(qisa_lines)
    if feedback_circuit:
        enable_sticky_pulse_latching(sim)
    oracle = create_logical_oracle(
        trace_meta,
        num_lq,
        feedback_circuit=feedback_circuit,
        force_logical_oracle=force_logical_oracle,
    )
    oracle_override = make_oracle_override(sim, oracle)
    install_starvation_watchdog(
        sim,
        trace_meta,
        feedback_circuit=feedback_circuit,
        oracle_override=oracle_override,
    )
    return oracle
