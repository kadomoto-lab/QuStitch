"""Conversion of simulator values into JSON-serialisable Python objects."""

from __future__ import annotations

from typing import Any

import numpy as np


def to_json_safe(value: Any) -> Any:
    """Normalise ``value`` into a JSON-serialisable type.

    numpy scalars and arrays, ``bytes`` and Enum-like objects are converted to
    plain Python values; dicts, lists and tuples are converted recursively.
    Anything else falls back to ``str(value)``.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float, str)):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")

    # numpy types
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.bool_):
        return bool(value)

    # Enum-like objects
    if hasattr(value, "value"):
        return to_json_safe(value.value)
    if hasattr(value, "name") and hasattr(value, "__class__"):
        return str(value.name)

    # Containers
    if isinstance(value, dict):
        return {to_json_safe(k): to_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json_safe(v) for v in value]

    # Fallback: stringify
    return str(value)
