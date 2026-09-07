"""The sample circuits shipped with the frontend (``frontend/public/circuit_*.json``).

Each entry has:

- ``name``: the JSON file stem under ``frontend/public``,
- ``qasm``: the exact OpenQASM 2.0 input (it is echoed verbatim into ``input.qasm``),
- ``options``: extra keyword arguments for ``trace_patches_from_qasm``.

The order follows the frontend's sample list. Circuits with T gates
(``circuit_2q_t_bell``, ``circuit_2q_qft``) need no options: the emulate-mode
extensions are enabled automatically when the compiled QISA contains LQM_FB.
"""

from __future__ import annotations

from typing import Any

SAMPLE_CIRCUITS: list[dict[str, Any]] = [
    {
        "name": "circuit_2q_bell_state",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[2];\n"
            "creg c[2];\n"
            "h q[0];\n"
            "cx q[0],q[1];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_2q_cnot_simple",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[2];\n"
            "creg c[2];\n"
            "cx q[0],q[1];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_2q_h_both_cnot",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[2];\n"
            "creg c[2];\n"
            "h q[0];\n"
            "h q[1];\n"
            "cx q[0],q[1];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_2q_x_cnot",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[2];\n"
            "creg c[2];\n"
            "x q[0];\n"
            "cx q[0],q[1];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_2q_z_cnot",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[2];\n"
            "creg c[2];\n"
            "z q[0];\n"
            "cx q[0],q[1];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_3q_bell_chain",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[3];\n"
            "creg c[3];\n"
            "h q[0];\n"
            "cx q[0],q[1];\n"
            "h q[1];\n"
            "cx q[1],q[2];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_3q_fan_out",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[3];\n"
            "creg c[3];\n"
            "h q[0];\n"
            "cx q[0],q[1];\n"
            "cx q[0],q[2];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_3q_linear",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[3];\n"
            "creg c[3];\n"
            "h q[0];\n"
            "cx q[0],q[1];\n"
            "cx q[1],q[2];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_4q_full_entangle",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[4];\n"
            "creg c[4];\n"
            "h q[0];\n"
            "h q[1];\n"
            "h q[2];\n"
            "h q[3];\n"
            "cx q[0],q[1];\n"
            "cx q[0],q[2];\n"
            "cx q[0],q[3];\n"
            "cx q[1],q[2];\n"
            "cx q[1],q[3];\n"
            "cx q[2],q[3];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
            "measure q[3] -> c[3];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_4q_ghz",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[4];\n"
            "creg c[4];\n"
            "h q[0];\n"
            "cx q[0],q[1];\n"
            "cx q[1],q[2];\n"
            "cx q[2],q[3];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
            "measure q[3] -> c[3];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_4q_ring",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[4];\n"
            "creg c[4];\n"
            "h q[0];\n"
            "cx q[0],q[1];\n"
            "cx q[1],q[2];\n"
            "cx q[2],q[3];\n"
            "cx q[3],q[0];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
            "measure q[3] -> c[3];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_5q_linear",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[5];\n"
            "creg c[5];\n"
            "h q[0];\n"
            "cx q[0],q[1];\n"
            "cx q[1],q[2];\n"
            "cx q[2],q[3];\n"
            "cx q[3],q[4];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
            "measure q[3] -> c[3];\n"
            "measure q[4] -> c[4];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_6q_ladder",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[6];\n"
            "creg c[6];\n"
            "h q[0];\n"
            "h q[1];\n"
            "cx q[0],q[2];\n"
            "cx q[1],q[3];\n"
            "cx q[2],q[4];\n"
            "cx q[3],q[5];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
            "measure q[3] -> c[3];\n"
            "measure q[4] -> c[4];\n"
            "measure q[5] -> c[5];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_6q_ladder_oracle",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[6];\n"
            "creg c[6];\n"
            "h q[0];\n"
            "h q[1];\n"
            "cx q[0],q[2];\n"
            "cx q[1],q[3];\n"
            "cx q[2],q[4];\n"
            "cx q[3],q[5];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
            "measure q[2] -> c[2];\n"
            "measure q[3] -> c[3];\n"
            "measure q[4] -> c[4];\n"
            "measure q[5] -> c[5];\n"
        ),
        "options": {"force_logical_oracle": True},
    },
    {
        "name": "circuit_2q_t_bell",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[2];\n"
            "creg c[2];\n"
            "h q[0];\n"
            "t q[0];\n"
            "cx q[0],q[1];\n"
            "measure q[0] -> c[0];\n"
            "measure q[1] -> c[1];\n"
        ),
        "options": {},
    },
    {
        "name": "circuit_2q_qft",
        "qasm": (
            "OPENQASM 2.0;\n"
            'include "qelib1.inc";\n'
            "qreg q[2];\n"
            "creg meas[2];\n"
            "h q[1];\n"
            "cp(pi/2) q[0],q[1];\n"
            "h q[0];\n"
            "barrier q[0],q[1];\n"
            "measure q[0] -> meas[0];\n"
            "measure q[1] -> meas[1];\n"
        ),
        "options": {},
    },
]

SAMPLE_NAMES: list[str] = [circuit["name"] for circuit in SAMPLE_CIRCUITS]


def find_sample(name: str) -> dict[str, Any] | None:
    """Return the sample circuit called ``name``, or ``None``."""
    for circuit in SAMPLE_CIRCUITS:
        if circuit["name"] == name:
            return circuit
    return None


def select_samples(only: list[str] | None) -> list[dict[str, Any]]:
    """Return the samples whose name is in ``only`` (all samples when ``only`` is empty)."""
    wanted = set(only or [])
    return [circuit for circuit in SAMPLE_CIRCUITS if not wanted or circuit["name"] in wanted]
