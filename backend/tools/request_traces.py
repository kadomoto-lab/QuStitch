#!/usr/bin/env python3
"""Request traces for the sample circuits from a running QuStitch Trace API server.

Each sample is POSTed to ``<url>/trace`` one after another (the server serialises
traces anyway), the response is saved as ``<out-dir>/<name>.json`` and a summary
is printed and written to ``<out-dir>/summary.json``.

Samples that need options the HTTP API does not expose (for example
``force_logical_oracle``) are skipped and reported as such; use
``tools/regenerate_samples.py`` for those.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from tools.sample_circuits import select_samples

DEFAULT_URL = "http://localhost:8000"
DEFAULT_OUT_DIR = BACKEND_DIR / "test_results_api"
REQUEST_TIMEOUT_SECONDS = 86_400  # 24 hours


def _print_execution_summary(result: dict[str, Any]) -> None:
    trace = result.get("result", {}).get("clifford_t_execution_trace", {})
    if not trace:
        print("  warning: clifford_t_execution_trace not found")
        return
    summary = trace.get("summary", {})
    print(f"  total gates: {summary.get('total_gates')}")
    print(
        f"  PPR: {summary.get('ppr_count')}, PPM: {summary.get('ppm_count')}, "
        f"SQM: {summary.get('sqm_count')}, Pauli frame: {summary.get('pauli_frame_count')}"
    )
    print(f"  all gates traced: {summary.get('all_gates_traced')}")


def run_trace(url: str, name: str, qasm: str, out_dir: Path) -> dict[str, Any]:
    """POST one circuit to the API, save the response and return a status record."""
    print(f"\n{'=' * 60}\n{name}\n{'=' * 60}")

    payload = json.dumps({"qasm": qasm}).encode("utf-8")
    req = urllib.request.Request(
        f"{url.rstrip('/')}/trace",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    start = time.time()
    try:
        print("running...", flush=True)
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            result = json.load(resp)
        elapsed = time.time() - start
        print(f"done ({elapsed / 60:.1f} min)")
        _print_execution_summary(result)

        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{name}.json"
        out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  saved to {out_path}")
        return {"status": "success", "elapsed_minutes": elapsed / 60, "path": str(out_path)}

    except urllib.error.HTTPError as e:
        elapsed = time.time() - start
        print(f"HTTP error: {e.code} {e.reason} ({elapsed / 60:.1f} min)")
        try:
            print(f"  detail: {e.read().decode('utf-8')[:200]}")
        except Exception:
            pass
        return {"status": "error", "error": f"HTTP {e.code}", "elapsed_minutes": elapsed / 60}
    except urllib.error.URLError as e:
        elapsed = time.time() - start
        print(f"URL error: {e.reason} ({elapsed / 60:.1f} min)")
        return {"status": "error", "error": str(e), "elapsed_minutes": elapsed / 60}
    except KeyboardInterrupt:
        elapsed = time.time() - start
        print(f"\ninterrupted ({elapsed / 60:.1f} min)")
        return {"status": "interrupted", "elapsed_minutes": elapsed / 60}
    except Exception as e:
        elapsed = time.time() - start
        print(f"error: {e} ({elapsed / 60:.1f} min)")
        return {"status": "error", "error": str(e), "elapsed_minutes": elapsed / 60}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL, help="Base URL of the API server")
    parser.add_argument(
        "--only", action="append", default=[], help="Sample name to request (repeatable)"
    )
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args(argv)

    circuits = select_samples(args.only)
    unknown = set(args.only) - {circuit["name"] for circuit in circuits}
    if unknown:
        print(f"unknown sample name(s): {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2

    print(f"API: {args.url}\ncircuits: {len(circuits)}")
    results: list[dict[str, Any]] = []
    total_start = time.time()

    for index, circuit in enumerate(circuits, start=1):
        name = circuit["name"]
        print(f"\n[{index}/{len(circuits)}] {name}")
        options = circuit.get("options", {})
        if options:
            print(f"  skipped: options {sorted(options)} are not supported by the HTTP API")
            results.append({"name": name, "index": index, "status": "skipped"})
            continue
        record = run_trace(args.url, name, circuit["qasm"], args.out_dir)
        results.append({"name": name, "index": index, **record})
        if record["status"] == "interrupted":
            break

    total_elapsed = time.time() - total_start
    success_count = sum(1 for r in results if r.get("status") == "success")
    error_count = sum(1 for r in results if r.get("status") == "error")
    skipped_count = sum(1 for r in results if r.get("status") == "skipped")

    print(f"\n{'=' * 60}\nsummary\n{'=' * 60}")
    print(f"success: {success_count}/{len(results)}")
    print(f"error:   {error_count}/{len(results)}")
    print(f"skipped: {skipped_count}/{len(results)}")
    print(f"total time: {total_elapsed / 60:.1f} min ({total_elapsed / 3600:.2f} h)")
    for r in results:
        elapsed = r.get("elapsed_minutes", 0.0)
        print(f"  [{r['status']}] {r['index']}: {r['name']} ({elapsed:.1f} min)")
        if r.get("status") == "error":
            print(f"      error: {r.get('error', 'unknown')}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    summary_path = args.out_dir / "summary.json"
    summary_path.write_text(
        json.dumps(
            {
                "url": args.url,
                "total_circuits": len(circuits),
                "success_count": success_count,
                "error_count": error_count,
                "skipped_count": skipped_count,
                "total_elapsed_minutes": total_elapsed / 60,
                "results": results,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"\nsummary written to {summary_path}")
    return 1 if error_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
