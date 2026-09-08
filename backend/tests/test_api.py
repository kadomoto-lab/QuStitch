"""Tests for API boundary validation and authentication."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from qustitch_trace import api

QASM = 'OPENQASM 2.0; include "qelib1.inc"; qreg q[1];'


def test_trace_request_accepts_a_shipped_config() -> None:
    request = api.TraceRequest(qasm=QASM)
    assert request.config == api.DEFAULT_CONFIG_NAME


def test_trace_request_rejects_config_path_traversal() -> None:
    with pytest.raises(ValidationError, match="Unknown config"):
        api.TraceRequest(qasm=QASM, config="../../secrets")


def test_trace_request_rejects_debug_only_fields() -> None:
    with pytest.raises(ValidationError, match="extra fields not permitted"):
        api.TraceRequest(qasm=QASM, keep_artifacts=True)


def test_trace_request_caps_physical_schedule_frames() -> None:
    with pytest.raises(ValidationError):
        api.TraceRequest(
            qasm=QASM,
            max_physical_schedule_frames=api.MAX_PHYSICAL_SCHEDULE_FRAMES + 1,
        )


def test_api_key_is_optional(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api, "API_KEY", None)
    api.require_api_key(None)


def test_api_key_requires_matching_bearer_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api, "API_KEY", "test-secret")

    with pytest.raises(HTTPException) as missing:
        api.require_api_key(None)
    assert missing.value.status_code == 401

    with pytest.raises(HTTPException) as wrong:
        api.require_api_key("Bearer wrong")
    assert wrong.value.status_code == 401

    api.require_api_key("Bearer test-secret")
