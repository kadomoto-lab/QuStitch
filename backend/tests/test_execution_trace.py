"""Tests for ``qustitch_trace.execution_trace`` with synthetic compiler output."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

from qustitch_trace.execution_trace import (
    build_clifford_t_execution_trace,
    build_logical_qubit_mapping,
    extract_sqm_operations,
)


class _Bit:
    """Mimics a pytket/qiskit bit (only ``index`` is read)."""

    def __init__(self, index: int) -> None:
        self.index = index


QISA_LINES = [
    "LQI [Z,Z,Z,Z,Z]",
    "MERGE_INFO [I,I,X,X,I]",
    "SPLIT_INFO [I,I,I,I,I]",
    "LQM_Z [-,-,-,T,-]",
    "LQM_X [-,-,T,-,-]",
]

EVENTS = [
    {"seq": 0, "cycle": 100, "qisa_idx": 1, "inst": "MERGE_INFO", "qisa_raw": QISA_LINES[1]},
    {"seq": 1, "cycle": 200, "qisa_idx": 2, "inst": "SPLIT_INFO", "qisa_raw": QISA_LINES[2]},
]

LOGICAL_QUBIT_MAPPING = [
    {"lq_idx": 0, "role": "z_ancilla"},
    {"lq_idx": 1, "role": "m_ancilla"},
    {"lq_idx": 2, "role": "data", "qubit_index": 0},
    {"lq_idx": 3, "role": "data", "qubit_index": 1},
    {"lq_idx": 4, "role": "padding", "qubit_index": 2},
]


def _op(op_type: str, block_id: str, gate_idx: int, paulis: list[str], qubits: list[int]) -> dict:
    return {
        "block_id": block_id,
        "op_type": op_type,
        "starting_gate_idx": gate_idx,
        "source_pauli_product": ["Z"],
        "source_target_qubits": [qubits[0]],
        "classical_target": qubits[0],
        "pauli_product": paulis,
        "target_qubits": qubits,
        "sign_positive": True,
        "transformation_log": [],
        "transformation_steps": [],
    }


def _compilation_trace() -> dict[str, Any]:
    circ_list = [
        ["H", [_Bit(0)]],
        ["CX", [_Bit(0), _Bit(1)]],
        ["Measure", [_Bit(0), _Bit(0)]],
        ["Measure", [_Bit(1), _Bit(1)]],
    ]
    h_log = {
        "gate_idx": 0,
        "gate": "h",
        "qubits": [0],
        "effect": "transform_pauli",
        "qubit": 0,
        "pauli_before": "Z",
        "pauli_after": "X",
        "block_id": "PPM:1",
        "output_gate_idx": 2,
        "output_op_type": "PPM",
    }
    cx_log = {
        "gate_idx": 1,
        "gate": "cx",
        "qubits": [0, 1],
        "effect": "propagate_pauli",
        "source_qubit": 0,
        "target_qubit": 1,
        "added_pauli": "X",
        "block_id": "PPM:1",
        "output_gate_idx": 2,
        "output_op_type": "PPM",
    }
    ppm = _op("PPM", "PPM:1", 2, ["X", "X"], [0, 1])
    ppm["transformation_log"] = [cx_log, h_log]
    sqm = _op("SQM", "SQM:0", 3, ["Z"], [1])
    return {
        "circ_list": circ_list,
        "ppr_operations": [],
        # The compiler lists PPMs in reverse program order (PPM first, SQM last).
        "ppm_operations": [sqm, ppm],
        "gate_transformations": [cx_log, h_log],
    }


def test_extract_sqm_operations_parses_targets_and_cycles() -> None:
    ops = extract_sqm_operations(QISA_LINES, EVENTS, total_cycles=500)
    assert ops == [
        {
            "sqm_idx": 0,
            "qisa_idx": 3,
            "basis": "Z",
            "target_qubits": [1],
            "cycle_after": 200,
            "cycle_before": 500,
        },
        {
            "sqm_idx": 1,
            "qisa_idx": 4,
            "basis": "X",
            "target_qubits": [0],
            "cycle_after": 200,
            "cycle_before": 500,
        },
    ]


def test_extract_sqm_operations_ignores_ancilla_targets() -> None:
    ops = extract_sqm_operations(["LQM_Z [T,-,-]", "LQM_FB [-,-,T]"], [], 10)
    assert len(ops) == 1 and ops[0]["target_qubits"] == []


def test_build_execution_trace_links_blocks_and_gates() -> None:
    trace = build_clifford_t_execution_trace(
        _compilation_trace(), EVENTS, QISA_LINES, 500, LOGICAL_QUBIT_MAPPING
    )

    assert trace["summary"] == {
        "total_gates": 4,
        "ppr_count": 0,
        "ppm_count": 1,
        "sqm_count": 1,
        "pauli_frame_count": 2,
        "all_gates_traced": True,
        "pauli_product_block_count": 2,
    }

    blocks = {block["block_id"]: block for block in trace["pauli_product_blocks"]}
    assert [block["block_id"] for block in trace["pauli_product_blocks"]] == ["PPM:1", "SQM:0"]

    ppm = blocks["PPM:1"]
    assert ppm["op_type"] == "ppm"
    assert ppm["source_gate"] == "measure" and ppm["source_qubits"] == [0, 0]
    assert ppm["final_pauli_product"] == ["X", "X"]
    assert ppm["cycle_start"] == 100 and ppm["cycle_end"] == 200
    assert ppm["qisa_window"]["merge_qisa_raw"] == QISA_LINES[1]
    assert ppm["qisa_window"]["split_event_seq"] == 1

    sqm = blocks["SQM:0"]
    assert sqm["op_type"] == "sqm"
    assert sqm["basis"] == "Z" and sqm["cycle_after"] == 200 and sqm["cycle_before"] == 500
    assert "cycle_start" not in sqm

    gates = trace["gates"]
    assert [gate["execution_type"] for gate in gates] == [
        "pauli_frame",
        "pauli_frame",
        "ppm",
        "sqm",
    ]
    assert gates[0]["absorbed_into"][0]["pauli_before"] == "Z"
    assert gates[0]["absorbed_into"][0]["output_op_type"] == "PPM"
    assert gates[1]["absorbed_into"][0]["added_pauli"] == "X"
    assert gates[2]["pauli_product_block_id"] == "PPM:1"
    assert gates[2]["cycle_start"] == 100 and gates[2]["cycle_end"] == 200
    assert gates[3]["pauli_product_block_id"] == "SQM:0" and gates[3]["basis"] == "Z"
    assert list(gates[2]) == [
        "gate_idx",
        "gate",
        "qubits",
        "pauli_product_block_id",
        "execution_type",
        "cycle_start",
        "cycle_end",
        "pauli_product",
        "target_qubits",
        "source_pauli_product",
        "source_target_qubits",
        "transformation_steps",
    ]


def test_windows_are_matched_by_pauli_mask_not_by_order() -> None:
    """QISA runs PPM blocks in reverse program order; windows follow the operator."""
    circ_list = [["Measure", [_Bit(0), _Bit(0)]], ["Measure", [_Bit(1), _Bit(1)]]]
    first = _op("PPM", "PPM:0", 0, ["Z", "Z"], [0, 1])
    second = _op("PPM", "PPM:1", 1, ["X", "Z"], [0, 1])
    events = [
        {"seq": 0, "cycle": 10, "qisa_idx": 0, "inst": "MERGE_INFO", "qisa_raw": "M [I,I,X,Z,I]"},
        {"seq": 1, "cycle": 20, "qisa_idx": 1, "inst": "SPLIT_INFO", "qisa_raw": "S"},
        {"seq": 2, "cycle": 30, "qisa_idx": 2, "inst": "MERGE_INFO", "qisa_raw": "M [I,I,Z,Z,I]"},
        {"seq": 3, "cycle": 40, "qisa_idx": 3, "inst": "SPLIT_INFO", "qisa_raw": "S"},
    ]
    trace = build_clifford_t_execution_trace(
        {
            "circ_list": circ_list,
            "ppr_operations": [],
            "ppm_operations": [second, first],
            "gate_transformations": [],
        },
        events,
        [],
        100,
        LOGICAL_QUBIT_MAPPING,
    )
    blocks = {block["block_id"]: block for block in trace["pauli_product_blocks"]}
    assert blocks["PPM:0"]["cycle_start"] == 30  # ZZ window is the second one
    assert blocks["PPM:1"]["cycle_start"] == 10  # XZ window is the first one


def test_no_effect_gate_and_empty_trace() -> None:
    assert build_clifford_t_execution_trace({}, [], [], 0, [])["summary"]["total_gates"] == 0
    trace = build_clifford_t_execution_trace(
        {"circ_list": [["Barrier", [_Bit(0)]]], "ppr_operations": [], "ppm_operations": []},
        [],
        [],
        0,
        [],
    )
    assert trace["gates"] == [
        {"gate_idx": 0, "gate": "barrier", "qubits": [0], "execution_type": "no_effect"}
    ]
    assert trace["summary"]["all_gates_traced"] is False


def test_build_logical_qubit_mapping_roles_and_patches() -> None:
    sim = SimpleNamespace(
        pdu=SimpleNamespace(pch_maptable=[(0, 0), (1, 1), (3, 3), (4, 5), (6, 6)]),
        param=SimpleNamespace(num_lq=5, num_pchcol=3),
        piu=SimpleNamespace(pchinfo_static_ram=[{"pchtype": f"t{i}"} for i in range(7)]),
    )
    mapping = build_logical_qubit_mapping(sim, num_qasm_qubits=2)
    assert [entry["role"] for entry in mapping] == [
        "z_ancilla",
        "m_ancilla",
        "data",
        "data",
        "padding",
    ]
    assert mapping[0]["description"] == "Magic state ancilla (Z-type)"
    assert mapping[2]["qubit_index"] == 0 and mapping[2]["description"] == "User qubit q[0]"
    assert mapping[2]["patch_indices"] == [3] and mapping[2]["patch_coords"] == [[1, 0]]
    assert mapping[3]["patch_indices"] == [4, 5]
    assert mapping[3]["patch_coords"] == [[1, 1], [1, 2]]
    assert mapping[3]["pchtype"] == "t4"
    assert mapping[4]["description"] == "Padding qubit (unused)"


def test_build_logical_qubit_mapping_without_maptable() -> None:
    sim = SimpleNamespace(pdu=SimpleNamespace(), param=None, piu=None)
    assert build_logical_qubit_mapping(sim, 1) == []


def test_sqm_blocks_in_fixture_are_consistent_with_qisa(trace_path: Path, load_trace: Any) -> None:
    trace = load_trace(trace_path)
    sqm_ops = extract_sqm_operations(
        trace["compiled"]["qisa"], trace["patch"]["events"], trace["meta"]["total_cycles"]
    )
    blocks = trace["clifford_t_execution_trace"]["pauli_product_blocks"]
    sqm_blocks = [block for block in blocks if block["op_type"] == "sqm"]
    assert len(sqm_blocks) == trace["clifford_t_execution_trace"]["summary"]["sqm_count"]
    assert len(sqm_ops) >= len(sqm_blocks)
    available = [(op["basis"], op["cycle_after"], op["cycle_before"]) for op in sqm_ops]
    for block in sqm_blocks:
        key = (block["basis"], block["cycle_after"], block["cycle_before"])
        assert key in available
        available.remove(key)
