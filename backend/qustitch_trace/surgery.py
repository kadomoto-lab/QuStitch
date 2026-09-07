"""Derived lattice-surgery views: seam faces and edge-level seams.

The PIU state only records ``facebd == "pp"`` as the geometric seam; the Pauli
product operand (``pchpp``) lives on the instruction. This module keeps both and
explicitly records any inferred mapping between them.
"""

from __future__ import annotations

from typing import Any

from .instructions import KIND_BY_EVENT_INST
from .json_utils import to_json_safe
from .snapshots import DIRECTIONS, OPPOSITE_DIRECTION


def patch_edge_key(row: int, col: int, face: str) -> str:
    """Return the canonical grid-edge key shared by the two patches touching a face."""
    if face == "n":
        return f"h:{row}:{col}"
    if face == "s":
        return f"h:{row + 1}:{col}"
    if face == "w":
        return f"v:{row}:{col}"
    if face == "e":
        return f"v:{row}:{col + 1}"
    return f"unknown:{row}:{col}:{face}"


def edge_axis(edge_key: str) -> str:
    """Return ``"horizontal"`` for ``h:`` edge keys and ``"vertical"`` otherwise."""
    return "horizontal" if edge_key.startswith("h:") else "vertical"


def parse_edge_key(edge_key: str) -> tuple[str, int, int]:
    """Split an edge key into ``(orientation, row, col)``."""
    orientation, row, col = edge_key.split(":")
    return orientation, int(row), int(col)


def neighbor_coord(row: int, col: int, face: str) -> tuple[int, int]:
    """Return the grid coordinate of the patch on the other side of ``face``."""
    if face == "n":
        return row - 1, col
    if face == "s":
        return row + 1, col
    if face == "w":
        return row, col - 1
    if face == "e":
        return row, col + 1
    return row, col


def non_identity_paulis(values: Any) -> list[str]:
    """Return the sorted, de-duplicated non-identity Pauli labels in ``values``."""
    if not isinstance(values, list):
        return []
    return sorted({str(value) for value in values if value not in (None, "I")})


