"""Tests for trace artifact cleanup on unsuccessful runs."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from qustitch_trace import runner
from qustitch_trace.xqsim_bridge import ArtifactPaths

QASM = 'OPENQASM 2.0; include "qelib1.inc"; qreg q[1];'


def test_partial_compile_artifacts_are_removed(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    paths = ArtifactPaths(
        tmp_path / "job.qasm",
        tmp_path / "job.qtrp",
        tmp_path / "job.qisa",
        tmp_path / "job.qbin",
    )
    prepared = SimpleNamespace(num_compile_qubits=1)

    monkeypatch.setattr(runner, "load_xqsim", lambda: object())
    monkeypatch.setattr(runner, "_prepare_circuit", lambda *_args: prepared)
    monkeypatch.setattr(runner, "make_job_name", lambda _num_qubits: "api_test_n1")
    monkeypatch.setattr(runner, "artifact_paths", lambda _job_name: paths)

    def fail_compile(*_args, **_kwargs):
        for path in paths:
            path.write_text("partial", encoding="utf-8")
        raise RuntimeError("compiler failed")

    monkeypatch.setattr(runner, "_compile_circuit", fail_compile)

    with pytest.raises(RuntimeError, match="compiler failed"):
        runner.trace_patches_from_qasm(QASM)

    assert all(not path.exists() for path in paths)
