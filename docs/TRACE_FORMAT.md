# Trace format

QuStitch visualizes **trace files**: JSON documents produced by the backend
(`backend/qustitch_trace`) from an OpenQASM 2.0 circuit. This document describes
schema version `1.1.0`. The TypeScript definitions in
[`frontend/src/types/trace.ts`](../frontend/src/types/trace.ts) are the
authoritative reference; the backend validator
[`backend/tools/validate_trace.py`](../backend/tools/validate_trace.py) checks
the invariants listed below.

A trace is either a bare trace object or, when it comes from the HTTP API, an
envelope `{ "result": <trace> }`. The frontend accepts both.

## Top-level structure

```jsonc
{
  "schema_version": "1.1.0",
  "meta": { ... },                       // run metadata
  "input": { ... },                      // the circuit that was traced
  "compiled": { ... },                   // Clifford+T QASM and QISA program
  "patch": { "initial": [...], "events": [...] },   // patch layout over time
  "instruction_trace": [...],            // every QISA instruction accepted by the PIU
  "surgery_faces": [...],                // derived: faces touched by each event
  "surgery_seams": [...],                // derived: pp edges active after each event
  "physical_layout": { ... },            // grid / unit-cell geometry
  "physical_schedule": [...],            // optional: sparse physical-qubit codewords
  "logical_qubit_mapping": [...],        // logical qubit -> patch assignment
  "clifford_t_execution_trace": { ... }  // how each input gate is executed
}
```

## `meta`

