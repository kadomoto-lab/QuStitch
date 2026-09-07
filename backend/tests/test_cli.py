"""Tests for the argparse layer of ``qustitch_trace.cli`` (no simulation is run)."""

from __future__ import annotations

import pytest

from qustitch_trace.cli import build_parser
from qustitch_trace.runner import DEFAULT_CONFIG_NAME, DEFAULT_MAX_CYCLES


def test_defaults() -> None:
    args = build_parser().parse_args(["--qasm-file", "c.qasm"])
    assert args.qasm_file == "c.qasm"
    assert args.config == DEFAULT_CONFIG_NAME
    assert args.out == "-"
    assert args.keep_artifacts is False
    assert args.debug is False
    assert args.timeout is None
    assert args.max_cycles == DEFAULT_MAX_CYCLES
    assert args.logical_oracle is False


def test_all_flags() -> None:
    args = build_parser().parse_args(
        [
            "--qasm-file",
            "c.qasm",
            "--config",
            "example_rsfq_d5",
            "--out",
            "trace.json",
            "--keep-artifacts",
            "--debug",
            "--timeout",
            "60",
            "--max-cycles",
            "400",
            "--logical-oracle",
        ]
    )
    assert args.config == "example_rsfq_d5"
    assert args.out == "trace.json"
    assert args.keep_artifacts is True
    assert args.debug is True
    assert args.timeout == 60
    assert args.max_cycles == 400
    assert args.logical_oracle is True


def test_qasm_file_is_required() -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args([])


def test_underscore_flags_are_rejected() -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["--qasm_file", "c.qasm"])
