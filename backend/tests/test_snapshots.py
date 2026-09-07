"""Tests for ``qustitch_trace.snapshots`` using a synthetic PIU."""

from __future__ import annotations

import copy
from types import SimpleNamespace
from typing import Any

from qustitch_trace.snapshots import (
    PatchSnapshot,
    diff_patch_snapshots,
    diff_patch_snapshots_with_before,
    format_cornerbd,
    format_facebd,
    format_patch_operation,
    patch_coords,
    take_full_patch_snapshot,
)

NOOP = "1111"


def make_fake_sim(num_pch: int = 2, num_pchcol: int = 2) -> Any:
    """A minimal stand-in for ``xq_simulator`` exposing the PIU registers we read."""
    piu = SimpleNamespace(
        config=SimpleNamespace(opcode_bw=4),
        pchinfo_static_ram=[{"pchtype": "zt", "z_bd": "n", "x_bd": "w"} for _ in range(num_pch)],
        facebd_ram=[["x", "z", "x", "z"] for _ in range(num_pch)],  # (w, n, e, s)
        cornerbd_ram=[["i", "i", "i", "i"] for _ in range(num_pch)],  # (nw, ne, sw, se)
        pchop_list_reg_reg=[[NOOP] * num_pch, [NOOP] * num_pch],
        pchmreg_list_reg_reg=[[0] * num_pch, [0] * num_pch],
        pchpp_list_reg_reg=[["I"] * num_pch, ["I"] * num_pch],
        merged_reg=[0] * num_pch,
        merged_mem=[0] * num_pch,
        esmon_reg=[1] * num_pch,
    )
    param = SimpleNamespace(num_pch=num_pch, num_pchcol=num_pchcol)
    return SimpleNamespace(piu=piu, param=param, cycle=0)


def test_format_facebd_orders_w_n_e_s() -> None:
    assert format_facebd(["a", "b", "c", "d"]) == {"w": "a", "n": "b", "e": "c", "s": "d"}
    assert format_facebd(["a"]) == {"w": "", "n": "", "e": "", "s": ""}


def test_format_cornerbd_orders_nw_ne_sw_se() -> None:
    assert format_cornerbd(["a", "b", "c", "d"]) == {"nw": "a", "ne": "b", "sw": "c", "se": "d"}
    assert format_cornerbd([]) == {"nw": "", "ne": "", "sw": "", "se": ""}


def test_patch_coords() -> None:
    param = SimpleNamespace(num_pchcol=3)
    assert patch_coords(param, 4) == {"row": 1, "col": 1}


def test_format_patch_operation_defaults_when_planes_missing() -> None:
    piu = SimpleNamespace(config=SimpleNamespace(opcode_bw=3), pchop_list_reg_reg=None)
    assert format_patch_operation(piu, 0) == {
        "pchop": ["111", "111"],
        "pchmreg": [0, 0],
        "pchpp": ["I", "I"],
    }


def test_take_full_patch_snapshot_shape_and_key_order() -> None:
    sim = make_fake_sim()
    snapshot = take_full_patch_snapshot(sim)
    assert isinstance(snapshot, PatchSnapshot)
    assert len(snapshot.patches) == 2
    patch = snapshot.patches[1]
    assert list(patch) == [
        "pchidx",
        "row",
        "col",
        "pchtype",
        "static_bd",
        "merged",
        "esmon",
        "facebd",
        "cornerbd",
        "operation",
    ]
    assert patch["pchidx"] == 1 and patch["row"] == 0 and patch["col"] == 1
    assert patch["static_bd"] == {"z_bd": "n", "x_bd": "w"}
    assert patch["merged"] == {"reg": 0, "mem": 0}
    assert patch["esmon"] == 1
    assert patch["facebd"] == {"w": "x", "n": "z", "e": "x", "s": "z"}
    assert patch["operation"] == {"pchop": [NOOP, NOOP], "pchmreg": [0, 0], "pchpp": ["I", "I"]}


def test_diff_reports_only_changed_patches_with_before_after() -> None:
    sim = make_fake_sim()
    before = take_full_patch_snapshot(sim)
    sim.piu.facebd_ram[1] = ["x", "z", "pp", "z"]
    sim.piu.cornerbd_ram[1] = ["i", "pp", "i", "i"]
    after = take_full_patch_snapshot(sim)

    assert diff_patch_snapshots(before, after) == [after.patches[1]]

    deltas = diff_patch_snapshots_with_before(before, after)
    assert len(deltas) == 1
    delta = deltas[0]
    assert delta["pchidx"] == 1
    assert delta["facebd_before"] == before.patches[1]["facebd"]
    assert delta["facebd_after"] == after.patches[1]["facebd"]
    assert delta["changed_faces"] == ["e"]
    assert delta["changed_corners"] == ["ne"]
    # The extra keys are appended after the plain patch keys.
    assert list(delta)[-6:] == [
        "facebd_before",
        "facebd_after",
        "cornerbd_before",
        "cornerbd_after",
        "changed_faces",
        "changed_corners",
    ]
    # Inputs are not mutated.
    assert "changed_faces" not in after.patches[1]


def test_diff_is_empty_when_nothing_changed() -> None:
    sim = make_fake_sim()
    before = take_full_patch_snapshot(sim)
    after = PatchSnapshot(patches=copy.deepcopy(before.patches))
    assert diff_patch_snapshots_with_before(before, after) == []
