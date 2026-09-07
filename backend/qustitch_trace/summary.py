"""Trace summary: enumerated values and record counts of a finished trace."""

from __future__ import annotations

from typing import Any


def iter_enum_values_from_patches(patches: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Collect the distinct patch types, boundaries and operation values seen in ``patches``."""
    patch_types = set()
    facebd = set()
    cornerbd = set()
    static_z_bd = set()
    static_x_bd = set()
    pchpp = set()
    pchop = set()

    for patch in patches:
        if patch.get("pchtype") is not None:
            patch_types.add(str(patch.get("pchtype")))
        for value in patch.get("facebd", {}).values():
            facebd.add(str(value))
        for value in patch.get("cornerbd", {}).values():
            cornerbd.add(str(value))
        static_bd = patch.get("static_bd") or {}
        if static_bd.get("z_bd") is not None:
            static_z_bd.add(str(static_bd.get("z_bd")))
        if static_bd.get("x_bd") is not None:
            static_x_bd.add(str(static_bd.get("x_bd")))
        operation = patch.get("operation") or {}
        for value in operation.get("pchpp", []):
            pchpp.add(str(value))
        for value in operation.get("pchop", []):
            pchop.add(str(value))

    return {
        "patch_types": sorted(patch_types),
        "facebd": sorted(facebd),
        "cornerbd": sorted(cornerbd),
        "static_z_bd": sorted(static_z_bd),
        "static_x_bd": sorted(static_x_bd),
        "pchpp": sorted(pchpp),
        "pchop": sorted(pchop),
    }


def build_trace_summary(
    initial_patches: list[dict[str, Any]],
    events: list[dict[str, Any]],
    instruction_trace: list[dict[str, Any]],
    surgery_seams: list[dict[str, Any]],
) -> dict[str, Any]:
    """Summarise enumerated values and counts across the whole trace."""
    all_patches = list(initial_patches)
    for event in events:
        all_patches.extend(event.get("patch_delta", []))

    enum_values = iter_enum_values_from_patches(all_patches)
    inst_values = sorted(
        {str(entry.get("inst")) for entry in instruction_trace if entry.get("inst") is not None}
    )
    event_values = sorted(
        {str(event.get("inst")) for event in events if event.get("inst") is not None}
    )
    seam_paulis = sorted(
        {
            str(pauli)
            for seam in surgery_seams
            for pauli in seam.get("paulis", [])
            if pauli not in (None, "I")
        }
    )
    seam_sources = sorted(
        {str(seam.get("source")) for seam in surgery_seams if seam.get("source") is not None}
    )

    return {
        "enum_values": {
            **enum_values,
            "instruction_insts": inst_values,
            "event_insts": event_values,
            "surgery_seam_paulis": seam_paulis,
            "surgery_seam_sources": seam_sources,
        },
        "counts": {
            "initial_patches": len(initial_patches),
            "events": len(events),
            "instructions": len(instruction_trace),
            "patch_deltas": sum(len(event.get("patch_delta", [])) for event in events),
            "surgery_seams": len(surgery_seams),
        },
    }
