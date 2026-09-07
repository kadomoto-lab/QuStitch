"""Snapshots of the XQsim patch information unit (PIU) state and their diffs.

Everything in this module is observation only: it reads PIU registers and
formats them for JSON without changing simulator behaviour.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .json_utils import to_json_safe

DIRECTIONS = ("n", "e", "s", "w")
CORNERS = ("nw", "ne", "sw", "se")
OPPOSITE_DIRECTION = {"n": "s", "s": "n", "e": "w", "w": "e"}


@dataclass(frozen=True)
class PatchSnapshot:
    """A full snapshot of all patches, used to compute deltas."""

    patches: list[dict[str, Any]]  # index aligned by pchidx


def format_facebd(facebd_list: list[str]) -> dict[str, str]:
    """Format a face-boundary list.

    Existing code uses order: (w, n, e, s).
    See: logical_measurement_unit.py unpacking.
    """
    if len(facebd_list) != 4:
        return {"w": "", "n": "", "e": "", "s": ""}
    w, n, e, s = facebd_list
    return {
        "w": to_json_safe(w),
        "n": to_json_safe(n),
        "e": to_json_safe(e),
        "s": to_json_safe(s),
    }


def format_cornerbd(cornerbd_list: list[str]) -> dict[str, str]:
    """Format a corner-boundary list.

    Existing code uses order: (nw, ne, sw, se).
    See: physical_schedule_unit.py / pauliframe_unit.py unpacking.
    """
    if len(cornerbd_list) != 4:
        return {"nw": "", "ne": "", "sw": "", "se": ""}
    nw, ne, sw, se = cornerbd_list
    return {
        "nw": to_json_safe(nw),
        "ne": to_json_safe(ne),
        "sw": to_json_safe(sw),
        "se": to_json_safe(se),
    }


def format_patch_operation(piu: Any, pchidx: int) -> dict[str, Any]:
    """Return per-patch operation fields carried by PIU pipeline registers."""
    noop = "1" * piu.config.opcode_bw

    def _list_at(attr: str, default: Any) -> Any:
        planes = getattr(piu, attr, None)
        if not planes or len(planes) < 2:
            return [default, default]
        return [
            planes[0][pchidx] if pchidx < len(planes[0]) else default,
            planes[1][pchidx] if pchidx < len(planes[1]) else default,
        ]

    return {
        "pchop": to_json_safe(_list_at("pchop_list_reg_reg", noop)),
        "pchmreg": to_json_safe(_list_at("pchmreg_list_reg_reg", 0)),
        "pchpp": to_json_safe(_list_at("pchpp_list_reg_reg", "I")),
    }


def patch_coords(param: Any, pchidx: int) -> dict[str, int]:
    """Return the (row, col) grid coordinates of a patch index."""
    row, col = divmod(int(pchidx), int(param.num_pchcol))
    return {"row": int(row), "col": int(col)}


def take_full_patch_snapshot(sim: Any) -> PatchSnapshot:
    """Read PIU internal state and format it for JSON.

    This is "observation only" (no new behavior).
    """
    piu = sim.piu
    param = sim.param

    patches: list[dict[str, Any]] = []
    for pchidx in range(param.num_pch):
        pchrow, pchcol = divmod(pchidx, param.num_pchcol)

        # static
        pchstat = piu.pchinfo_static_ram[pchidx]
        pchtype = to_json_safe(pchstat.get("pchtype"))
        static_bd = {
            "z_bd": to_json_safe(pchstat.get("z_bd")),
            "x_bd": to_json_safe(pchstat.get("x_bd")),
        }

        # dynamic boundary
        facebd = piu.facebd_ram[pchidx]
        cornerbd = piu.cornerbd_ram[pchidx]
        operation = format_patch_operation(piu, pchidx)

        # merged flags (both, as requested)
        merged_reg = int(piu.merged_reg[pchidx]) if hasattr(piu, "merged_reg") else 0
        merged_mem = int(piu.merged_mem[pchidx]) if hasattr(piu, "merged_mem") else 0
        esmon = int(piu.esmon_reg[pchidx]) if hasattr(piu, "esmon_reg") else 0

        patches.append(
            {
                "pchidx": pchidx,
                "row": int(pchrow),
                "col": int(pchcol),
                "pchtype": pchtype,
                "static_bd": static_bd,
                "merged": {"reg": merged_reg, "mem": merged_mem},
                "esmon": esmon,
                "facebd": format_facebd(facebd),
                "cornerbd": format_cornerbd(cornerbd),
                "operation": operation,
            }
        )
    return PatchSnapshot(patches=patches)


def diff_patch_snapshots(prev: PatchSnapshot, cur: PatchSnapshot) -> list[dict[str, Any]]:
    """Compute patch deltas (only changed patches).

    This is formatting/comparison only.
    """
    deltas: list[dict[str, Any]] = []
    for p_prev, p_cur in zip(prev.patches, cur.patches, strict=False):
        if p_prev != p_cur:
            deltas.append(p_cur)
    return deltas


def diff_patch_snapshots_with_before(
    prev: PatchSnapshot, cur: PatchSnapshot
) -> list[dict[str, Any]]:
    """Compute patch deltas, annotating each changed patch with its before/after boundaries."""
    deltas: list[dict[str, Any]] = []
    for p_prev, p_cur in zip(prev.patches, cur.patches, strict=False):
        if p_prev == p_cur:
            continue

        facebd_before = p_prev.get("facebd", {}) or {}
        facebd_after = p_cur.get("facebd", {}) or {}
        cornerbd_before = p_prev.get("cornerbd", {}) or {}
        cornerbd_after = p_cur.get("cornerbd", {}) or {}

        entry = dict(p_cur)
        entry["facebd_before"] = facebd_before
        entry["facebd_after"] = facebd_after
        entry["cornerbd_before"] = cornerbd_before
        entry["cornerbd_after"] = cornerbd_after
        entry["changed_faces"] = [
            face for face in DIRECTIONS if facebd_before.get(face) != facebd_after.get(face)
        ]
        entry["changed_corners"] = [
            corner
            for corner in CORNERS
            if cornerbd_before.get(corner) != cornerbd_after.get(corner)
        ]
        deltas.append(entry)
    return deltas
