"""Clifford+T execution trace: links compiler blocks to lattice-surgery windows.

The compiler (``gsc_compiler``) records how each Clifford+T gate is absorbed into
Pauli-product rotations (PPR), Pauli-product measurements (PPM) and single-qubit
measurements (SQM). This module joins that compilation trace with the observed
MERGE_INFO/SPLIT_INFO windows of the simulation.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from .json_utils import to_json_safe

logger = logging.getLogger(__name__)


def extract_sqm_operations(
    qisa_lines: list[str],
    events: list[dict[str, Any]],
    total_cycles: int,
) -> list[dict[str, Any]]:
    """Extract SQM (single-qubit measurement) operations from the QISA listing.

    Args:
        qisa_lines: ``compiled.qisa`` lines.
        events: ``patch.events`` list.
        total_cycles: total number of simulated cycles.

    Returns:
        A list of SQM operation records.
    """
    sqm_operations: list[dict[str, Any]] = []

    # Cycle of the last patch event
    last_event_cycle = 0
    for event in events:
        cycle = event.get("cycle", 0)
        if cycle > last_event_cycle:
            last_event_cycle = cycle

    # Detect LQM_X / LQM_Z instructions
    for qisa_idx, line in enumerate(qisa_lines):
        line_stripped = line.strip()
        if line_stripped.startswith("LQM_X") or line_stripped.startswith("LQM_Z"):
            # Measurement basis
            basis = "X" if line_stripped.startswith("LQM_X") else "Z"

            # Target qubits (e.g. find the "T" positions in [-,-,T,-,...])
            target_qubits = []
            if "[" in line_stripped and "]" in line_stripped:
                bracket_start = line_stripped.rfind("[")
                bracket_end = line_stripped.rfind("]")
                if bracket_start < bracket_end:
                    qubit_str = line_stripped[bracket_start + 1 : bracket_end]
                    parts = qubit_str.split(",")
                    for idx, part in enumerate(parts):
                        if part.strip() == "T":
                            # Convert lq_idx to the user qubit index:
                            # lq_idx 0 and 1 are ancillas, lq_idx >= 2 are user qubits.
                            if idx >= 2:
                                target_qubits.append(idx - 2)

            sqm_operations.append(
                {
                    "sqm_idx": len(sqm_operations),
                    "qisa_idx": qisa_idx,
                    "basis": basis,
                    "target_qubits": target_qubits,
                    "cycle_after": last_event_cycle,
                    "cycle_before": total_cycles,
                }
            )

    return sqm_operations


def _empty_execution_trace() -> dict[str, Any]:
    return {
        "gates": [],
        "pauli_product_blocks": [],
        "summary": {
            "total_gates": 0,
            "ppr_count": 0,
            "ppm_count": 0,
            "sqm_count": 0,
            "pauli_frame_count": 0,
            "all_gates_traced": False,
        },
    }


def _gate_name_and_qubits(
    circ_list: list[Any], gate_idx: int | None
) -> tuple[str | None, list[int]]:
    if gate_idx is None or gate_idx < 0 or gate_idx >= len(circ_list):
        return None, []
    gate_info = circ_list[gate_idx]
    gate_name = gate_info[0] if isinstance(gate_info, list) else str(gate_info)
    gate_args = gate_info[1] if isinstance(gate_info, list) and len(gate_info) > 1 else []
    gate_qubits: list[int] = []
    if isinstance(gate_args, (list, tuple)):
        for arg in gate_args:
            if hasattr(arg, "index"):
                gate_qubits.append(arg.index)
    return gate_name.lower(), gate_qubits


def _copy_op_block(circ_list: list[Any], op: dict[str, Any]) -> dict[str, Any]:
    source_gate_idx = op.get("starting_gate_idx")
    source_gate, source_qubits = _gate_name_and_qubits(circ_list, source_gate_idx)
    return {
        "block_id": op.get("block_id"),
        "op_type": str(op.get("op_type", "")).lower(),
        "source_gate_idx": source_gate_idx,
        "source_gate": source_gate,
        "source_qubits": source_qubits,
        "source_pauli_product": op.get("source_pauli_product", []),
        "source_target_qubits": op.get("source_target_qubits", []),
        "final_pauli_product": op.get("pauli_product", []),
        "target_qubits": op.get("target_qubits", []),
        "sign_positive": op.get("sign_positive", True),
        "classical_target": op.get("classical_target"),
        "transformation_steps": op.get("transformation_steps", []),
        "transformation_log": op.get("transformation_log", []),
    }


def _attach_lattice_window(block: dict[str, Any], pair: dict[str, Any]) -> None:
    block["cycle_start"] = pair.get("merge_cycle")
    block["cycle_end"] = pair.get("split_cycle")
    block["qisa_window"] = {
        "merge_event_seq": pair.get("merge_event_seq"),
        "merge_cycle": pair.get("merge_cycle"),
        "merge_qisa_idx": pair.get("merge_qisa_idx"),
        "merge_qisa_raw": pair.get("merge_qisa_raw"),
        "split_event_seq": pair.get("split_event_seq"),
        "split_cycle": pair.get("split_cycle"),
        "split_qisa_idx": pair.get("split_qisa_idx"),
        "split_qisa_raw": pair.get("split_qisa_raw"),
    }


def _merge_split_windows(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """List merge/split windows in chronological order.

    Assignment of windows to blocks happens later by decoding the Pauli mask
    of each MERGE_INFO instruction.
    """
    event_pairs = []
    i = 0
    while i < len(events):
        if events[i].get("inst") == "MERGE_INFO":
            merge_event = events[i]
            # Find the matching SPLIT_INFO
            for j in range(i + 1, len(events)):
                if events[j].get("inst") == "SPLIT_INFO":
                    split_event = events[j]
                    event_pairs.append(
                        {
                            "merge_event_seq": merge_event.get("seq"),
                            "merge_cycle": merge_event.get("cycle"),
                            "merge_qisa_idx": merge_event.get("qisa_idx"),
                            "merge_qisa_raw": merge_event.get("qisa_raw"),
                            "split_event_seq": split_event.get("seq"),
                            "split_cycle": split_event.get("cycle"),
                            "split_qisa_idx": split_event.get("qisa_idx"),
                            "split_qisa_raw": split_event.get("qisa_raw"),
                        }
                    )
                    i = j
                    break
        i += 1
    return event_pairs


def _decode_merge_terms(lq_to_qubit: dict[int, int], raw_line: str | None) -> frozenset | None:
    """Decode the Pauli mask of a MERGE_INFO line into ``{(qubit, pauli), ...}``."""
    if not raw_line:
        return None
    mask_match = re.search(r"\[(.*)\]", raw_line)
    if not mask_match:
        return None
    terms = []
    for lq_idx, pauli in enumerate(p.strip() for p in mask_match.group(1).split(",")):
        if pauli and pauli != "I":
            qubit = lq_to_qubit.get(lq_idx)
            if qubit is None:
                return None
            terms.append((qubit, pauli))
    return frozenset(terms)


def _assign_lattice_windows(
    lattice_ops: list[dict[str, Any]],
    event_pairs: list[dict[str, Any]],
    logical_qubit_mapping: list[dict[str, Any]],
) -> dict[int, int | None]:
    """Map ``id(op)`` of each PPR/PPM block to the index of its merge/split window.

    QISA executes PPM/PPR blocks in an order that differs from program order
    (typically reversed), so windows are not assigned by order of appearance.
    Instead the Pauli mask of each MERGE_INFO is decoded and matched against the
    block whose operator is identical. Only when decoding fails do we fall back
    to order of appearance.
    """
    lq_to_qubit: dict[int, int] = {}
    for lq_entry in logical_qubit_mapping or []:
        if lq_entry.get("role") == "data" and lq_entry.get("qubit_index") is not None:
            lq_to_qubit[int(lq_entry["lq_idx"])] = int(lq_entry["qubit_index"])

    window_terms = [
        _decode_merge_terms(lq_to_qubit, pair.get("merge_qisa_raw")) for pair in event_pairs
    ]
    window_used = [False] * len(event_pairs)
    pair_idx_for_op: dict[int, int | None] = {}
    for op in lattice_ops:
        op_terms = frozenset(
            zip(op.get("target_qubits", []), op.get("pauli_product", []), strict=False)
        )
        matched = None
        for window_idx, terms in enumerate(window_terms):
            if not window_used[window_idx] and terms is not None and terms == op_terms:
                matched = window_idx
                break
        if matched is not None:
            window_used[matched] = True
        pair_idx_for_op[id(op)] = matched
    for op in lattice_ops:
        if pair_idx_for_op[id(op)] is None:
            for window_idx in range(len(event_pairs)):
                if not window_used[window_idx]:
                    window_used[window_idx] = True
                    pair_idx_for_op[id(op)] = window_idx
                    break
    return pair_idx_for_op


def _sort_by_starting_gate(ops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        ops,
        key=lambda op: (
            op.get("starting_gate_idx") if op.get("starting_gate_idx") is not None else -1
        ),
    )


def _gate_entry(gate_idx: int, gate_info: Any) -> dict[str, Any]:
    gate_name = gate_info[0] if isinstance(gate_info, list) else str(gate_info)
    gate_args = gate_info[1] if isinstance(gate_info, list) and len(gate_info) > 1 else []

    gate_qubits = []
    if isinstance(gate_args, (list, tuple)):
        for arg in gate_args:
            if hasattr(arg, "index"):
                gate_qubits.append(arg.index)

    return {
        "gate_idx": gate_idx,
        "gate": gate_name.lower(),
        "qubits": gate_qubits,
    }


def _absorbed_into(transformations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "effect": trans.get("effect"),
            "pauli_before": trans.get("pauli_before"),
            "pauli_after": trans.get("pauli_after"),
            "qubit": trans.get("qubit"),
            "added_pauli": trans.get("added_pauli"),
            "source_qubit": trans.get("source_qubit"),
            "target_qubit": trans.get("target_qubit"),
            "block_id": trans.get("block_id"),
            "output_gate_idx": trans.get("output_gate_idx"),
            "output_op_type": trans.get("output_op_type"),
        }
        for trans in transformations
    ]


def build_clifford_t_execution_trace(
    compilation_trace: dict[str, Any],
    events: list[dict[str, Any]],
    qisa_lines: list[str],
    total_cycles: int,
    logical_qubit_mapping: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the complete execution trace of the Clifford+T circuit.

    Args:
        compilation_trace: ``gsc_compiler.compilation_trace``.
        events: ``patch.events`` list.
        qisa_lines: ``compiled.qisa`` lines.
        total_cycles: total number of simulated cycles.
        logical_qubit_mapping: logical qubit mapping (see ``build_logical_qubit_mapping``).

    Returns:
        The execution trace (gates, Pauli-product blocks and a summary).
    """
    trace = _empty_execution_trace()

    try:
        circ_list = compilation_trace.get("circ_list", [])
        ppr_operations = compilation_trace.get("ppr_operations", [])
        ppm_operations = compilation_trace.get("ppm_operations", [])
        gate_transformations = compilation_trace.get("gate_transformations", [])

        if not circ_list:
            return trace

        trace["summary"]["total_gates"] = len(circ_list)

        # gate_idx -> PPR/PPM map
        gate_to_ppr: dict[int, dict[str, Any]] = {}
        for ppr_op in ppr_operations:
            starting_idx = ppr_op.get("starting_gate_idx")
            if starting_idx is not None:
                gate_to_ppr[starting_idx] = ppr_op

        for ppm_op in ppm_operations:
            starting_idx = ppm_op.get("starting_gate_idx")
            if starting_idx is not None:
                gate_to_ppr[starting_idx] = ppm_op

        # gate_idx -> transformation history map
        gate_to_transformation: dict[int, list[dict[str, Any]]] = {}
        for trans in gate_transformations:
            gate_idx = trans.get("gate_idx")
            if gate_idx is not None:
                if gate_idx not in gate_to_transformation:
                    gate_to_transformation[gate_idx] = []
                gate_to_transformation[gate_idx].append(trans)

        # Cycle information for PPM/PPR comes from the merge/split windows.
        event_pairs = _merge_split_windows(events)

        # SQM operations
        sqm_operations = extract_sqm_operations(qisa_lines, events, total_cycles)

        # Block-level trace: this preserves the causal chain
        # source gate -> Pauli propagation steps -> final PPM/PPR/SQM.
        block_by_gate_idx: dict[int, dict[str, Any]] = {}
        ppr_ops_sorted = _sort_by_starting_gate(ppr_operations)
        ppm_ops_sorted = _sort_by_starting_gate(ppm_operations)

        lattice_ops = ppr_ops_sorted + [op for op in ppm_ops_sorted if op.get("op_type") == "PPM"]
        pair_idx_for_op = _assign_lattice_windows(lattice_ops, event_pairs, logical_qubit_mapping)

        # SQM execution order also differs from program order, so match by target qubits.
        sqm_used = [False] * len(sqm_operations)

        def _take_matching_sqm(op: dict[str, Any]) -> dict[str, Any] | None:
            targets = list(op.get("target_qubits", []))
            for sqm_i, sqm_op in enumerate(sqm_operations):
                if not sqm_used[sqm_i] and list(sqm_op.get("target_qubits", [])) == targets:
                    sqm_used[sqm_i] = True
                    return sqm_op
            for sqm_i, sqm_op in enumerate(sqm_operations):
                if not sqm_used[sqm_i]:
                    sqm_used[sqm_i] = True
                    return sqm_op
            return None

        for op in ppr_ops_sorted:
            block = _copy_op_block(circ_list, op)
            pair_idx = pair_idx_for_op.get(id(op))
            if pair_idx is not None:
                _attach_lattice_window(block, event_pairs[pair_idx])
            source_gate_idx = block.get("source_gate_idx")
            if source_gate_idx is not None:
                block_by_gate_idx[int(source_gate_idx)] = block
            trace["pauli_product_blocks"].append(block)

        for op in ppm_ops_sorted:
            block = _copy_op_block(circ_list, op)
            if op.get("op_type") == "PPM":
                pair_idx = pair_idx_for_op.get(id(op))
                if pair_idx is not None:
                    _attach_lattice_window(block, event_pairs[pair_idx])
            elif op.get("op_type") == "SQM":
                sqm_op = _take_matching_sqm(op)
                if sqm_op is not None:
                    block["basis"] = sqm_op.get("basis")
                    block["cycle_after"] = sqm_op.get("cycle_after")
                    block["cycle_before"] = sqm_op.get("cycle_before")
            source_gate_idx = block.get("source_gate_idx")
            if source_gate_idx is not None:
                block_by_gate_idx[int(source_gate_idx)] = block
            trace["pauli_product_blocks"].append(block)

        # Per-gate entries
        ppr_count = 0
        ppm_count = 0
        sqm_count = 0
        pauli_frame_count = 0

        for gate_idx, gate_info in enumerate(circ_list):
            entry = _gate_entry(gate_idx, gate_info)

            if gate_idx in gate_to_ppr:
                # This gate produces a PPR/PPM (T or Measure)
                op = gate_to_ppr[gate_idx]
                op_type = op.get("op_type", "")
                block = block_by_gate_idx.get(gate_idx)
                if block:
                    entry["pauli_product_block_id"] = block.get("block_id")

                if op_type == "PPR":
                    entry["execution_type"] = "ppr"
                    ppr_count += 1
                    if block and block.get("cycle_start") is not None:
                        entry["cycle_start"] = block["cycle_start"]
                        entry["cycle_end"] = block["cycle_end"]
                elif op_type == "PPM":
                    entry["execution_type"] = "ppm"
                    ppm_count += 1
                    if block and block.get("cycle_start") is not None:
                        entry["cycle_start"] = block["cycle_start"]
                        entry["cycle_end"] = block["cycle_end"]
                elif op_type == "SQM":
                    entry["execution_type"] = "sqm"
                    sqm_count += 1
                    if block:
                        entry["basis"] = block.get("basis")
                        entry["cycle_after"] = block.get("cycle_after")
                        entry["cycle_before"] = block.get("cycle_before")

                entry["pauli_product"] = op.get("pauli_product", [])
                entry["target_qubits"] = op.get("target_qubits", [])
                entry["source_pauli_product"] = op.get("source_pauli_product", [])
                entry["source_target_qubits"] = op.get("source_target_qubits", [])
                entry["transformation_steps"] = op.get("transformation_steps", [])

            elif gate_idx in gate_to_transformation:
                # This gate is absorbed by Pauli frame tracking (Clifford gate)
                entry["execution_type"] = "pauli_frame"
                pauli_frame_count += 1
                entry["absorbed_into"] = _absorbed_into(gate_to_transformation[gate_idx])
            else:
                # Gate without transformation history (had no effect)
                entry["execution_type"] = "no_effect"

            trace["gates"].append(entry)

        trace["summary"]["ppr_count"] = ppr_count
        trace["summary"]["ppm_count"] = ppm_count
        trace["summary"]["sqm_count"] = sqm_count
        trace["summary"]["pauli_frame_count"] = pauli_frame_count
        trace["summary"]["all_gates_traced"] = (
            ppr_count + ppm_count + sqm_count + pauli_frame_count > 0
        )
        trace["summary"]["pauli_product_block_count"] = len(trace["pauli_product_blocks"])

    except Exception as e:
        logger.warning(f"Failed to build Clifford+T execution trace: {e}")

    return trace


