"""QISA instruction naming and the per-instruction trace entries accepted by the PIU."""

from __future__ import annotations

from typing import Any

from .json_utils import to_json_safe
from .snapshots import patch_coords

EVENT_INSTS = {"PREP_INFO", "MERGE_INFO", "SPLIT_INFO"}
KIND_BY_EVENT_INST = {
    "PREP_INFO": "prepare",
    "MERGE_INFO": "merge",
    "SPLIT_INFO": "split",
}


def opcode_to_inst_name(param: Any, opcode_bits: str | None) -> str | None:
    """Map an opcode bit string to its QISA mnemonic using the simulator parameters."""
    if opcode_bits is None:
        return None
    mapping = {
        getattr(param, "PREP_INFO_opcode", None): "PREP_INFO",
        getattr(param, "MERGE_INFO_opcode", None): "MERGE_INFO",
        getattr(param, "SPLIT_INFO_opcode", None): "SPLIT_INFO",
        getattr(param, "LQI_opcode", None): "LQI",
        getattr(param, "RUN_ESM_opcode", None): "RUN_ESM",
        getattr(param, "INIT_INTMD_opcode", None): "INIT_INTMD",
        getattr(param, "MEAS_INTMD_opcode", None): "MEAS_INTMD",
        getattr(param, "PPM_INTERPRET_opcode", None): "PPM_INTERPRET",
        getattr(param, "LQM_X_opcode", None): "LQM_X",
        getattr(param, "LQM_Y_opcode", None): "LQM_Y",
        getattr(param, "LQM_Z_opcode", None): "LQM_Z",
        getattr(param, "LQM_FB_opcode", None): "LQM_FB",
    }
    return mapping.get(opcode_bits)


def build_instruction_trace_entry(
    sim: Any,
    *,
    qisa_idx: int,
    qisa_lines: list[str],
    inst_name: str | None,
) -> dict[str, Any]:
    """Build a sparse, JSON-safe view of the QISA instruction accepted by PIU."""
    param = sim.param
    piu = sim.piu
    raw_line = qisa_lines[qisa_idx] if 0 <= qisa_idx < len(qisa_lines) else None
    noop = "1" * param.opcode_bw

    pch_list = list(getattr(piu, "input_pch_list", []) or [])
    pchpp_list = getattr(piu, "input_pchpp_list", None) or []
    pchop_list = getattr(piu, "input_pchop_list", None) or []
    pchmreg_list = getattr(piu, "input_pchmreg_list", None) or []

    patches: list[dict[str, Any]] = []
    for pchidx in range(param.num_pch):
        selected = bool(pch_list[pchidx]) if pchidx < len(pch_list) else False
        pchpp = [
            pchpp_list[0][pchidx] if len(pchpp_list) > 0 and pchidx < len(pchpp_list[0]) else "I",
            pchpp_list[1][pchidx] if len(pchpp_list) > 1 and pchidx < len(pchpp_list[1]) else "I",
        ]
        pchop = [
            pchop_list[0][pchidx] if len(pchop_list) > 0 and pchidx < len(pchop_list[0]) else noop,
            pchop_list[1][pchidx] if len(pchop_list) > 1 and pchidx < len(pchop_list[1]) else noop,
        ]
        pchmreg = [
            pchmreg_list[0][pchidx]
            if len(pchmreg_list) > 0 and pchidx < len(pchmreg_list[0])
            else 0,
            pchmreg_list[1][pchidx]
            if len(pchmreg_list) > 1 and pchidx < len(pchmreg_list[1])
            else 0,
        ]
        active = (
            selected
            or any(pp != "I" for pp in pchpp)
            or any(op != noop for op in pchop)
            or any(int(mreg) != 0 for mreg in pchmreg)
        )
        if not active:
            continue

        coords = patch_coords(param, pchidx)
        patches.append(
            {
                "pchidx": int(pchidx),
                **coords,
                "selected": selected,
                "pchpp": to_json_safe(pchpp),
                "pchop": to_json_safe(pchop),
                "pchmreg": to_json_safe(pchmreg),
            }
        )

    return {
        "seq": int(qisa_idx),
        "cycle": int(sim.cycle),
        "qisa_idx": int(qisa_idx),
        "raw_line": raw_line,
        "inst": inst_name,
        "opcode_bits": to_json_safe(getattr(piu, "input_opcode", None)),
        "source": "xqsim",
        "patches": patches,
    }
