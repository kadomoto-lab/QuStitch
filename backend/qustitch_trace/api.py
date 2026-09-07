"""QuStitch Trace API (FastAPI interface layer).

Purpose:
    Expose the existing XQsim compiler/simulator "as is" over HTTP: accept an
    OpenQASM 2.0 string and return the patch-shape time series (JSON).

Notes:
    - This module only handles input/output (HTTP/JSON).
    - Quantum processing and simulation are delegated to the existing implementation.

Operational constraints:
    - Trace requests are serialised (a concurrent request gets a 429).
    - Running uvicorn with ``--workers 1`` is recommended.
    - Intercepting ``sys.exit`` affects the whole process, so concurrent
      execution is unsafe.

Run with: ``uvicorn qustitch_trace.api:app --host 0.0.0.0 --port 8000``
"""

from __future__ import annotations

import logging
import os
import threading
import time
import traceback
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, validator

from . import __version__
from .ray_setup import init_ray_once, shutdown_ray
from .runner import DEFAULT_CONFIG_NAME, trace_patches_from_qasm

logger = logging.getLogger(__name__)

# Global mutex used to serialise trace runs
_trace_lock = threading.Lock()
_trace_in_progress = False
_trace_start_time: float | None = None

# Limits configurable through environment variables
MAX_QASM_SIZE_BYTES = int(os.environ.get("XQSIM_MAX_QASM_SIZE_BYTES", str(1024 * 1024)))  # 1MB
MAX_QUBITS = int(os.environ.get("XQSIM_MAX_QUBITS", "20"))
MAX_DEPTH = int(os.environ.get("XQSIM_MAX_DEPTH", "1000"))
MAX_INSTRUCTIONS = int(os.environ.get("XQSIM_MAX_INSTRUCTIONS", "10000"))
TRACE_TIMEOUT_SECONDS = int(os.environ.get("XQSIM_TRACE_TIMEOUT_SECONDS", "300"))  # 5 minutes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan: initialise Ray on startup and shut it down on exit."""
    # Startup
    logger.info("Starting QuStitch Trace API server...")
    init_ray_once()
    logger.info(
        f"Configuration: MAX_QASM_SIZE={MAX_QASM_SIZE_BYTES}B, "
        f"MAX_QUBITS={MAX_QUBITS}, MAX_DEPTH={MAX_DEPTH}, "
        f"TRACE_TIMEOUT={TRACE_TIMEOUT_SECONDS}s"
    )
    yield
    # Shutdown
    logger.info("Shutting down QuStitch Trace API server...")
    if _trace_in_progress:
        logger.warning("Trace operation in progress during shutdown, may be interrupted")
    shutdown_ray()


app = FastAPI(
    title="QuStitch Trace API",
    version=__version__,
    lifespan=lifespan,
)


class TraceRequest(BaseModel):
    """Request body of ``POST /trace``."""

    qasm: str = Field(..., description="OpenQASM 2.0 text")
    config: str = Field(
        DEFAULT_CONFIG_NAME,
        description="Config name under xqsim/configs (without .json)",
    )
    keep_artifacts: bool = Field(False, description="Keep intermediate artifacts (debug)")
    debug_logging: bool = Field(False, description="Enable verbose debug logging")
    include_physical_schedule: bool = Field(
        False, description="Include sparse XQsim PSU physical operation schedule"
    )
    physical_schedule_start_cycle: int | None = Field(
        None, ge=0, description="Start cycle for physical schedule collection"
    )
    physical_schedule_end_cycle: int | None = Field(
        None, ge=0, description="End cycle for physical schedule collection"
    )
    max_physical_schedule_frames: int = Field(
        1000,
        ge=1,
        le=100000,
        description="Maximum sparse physical schedule frames to return",
    )

    @validator("qasm")
    def validate_qasm_size(cls, v: str) -> str:
        size = len(v.encode("utf-8"))
        if size > MAX_QASM_SIZE_BYTES:
            raise ValueError(f"QASM size exceeds limit: {size} bytes > {MAX_QASM_SIZE_BYTES} bytes")
        return v

    @validator("physical_schedule_end_cycle")
    def validate_schedule_window(cls, v: int | None, values: dict[str, Any]) -> int | None:
        start = values.get("physical_schedule_start_cycle")
        if v is not None and start is not None and v < start:
            raise ValueError("physical_schedule_end_cycle must be >= physical_schedule_start_cycle")
        return v


