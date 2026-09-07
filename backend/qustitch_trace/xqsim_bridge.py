"""Path bootstrap, lazy imports and artifact naming for the vendored XQsim tree.

The vendored code has fixed expectations about where it lives:

- ``gsc_compiler`` resolves its parent directory (``backend/xqsim``) and writes
  artifacts to ``backend/xqsim/quantum_circuits/{open_qasm,transpiled,qisa_compiled,binary}``.
- ``xq_simulator`` calls ``os.chdir`` into its own directory in ``setup()`` and
  reads ``configs/`` and ``quantum_circuits/binary/`` relative to the same root.

This module mirrors those conventions so the interface layer and the core agree
on every path.
"""

from __future__ import annotations

import importlib
import os
import sys
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NamedTuple

XQSIM_ROOT = Path(os.path.abspath(__file__)).parent.parent / "xqsim"
XQSIM_SIMULATOR_DIR = XQSIM_ROOT / "XQ-simulator"
XQSIM_COMPILER_DIR = XQSIM_ROOT / "compiler"
XQSIM_CONFIG_DIR = XQSIM_ROOT / "configs"
ARTIFACT_ROOT = XQSIM_ROOT / "quantum_circuits"
ARTIFACT_SUBDIRS = ("open_qasm", "transpiled", "qisa_compiled", "binary")


def bootstrap_sys_path() -> None:
    """Put the vendored XQsim directories on ``sys.path`` (matching XQsim's own style).

    Each directory is inserted at the front, so the resulting order is
    ``xqsim/``, ``xqsim/compiler/``, ``xqsim/XQ-simulator/``, then everything else.
    """
    for directory in (XQSIM_SIMULATOR_DIR, XQSIM_COMPILER_DIR, XQSIM_ROOT):
        entry = str(directory)
        if entry not in sys.path:
            sys.path.insert(0, entry)


@dataclass(frozen=True)
class XqsimModules:
    """Entry points of qiskit and the vendored XQsim compiler/simulator."""

    quantum_circuit_cls: type
    gsc_compiler_cls: type
    decompose_qc_to_clifford_t: Callable[[Any], Any]
    xq_simulator_cls: type


def load_xqsim() -> XqsimModules:
    """Bootstrap ``sys.path`` and import qiskit plus the XQsim compiler and simulator.

    The imports are deliberately lazy: qiskit and ray are heavy, and the XQsim
    modules are only importable once the path bootstrap has run.
    """
    bootstrap_sys_path()
    quantum_circuit_cls = importlib.import_module("qiskit").QuantumCircuit
    gsc_mod = importlib.import_module("gsc_compiler")
    sim_mod = importlib.import_module("xq_simulator")
    return XqsimModules(
        quantum_circuit_cls=quantum_circuit_cls,
        gsc_compiler_cls=gsc_mod.gsc_compiler,
        decompose_qc_to_clifford_t=gsc_mod.decompose_qc_to_Clifford_T,
        xq_simulator_cls=sim_mod.xq_simulator,
    )


def ensure_artifact_root() -> Path:
    """Return the artifact root directory, creating the per-stage sub-directories.

    Important: ``gsc_compiler`` internally resolves ``<xqsim>/quantum_circuits``,
    so this path must match the compiler's.
    """
    for subdir in ARTIFACT_SUBDIRS:
        (ARTIFACT_ROOT / subdir).mkdir(parents=True, exist_ok=True)
    return ARTIFACT_ROOT


def make_job_name(num_qasm_qubits: int) -> str:
    """Return a unique job name in the ``{prefix}_n{N}`` format XQsim expects.

    XQsim parses ``N`` from the end of the qbin name to set ``num_lq = N + 2``,
    so ``N`` must be the last component.
    """
    return f"api_{uuid.uuid4().hex}_n{num_qasm_qubits}"


class ArtifactPaths(NamedTuple):
    """The four files produced by the compiler pipeline for one job."""

    qasm: Path
    qtrp: Path
    qisa: Path
    qbin: Path


def artifact_paths(job_name: str) -> ArtifactPaths:
    """Return the artifact paths for ``job_name`` (creating the directories)."""
    root = ensure_artifact_root()
    return ArtifactPaths(
        qasm=root / "open_qasm" / f"{job_name}.qasm",
        qtrp=root / "transpiled" / f"{job_name}.qtrp",
        qisa=root / "qisa_compiled" / f"{job_name}.qisa",
        qbin=root / "binary" / f"{job_name}.qbin",
    )
