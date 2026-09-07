/**
 * Type definitions for the XQsim patch-trace JSON produced by the QuStitch backend
 * (`backend/qustitch_trace`). The schema is documented in `docs/TRACE_FORMAT.md`.
 */

// ---------------------------------------------------------------------------
// Patches
// ---------------------------------------------------------------------------

/** Patch type as reported by the XQsim patch information unit (PIU). */
export type PatchType = "zt" | "zb" | "mt" | "mb" | "m" | "x" | "awe" | "aw" | "ae" | "ac" | "i"

/** Boundary condition of a patch face or corner. */
export type BoundaryType = "i" | "x" | "z" | "y" | "pp" | "lp" | "mp" | "c" | "ze" | "ye" | "ie"
export type PatchFace = "n" | "s" | "e" | "w"
export type PatchCorner = "nw" | "ne" | "sw" | "se"
export type GridEdgeOrientation = "h" | "v"
export type Pauli = "I" | "X" | "Y" | "Z"

export type FaceBoundaries = Record<PatchFace, BoundaryType>
export type CornerBoundaries = Record<PatchCorner, BoundaryType>

export interface PatchOperation {
  pchop: string[]
  pchmreg: number[]
  pchpp: string[]
}

export interface Patch {
  /** Patch index (0-based, row-major). */
  pchidx: number
  row: number
  col: number
  pchtype: PatchType
  /** Static boundary assignment from the PIU. */
  static_bd?: {
    z_bd: string | null
    x_bd: string | null
  }
  merged: {
    reg: number
    mem: number
  }
  esmon?: number
  facebd: FaceBoundaries
  cornerbd: CornerBoundaries
  /** Per-patch operation fields carried by the PIU pipeline registers. */
  operation?: PatchOperation
  facebd_before?: FaceBoundaries
  facebd_after?: FaceBoundaries
  cornerbd_before?: CornerBoundaries
  cornerbd_after?: CornerBoundaries
  changed_faces?: PatchFace[]
  changed_corners?: PatchCorner[]
}

export type TraceSource = "xqsim" | "derived" | "inferred" | "schematic" | "unavailable"

/** A patch-state change accepted by the PIU (PREP_INFO / MERGE_INFO / SPLIT_INFO). */
export interface PatchEvent {
  /** Event sequence number (0-based). */
  seq: number
  /** Cycle at which the patch state finished changing. */
  cycle: number
  accepted_cycle?: number
  effect_cycle_start?: number | null
  effect_cycle_end?: number | null
  /** Index of the QISA instruction that caused this event. */
  qisa_idx: number
  inst: string
  instruction_trace_idx?: number
  qisa_raw?: string | null
  source?: TraceSource
  /** New state of every patch that changed (delta only). */
  patch_delta: Patch[]
}

export interface PatchInfo {
  initial: Patch[]
  events: PatchEvent[]
}

// ---------------------------------------------------------------------------
// Logical qubit mapping
// ---------------------------------------------------------------------------

export type LogicalQubitRole = "z_ancilla" | "m_ancilla" | "data" | "padding"

export interface LogicalQubitMapping {
  /** Internal logical-qubit index used by XQsim. */
  lq_idx: number
  role: LogicalQubitRole
  /** User-visible qubit index (`q[n]`); only for `data` and `padding` roles. */
  qubit_index?: number
  description: string
  patch_indices: number[]
  patch_coords: [number, number][]
  pchtype: string
}

// ---------------------------------------------------------------------------
// Clifford+T execution trace
// ---------------------------------------------------------------------------

export type GateExecutionType = "ppr" | "ppm" | "sqm" | "pauli_frame" | "no_effect"

export type AbsorptionEffect = "transform_pauli" | "propagate_pauli"

/** How a Clifford gate was absorbed into a later Pauli-product operation. */
export interface AbsorptionInfo {
  effect: AbsorptionEffect
  pauli_before?: string
  pauli_after?: string
  qubit?: number[]
  source_qubit?: number[]
  target_qubit?: number[]
  added_pauli?: string
  block_id?: string
  output_gate_idx?: number
  output_op_type?: "PPR" | "PPM" | "SQM" | string
}

export interface PauliProductTerm {
  pauli: Exclude<Pauli, "I"> | string
  qubit: number
}

export interface PauliProductTransformationStep {
  gate_idx: number
  gate: string
  qubits: number[]
  before: PauliProductTerm[]
  after: PauliProductTerm[]
  sign_before?: boolean
  sign_after?: boolean
  effects?: AbsorptionInfo[]
  block_id?: string
  output_gate_idx?: number
}

