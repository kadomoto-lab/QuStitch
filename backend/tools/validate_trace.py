#!/usr/bin/env python3
"""Validate saved QuStitch trace JSON files against the trace contract.

Usage: ``python tools/validate_trace.py trace.json [more.json ...]``
(exit status 1 if any file has errors). Importable as ``validate_trace()`` and
``summarize_trace()``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DIRECTIONS = {"n", "e", "s", "w"}
OPPOSITE = {"n": "s", "s": "n", "e": "w", "w": "e"}


def unwrap_api_response(payload: dict[str, Any]) -> dict[str, Any]:
    """Accept both a bare trace and the API's ``{"result": trace}`` envelope."""
    return payload.get("result", payload)


def _edge_from_endpoint(row: int, col: int, face: str) -> str:
    if face == "n":
        return f"h:{row}:{col}"
    if face == "s":
        return f"h:{row + 1}:{col}"
    if face == "w":
        return f"v:{row}:{col}"
    if face == "e":
        return f"v:{row}:{col + 1}"
    return f"invalid:{row}:{col}:{face}"


def _parse_edge_key(edge_key: str) -> tuple[str, int, int] | None:
    parts = str(edge_key).split(":")
    if len(parts) != 3 or parts[0] not in {"h", "v"}:
        return None
    try:
        return parts[0], int(parts[1]), int(parts[2])
    except ValueError:
        return None


def _collect_values(trace: dict[str, Any]) -> dict[str, list[str]]:
    patches = list(trace.get("patch", {}).get("initial", []))
    for event in trace.get("patch", {}).get("events", []):
        patches.extend(event.get("patch_delta", []))

    values: dict[str, set[str]] = {
        "patch_types": set(),
        "facebd": set(),
        "cornerbd": set(),
        "pchpp": set(),
        "surgery_seam_paulis": set(),
    }
    for patch in patches:
        if patch.get("pchtype") is not None:
            values["patch_types"].add(str(patch["pchtype"]))
        for item in patch.get("facebd", {}).values():
            values["facebd"].add(str(item))
        for item in patch.get("cornerbd", {}).values():
            values["cornerbd"].add(str(item))
        for item in patch.get("operation", {}).get("pchpp", []):
            values["pchpp"].add(str(item))

    for instruction in trace.get("instruction_trace", []):
        for patch in instruction.get("patches", []):
            for item in patch.get("pchpp", []):
                values["pchpp"].add(str(item))

    for seam in trace.get("surgery_seams", []):
        for item in seam.get("paulis", []):
            values["surgery_seam_paulis"].add(str(item))
        for edge in seam.get("edges", []):
            for item in edge.get("paulis", []):
                values["surgery_seam_paulis"].add(str(item))

    return {key: sorted(items) for key, items in values.items()}


def _validate_patch(patch: dict[str, Any], label: str, errors: list[str]) -> None:
    for key in ["pchidx", "row", "col", "pchtype", "static_bd", "merged", "facebd", "cornerbd"]:
        if key not in patch:
            errors.append(f"{label} missing {key}")

    facebd = patch.get("facebd", {})
    if not isinstance(facebd, dict):
        errors.append(f"{label}.facebd must be an object")
    else:
        for face in DIRECTIONS:
            if face not in facebd:
                errors.append(f"{label}.facebd missing {face}")

    cornerbd = patch.get("cornerbd", {})
    if not isinstance(cornerbd, dict):
        errors.append(f"{label}.cornerbd must be an object")
    else:
        for corner in ["nw", "ne", "sw", "se"]:
            if corner not in cornerbd:
                errors.append(f"{label}.cornerbd missing {corner}")

    operation = patch.get("operation")
    if operation is not None:
        for key in ["pchop", "pchmreg", "pchpp"]:
            if key not in operation:
                errors.append(f"{label}.operation missing {key}")


