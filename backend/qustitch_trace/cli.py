"""Command-line interface (``python -m qustitch_trace --qasm-file c.qasm --out trace.json``)."""

from __future__ import annotations

import argparse
import json
import logging
import os
from collections.abc import Sequence

from .ray_setup import init_ray_once, shutdown_ray
from .runner import DEFAULT_CONFIG_NAME, DEFAULT_MAX_CYCLES, trace_patches_from_qasm


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser (kept separate so it can be tested without a simulation)."""
    parser = argparse.ArgumentParser(
        prog="qustitch_trace",
        description="QuStitch trace generator (OpenQASM 2.0 -> XQsim patch trace JSON)",
    )
    parser.add_argument("--qasm-file", required=True, help="Path to OpenQASM 2.0 file")
    parser.add_argument(
        "--config",
        default=DEFAULT_CONFIG_NAME,
        help="Config name under xqsim/configs (without .json)",
    )
    parser.add_argument("--out", default="-", help="Output JSON path, or '-' for stdout")
    parser.add_argument(
        "--keep-artifacts",
        action="store_true",
        help="Keep generated qasm/qtrp/qisa/qbin files for debugging",
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument("--timeout", type=int, default=None, help="Timeout in seconds")
    parser.add_argument(
        "--max-cycles",
        type=int,
        default=DEFAULT_MAX_CYCLES,
        help="Stop the simulation after this many cycles (safety net)",
    )
    parser.add_argument(
        "--logical-oracle",
        action="store_true",
        help="Force-enable the logical-outcome oracle even for Clifford circuits",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    """Run a trace from the command line."""
    args = build_parser().parse_args(argv)

    if args.debug:
        logging.basicConfig(level=logging.DEBUG)

    with open(args.qasm_file, encoding="utf-8") as f:
        qasm_str = f.read()

    # The simulator chdirs into its own directory during setup, so resolve the
    # output path before running.
    out_path = None if args.out == "-" else os.path.abspath(args.out)

    init_ray_once()
    try:
        result = trace_patches_from_qasm(
            qasm_str,
            config_name=args.config,
            skip_pqsim=True,
            keep_artifacts=bool(args.keep_artifacts),
            debug_logging=bool(args.debug),
            max_cycles=args.max_cycles,
            timeout_seconds=args.timeout,
            force_logical_oracle=bool(args.logical_oracle),
        )
    finally:
        shutdown_ray()

    out_json = json.dumps(result, ensure_ascii=False, indent=2)
    if out_path is None:
        print(out_json)
    else:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(out_json)


if __name__ == "__main__":
    main()
