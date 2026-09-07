"""Physical-layer views: the qubit-plane layout and sparse PSU schedule frames."""

from __future__ import annotations

from typing import Any

import numpy as np

from .instructions import opcode_to_inst_name
from .json_utils import to_json_safe


def build_physical_layout(sim: Any) -> dict[str, Any]:
    """Describe the patch grid, unit cells and qubit plane of the simulated device."""
    param = sim.param
    return {
        "source": "xqsim",
        "code_distance": int(param.code_dist),
        "patch_grid": {
            "rows": int(param.num_pchrow),
            "cols": int(param.num_pchcol),
            "num_patches": int(param.num_pch),
        },
        "unit_cell": {
            "rows_per_patch": int(param.num_ucrow),
            "cols_per_patch": int(param.num_uccol),
            "qubits_per_cell": int(param.num_qb_per_uc),
        },
        "qubit_plane": {
            "aq_rows": int(param.num_aqrow),
            "aq_cols": int(param.num_aqcol),
            "dq_rows": int(param.num_dqrow),
            "dq_cols": int(param.num_dqcol),
            "aq_per_patch": int(param.num_pchaq),
            "dq_per_patch": int(getattr(param, "num_pchdq", param.qb_plane.get("num_pchdq"))),
        },
        "indexing": {
            "cwdarray_order": ["patch_row", "patch_col", "uc_row", "uc_col", "qbidx"],
            "qbidx_kind": {
                "0-3": "dq",
                "4-7": "aq",
            },
        },
    }


def capture_physical_schedule_frame(sim: Any) -> dict[str, Any] | None:
    """Capture the PSU output control-word array for the current cycle, if any.

    Returns ``None`` when the PSU output is not valid or carries no operations.
    """
    psu = sim.psu
    if not getattr(psu, "output_valid", False):
        return None

    ops: list[dict[str, Any]] = []
    for (patch_row, patch_col, uc_row, uc_col, qbidx), op in np.ndenumerate(psu.output_cwdarray):
        if not op:
            continue
        pchidx = int(patch_row * sim.param.num_pchcol + patch_col)
        ops.append(
            {
                "patch": {
                    "row": int(patch_row),
                    "col": int(patch_col),
                    "pchidx": pchidx,
                },
                "unit_cell": {
                    "row": int(uc_row),
                    "col": int(uc_col),
                },
                "qbidx": int(qbidx),
                "qubit_kind": "dq" if int(qbidx) <= 3 else "aq",
                "op": to_json_safe(op),
            }
        )

    if not ops:
        return None

    return {
        "cycle": int(sim.cycle),
        "valid": True,
        "opcode": opcode_to_inst_name(sim.param, getattr(psu, "output_opcode", None)),
        "opcode_bits": to_json_safe(getattr(psu, "output_opcode", None)),
        "timing": to_json_safe(getattr(psu, "output_timing", None)),
        "ops": ops,
        "source": "xqsim",
    }