export interface QisaWindow {
  merge_event_seq?: number
  merge_cycle?: number
  merge_qisa_idx?: number
  merge_qisa_raw?: string | null
  split_event_seq?: number
  split_cycle?: number
  split_qisa_idx?: number
  split_qisa_raw?: string | null
}

/** One PPM / PPR / SQM block produced from a measurement or T gate. */
export interface PauliProductBlock {
  block_id: string
  op_type: "ppm" | "ppr" | "sqm" | string
  source_gate_idx: number
  source_gate?: string | null
  source_qubits?: number[]
  source_pauli_product: string[]
  source_target_qubits: number[]
  final_pauli_product: string[]
  target_qubits: number[]
  sign_positive?: boolean
  classical_target?: number | null
  transformation_steps: PauliProductTransformationStep[]
  transformation_log?: AbsorptionInfo[]
  cycle_start?: number
  cycle_end?: number
  cycle_after?: number
  cycle_before?: number
  basis?: "X" | "Z" | string
  qisa_window?: QisaWindow
}

export interface GateTraceEntry {
  gate_idx: number
  /** Lower-case gate name (`h`, `cx`, `s`, `t`, `measure`, ...). */
  gate: string
  qubits: number[][]
  execution_type: GateExecutionType
  pauli_product?: string[]
  target_qubits?: number[][]
  pauli_product_block_id?: string
  source_pauli_product?: string[]
  source_target_qubits?: number[]
  transformation_steps?: PauliProductTransformationStep[]
  /** MERGE_INFO cycle (PPM / PPR). */
  cycle_start?: number
  /** SPLIT_INFO cycle (PPM / PPR). */
  cycle_end?: number
  basis?: "X" | "Z"
  cycle_after?: number
  cycle_before?: number
  absorbed_into?: AbsorptionInfo[]
}

export interface CliffordTExecutionSummary {
  total_gates: number
  ppr_count: number
  ppm_count: number
  sqm_count: number
  pauli_frame_count: number
  all_gates_traced: boolean
  pauli_product_block_count?: number
}

export interface CliffordTExecutionTrace {
  gates: GateTraceEntry[]
  pauli_product_blocks?: PauliProductBlock[]
  summary: CliffordTExecutionSummary
}

// ---------------------------------------------------------------------------
// Instruction trace, surgery views, physical layout
// ---------------------------------------------------------------------------

export interface InstructionPatchOperand {
  pchidx: number
  row: number
  col: number
  selected: boolean
  pchpp: string[]
  pchop: string[]
  pchmreg: number[]
}

export interface InstructionTraceEntry {
  seq: number
  cycle: number
  qisa_idx: number
  raw_line?: string | null
  inst?: string | null
  opcode_bits?: string | null
  source?: TraceSource
  patch_event_seq?: number
  patches: InstructionPatchOperand[]
}

export type SurgeryKind = "prepare" | "merge" | "split"

export interface SurgeryFacePatch {
  pchidx: number
  row: number
  col: number
  faces: PatchFace[]
  facebd: FaceBoundaries
  pchpp: string[]
}

export interface SurgeryFace {
  id: string
  cycle: number
  event_seq: number
  qisa_idx?: number
  kind: SurgeryKind
  inst: string
  pauli?: string | null
  paulis: string[]
  patches: SurgeryFacePatch[]
  source: TraceSource
  inferred: boolean
}

export interface SurgerySeamOperand {
  pchidx: number
  row: number
  col: number
  selected?: boolean
  pchpp: string[]
  pchop: string[]
  pchmreg: number[]
  active_paulis: string[]
}

export interface SurgerySeamEndpoint {
  pchidx: number
  row: number
  col: number
  face: PatchFace
  facebd: BoundaryType
  pchtype?: string | null
  pchpp: string[]
  pchop?: string[]
  pchmreg?: number[]
}

export interface SurgerySeamEdge {
  id: string
  edge_key: string
  orientation: GridEdgeOrientation
  row: number
  col: number
  axis?: "horizontal" | "vertical"
  boundary: BoundaryType
  cycle: number
  event_seq: number
  qisa_idx?: number
  instruction_trace_idx?: number
  kind: SurgeryKind
  inst: string
  pauli?: string | null
  paulis: string[]
  endpoints: SurgerySeamEndpoint[]
  source: TraceSource
  inferred: boolean
  source_event_seq?: number
  source_qisa_idx?: number
  source_inst?: string
  reason?: string
}

