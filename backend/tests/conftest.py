"""Shared pytest configuration: import paths and the shipped trace fixtures."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
FIXTURE_DIR = REPO_ROOT / "frontend" / "public"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def fixture_trace_paths() -> list[Path]:
    """The sample traces shipped with the frontend (empty if the frontend is absent)."""
    if not FIXTURE_DIR.is_dir():
        return []
    return sorted(FIXTURE_DIR.glob("circuit_*.json"))


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    """Parametrise any test taking ``trace_path`` over every shipped sample trace."""
    if "trace_path" in metafunc.fixturenames:
        paths = fixture_trace_paths()
        metafunc.parametrize("trace_path", paths, ids=[path.stem for path in paths])


@pytest.fixture(scope="session")
def load_trace() -> Callable[[Path], dict[str, Any]]:
    """Session-cached loader for the (multi-megabyte) trace fixtures."""
    cache: dict[Path, dict[str, Any]] = {}

    def _load(path: Path) -> dict[str, Any]:
        if path not in cache:
            payload = json.loads(path.read_text(encoding="utf-8"))
            cache[path] = payload.get("result", payload)
        return cache[path]

    return _load


@pytest.fixture(scope="session")
def bell_trace(load_trace: Callable[[Path], dict[str, Any]]) -> dict[str, Any]:
    """The 2-qubit Bell-state sample trace."""
    path = FIXTURE_DIR / "circuit_2q_bell_state.json"
    if not path.is_file():
        pytest.skip("frontend sample traces are not available")
    return load_trace(path)
