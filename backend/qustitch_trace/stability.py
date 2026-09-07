"""Trace metadata, simulator stability checks and ``sys.exit`` interception.

Operational notes:

- Intercepting ``sys.exit`` affects the whole process.
- Concurrent traces are unsafe; the API layer serialises requests.
- Running uvicorn with ``--workers 1`` is recommended.
"""

from __future__ import annotations

import sys
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from .json_utils import to_json_safe

# Guards the sys.exit replacement.
# NOTE: this is not fully thread-safe; the API layer must serialise trace runs.
_exit_intercept_lock = threading.Lock()


@dataclass
class TraceMetadata:
    """Bookkeeping collected while a trace runs (forced terminations, warnings, ...)."""

    forced_terminations: list[dict[str, Any]] = field(default_factory=list)
    cleanup_failed: bool = False
    cleanup_errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stability_check_failures: list[dict[str, Any]] = field(default_factory=list)


def get_unit_states(sim: Any) -> dict[str, Any]:
    """Return the state of each simulator unit (for debugging / metadata)."""
    return {
        "qif_done": to_json_safe(getattr(sim.qif, "done", None)),
        "qif_all_fetched": to_json_safe(getattr(sim.qif, "all_fetched", None)),
        "qid_done": to_json_safe(getattr(sim.qid, "done", None)),
        "pdu_state": to_json_safe(getattr(sim.pdu, "state", None)),
        "piu_state": to_json_safe(getattr(sim.piu, "state", None)),
        "psu_state": to_json_safe(getattr(sim.psu, "state", None)),
        "tcu_timebuf_empty": to_json_safe(getattr(sim.tcu, "output_timebuf_empty", None)),
        "pfu_state": to_json_safe(getattr(sim.pfu, "state", None)),
        "lmu_done": to_json_safe(getattr(sim.lmu, "done", None)),
    }


def safe_getattr(obj: Any, attr: str, default: Any = None) -> tuple[Any, bool]:
    """Read an attribute safely and report whether it could be read.

    Returns:
        ``(value, success)``: the value and a flag telling whether it was observable.
    """
    try:
        if not hasattr(obj, attr):
            return default, False
        value = getattr(obj, attr)
        # Callables are not invoked (telling properties apart is not practical).
        return value, True
    except Exception:
        return default, False


