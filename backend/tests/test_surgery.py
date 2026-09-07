"""Tests for ``qustitch_trace.surgery`` (synthetic data plus fixture regression)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from qustitch_trace.summary import build_trace_summary
from qustitch_trace.surgery import (
    build_surgery_views,
    edge_axis,
    merge_pauli,
    neighbor_coord,
    non_identity_paulis,
    parse_edge_key,
    patch_edge_key,
    patch_state_after_events,
    pp_edges_for_state,
)


def _dumps(value: Any) -> str:
    # Key-order sensitive serialisation, as the frontend files are written.
    return json.dumps(value, ensure_ascii=False, indent=2)


def _patch(pchidx: int, row: int, col: int, facebd: dict[str, str], **operation: Any) -> dict:
    return {
        "pchidx": pchidx,
        "row": row,
        "col": col,
        "pchtype": "zt",
        "facebd": facebd,
        "operation": {
            "pchop": operation.get("pchop", ["1111", "1111"]),
            "pchmreg": operation.get("pchmreg", [0, 0]),
            "pchpp": operation.get("pchpp", ["I", "I"]),
        },
    }


def test_edge_keys_are_shared_between_neighbours() -> None:
    assert patch_edge_key(1, 2, "n") == "h:1:2"
    assert patch_edge_key(0, 2, "s") == "h:1:2"
    assert patch_edge_key(1, 2, "w") == "v:1:2"
    assert patch_edge_key(1, 1, "e") == "v:1:2"
    assert patch_edge_key(0, 0, "x") == "unknown:0:0:x"
    assert parse_edge_key("h:3:4") == ("h", 3, 4)
    assert edge_axis("h:0:0") == "horizontal"
    assert edge_axis("v:0:0") == "vertical"


def test_neighbor_coord() -> None:
    assert neighbor_coord(1, 1, "n") == (0, 1)
    assert neighbor_coord(1, 1, "s") == (2, 1)
    assert neighbor_coord(1, 1, "w") == (1, 0)
    assert neighbor_coord(1, 1, "e") == (1, 2)
    assert neighbor_coord(1, 1, "?") == (1, 1)


def test_non_identity_paulis() -> None:
    assert non_identity_paulis(["Z", "I", None, "X", "Z"]) == ["X", "Z"]
    assert non_identity_paulis("XZ") == []


def test_merge_pauli_tracks_single_and_multiple() -> None:
    seam: dict[str, Any] = {"pauli": None, "paulis": []}
    merge_pauli(seam, "I")
    assert seam == {"pauli": None, "paulis": []}
    merge_pauli(seam, "Z")
    assert seam == {"pauli": "Z", "paulis": ["Z"]}
    merge_pauli(seam, "X")
    assert seam == {"pauli": None, "paulis": ["X", "Z"]}


def test_patch_state_after_events_replays_deltas() -> None:
    initial = [_patch(0, 0, 0, {"w": "x", "n": "z", "e": "x", "s": "z"})]
    changed = _patch(0, 0, 0, {"w": "x", "n": "z", "e": "pp", "s": "z"})
    states = patch_state_after_events(initial, [{"patch_delta": [changed]}, {"patch_delta": []}])
    assert len(states) == 2
    assert states[0][0]["facebd"]["e"] == "pp"
    assert states[1][0] is changed
    assert initial[0]["facebd"]["e"] == "x"


def test_pp_edges_pair_opposite_faces() -> None:
    left = _patch(0, 0, 0, {"w": "x", "n": "z", "e": "pp", "s": "z"}, pchpp=["Z", "I"])
    right = _patch(1, 0, 1, {"w": "pp", "n": "z", "e": "x", "s": "z"}, pchpp=["X", "I"])
    lonely = _patch(2, 1, 0, {"w": "x", "n": "pp", "e": "x", "s": "z"})
    edges = pp_edges_for_state({0: left, 1: right, 2: lonely})

    assert [edge["edge_key"] for edge in edges] == ["v:0:1", "h:1:0"]
    shared = edges[0]
    assert shared["axis"] == "vertical" and shared["boundary"] == "pp"
    assert [(e["pchidx"], e["face"]) for e in shared["endpoints"]] == [(0, "e"), (1, "w")]
    assert shared["endpoints"][0]["pchpp"] == ["Z"]
    assert shared["endpoints"][1]["pchpp"] == ["X"]
    assert list(shared["endpoints"][0]) == [
        "pchidx",
        "row",
        "col",
        "face",
        "facebd",
        "pchtype",
        "pchpp",
        "pchop",
        "pchmreg",
    ]
    # The lonely patch faces the grid boundary: a single endpoint.
    assert len(edges[1]["endpoints"]) == 1


def test_build_surgery_views_links_merge_operands_to_edges() -> None:
    initial = [
        _patch(0, 0, 0, {"w": "x", "n": "z", "e": "x", "s": "z"}),
        _patch(1, 0, 1, {"w": "x", "n": "z", "e": "x", "s": "z"}),
    ]
    merged = [
        _patch(0, 0, 0, {"w": "x", "n": "z", "e": "pp", "s": "z"}),
        _patch(1, 0, 1, {"w": "pp", "n": "z", "e": "x", "s": "z"}),
    ]
    events = [
        {
            "seq": 0,
            "cycle": 10,
            "accepted_cycle": 9,
            "effect_cycle_start": 10,
            "effect_cycle_end": 10,
            "qisa_idx": 3,
            "instruction_trace_idx": 3,
            "inst": "MERGE_INFO",
            "qisa_raw": "MERGE_INFO [Z,X]",
            "source": "xqsim",
            "patch_delta": merged,
        },
        {
            "seq": 1,
            "cycle": 20,
            "accepted_cycle": 19,
            "effect_cycle_start": 20,
            "effect_cycle_end": 20,
            "qisa_idx": 5,
            "instruction_trace_idx": 5,
            "inst": "SPLIT_INFO",
            "qisa_raw": "SPLIT_INFO",
            "source": "xqsim",
            "patch_delta": initial,
        },
    ]
    instruction_trace = [{"qisa_idx": i, "inst": "LQI", "patches": []} for i in range(3)]
    instruction_trace.append(
        {
            "qisa_idx": 3,
            "inst": "MERGE_INFO",
            "opcode_bits": "0011",
            "patches": [
                {"pchidx": 0, "row": 0, "col": 0, "selected": True, "pchpp": ["Z", "I"]},
                {"pchidx": 1, "row": 0, "col": 1, "selected": True, "pchpp": ["X", "I"]},
            ],
        }
    )
    instruction_trace.append({"qisa_idx": 4, "inst": "RUN_ESM", "patches": []})
    instruction_trace.append({"qisa_idx": 5, "inst": "SPLIT_INFO", "patches": []})

    faces, seams = build_surgery_views(initial, events, instruction_trace)

    assert [face["id"] for face in faces] == ["sf-0", "sf-1"]
    assert faces[0]["kind"] == "merge" and faces[0]["paulis"] == ["X", "Z"]
    assert faces[0]["patches"][0]["pp_faces"] == ["e"]
    assert faces[1]["patches"] == [
        {
            "pchidx": p["pchidx"],
            "row": p["row"],
            "col": p["col"],
            "faces": ["w", "n", "e", "s"],
            "pp_faces": [],
            "facebd": p["facebd"],
            "pchpp": [],
        }
        for p in initial
    ]

    assert [seam["id"] for seam in seams] == ["seam-0", "seam-1"]
    merge_seam = seams[0]
    assert merge_seam["edge_scope"] == "active_after_event"
    assert merge_seam["paulis"] == ["X", "Z"] and merge_seam["pauli"] is None
    assert merge_seam["source"] == "inferred" and merge_seam["inferred"] is True
    assert [op["active_paulis"] for op in merge_seam["operands"]] == [["Z"], ["X"]]
    assert merge_seam["raw"] == {"qisa_raw": "MERGE_INFO [Z,X]", "opcode_bits": "0011"}
    (edge,) = merge_seam["edges"]
    assert edge["edge_key"] == "v:0:1"
    assert edge["reason"] == "merge_pchpp_operand_linked_to_nearest_pp_edge_containing_same_patch"
    assert edge["source_event_seq"] == 0 and edge["source_inst"] == "MERGE_INFO"

    split_seam = seams[1]
    assert split_seam["edge_scope"] == "operation"
    assert split_seam["edges"] == [] and split_seam["paulis"] == []
    assert split_seam["source"] == "derived" and split_seam["inferred"] is False


def test_surgery_views_match_shipped_fixture(trace_path: Path, load_trace: Any) -> None:
    """The derived views must be reproducible byte-for-byte from the raw patch data."""
    trace = load_trace(trace_path)
    faces, seams = build_surgery_views(
        trace["patch"]["initial"], trace["patch"]["events"], trace["instruction_trace"]
    )
    assert _dumps(faces) == _dumps(trace["surgery_faces"])
    assert _dumps(seams) == _dumps(trace["surgery_seams"])


def test_trace_summary_matches_shipped_fixture(trace_path: Path, load_trace: Any) -> None:
    trace = load_trace(trace_path)
    summary = build_trace_summary(
        trace["patch"]["initial"],
        trace["patch"]["events"],
        trace["instruction_trace"],
        trace["surgery_seams"],
    )
    assert _dumps(summary) == _dumps(trace["meta"]["trace_summary"])
