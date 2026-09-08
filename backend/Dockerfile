# syntax=docker/dockerfile:1
#
# QuStitch trace backend (linux/amd64)
#
# - We run on linux/amd64 and fetch the official gridsynth binary during the build.
#   The GPL-licensed binary is intentionally absent from the current source tree.
# - We do NOT change XQsim core logic; the container only provides a reproducible runtime.
FROM --platform=linux/amd64 python:3.10-slim-bullseye

ARG GRIDSYNTH_URL="https://www.mathstat.dal.ca/~selinger/newsynth/downloads/lin/gridsynth"
ARG GRIDSYNTH_SHA256="8633f62b36ac91b2d4805bfce852dc7f8491bf93836ce9ec9d06982d1b373515"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (keep minimal; wheels exist for most deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    curl \
    libffi7 \
    && rm -rf /var/lib/apt/lists/* && \
    # Create symlink for libffi.so.6 if needed by the fetched gridsynth binary.
    (ldconfig -p | grep -q libffi.so.7 && ln -sf /usr/lib/x86_64-linux-gnu/libffi.so.7 /usr/lib/x86_64-linux-gnu/libffi.so.6 || true)

# Install python deps
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -U pip && \
    # Keep upstream requirements.txt unchanged; fix platform-specific constraints at build time.
    # - ray==2.5.0 requires grpcio<=1.49.1 on macOS; align here as well for consistency.
    # - stim==1.11.0 fails to build on aarch64 due to x86 flags; install stim separately (wheel-only).
    sed 's/^grpcio==.*/grpcio==1.49.1/' /app/requirements.txt | grep -v '^stim==' > /tmp/requirements-docker.txt && \
    pip install --no-cache-dir -r /tmp/requirements-docker.txt && \
    # Allow source build on aarch64 (wheels may not be published for this platform/Python combo).
    pip install --no-cache-dir stim==1.15.0 && \
    # API server deps (interface layer)
    # NOTE: This repo pins ray==2.5.0 (requirements.txt). Ray 2.5.0 is not compatible with
    # pydantic v2 (FastAPI>=0.100 pulls pydantic v2), and /trace triggers Ray init.
    # Keep FastAPI on a pydantic v1-compatible version to avoid Ray dashboard/import crashes.
    pip install --no-cache-dir "pydantic<2" "fastapi==0.95.2" "uvicorn==0.22.0"

# Copy source (backend/ is the build context: qustitch_trace/, tools/, xqsim/)
COPY . /app

# Fetch the official newsynth 0.3.0.4 Linux binary and verify it before use.
# Source and GPLv3-or-later license:
# https://hackage.haskell.org/package/newsynth-0.3.0.4
RUN curl --fail --show-error --silent --location \
        "$GRIDSYNTH_URL" \
        --output /app/xqsim/compiler/gridsynth && \
    echo "$GRIDSYNTH_SHA256  /app/xqsim/compiler/gridsynth" | sha256sum --check --strict && \
    chmod 0755 /app/xqsim/compiler/gridsynth && \
    mkdir -p /app/licenses && \
    cp /usr/share/common-licenses/GPL-3 /app/licenses/GPL-3.0.txt

EXPOSE 8000

# Start API server
CMD ["python", "-m", "uvicorn", "qustitch_trace.api:app", "--host", "0.0.0.0", "--port", "8000"]
