"""Logical-outcome oracle for emulate mode (Level B extension)."""

from __future__ import annotations

from typing import Any

import numpy as np


class LogicalOutcomeOracle:
    """Logical measurement oracle for emulate mode (Level B).

    Fast mode (``skip_pqsim``) carries no quantum state; measurement values are
    merely error-injection bookkeeping (always 0 when there are no errors). In
    circuits with feedback (LQM_FB) the measurement values decide both the
    control flow (X/Z basis selection) and the meaning of the result, so this
    class keeps an ideal state of the logical qubits only (dimension
    ``2**num_lq``) as a sidecar, projects/samples the measurement operator the
    LMU interprets, and supplies the outcome to ``final_meas``. The XQsim core
    logic is not modified. Results are reproducible thanks to a deterministic seed.

    State convention: lq0 = magic state ``|m> = (|0> + e^{i pi/4}|1>)/sqrt(2)``;
    everything else (zero ancilla / data / padding) = ``|0>``. Measurements are
    treated as ideal projective measurements (sign/byproduct corrections are
    unnecessary because the sampled bit is the true value as is).
    """

    _PAULI = {
        "I": np.eye(2, dtype=complex),
        "X": np.array([[0, 1], [1, 0]], dtype=complex),
        "Y": np.array([[0, -1j], [1j, 0]], dtype=complex),
        "Z": np.array([[1, 0], [0, -1]], dtype=complex),
    }

    @staticmethod
    def _magic_vec() -> np.ndarray:
        return np.array([1.0, np.exp(1j * np.pi / 4.0)], dtype=complex) / np.sqrt(2.0)

    @staticmethod
    def _zero_vec() -> np.ndarray:
        return np.array([1.0, 0.0], dtype=complex)

    def __init__(self, num_lq: int, seed: int = 12345) -> None:
        self.num_lq = int(num_lq)
        self.rng = np.random.default_rng(seed)
        # kron order: lq0 is the most significant bit. lq0 = |m>, everything else = |0>
        state = self._magic_vec()
        for _ in range(self.num_lq - 1):
            state = np.kron(state, self._zero_vec())
        self.state = state
        self.samples: list[dict[str, Any]] = []

    def _reset_qubit(self, qubit: int, target: np.ndarray) -> None:
        """Re-prepare an ancilla consumed by a measurement into a fresh state.

        Right after a single-qubit projective measurement the qubit is separable
        as a product state, so the factor for the remaining qubits is taken from
        the leading SVD component and re-tensored with ``target`` (exact for a
        product state).
        """
        n = self.num_lq
        psi_moved = np.moveaxis(self.state.reshape([2] * n), qubit, 0).reshape(2, -1)
        _, s, vh = np.linalg.svd(psi_moved, full_matrices=False)
        rest = vh[0] * s[0]
        new = np.kron(target, rest)
        new = np.moveaxis(new.reshape([2] * n), 0, qubit).reshape(-1)
        norm = float(np.linalg.norm(new))
        if norm > 1e-12:
            self.state = new / norm

    def _operator(self, paulis: list[str]) -> np.ndarray:
        op = np.array([[1.0 + 0j]])
        for p in paulis:
            op = np.kron(op, self._PAULI[p])
        return op

    def measure(self, paulis: list[str]) -> int:
        """Projectively measure a Pauli string (in lq_idx order).

        Returns 0 for the +1 eigenvalue and 1 for the -1 eigenvalue.
        """
        op = self._operator(paulis)
        applied = op @ self.state
        exp_val = float(np.real(np.vdot(self.state, applied)))
        p_plus = min(max((1.0 + exp_val) / 2.0, 0.0), 1.0)
        bit = 0 if float(self.rng.random()) < p_plus else 1
        sign = 1.0 if bit == 0 else -1.0
        projected = (self.state + sign * applied) / 2.0
        norm = float(np.linalg.norm(projected))
        if norm > 1e-12:
            self.state = projected / norm
        sample: dict[str, Any] = {
            "paulis": "".join(paulis),
            "outcome": bit,
            "p_plus": round(p_plus, 6),
        }
        # A single-qubit measurement of an ancilla consumes that ancilla. On the
        # physical side it is re-prepared by the LQI of the next pi/8 window, so
        # the sidecar state is re-tensored with a fresh ancilla as well.
        non_identity = [i for i, p in enumerate(paulis) if p != "I"]
        if len(non_identity) == 1 and non_identity[0] == 0:
            self._reset_qubit(0, self._magic_vec())
            sample["reprepared"] = "magic"
        elif len(non_identity) == 1 and non_identity[0] == 1:
            self._reset_qubit(1, self._zero_vec())
            sample["reprepared"] = "zero"
        self.samples.append(sample)
        return bit
