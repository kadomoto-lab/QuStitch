# Vendored XQsim

`backend/xqsim/` is vendored from **XQsim** by SNU-HPCS:
<https://github.com/SNU-HPCS/XQsim> (MIT License, Copyright (c) 2023 SNU-HPCS; see
[`LICENSE`](./LICENSE)).

QuStitch only uses XQsim's quantum compiler (`compiler/`) and cycle-level simulator
(`XQ-simulator/`). The following parts of the upstream repository were **removed** from
the vendored copy:

- `XQ-estimator/` (hardware estimation)
- the Jupyter notebooks and `figures/`
- the top-level drivers `xqsim.py`, `gen_single_esm.py` and `logical_simulation.py`
- the GPL-licensed prebuilt `compiler/gridsynth` executable (the Docker build
  fetches and verifies the official binary instead; see `../THIRD_PARTY_NOTICES.md`)

Everything that remains is byte-identical to upstream **except** the four files listed
below. The simulator extensions are opt-in and preserve upstream behaviour when disabled;
the compiler tracing, angle normalisation and process timeout are active changes documented
below.

## Modified files

### `compiler/gsc_compiler.py`

- **Compilation trace tracking.** `gsc_compiler` gains a `compilation_trace` dict
  (`circ_list`, `ppr_operations`, `ppm_operations`, `gate_transformations`).
  `decompose_Clifford_T_to_PPR` and `construct_one_block` accept a
  `track_transformations` flag; when set they additionally record, for every PPR/PPM
  block, the starting gate index and a step-by-step log of how each Clifford gate
  (H, S, CX) transformed the Pauli product. The compiler runs the tracked decomposition
  once to fill `compilation_trace`, then the untracked one to produce the `.qtrp` file
  exactly as before. Helper functions `_bit_index`, `_pauli_product_snapshot` and
  `_gate_qubit_indices` were added; the final ordering key uses `_bit_index` instead of
  `x[1].index` (same result for qiskit/pytket bits).
- **Rz angle normalisation in `rz_approximate_synthesis`.** The rotation angle is reduced
  modulo `2` (in units of pi) before the exact-match table, and the table covers all
  multiples of pi/4 (`0`, `1/4`, `1/2`, `3/4`, `1`, `5/4`, `3/2`, `7/4`), so e.g.
  `rz(pi/2)` becomes `S` and `rz(-pi/4)` becomes `T S S S` instead of being sent to
  gridsynth. Angles that are not multiples of pi/4 still go through gridsynth as upstream.
- **External process timeout.** The `gridsynth` invocation has a configurable wall-clock
  timeout (`XQSIM_GRIDSYNTH_TIMEOUT_SECONDS`, default 300 seconds) so malformed or unusually
  expensive input cannot hold an API worker indefinitely.

### `XQ-simulator/pauliframe_unit.py`

- Opt-in `sticky_error_pulse` flag (default `False`). The EDU's `output_valid` is a
  single-cycle pulse that is lost if it arrives while the PFU is not in `"waiting"`. When
  the flag is set, the pulse (and `pfflag`) is latched in `errorpend_reg` /
  `pfflagpend_reg` and consumed at the next `"waiting"` state. All three touched
  conditions are of the form `upstream_condition or (self.sticky_error_pulse and ...)`.

### `XQ-simulator/logical_measurement_unit.py`

- Opt-in `ungated_dqmeas_latch` flag (default `False`). Upstream only latches a
  `dqmeas_valid` pulse while `measop` is one of the LQM/MEAS_INTMD opcodes, so a pulse
  arriving out of that context is lost. When the flag is set the latch is unconditional,
  mirroring how `aqmeas` is already latched.

### `XQ-simulator/xq_simulator.py`

- `emulate` -> `skip_pqsim` in two places (`run()` after the simulation loop and
  `run_cycle_update()`). Upstream reads `self.emulate`, an attribute that `setup()` never
  defines; `skip_pqsim` is the attribute `setup()` actually sets.

## How QuStitch uses the flags

`qustitch_trace.emulation` sets `sticky_error_pulse` and `ungated_dqmeas_latch` only for
circuits whose QISA contains a feedback measurement (`LQM_FB`, i.e. circuits with T
gates) and only in emulate mode (`skip_pqsim=True`). Clifford-only circuits run the
vendored code with all flags at their upstream defaults.