def patch_state_after_events(
    initial_patches: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> list[dict[int, dict[str, Any]]]:
    """Replay patch deltas and return the full patch state after each event."""
    states: list[dict[int, dict[str, Any]]] = []
    current = {
        int(patch.get("pchidx", index)): patch for index, patch in enumerate(initial_patches)
    }

    for event in events:
        current = dict(current)
        for patch in event.get("patch_delta", []):
            if patch.get("pchidx") is None:
                continue
            current[int(patch["pchidx"])] = patch
        states.append(current)

    return states


def coord_patch_map(state: dict[int, dict[str, Any]]) -> dict[tuple[int, int], dict[str, Any]]:
    """Index a patch state by ``(row, col)``."""
    return {(int(patch.get("row", 0)), int(patch.get("col", 0))): patch for patch in state.values()}


def _edge_endpoint(patch: dict[str, Any], face: str, row: int, col: int) -> dict[str, Any]:
    operation = patch.get("operation") or {}
    return {
        "pchidx": int(patch.get("pchidx", -1)),
        "row": row,
        "col": col,
        "face": face,
        "facebd": "pp",
        "pchtype": patch.get("pchtype"),
        "pchpp": non_identity_paulis(operation.get("pchpp", [])),
        "pchop": to_json_safe(operation.get("pchop", [])),
        "pchmreg": to_json_safe(operation.get("pchmreg", [])),
    }


def pp_edges_for_state(state: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    """List every grid edge that currently carries a ``pp`` face boundary."""
    coord_map = coord_patch_map(state)
    emitted_edges = set()
    edges: list[dict[str, Any]] = []

    for patch in state.values():
        pchidx = patch.get("pchidx")
        if pchidx is None:
            continue

        row = int(patch.get("row", 0))
        col = int(patch.get("col", 0))
        facebd = patch.get("facebd", {}) or {}

        for face in DIRECTIONS:
            if facebd.get(face) != "pp":
                continue

            edge_key = patch_edge_key(row, col, face)
            if edge_key in emitted_edges:
                continue
            emitted_edges.add(edge_key)
            orientation, edge_row, edge_col = parse_edge_key(edge_key)

            endpoints = [_edge_endpoint(patch, face, row, col)]

            neighbor_row, neighbor_col = neighbor_coord(row, col, face)
            neighbor = coord_map.get((neighbor_row, neighbor_col))
            if neighbor is not None:
                opposite = OPPOSITE_DIRECTION[face]
                neighbor_facebd = neighbor.get("facebd", {}) or {}
                if neighbor_facebd.get(opposite) == "pp":
                    endpoints.append(
                        _edge_endpoint(
                            neighbor,
                            opposite,
                            int(neighbor.get("row", neighbor_row)),
                            int(neighbor.get("col", neighbor_col)),
                        )
                    )

            edges.append(
                {
                    "edge_key": edge_key,
                    "id": edge_key,
                    "orientation": orientation,
                    "row": edge_row,
                    "col": edge_col,
                    "axis": edge_axis(edge_key),
                    "boundary": "pp",
                    "endpoints": endpoints,
                }
            )

    return edges


def merge_pauli(existing: dict[str, Any], pauli: str) -> None:
    """Add ``pauli`` to a seam's ``paulis`` set and refresh its scalar ``pauli`` field."""
    if pauli in (None, "I"):
        return
    paulis = set(existing.get("paulis", []))
    paulis.add(str(pauli))
    sorted_paulis = sorted(paulis)
    existing["paulis"] = sorted_paulis
    existing["pauli"] = sorted_paulis[0] if len(sorted_paulis) == 1 else None


def _instruction_patches(instruction: dict[str, Any]) -> dict[Any, dict[str, Any]]:
    return {
        patch.get("pchidx"): patch
        for patch in instruction.get("patches", [])
        if patch.get("pchidx") is not None
    }


def _build_surgery_face(
    event: dict[str, Any],
    inst: str,
    instruction_patches: dict[Any, dict[str, Any]],
) -> dict[str, Any]:
    patch_entries = []
    paulis = set()

    for patch in event.get("patch_delta", []):
        pchidx = patch.get("pchidx")
        inst_patch = instruction_patches.get(pchidx, {})
        patch_paulis = [str(pp) for pp in inst_patch.get("pchpp", []) if pp not in (None, "I")]
        paulis.update(patch_paulis)

        active_faces = [
            direction
            for direction, boundary in patch.get("facebd", {}).items()
            if boundary not in (None, "", "i")
        ]
        patch_entries.append(
            {
                "pchidx": int(pchidx),
                "row": int(patch.get("row", 0)),
                "col": int(patch.get("col", 0)),
                "faces": active_faces,
                "pp_faces": [
                    direction
                    for direction, boundary in patch.get("facebd", {}).items()
                    if boundary == "pp"
                ],
                "facebd": patch.get("facebd", {}),
                "pchpp": patch_paulis,
            }
        )

    sorted_paulis = sorted(paulis)
    return {
        "id": f"sf-{event.get('seq')}",
        "cycle": int(event.get("cycle", 0)),
        "event_seq": int(event.get("seq", 0)),
        "qisa_idx": event.get("qisa_idx"),
        "kind": KIND_BY_EVENT_INST[inst],
        "inst": inst,
        "pauli": sorted_paulis[0] if len(sorted_paulis) == 1 else None,
        "paulis": sorted_paulis,
        "patches": patch_entries,
        "source": "derived",
        "inferred": True,
    }


def _seam_from_edge(event: dict[str, Any], inst: str, edge: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(edge["edge_key"]),
        "edge_key": edge["edge_key"],
        "orientation": edge["orientation"],
        "row": edge["row"],
        "col": edge["col"],
        "axis": edge["axis"],
        "boundary": edge["boundary"],
        "cycle": int(event.get("cycle", 0)),
        "event_seq": int(event.get("seq", 0)),
        "qisa_idx": event.get("qisa_idx"),
        "instruction_trace_idx": event.get("instruction_trace_idx"),
        "kind": KIND_BY_EVENT_INST[inst],
        "inst": inst,
        "pauli": None,
        "paulis": [],
        "endpoints": edge["endpoints"],
        "source": "derived",
        "inferred": False,
        "reason": "facebd_pp_current_state",
    }


def _link_merge_operands_to_edges(
    events: list[dict[str, Any]],
    instruction_by_qisa: dict[Any, dict[str, Any]],
    states_after_events: list[dict[int, dict[str, Any]]],
    seam_by_event_edge: dict[tuple[int, str], dict[str, Any]],
) -> None:
    """Attach MERGE_INFO operand Paulis to the nearest later ``pp`` edge of the same patch."""
    for event_index, event in enumerate(events):
        inst = event.get("inst")
        if inst != "MERGE_INFO":
            continue

        instruction = instruction_by_qisa.get(event.get("qisa_idx"), {})
        operand_paulis = {
            int(patch.get("pchidx")): non_identity_paulis(patch.get("pchpp", []))
            for patch in instruction.get("patches", [])
            if patch.get("pchidx") is not None and non_identity_paulis(patch.get("pchpp", []))
        }
        if not operand_paulis:
            continue

        for pchidx, paulis in operand_paulis.items():
            for future_index in range(event_index, len(events)):
                future_event = events[future_index]
                if future_index > event_index and future_event.get("inst") == "MERGE_INFO":
                    break

                matched_edges = [
                    edge
                    for edge in pp_edges_for_state(states_after_events[future_index])
                    if any(participant.get("pchidx") == pchidx for participant in edge["endpoints"])
                ]
                if not matched_edges:
                    continue

                for edge in matched_edges:
                    seam_key = (int(future_event.get("seq", 0)), edge["edge_key"])
                    seam = seam_by_event_edge.get(seam_key)
                    if seam is None:
                        continue
                    for pauli in paulis:
                        merge_pauli(seam, pauli)
                    seam["source"] = "inferred"
                    seam["inferred"] = True
                    seam["source_event_seq"] = int(event.get("seq", 0))
                    seam["source_qisa_idx"] = event.get("qisa_idx")
                    seam["source_inst"] = inst
                    seam["reason"] = (
                        "merge_pchpp_operand_linked_to_nearest_pp_edge_containing_same_patch"
                    )
                break


def _build_seam_entry(
    event: dict[str, Any],
    inst: str,
    instruction: dict[str, Any],
    event_edges: list[dict[str, Any]],
) -> dict[str, Any]:
    operands = []
    operand_paulis = set()
    for patch in instruction.get("patches", []):
        active_paulis = non_identity_paulis(patch.get("pchpp", []))
        if not active_paulis:
            continue
        operand_paulis.update(active_paulis)
        operands.append(
            {
                "pchidx": int(patch.get("pchidx", 0)),
                "row": int(patch.get("row", 0)),
                "col": int(patch.get("col", 0)),
                "selected": bool(patch.get("selected", False)),
                "pchpp": to_json_safe(patch.get("pchpp", [])),
                "pchop": to_json_safe(patch.get("pchop", [])),
                "pchmreg": to_json_safe(patch.get("pchmreg", [])),
                "active_paulis": active_paulis,
            }
        )

    edge_paulis = {
        str(pauli)
        for edge in event_edges
        for pauli in edge.get("paulis", [])
        if pauli not in (None, "I")
    }
    all_paulis = sorted(edge_paulis or operand_paulis)
    has_inferred_edge = any(bool(edge.get("inferred")) for edge in event_edges)

    return {
        "id": f"seam-{event.get('seq')}",
        "event_seq": int(event.get("seq", 0)),
        "cycle": int(event.get("cycle", 0)),
        "accepted_cycle": event.get("accepted_cycle", event.get("cycle")),
        "effect_cycle_start": event.get("effect_cycle_start"),
        "effect_cycle_end": event.get("effect_cycle_end"),
        "qisa_idx": event.get("qisa_idx"),
        "instruction_trace_idx": event.get("instruction_trace_idx"),
        "inst": inst,
        "kind": KIND_BY_EVENT_INST[inst],
        "edge_scope": "active_after_event" if event_edges else "operation",
        "pauli": all_paulis[0] if len(all_paulis) == 1 else None,
        "paulis": all_paulis,
        "edges": event_edges,
        "operands": operands,
        "raw": {
            "qisa_raw": event.get("qisa_raw"),
            "opcode_bits": instruction.get("opcode_bits"),
        },
        "source": "inferred" if has_inferred_edge else "derived",
        "inferred": has_inferred_edge,
    }


def build_surgery_views(
    initial_patches: list[dict[str, Any]],
    events: list[dict[str, Any]],
    instruction_trace: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Derive surgery-face and edge-level seam views from XQsim patch state.

    ``facebd == "pp"`` is the geometric seam in PIU state. ``pchpp`` is the
    Pauli-product operand on logical patches. This function preserves both and
    explicitly records any inferred mapping between them.

    Returns ``(surgery_faces, surgery_seams)``.
    """
    instruction_by_qisa = {
        entry.get("qisa_idx"): entry
        for entry in instruction_trace
        if entry.get("qisa_idx") is not None
    }
    faces: list[dict[str, Any]] = []
    states_after_events = patch_state_after_events(initial_patches, events)
    seam_by_event_edge: dict[tuple[int, str], dict[str, Any]] = {}

    for event_index, event in enumerate(events):
        inst = event.get("inst")
        if inst not in KIND_BY_EVENT_INST:
            continue

        instruction = instruction_by_qisa.get(event.get("qisa_idx"), {})
        instruction_patches = _instruction_patches(instruction)
        faces.append(_build_surgery_face(event, inst, instruction_patches))

        state = states_after_events[event_index]
        for edge in pp_edges_for_state(state):
            seam_key = (int(event.get("seq", 0)), edge["edge_key"])
            seam_by_event_edge[seam_key] = _seam_from_edge(event, inst, edge)

            for participant in edge["endpoints"]:
                inst_patch = instruction_patches.get(participant.get("pchidx"), {})
                for pauli in non_identity_paulis(inst_patch.get("pchpp", [])):
                    merge_pauli(seam_by_event_edge[seam_key], pauli)
                    seam_by_event_edge[seam_key]["reason"] = "same_event_operand_patch_pp_edge"

    _link_merge_operands_to_edges(
        events, instruction_by_qisa, states_after_events, seam_by_event_edge
    )

    flat_edges = sorted(
        seam_by_event_edge.values(),
        key=lambda item: (int(item.get("event_seq", 0)), str(item.get("edge_key", ""))),
    )
    edges_by_event: dict[int, list[dict[str, Any]]] = {}
    for edge in flat_edges:
        edges_by_event.setdefault(int(edge.get("event_seq", 0)), []).append(edge)

    seams: list[dict[str, Any]] = []
    for event in events:
        inst = event.get("inst")
        if inst not in KIND_BY_EVENT_INST:
            continue

        instruction = instruction_by_qisa.get(event.get("qisa_idx"), {})
        event_edges = edges_by_event.get(int(event.get("seq", 0)), [])
        seams.append(_build_seam_entry(event, inst, instruction, event_edges))

    return faces, seams