def _validate_event_links(
    events: list[dict[str, Any]],
    instruction_trace: list[dict[str, Any]],
    errors: list[str],
) -> None:
    instruction_by_index = dict(enumerate(instruction_trace))
    instruction_qisa = {item.get("qisa_idx"): item for item in instruction_trace}

    last_cycle = -1
    for index, event in enumerate(events):
        for key in ["seq", "cycle", "qisa_idx", "instruction_trace_idx", "inst", "patch_delta"]:
            if key not in event:
                errors.append(f"event[{index}] missing {key}")
        if event.get("seq") != index:
            errors.append(f"event[{index}] seq mismatch: {event.get('seq')}")
        cycle = event.get("cycle", -1)
        if isinstance(cycle, int) and cycle < last_cycle:
            errors.append(f"event[{index}] cycle is not monotonic")
        if isinstance(cycle, int):
            last_cycle = cycle

        instruction = instruction_by_index.get(event.get("instruction_trace_idx"))
        if instruction is None:
            errors.append(f"event[{index}] instruction_trace_idx is invalid")
        else:
            for key in ["qisa_idx", "inst"]:
                if event.get(key) != instruction.get(key):
                    errors.append(f"event[{index}] {key} does not match instruction_trace")

        if event.get("qisa_idx") not in instruction_qisa:
            errors.append(f"event[{index}] qisa_idx has no instruction_trace link")

        for patch_index, patch in enumerate(event.get("patch_delta", [])):
            label = f"event[{index}].patch_delta[{patch_index}]"
            _validate_patch(patch, label, errors)
            if "facebd_before" not in patch or "facebd_after" not in patch:
                errors.append(f"{label} missing facebd before/after")
            if "changed_faces" not in patch:
                errors.append(f"{label} missing changed_faces")


def _validate_edge(edge: dict[str, Any], edge_label: str, errors: list[str]) -> None:
    for key in ["id", "edge_key", "orientation", "row", "col", "boundary", "endpoints"]:
        if key not in edge:
            errors.append(f"{edge_label} missing {key}")

    parsed = _parse_edge_key(edge.get("edge_key"))
    if parsed is None:
        errors.append(f"{edge_label}.edge_key is invalid: {edge.get('edge_key')}")
    else:
        orientation, row, col = parsed
        if edge.get("orientation") != orientation:
            errors.append(f"{edge_label}.orientation does not match edge_key")
        if edge.get("row") != row or edge.get("col") != col:
            errors.append(f"{edge_label}.row/col does not match edge_key")

    endpoints = edge.get("endpoints", [])
    if not isinstance(endpoints, list) or not endpoints:
        errors.append(f"{edge_label}.endpoints must be a non-empty list")
        return

    for endpoint_index, endpoint in enumerate(endpoints):
        endpoint_label = f"{edge_label}.endpoints[{endpoint_index}]"
        for key in ["pchidx", "row", "col", "face", "facebd"]:
            if key not in endpoint:
                errors.append(f"{endpoint_label} missing {key}")
        face = endpoint.get("face")
        if face not in DIRECTIONS:
            errors.append(f"{endpoint_label}.face is invalid: {face}")
            continue
        endpoint_edge = _edge_from_endpoint(
            int(endpoint.get("row", 0)),
            int(endpoint.get("col", 0)),
            str(face),
        )
        if endpoint_edge != edge.get("edge_key"):
            errors.append(f"{endpoint_label} does not lie on edge {edge.get('edge_key')}")
        if endpoint.get("facebd") != edge.get("boundary"):
            errors.append(f"{endpoint_label}.facebd does not match edge boundary")

    if len(endpoints) == 2:
        faces = [str(endpoint.get("face")) for endpoint in endpoints]
        if OPPOSITE.get(faces[0]) != faces[1]:
            errors.append(f"{edge_label}.endpoints are not opposite faces")


