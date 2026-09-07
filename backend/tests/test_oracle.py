"""Tests for ``qustitch_trace.oracle.LogicalOutcomeOracle``."""

from __future__ import annotations

import math

import numpy as np
import pytest

from qustitch_trace.oracle import LogicalOutcomeOracle


def test_initial_state_is_magic_times_zeros() -> None:
    oracle = LogicalOutcomeOracle(num_lq=3)
    expected = np.zeros(8, dtype=complex)
    expected[0b000] = 1 / math.sqrt(2)
    expected[0b100] = np.exp(1j * math.pi / 4) / math.sqrt(2)
    assert np.allclose(oracle.state, expected)
    assert oracle.samples == []


def test_z_measurement_of_zero_qubit_is_deterministic() -> None:
    oracle = LogicalOutcomeOracle(num_lq=3)
    assert oracle.measure(["I", "Z", "I"]) == 0  # zero ancilla
    assert oracle.measure(["I", "I", "Z"]) == 0  # data qubit
    assert oracle.samples[0] == {"paulis": "IZI", "outcome": 0, "p_plus": 1.0, "reprepared": "zero"}
    assert oracle.samples[1] == {"paulis": "IIZ", "outcome": 0, "p_plus": 1.0}


def test_sample_record_key_order() -> None:
    oracle = LogicalOutcomeOracle(num_lq=3)
    oracle.measure(["Z", "I", "I"])
    assert list(oracle.samples[0]) == ["paulis", "outcome", "p_plus", "reprepared"]
    assert oracle.samples[0]["reprepared"] == "magic"


def test_deterministic_seed() -> None:
    a = LogicalOutcomeOracle(num_lq=3)
    b = LogicalOutcomeOracle(num_lq=3)
    ops = [["Z", "I", "I"], ["X", "I", "I"], ["I", "I", "X"], ["Y", "I", "I"], ["I", "Z", "Z"]]
    assert [a.measure(op) for op in ops] == [b.measure(op) for op in ops]
    assert a.samples == b.samples
    c = LogicalOutcomeOracle(num_lq=3, seed=1)
    assert [c.measure(op) for op in ops] != [a.measure(op) for op in ops] or c.samples != a.samples


@pytest.mark.parametrize(
    ("pauli", "expected_p_plus"),
    [
        ("Z", 0.5),
        ("X", round((1 + math.cos(math.pi / 4)) / 2, 6)),
        ("Y", round((1 + math.sin(math.pi / 4)) / 2, 6)),
    ],
)
def test_magic_state_statistics(pauli: str, expected_p_plus: float) -> None:
    """Measuring lq0 re-prepares |m>, so every sample sees the same p_plus."""
    oracle = LogicalOutcomeOracle(num_lq=2)
    n = 4000
    outcomes = [oracle.measure([pauli, "I"]) for _ in range(n)]
    assert {sample["p_plus"] for sample in oracle.samples} == {expected_p_plus}
    assert all(sample["reprepared"] == "magic" for sample in oracle.samples)
    frequency_plus = 1 - sum(outcomes) / n
    assert abs(frequency_plus - expected_p_plus) < 0.04
    # The state is renormalised after every projection.
    assert math.isclose(float(np.linalg.norm(oracle.state)), 1.0, abs_tol=1e-9)


def test_projection_updates_state() -> None:
    oracle = LogicalOutcomeOracle(num_lq=3)
    first = oracle.measure(["I", "I", "X"])  # data qubit lq2 in |0>: 50/50
    assert oracle.samples[0]["p_plus"] == 0.5
    # Data qubits are not re-prepared, so a repeated X measurement is deterministic.
    assert oracle.measure(["I", "I", "X"]) == first
    assert oracle.samples[1]["p_plus"] == 1.0
    assert "reprepared" not in oracle.samples[1]
