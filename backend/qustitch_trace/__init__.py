"""QuStitch trace generator: OpenQASM 2.0 -> XQsim lattice-surgery patch trace (JSON).

The package is a thin input/output layer around the vendored XQsim compiler and
simulator (``backend/xqsim``). See :func:`trace_patches_from_qasm`.
"""

from __future__ import annotations

from .runner import TRACE_SCHEMA_VERSION, trace_patches_from_qasm

__version__ = "1.0.0"

__all__ = ["TRACE_SCHEMA_VERSION", "__version__", "trace_patches_from_qasm"]