def check_system_stable(sim: Any, trace_meta: TraceMetadata) -> bool:
    """Decide whether the whole simulator is in a stable (idle) state.

    Important:

    - Unobservable conditions count as False (never treated as stable).
    - Which conditions could not be evaluated is recorded in ``trace_meta``.
    - This is an additional "is it safe to stop?" check; ``max_cycles`` remains
      the final safety net.

    Returns:
        True if the system appears stable, False otherwise.
    """
    conditions: dict[str, tuple[bool, bool]] = {}  # name -> (value, observable)

    # QIF: all instructions fetched
    qif_all_fetched, qif_obs = safe_getattr(sim.qif, "all_fetched", False)
    conditions["qif_all_fetched"] = (bool(qif_all_fetched), qif_obs)

    # QID: buffers empty
    to_pchdec_buf, pchdec_obs = safe_getattr(sim.qid, "to_pchdec_buf", None)
    if pchdec_obs and to_pchdec_buf is not None:
        pchdec_empty, pchdec_empty_obs = safe_getattr(to_pchdec_buf, "empty", False)
        conditions["qid_pchdec_empty"] = (bool(pchdec_empty), pchdec_empty_obs)
    else:
        conditions["qid_pchdec_empty"] = (False, False)

    to_lqmeas_buf, lqmeas_obs = safe_getattr(sim.qid, "to_lqmeas_buf", None)
    if lqmeas_obs and to_lqmeas_buf is not None:
        lqmeas_empty, lqmeas_empty_obs = safe_getattr(to_lqmeas_buf, "empty", False)
        conditions["qid_lqmeas_empty"] = (bool(lqmeas_empty), lqmeas_empty_obs)
    else:
        conditions["qid_lqmeas_empty"] = (False, False)

    # PDU: empty
    pdu_state, pdu_obs = safe_getattr(sim.pdu, "state", None)
    conditions["pdu_empty"] = (pdu_state == "empty", pdu_obs)

    # PIU: ready
    piu_state, piu_obs = safe_getattr(sim.piu, "state", None)
    conditions["piu_ready"] = (piu_state == "ready", piu_obs)

    piu_topsu_valid, topsu_obs = safe_getattr(sim.piu, "output_topsu_valid", True)
    conditions["piu_no_topsu_valid"] = (not bool(piu_topsu_valid), topsu_obs)

    piu_tolmu_valid, tolmu_obs = safe_getattr(sim.piu, "output_tolmu_valid", True)
    conditions["piu_no_tolmu_valid"] = (not bool(piu_tolmu_valid), tolmu_obs)

    # PSU: ready with an empty buffer
    psu_state, psu_state_obs = safe_getattr(sim.psu, "state", None)
    conditions["psu_ready"] = (psu_state == "ready", psu_state_obs)

    psu_srmem, srmem_obs = safe_getattr(sim.psu, "pchinfo_srmem", None)
    if srmem_obs and psu_srmem is not None:
        srmem_notempty, notempty_obs = safe_getattr(psu_srmem, "output_notempty", True)
        conditions["psu_buf_empty"] = (not bool(srmem_notempty), notempty_obs)
    else:
        conditions["psu_buf_empty"] = (False, False)

    # TCU: time buffer empty
    tcu_empty, tcu_obs = safe_getattr(sim.tcu, "output_timebuf_empty", False)
    conditions["tcu_empty"] = (bool(tcu_empty), tcu_obs)

    # PFU: ready
    pfu_state, pfu_obs = safe_getattr(sim.pfu, "state", None)
    conditions["pfu_ready"] = (pfu_state == "ready", pfu_obs)

    # LMU: instinfo_valid is False
    lmu_instinfo_valid, lmu_obs = safe_getattr(sim.lmu, "instinfo_valid", True)
    conditions["lmu_no_instinfo_valid"] = (not bool(lmu_instinfo_valid), lmu_obs)

    # LMU: done
    lmu_done, lmu_done_obs = safe_getattr(sim.lmu, "done", False)
    conditions["lmu_done"] = (bool(lmu_done), lmu_done_obs)

    # QXU: measurement memories empty
    qxu_dq_meas_mem, qxu_dq_obs = safe_getattr(sim.qxu, "dq_meas_mem", None)
    qxu_aq_meas_mem, qxu_aq_obs = safe_getattr(sim.qxu, "aq_meas_mem", None)
    qxu_empty = not (bool(qxu_dq_meas_mem) or bool(qxu_aq_meas_mem))
    qxu_obs = qxu_dq_obs and qxu_aq_obs
    conditions["qxu_meas_mem_empty"] = (qxu_empty, qxu_obs)

    # Record the unobservable conditions
    unobservable = [name for name, (_value, obs) in conditions.items() if not obs]
    if unobservable:
        trace_meta.stability_check_failures.append(
            {
                "cycle": sim.cycle,
                "unobservable_conditions": unobservable,
            }
        )

    # True only if every condition holds and every condition was observable
    all_true = all(val for val, _ in conditions.values())
    all_observable = all(obs for _, obs in conditions.values())

    return all_true and all_observable


@contextmanager
def intercept_sys_exit() -> Iterator[dict[str, Any]]:
    """Temporarily replace ``sys.exit`` so simulator exits surface as ``RuntimeError``.

    Warning: this pattern is unsafe under concurrent execution. The API layer
    must serialise trace runs.
    """
    original_exit = sys.exit
    exit_info: dict[str, Any] = {"called": False, "code": None}

    def _intercepted_exit(code: Any = None) -> None:
        exit_info["called"] = True
        exit_info["code"] = code
        error_msg = (
            "XQsim simulation error: sys.exit() was called by the simulator. "
            "This typically occurs when there is an invalid patch Pauli product (pchpp) "
            "configuration. "
            f"Exit code: {code}"
        )
        raise RuntimeError(error_msg)

    with _exit_intercept_lock:
        try:
            sys.exit = _intercepted_exit
            yield exit_info
        finally:
            sys.exit = original_exit
