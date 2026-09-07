"""Tests for ``tools/validate_trace.py`` against the shipped sample traces."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from qustitch_trace import TRACE_SCHEMA_VERSION
from tools.validate_trace import main, summarize_trace, unwrap_api_response, validate_trace


def test_every_shipped_trace_validates(trace_path: Path, load_trace: Any) -> None:
    trace = load_trace(trace_path)
    assert validate_trace(trace) == []
    assert trace["schema_version"] == TRACE_SCHEMA_VERSION
    assert trace["meta"]["termination_reason"] == "normal"


def test_summary_counts(bell_trace: dict[str, Any]) -> None:
    summary = summarize_trace(bell_trace, "bell.json")
    assert summary["path"] == "bell.json"
    assert summary["schema_version"] == TRACE_SCHEMA_VERSION
    assert summary["counts"]["patches"] == len(bell_trace["patch"]["initial"])
    assert summary["counts"]["events"] == len(bell_trace["patch"]["events"])
    assert summary["counts"]["surgery_seams"] == len(bell_trace["surgery_seams"])
    assert summary["counts"]["physical_schedule_frames"] == 0
    assert summary["termination_reason"] == "normal"
    assert "pp" in summary["values"]["facebd"]


def test_unwrap_api_response() -> None:
    assert unwrap_api_response({"result": {"a": 1}}) == {"a": 1}
    assert unwrap_api_response({"a": 1}) == {"a": 1}


def test_validation_detects_broken_links(bell_trace: dict[str, Any]) -> None:
    broken = copy.deepcopy(bell_trace)
    broken["patch"]["events"][0]["instruction_trace_idx"] = 10**6
    broken["surgery_seams"][0]["event_seq"] = -1
    broken["meta"]["trace_summary"]["counts"]["surgery_seams"] = 0
    del broken["physical_layout"]
    errors = validate_trace(broken)
    assert "missing top-level key: physical_layout" in errors
    assert "event[0] instruction_trace_idx is invalid" in errors
    assert "surgery_seams[0] event_seq is invalid" in errors
    assert "trace_summary.counts.surgery_seams does not match surgery_seams length" in errors


def test_validation_detects_bad_edges() -> None:
    trace = {
        "schema_version": "1.1.0",
        "meta": {
            "schema_version": "1.1.0",
            "generation_mode": {},
            "provenance": {},
            "truncation": {},
            "trace_summary": {"counts": {"surgery_seams": 1}},
        },
        "input": {},
        "compiled": {},
        "patch": {"initial": [{"pchidx": 0}], "events": []},
        "instruction_trace": [],
        "surgery_seams": [
            {
                "id": "seam-0",
                "event_seq": 0,
                "edges": [
                    {
                        "edge_key": "h:0:0",
                        "orientation": "v",
                        "row": 0,
                        "col": 0,
                        "boundary": "pp",
                        "endpoints": [
                            {"pchidx": 0, "row": 0, "col": 0, "face": "e", "facebd": "x"}
                        ],
                    }
                ],
            }
        ],
        "physical_layout": {},
    }
    errors = validate_trace(trace)
    assert "patch.initial[0] missing pchtype" in errors
    assert "surgery_seams[0] event_seq is invalid" in errors
    assert "surgery_seams[0].edges[0].orientation does not match edge_key" in errors
    assert "surgery_seams[0].edges[0].endpoints[0] does not lie on edge h:0:0" in errors
    assert "surgery_seams[0].edges[0].endpoints[0].facebd does not match edge boundary" in errors


def test_cli_exit_status(tmp_path: Path, bell_trace: dict[str, Any], capsys: Any) -> None:
    good = tmp_path / "good.json"
    good.write_text(json.dumps({"result": bell_trace}), encoding="utf-8")
    assert main([str(good)]) == 0
    assert '"errors": []' in capsys.readouterr().out

    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"schema_version": "1.1.0"}), encoding="utf-8")
    assert main([str(good), str(bad)]) == 1
