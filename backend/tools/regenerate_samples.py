#!/usr/bin/env python3
"""Regenerate the frontend's sample traces (``frontend/public/circuit_*.json``).

Runs ``trace_patches_from_qasm`` for every entry of ``tools/sample_circuits.py``
(or the ``--only`` subset), validates the result and writes it next to the
existing samples. Samples that already exist, carry the current schema version
and validate cleanly are skipped unless ``--force`` is given. A JSON summary of
the batch is written to ``--summary-out`` after every circuit.

Full traces take from minutes to well over an hour each.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.sample_circuits import select_samples
from tools.validate_trace import summarize_trace, unwrap_api_response, validate_trace

REPO_ROOT = BACKEND_DIR.parent
PUBLIC_DIR = REPO_ROOT / "frontend" / "public"
DEFAULT_SUMMARY_OUT = BACKEND_DIR / "test_results_samples" / "regenerate_samples_summary.json"


def _load_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _is_current_valid(path: Path, schema_version: str) -> bool:
    payload = _load_json(path)
    if payload is None:
        return False
    trace = unwrap_api_response(payload)
    if trace.get("schema_version") != schema_version:
        return False
    return not validate_trace(trace)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="example_cmos_d5")
    parser.add_argument("--timeout-seconds", type=int, default=86_400)
    parser.add_argument("--max-cycles", type=int, default=10_000_000)
    parser.add_argument("--force", action="store_true", help="Regenerate even if already valid")
    parser.add_argument(
        "--only", action="append", default=[], help="Sample name to regenerate (repeatable)"
    )
    parser.add_argument("--summary-out", type=Path, default=DEFAULT_SUMMARY_OUT)
    args = parser.parse_args(argv)
    if not args.summary_out.is_absolute():
        args.summary_out = (Path.cwd() / args.summary_out).resolve()

    # Imported lazily: pulls in the trace runner (and, on first use, qiskit/ray).
    from qustitch_trace import TRACE_SCHEMA_VERSION, trace_patches_from_qasm
    from qustitch_trace.ray_setup import init_ray_once

    circuits = select_samples(args.only)
    unknown = set(args.only) - {circuit["name"] for circuit in circuits}
    if unknown:
        print(f"unknown sample name(s): {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2

    init_ray_once()
    results: list[dict[str, Any]] = []
    batch_start = time.time()

    for index, circuit in enumerate(circuits, start=1):
        name = circuit["name"]
        out_path = PUBLIC_DIR / f"{name}.json"
        print(f"[{index}/{len(circuits)}] {name}", flush=True)

        if not args.force and _is_current_valid(out_path, TRACE_SCHEMA_VERSION):
            print(f"  skip: already schema {TRACE_SCHEMA_VERSION} and valid", flush=True)
            results.append(
                {
                    "name": name,
                    "status": "skipped",
                    "path": str(out_path),
                    "elapsed_seconds": 0.0,
                }
            )
            continue

        start = time.time()
        try:
            trace = trace_patches_from_qasm(
                circuit["qasm"],
                config_name=args.config,
                skip_pqsim=True,
                keep_artifacts=False,
                debug_logging=False,
                max_cycles=args.max_cycles,
                timeout_seconds=args.timeout_seconds,
                **circuit.get("options", {}),
            )
            _write_json(out_path, trace)
            errors = validate_trace(trace)
            elapsed = time.time() - start
            summary = summarize_trace(trace, str(out_path))
            print(
                f"  done: {elapsed / 60:.1f} min, "
                f"events={summary['counts']['events']}, "
                f"seams={summary['counts']['surgery_seams']}, "
                f"errors={len(errors)}",
                flush=True,
            )
            results.append(
                {
                    "name": name,
                    "status": "success" if not errors else "validation_error",
                    "path": str(out_path),
                    "elapsed_seconds": elapsed,
                    "summary": summary,
                    "errors": errors,
                }
            )
            if errors:
                break
        except Exception as exc:
            elapsed = time.time() - start
            print(f"  error after {elapsed / 60:.1f} min: {exc}", flush=True)
            results.append(
                {
                    "name": name,
                    "status": "error",
                    "path": str(out_path),
                    "elapsed_seconds": elapsed,
                    "error": str(exc),
                }
            )
            break

        _write_json(
            args.summary_out,
            {
                "total_elapsed_seconds": time.time() - batch_start,
                "results": results,
            },
        )

    final = {
        "total_elapsed_seconds": time.time() - batch_start,
        "success_count": sum(1 for item in results if item["status"] == "success"),
        "skipped_count": sum(1 for item in results if item["status"] == "skipped"),
        "error_count": sum(1 for item in results if item["status"] not in {"success", "skipped"}),
        "results": results,
    }
    _write_json(args.summary_out, final)
    print(json.dumps(final, ensure_ascii=False, indent=2), flush=True)
    return 1 if final["error_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
