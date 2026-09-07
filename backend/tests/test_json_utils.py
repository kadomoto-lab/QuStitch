"""Tests for ``qustitch_trace.json_utils.to_json_safe``."""

from __future__ import annotations

import enum
import json

import numpy as np

from qustitch_trace.json_utils import to_json_safe


class _Color(enum.Enum):
    RED = "red"


class _Named:
    name = "unit"


def test_scalars_pass_through() -> None:
    assert to_json_safe(None) is None
    assert to_json_safe(True) is True
    assert to_json_safe(3) == 3
    assert to_json_safe(2.5) == 2.5
    assert to_json_safe("s") == "s"


def test_bool_is_not_turned_into_int() -> None:
    value = to_json_safe(False)
    assert value is False and isinstance(value, bool)


def test_bytes_are_decoded() -> None:
    assert to_json_safe(b"abc") == "abc"
    assert to_json_safe(b"\xff") == "�"


def test_numpy_scalars_and_arrays() -> None:
    assert to_json_safe(np.int64(7)) == 7 and isinstance(to_json_safe(np.int64(7)), int)
    assert to_json_safe(np.float32(1.5)) == 1.5 and isinstance(to_json_safe(np.float32(1.5)), float)
    assert to_json_safe(np.bool_(True)) is True
    assert to_json_safe(np.array([[1, 2], [3, 4]])) == [[1, 2], [3, 4]]


def test_enum_and_named_objects() -> None:
    assert to_json_safe(_Color.RED) == "red"
    assert to_json_safe(_Named()) == "unit"


def test_containers_are_converted_recursively() -> None:
    value = {"a": (np.int32(1), [np.float64(0.5), None]), np.int64(2): b"x"}
    assert to_json_safe(value) == {"a": [1, [0.5, None]], 2: "x"}
    assert to_json_safe((1, 2)) == [1, 2]


def test_fallback_is_str() -> None:
    class Opaque:
        def __str__(self) -> str:
            return "opaque"

    assert to_json_safe(Opaque()) == "opaque"


def test_result_is_json_serialisable() -> None:
    payload = {"arr": np.arange(3), "n": np.int8(1), "e": _Color.RED, "t": (1, "a")}
    json.dumps(to_json_safe(payload))
