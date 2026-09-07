# QuStitch backend (`qustitch-trace`)

The QuStitch backend turns an OpenQASM 2.0 circuit into a lattice-surgery **patch
trace**: a cycle-accurate JSON time series of how the surface-code patches are
prepared, merged and split while the circuit runs on the
[XQsim](https://github.com/SNU-HPCS/XQsim) quantum control processor simulator.

XQsim's compiler and simulator are vendored unchanged in `xqsim/` (see
[`UPSTREAM.md`](./UPSTREAM.md) for the few opt-in modifications). Everything under
`qustitch_trace/` is an input/output layer around them: it compiles the circuit, steps
the simulator cycle by cycle, observes the patch information unit and serialises the
result.

## Layout

```
backend/
  qustitch_trace/        # the trace generator package (CLI + FastAPI app)
  tools/                 # sample regeneration, trace validation, API batch client
  tests/                 # pytest suite (no full simulations)
  xqsim/                 # vendored XQsim (compiler, simulator, configs, gridsynth)
  Dockerfile, docker-compose.yml, requirements.txt, pyproject.toml
```

## Quick start (Docker)

```bash
docker compose build backend
docker compose up -d backend
curl http://localhost:8000/health
curl -X POST http://localhost:8000/trace \
  -H "Content-Type: application/json" \
  -d '{"qasm": "OPENQASM 2.0;\ninclude \"qelib1.inc\";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];"}'
```

## Local setup

Python 3.10 is recommended (the upstream pins target it).

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Generate a trace from the command line:

```bash
python -m qustitch_trace --qasm-file circuit.qasm --out trace.json
python -m qustitch_trace --help
```

Run the API server:

```bash
uvicorn qustitch_trace.api:app --host 0.0.0.0 --port 8000 --workers 1
```

Tools (run from `backend/`):

```bash
python tools/validate_trace.py trace.json            # validate the JSON contract
python tools/regenerate_samples.py --only circuit_2q_bell_state   # rebuild frontend samples
python tools/request_traces.py --url http://localhost:8000        # batch-request via the API
```

Tests and linting:

```bash
python -m pytest tests -q
python -m ruff check . && python -m ruff format --check qustitch_trace tools tests
```

## API

### `GET /health`

Returns the server status, whether a trace is running and the configured limits.

### `POST /trace`

Request body:

| field | default | description |
| --- | --- | --- |
| `qasm` | (required) | OpenQASM 2.0 text |
| `config` | `"example_cmos_d5"` | config name under `xqsim/configs/` (without `.json`) |
| `keep_artifacts` | `false` | keep the generated compiler files |
| `debug_logging` | `false` | verbose logging |
| `include_physical_schedule` | `false` | include the sparse PSU physical operation schedule |
| `physical_schedule_start_cycle` / `physical_schedule_end_cycle` | `null` | window for the physical schedule |
| `max_physical_schedule_frames` | `1000` | frame cap for the physical schedule |

The response is `{"result": <trace>}`. The trace contains `meta`, `input`, `compiled`
(Clifford+T QASM and the full QISA listing), `patch` (initial patches and events),
`instruction_trace`, `surgery_faces`, `surgery_seams`, `physical_layout`,
`logical_qubit_mapping` and `clifford_t_execution_trace`.

Notes:

- A trace can take from minutes to well over an hour depending on the circuit.
- Only one trace runs at a time (a concurrent request gets `429`).
- Errors from the simulator map to `400`, timeouts to `504`.

### Environment variables

| variable | default |
| --- | --- |
| `XQSIM_MAX_QASM_SIZE_BYTES` | `1048576` |
| `XQSIM_MAX_QUBITS` | `20` |
| `XQSIM_MAX_DEPTH` | `1000` |
| `XQSIM_MAX_INSTRUCTIONS` | `10000` |
| `XQSIM_TRACE_TIMEOUT_SECONDS` | `300` (`86400` in `docker-compose.yml`) |
| `XQSIM_RAY_OBJECT_STORE_MB` | `256` |
| `XQSIM_RAY_NUM_CPUS` | `1` |
| `XQSIM_DEBUG_LOG_INTERVAL` | `1000` |

## Configurations

`xqsim/configs/` ships the upstream XQsim configurations: `example_cmos_d5` (default),
`example_rsfq_d5`, `current_300K_CMOS`, `nearfuture_4K_CMOS`, `nearfuture_4K_CMOS_Vopt`,
`nearfuture_4K_RSFQ`, `future_4K_ERSFQ`.

## Citation

If you use XQsim in your research, please cite:

```
@inproceedings{byun2022xqsim,
    title={XQsim: modeling cross-technology control processors for 10+ K qubit quantum computers},
    author={Byun, Ilkwon and Kim, Junpyo and Min, Dongmoon and Nagaoka, Ikki and Fukumitsu, Kosuke and Ishikawa, Iori and Tanimoto, Teruo and Tanaka, Masamitsu and Inoue, Koji and Kim, Jangwoo},
    booktitle={Proceedings of the 49th Annual International Symposium on Computer Architecture},
    pages={366--382},
    year={2022}
}
```

## License

XQsim is distributed under the MIT License (Copyright (c) 2023 SNU-HPCS); see
[`LICENSE`](./LICENSE) and [`UPSTREAM.md`](./UPSTREAM.md).