def _validate_surgery_seams(
    trace: dict[str, Any],
    events: list[dict[str, Any]],
    instruction_trace: list[dict[str, Any]],
    errors: list[str],
) -> None:
    seams = trace.get("surgery_seams", [])
    if not isinstance(seams, list):
        errors.append("surgery_seams must be a list")
        return

    events_by_seq = {event.get("seq"): event for event in events}
    instructions_by_index = dict(enumerate(instruction_trace))

    required_keys = [
        "id",
        "event_seq",
        "cycle",
        "qisa_idx",
        "instruction_trace_idx",
        "inst",
        "kind",
        "edges",
        "operands",
        "source",
        "inferred",
    ]
    for seam_index, seam in enumerate(seams):
        for key in required_keys:
            if key not in seam:
                errors.append(f"surgery_seams[{seam_index}] missing {key}")

        event = events_by_seq.get(seam.get("event_seq"))
        if event is None:
            errors.append(f"surgery_seams[{seam_index}] event_seq is invalid")
        else:
            for key in ["cycle", "qisa_idx", "instruction_trace_idx", "inst"]:
                if seam.get(key) != event.get(key):
                    errors.append(f"surgery_seams[{seam_index}] {key} does not match event")

        instruction = instructions_by_index.get(seam.get("instruction_trace_idx"))
        if instruction is None:
            errors.append(f"surgery_seams[{seam_index}] instruction_trace_idx is invalid")

        edges = seam.get("edges", [])
        if not isinstance(edges, list):
            errors.append(f"surgery_seams[{seam_index}].edges must be a list")
            continue

        for edge_index, edge in enumerate(edges):
            _validate_edge(edge, f"surgery_seams[{seam_index}].edges[{edge_index}]", errors)


def validate_trace(trace: dict[str, Any]) -> list[str]:
    """Return a list of contract violations (empty when the trace is valid)."""
    errors: list[str] = []

    required_top_level = [
        "schema_version",
        "meta",
        "input",
        "compiled",
        "patch",
        "instruction_trace",
        "surgery_seams",
        "physical_layout",
    ]
    for key in required_top_level:
        if key not in trace:
            errors.append(f"missing top-level key: {key}")

    meta = trace.get("meta", {})
    for key in ["schema_version", "generation_mode", "provenance", "truncation", "trace_summary"]:
        if key not in meta:
            errors.append(f"meta missing {key}")
    if trace.get("schema_version") != meta.get("schema_version"):
        errors.append("schema_version and meta.schema_version differ")

    patch = trace.get("patch", {})
    initial = patch.get("initial", [])
    events = patch.get("events", [])
    instruction_trace = trace.get("instruction_trace", [])

    if not isinstance(initial, list) or not initial:
        errors.append("patch.initial must be a non-empty list")
    else:
        for index, patch_item in enumerate(initial):
            _validate_patch(patch_item, f"patch.initial[{index}]", errors)

    if not isinstance(events, list):
        errors.append("patch.events must be a list")
        events = []
    if not isinstance(instruction_trace, list):
        errors.append("instruction_trace must be a list")
        instruction_trace = []

    _validate_event_links(events, instruction_trace, errors)
    _validate_surgery_seams(trace, events, instruction_trace, errors)

    summary = meta.get("trace_summary", {})
    counts = summary.get("counts", {}) if isinstance(summary, dict) else {}
    if counts.get("surgery_seams") != len(trace.get("surgery_seams", [])):
        errors.append("trace_summary.counts.surgery_seams does not match surgery_seams length")

    return errors


def summarize_trace(trace: dict[str, Any], path: str | None = None) -> dict[str, Any]:
    """Return a compact summary (counts, enumerated values, termination reason)."""
    values = _collect_values(trace)
    return {
        "path": path,
        "schema_version": (
            trace.get("schema_version") or trace.get("meta", {}).get("schema_version") or "0"
        ),
        "counts": {
            "patches": len(trace.get("patch", {}).get("initial", [])),
            "events": len(trace.get("patch", {}).get("events", [])),
            "instructions": len(trace.get("instruction_trace", [])),
            "surgery_seams": len(trace.get("surgery_seams", [])),
            "surgery_edges": sum(
                len(seam.get("edges", [])) for seam in trace.get("surgery_seams", [])
            ),
            "physical_schedule_frames": len(trace.get("physical_schedule", [])),
        },
        "values": values,
        "termination_reason": trace.get("meta", {}).get("termination_reason"),
    }


def load_trace(path: Path) -> dict[str, Any]:
    """Load a trace JSON file, unwrapping the API envelope if present."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    return unwrap_api_response(payload)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_paths", nargs="+", type=Path, help="Trace JSON file(s)")
    args = parser.parse_args(argv)

    failed = False
    for json_path in args.json_paths:
        trace = load_trace(json_path)
        errors = validate_trace(trace)
        summary = summarize_trace(trace, str(json_path))
        summary["errors"] = errors
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if errors:
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
