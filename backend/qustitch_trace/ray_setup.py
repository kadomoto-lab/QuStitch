"""Process-wide Ray initialisation shared by the CLI, the tools and the API server.

XQsim's quantum execution unit is built on Ray. Left to its own devices Ray
auto-initialises on first use with one worker per CPU core and an object store
sized at 30% of RAM, which is wasteful for a single sequential simulation and
harmful when many traces run in parallel on a large machine. QuStitch therefore
initialises Ray explicitly with a small, configurable footprint.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

DEFAULT_OBJECT_STORE_MB = 256
DEFAULT_NUM_CPUS = 1
RAY_TEMP_DIR = "/tmp/ray"
PLASMA_FALLBACK_DIR = "/tmp/ray_plasma"


def _plasma_directory(object_store_mb: int) -> str:
    """Prefer ``/dev/shm`` for the object store; fall back to ``/tmp`` if it is missing or full."""
    plasma_dir = "/dev/shm"
    if not os.path.exists(plasma_dir):
        os.makedirs(PLASMA_FALLBACK_DIR, exist_ok=True)
        logger.warning(f"/dev/shm not found, falling back to {PLASMA_FALLBACK_DIR}")
        return PLASMA_FALLBACK_DIR

    try:
        stat = os.statvfs(plasma_dir)
        available_mb = (stat.f_bavail * stat.f_frsize) / (1024 * 1024)
        if available_mb < object_store_mb * 1.5:
            os.makedirs(PLASMA_FALLBACK_DIR, exist_ok=True)
            logger.warning(
                f"/dev/shm has only {available_mb:.0f}MB available, "
                f"falling back to {PLASMA_FALLBACK_DIR}"
            )
            return PLASMA_FALLBACK_DIR
    except Exception as e:
        logger.warning(f"Failed to check /dev/shm capacity: {e}")
    return plasma_dir


def init_ray_once() -> None:
    """Initialise Ray exactly once per process with a small footprint.

    Environment variables:
        ``XQSIM_RAY_OBJECT_STORE_MB`` (default 256) and ``XQSIM_RAY_NUM_CPUS`` (default 1).

    Calling ``ray.init()`` per trace would pile up object stores, so this is a no-op
    when Ray is already initialised.
    """
    import ray

    if ray.is_initialized():
        logger.info("Ray already initialized, skipping")
        return

    os.environ.setdefault("RAY_DISABLE_DASHBOARD", "1")
    os.environ.setdefault("RAY_DASHBOARD_ENABLED", "0")
    os.environ.setdefault("RAY_USAGE_STATS_ENABLED", "0")

    object_store_mb = int(os.environ.get("XQSIM_RAY_OBJECT_STORE_MB", str(DEFAULT_OBJECT_STORE_MB)))
    num_cpus = int(os.environ.get("XQSIM_RAY_NUM_CPUS", str(DEFAULT_NUM_CPUS)))
    plasma_dir = _plasma_directory(object_store_mb)

    try:
        ray.init(
            ignore_reinit_error=True,
            include_dashboard=False,
            log_to_driver=False,
            num_cpus=num_cpus,
            object_store_memory=object_store_mb * 1024 * 1024,
            _plasma_directory=plasma_dir,
            _temp_dir=RAY_TEMP_DIR,
        )
        logger.info(f"Ray initialized: object_store={object_store_mb}MB, plasma_dir={plasma_dir}")
    except Exception as e:
        logger.error(f"Failed to initialize Ray: {e}")
        raise


def shutdown_ray() -> None:
    """Shut Ray down if this process initialised it (errors are logged, not raised)."""
    try:
        import ray

        if ray.is_initialized():
            ray.shutdown()
            logger.info("Ray shutdown completed")
    except Exception as e:
        logger.warning(f"Ray shutdown failed: {e}")