def build_logical_qubit_mapping(sim: Any, num_qasm_qubits: int) -> list[dict[str, Any]]:
    """Build the mapping between logical qubits and patches.

    XQsim assigns logical qubits as follows:

    - lq_idx 0: Z ancilla (magic state)
    - lq_idx 1: M ancilla (zero state)
    - lq_idx >= 2: the user's logical qubits (q[0], q[1], ...)

    Returns:
        A list of logical qubit mapping records.
    """
    mapping: list[dict[str, Any]] = []

    try:
        # Mapping table from the patch decode unit
        pch_maptable = getattr(sim.pdu, "pch_maptable", None)
        if pch_maptable is None:
            return mapping

        num_lq = sim.param.num_lq
        num_pchcol = sim.param.num_pchcol

        for lq_idx in range(num_lq):
            entry: dict[str, Any] = {
                "lq_idx": lq_idx,
            }

            # Role
            if lq_idx == 0:
                entry["role"] = "z_ancilla"
                entry["description"] = "Magic state ancilla (Z-type)"
            elif lq_idx == 1:
                entry["role"] = "m_ancilla"
                entry["description"] = "Zero state ancilla (M-type)"
            else:
                user_qubit_idx = lq_idx - 2
                if user_qubit_idx < num_qasm_qubits:
                    entry["role"] = "data"
                    entry["qubit_index"] = user_qubit_idx
                    entry["description"] = f"User qubit q[{user_qubit_idx}]"
                else:
                    entry["role"] = "padding"
                    entry["qubit_index"] = user_qubit_idx
                    entry["description"] = "Padding qubit (unused)"

            # Patch indices
            pch_tuple = pch_maptable[lq_idx] if lq_idx < len(pch_maptable) else (None, None)
            pchidx_1, pchidx_2 = pch_tuple

            if pchidx_1 is not None:
                # Patch coordinates (row, col)
                row_1, col_1 = divmod(pchidx_1, num_pchcol)
                entry["patch_indices"] = (
                    [pchidx_1] if pchidx_1 == pchidx_2 else [pchidx_1, pchidx_2]
                )
                entry["patch_coords"] = [[row_1, col_1]]

                if pchidx_1 != pchidx_2 and pchidx_2 is not None:
                    row_2, col_2 = divmod(pchidx_2, num_pchcol)
                    entry["patch_coords"].append([row_2, col_2])

                # Patch type
                pchinfo = (
                    sim.piu.pchinfo_static_ram[pchidx_1]
                    if pchidx_1 < len(sim.piu.pchinfo_static_ram)
                    else {}
                )
                entry["pchtype"] = to_json_safe(pchinfo.get("pchtype", "unknown"))

            mapping.append(entry)

    except Exception as e:
        logger.warning(f"Failed to build logical qubit mapping: {e}")

    return mapping