class TraceResponse(BaseModel):
    """Response body of ``POST /trace``."""

    result: dict[str, Any]


class ErrorResponse(BaseModel):
    """Error body."""

    detail: str


def validate_circuit_limits(qc: Any) -> None:
    """Check the circuit against the configured limits.

    Raises:
        ValueError: If a limit is exceeded.
    """
    num_qubits = qc.num_qubits
    if num_qubits > MAX_QUBITS:
        raise ValueError(f"Number of qubits exceeds limit: {num_qubits} > {MAX_QUBITS}")

    depth = qc.depth()
    if depth > MAX_DEPTH:
        raise ValueError(f"Circuit depth exceeds limit: {depth} > {MAX_DEPTH}")

    num_instructions = len(qc.data)
    if num_instructions > MAX_INSTRUCTIONS:
        raise ValueError(
            f"Number of instructions exceeds limit: {num_instructions} > {MAX_INSTRUCTIONS}"
        )


@app.get("/health")
def health() -> dict[str, Any]:
    """Health check; also reports whether a trace is running and the configured limits."""
    return {
        "status": "ok",
        "trace_in_progress": _trace_in_progress,
        "limits": {
            "max_qasm_size_bytes": MAX_QASM_SIZE_BYTES,
            "max_qubits": MAX_QUBITS,
            "max_depth": MAX_DEPTH,
            "max_instructions": MAX_INSTRUCTIONS,
            "trace_timeout_seconds": TRACE_TIMEOUT_SECONDS,
        },
    }


@app.post(
    "/trace",
    response_model=TraceResponse,
    responses={
        429: {"model": ErrorResponse, "description": "Trace already in progress"},
        400: {"model": ErrorResponse, "description": "Invalid input or simulation error"},
        504: {"model": ErrorResponse, "description": "Trace timeout"},
    },
)
def trace(req: TraceRequest) -> TraceResponse:
    """Generate a patch trace from QASM.

    Constraints:
        - This endpoint is serialised (only one request runs at a time).
        - A request arriving while another is running gets a 429.
        - Exceeding the timeout yields a 504.
    """
    global _trace_in_progress, _trace_start_time

    if not req.qasm or not req.qasm.strip():
        raise HTTPException(status_code=400, detail="qasm is empty")

    # Serialisation: return 429 if a trace is already running
    acquired = _trace_lock.acquire(blocking=False)
    if not acquired:
        raise HTTPException(
            status_code=429,
            detail="Another trace operation is in progress. Please try again later.",
        )

    try:
        _trace_in_progress = True
        _trace_start_time = time.time()

        # Lazy import (qiskit is heavy; import it after Ray has been initialised)
        from qiskit import QuantumCircuit

        # Parse the QASM and check the limits
        try:
            qc = QuantumCircuit.from_qasm_str(req.qasm)
            validate_circuit_limits(qc)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid QASM: {e}") from e

        # Run the trace with a timeout
        res = trace_patches_from_qasm(
            req.qasm,
            config_name=req.config,
            skip_pqsim=True,
            keep_artifacts=req.keep_artifacts,
            debug_logging=req.debug_logging,
            timeout_seconds=TRACE_TIMEOUT_SECONDS,
            include_physical_schedule=req.include_physical_schedule,
            physical_schedule_start_cycle=req.physical_schedule_start_cycle,
            physical_schedule_end_cycle=req.physical_schedule_end_cycle,
            max_physical_schedule_frames=req.max_physical_schedule_frames,
        )

        # Timeout check
        elapsed = time.time() - _trace_start_time
        if elapsed > TRACE_TIMEOUT_SECONDS:
            raise HTTPException(
                status_code=504,
                detail=f"Trace operation timed out after {elapsed:.1f} seconds",
            )

        return TraceResponse(result=res)

    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=f"Trace timeout: {e}") from e
    except RuntimeError as e:
        tb = traceback.format_exc()
        logger.error("Simulation error in /trace: %s\n%s", repr(e), tb)
        raise HTTPException(status_code=400, detail=f"Simulation error: {e}") from e
    except Exception as e:
        tb = traceback.format_exc()
        logger.error("Unhandled exception in /trace: %s\n%s", repr(e), tb)
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}") from e
    finally:
        _trace_in_progress = False
        _trace_start_time = None
        _trace_lock.release()