| Field | Description |
| --- | --- |
| `version` | Legacy API version (`3`). |
| `schema_version` | Same as the top-level `schema_version`. |
| `config` | XQsim configuration name (`example_cmos_d5` by default). |
| `block_type` | Logical block layout, `Distillation` in the shipped configs. |
| `code_distance` | Surface-code distance `d`. |
| `patch_grid` | `{ rows, cols }` of the logical patch grid. |
| `num_patches` | `rows × cols`. |
| `total_cycles` | Simulated control-processor cycles (1 cycle = 1 ns at 1 GHz). |
| `elapsed_seconds` | Wall-clock generation time. |
| `termination_reason` | `normal`, `timeout`, `max_cycles` or `error`. |
| `generation_mode` | `skip_pqsim` (physical-qubit simulation skipped), physical-schedule options. |
| `logical_oracle` | `{ enabled, samples }`; see [Logical outcome oracle](#logical-outcome-oracle). |
| `provenance` | For each section: `xqsim` (observed), `derived`, `inferred` or `unavailable`. |
| `truncation` | Whether `physical_schedule` was cut at `max_physical_schedule_frames`. |
| `trace_summary` | Enum values and counts found in the trace (used for validation). |
| `forced_terminations`, `stability_check_failures`, `warnings` | Diagnostics from the run. |

## `input` and `compiled`

`input.qasm` is the circuit exactly as submitted. XQsim requires an odd number
of logical data qubits, so circuits with an even qubit count are padded with one
unused qubit (`padding_applied: true`, `num_compile_qubits = num_qasm_qubits + 1`).

`compiled.clifford_t_qasm` is the gate-set-normalised circuit (for reference
only), `compiled.qisa` is the list of QISA instructions that XQsim executed, and
`compiled.qbin_name` is the temporary job name (contains a UUID).

Typical QISA instructions:

| Instruction | Meaning |
| --- | --- |
| `PREP_INFO` | Prepare patch boundaries for the next operation. |
| `LQI` | Logical-qubit initialisation. |
| `RUN_ESM` | One round of error-syndrome measurement. |
| `MERGE_INFO` / `SPLIT_INFO` | Lattice-surgery merge / split (opens / closes `pp` boundaries). |
| `INIT_INTMD` / `MEAS_INTMD` | Initialise / measure the intermediate (seam) qubits. |
| `PPM_INTERPRET` | Interpret the multi-body Pauli-product measurement. |
| `LQM_X` / `LQM_Y` / `LQM_Z` | Single-qubit logical measurement in the given basis. |
| `LQM_FB` | Measurement with feedback (used by T gates). |

## `patch`

`patch.initial` lists every patch on the grid; `patch.events` lists the moments
at which the patch information unit (PIU) accepted a `PREP_INFO`, `MERGE_INFO`
or `SPLIT_INFO` instruction. Each event carries the **new** state of the patches
that changed (`patch_delta`), so the layout at any event is obtained by applying
the deltas in order.

```jsonc
{
  "pchidx": 0, "row": 0, "col": 0,     // index and grid position
  "pchtype": "zt",                     // zt, zb, mt, mb, m, x, awe, aw, ae, ac, i
  "static_bd": { "z_bd": "...", "x_bd": "..." },
  "merged": { "reg": 0, "mem": 0 },
  "esmon": 1,
  "facebd":   { "w": "x", "n": "x", "e": "z", "s": "pp" },
  "cornerbd": { "nw": "c", "ne": "i", "sw": "i", "se": "i" },
  "operation": { "pchop": [...], "pchmreg": [...], "pchpp": ["X", "I"] },
  // present only inside patch_delta:
  "facebd_before": {...}, "facebd_after": {...},
  "cornerbd_before": {...}, "cornerbd_after": {...},
  "changed_faces": ["s"], "changed_corners": []
}
```

Boundary values (`facebd` / `cornerbd`):

| Value | Meaning | Drawn as |
| --- | --- | --- |
| `i` | Idle / inactive | not drawn |
| `x` | X-type boundary | red |
| `z`, `ze` | Z-type boundary | blue |
| `y`, `ye` | Y endpoint | violet, dashed |
| `pp`, `mp` | Open seam between merged patches | patches are joined |
| `lp` | Logical boundary | teal, dashed |
| `c` | Corner marker | dark |
| `ie` | Idle, extended | grey, dotted |

Event fields:

| Field | Description |
| --- | --- |
| `seq` | 0-based event number. |
| `cycle` | Cycle at which the patch state finished changing. |
| `accepted_cycle` | Cycle at which the PIU accepted the instruction. |
| `effect_cycle_start` / `effect_cycle_end` | First / last cycle with a patch-state change. |
| `qisa_idx`, `qisa_raw` | Index and text of the causing QISA instruction. |
| `instruction_trace_idx` | Index into `instruction_trace`. |
| `inst` | `PREP_INFO`, `MERGE_INFO` or `SPLIT_INFO`. |
| `patch_delta` | Changed patches (see above). |

Invariants checked by the validator: `seq` equals the array index, cycles are
monotonic, every event links to an `instruction_trace` entry with the same
`qisa_idx` and `inst`, and every delta carries `facebd_before/after` and
`changed_faces`.

## `instruction_trace`

One entry per QISA instruction accepted by the PIU, in execution order. Besides
`seq`, `cycle`, `qisa_idx`, `raw_line`, `inst` and `opcode_bits`, each entry
lists the patch operands that were active for the instruction (`patches[]` with
`selected`, `pchpp`, `pchop`, `pchmreg`). Entries that produced a patch event
carry `patch_event_seq`.

## `surgery_faces` and `surgery_seams`

Both are **derived** from the patch state (provenance `derived`, or `inferred`
where a Pauli operand had to be matched heuristically):

- `surgery_faces`: for each event, the faces of the changed patches that are
  not idle and the Pauli operands of the instruction.
- `surgery_seams`: for each event, the grid edges (`edge_key` such as `h:1:2`
  for the horizontal edge above row 1, column 2, or `v:0:3`) whose two sides are
  both `pp`, with their endpoints and the Pauli letter(s) carried across the
  seam. `edge_scope` is `active_after_event` when the seam list reflects the
  full state after the event.

## `logical_qubit_mapping`

XQsim assigns logical qubits as follows:

| `lq_idx` | `role` | Description |
| --- | --- | --- |
| 0 | `z_ancilla` | Magic-state ancilla used by T gates |
| 1 | `m_ancilla` | Zero-state ancilla used by measurements |
| 2 … | `data` | User qubits `q[0]`, `q[1]`, … (`qubit_index`) |
| last | `padding` | Unused qubit added to make the count odd |

Each entry lists `patch_indices` and `patch_coords` (`[row, col]`) of the patches
that hold the qubit.

## `clifford_t_execution_trace`

Explains how every gate of the input circuit is executed on the surface code.

```jsonc
{
  "gates": [
    { "gate_idx": 0, "gate": "h", "qubits": [[0]], "execution_type": "pauli_frame",
      "absorbed_into": [ { "effect": "transform_pauli", "pauli_before": "Z", "pauli_after": "X", "qubit": [0], "block_id": "PPM:0" } ] },
    { "gate_idx": 2, "gate": "measure", "qubits": [[0], [0]], "execution_type": "ppm",
      "pauli_product": ["X", "Z"], "target_qubits": [[0], [1]],
      "pauli_product_block_id": "PPM:0", "cycle_start": 18, "cycle_end": 5121 }
  ],
  "pauli_product_blocks": [
    { "block_id": "PPM:0", "op_type": "ppm", "source_gate_idx": 2, "source_gate": "measure",
      "source_pauli_product": ["Z"], "source_target_qubits": [0],
      "final_pauli_product": ["X", "Z"], "target_qubits": [0, 1],
      "transformation_steps": [ ... ], "cycle_start": 18, "cycle_end": 5121,
      "qisa_window": { "merge_event_seq": 0, "split_event_seq": 1, ... } }
  ],
  "summary": { "total_gates": 4, "ppr_count": 0, "ppm_count": 1, "sqm_count": 1,
               "pauli_frame_count": 2, "all_gates_traced": true, "pauli_product_block_count": 2 }
}
```

`execution_type` values:

| Value | Meaning |
| --- | --- |
| `ppr` | T gate executed as a π/8 Pauli-product rotation (merge with the magic-state ancilla). |
| `ppm` | Measurement executed as a multi-body Pauli-product measurement (merge / split). |
| `sqm` | Measurement executed as a single-qubit logical measurement (`LQM_*`). |
| `pauli_frame` | Clifford gate absorbed into a later block by Pauli propagation. |
| `no_effect` | Gate that did not affect any block. |

For `ppm` / `ppr`, `cycle_start` and `cycle_end` are the cycles of the
corresponding `MERGE_INFO` and `SPLIT_INFO` events. QISA executes blocks in a
different order than the program order, so the backend matches blocks to
merge/split windows by decoding the Pauli mask of each `MERGE_INFO`. For `sqm`,
`cycle_after` / `cycle_before` bound the measurement.

Each `pauli_product_block` records the propagation of the source Pauli (`Z` on
the measured / rotated qubit) backwards through the preceding Clifford gates:
`transformation_steps[]` holds one `{ gate_idx, gate, before, after, effects }`
entry per gate that changed the product.

## Logical outcome oracle

The backend runs XQsim in *emulate* mode (no physical-qubit simulation), in
which logical measurement values are not physically meaningful. For circuits
with feedback (T gates) and, optionally, for any circuit
(`--logical-oracle`), the backend samples measurement outcomes from an ideal
logical-state simulation with a fixed seed and feeds them back to the control
processor. The samples are stored in `meta.logical_oracle.samples` as
`{ paulis, outcome, p_plus }` in execution order, where `paulis` is the measured
Pauli string in `lq_idx` order and `p_plus` the probability of the `+1`
eigenvalue. The frontend shows them in the execution schedule.

## `physical_layout` and `physical_schedule`

`physical_layout` describes the geometry XQsim uses (`unit_cell` per patch,
ancilla / data qubit counts, the ordering of the 5-D codeword array).
`physical_schedule` is only present when a trace was generated with
`include_physical_schedule`; it lists sparse frames of physical-qubit operations
scheduled by the PSU and is not used by the current UI.