export interface SurgerySeam {
  id: string
  event_seq: number
  cycle: number
  accepted_cycle?: number
  effect_cycle_start?: number | null
  effect_cycle_end?: number | null
  qisa_idx: number
  instruction_trace_idx: number
  inst: string
  kind: SurgeryKind
  edge_scope: "operation" | "active_after_event" | "changed_boundary"
  pauli?: string | null
  paulis: string[]
  edges: SurgerySeamEdge[]
  operands: SurgerySeamOperand[]
  raw: {
    qisa_raw?: string | null
    opcode_bits?: string | null
  }
  source: TraceSource
  inferred: boolean
}

export interface PhysicalLayout {
  source: TraceSource
  code_distance: number
  patch_grid: {
    rows: number
    cols: number
    num_patches: number
  }
  unit_cell: {
    rows_per_patch: number
    cols_per_patch: number
    qubits_per_cell: number
  }
  qubit_plane: {
    aq_rows: number
    aq_cols: number
    dq_rows: number
    dq_cols: number
    aq_per_patch: number
    dq_per_patch: number
  }
  indexing: {
    cwdarray_order: string[]
    qbidx_kind: Record<string, "dq" | "aq">
  }
}

export interface PhysicalScheduleOp {
  patch: {
    row: number
    col: number
    pchidx: number
  }
  unit_cell: {
    row: number
    col: number
  }
  qbidx: number
  qubit_kind: "dq" | "aq"
  op: string
}

export interface PhysicalScheduleFrame {
  cycle: number
  valid: boolean
  opcode?: string | null
  opcode_bits?: string | null
  timing?: number | null
  source: TraceSource
  ops: PhysicalScheduleOp[]
}

export interface TraceSummary {
  enum_values: {
    patch_types: string[]
    facebd: string[]
    cornerbd: string[]
    static_z_bd: string[]
    static_x_bd: string[]
    pchpp: string[]
    pchop: string[]
    instruction_insts: string[]
    event_insts: string[]
    surgery_seam_paulis?: string[]
    surgery_seam_sources?: string[]
  }
  counts: {
    initial_patches: number
    events: number
    instructions: number
    patch_deltas: number
    surgery_seams?: number
  }
}

// ---------------------------------------------------------------------------
// Top-level trace
// ---------------------------------------------------------------------------

/** One logical measurement sampled by the emulate-mode outcome oracle. */
export interface OracleSampleInfo {
  /** Pauli string in `lq_idx` order. */
  paulis: string
  outcome: number
  /** Probability of the +1 eigenvalue before sampling. */
  p_plus: number
}

export type TerminationReason = "normal" | "timeout" | "error" | "max_cycles"

export interface MetaInfo {
  version: number
  schema_version?: string
  config: string
  block_type: string
  code_distance: number
  patch_grid: {
    rows: number
    cols: number
  }
  num_patches: number
  total_cycles: number
  elapsed_seconds: number
  termination_reason: TerminationReason
  generation_mode?: {
    skip_pqsim: boolean
    physical_schedule_included: boolean
    physical_schedule_window?: {
      start_cycle?: number | null
      end_cycle?: number | null
      max_frames?: number
    } | null
  }
  logical_oracle?: {
    enabled: boolean
    samples?: OracleSampleInfo[]
  }
  provenance?: Record<string, TraceSource>
  truncation?: {
    physical_schedule?: boolean
    reason?: string | null
  }
  trace_summary?: TraceSummary
  forced_terminations: Array<Record<string, unknown>>
  stability_check_failures: Array<Record<string, unknown>>
  warnings: string[]
}

export interface InputInfo {
  qasm: string
  num_qasm_qubits: number
  num_compile_qubits: number
  padding_applied: boolean
}

export interface CompiledInfo {
  clifford_t_qasm: string
  clifford_t_qasm_padded: string | null
  qisa: string[]
  qbin_name: string
}

export interface TraceResult {
  schema_version?: string
  meta: MetaInfo
  input: InputInfo
  compiled: CompiledInfo
  patch: PatchInfo
  instruction_trace?: InstructionTraceEntry[]
  surgery_faces?: SurgeryFace[]
  surgery_seams?: SurgerySeam[]
  physical_layout?: PhysicalLayout
  physical_schedule?: PhysicalScheduleFrame[]
  logical_qubit_mapping?: LogicalQubitMapping[]
  clifford_t_execution_trace?: CliffordTExecutionTrace
}

/** Envelope returned by the HTTP API (`POST /trace`). */
export interface TraceResponse {
  result: TraceResult
}
