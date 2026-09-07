import type {
  AbsorptionInfo,
  GateTraceEntry,
  InstructionTraceEntry,
  OracleSampleInfo,
  PatchEvent,
  TraceResult,
} from "@/types/trace"
import { firstNumber, qubitLabel } from "./refs"

/** MERGE → PPM_INTERPRET → SPLIT instructions that realise one lattice-surgery block. */
export interface QisaEventWindow {
  merge?: PatchEvent
  ppm?: InstructionTraceEntry
  split?: PatchEvent
}

export interface ObservableTerm {
  pauli: string
  qubit: number | null
}

export interface AbsorptionSummaryEntry {
  label: string
  count: number
}

export interface ScheduleRow {
  gate: GateTraceEntry
  observable: ObservableTerm[]
  absorptionSummary: AbsorptionSummaryEntry[]
  window?: QisaEventWindow
  outcome?: OracleSampleInfo
}

export function formatObservable(gate: GateTraceEntry): ObservableTerm[] {
  const paulis = gate.pauli_product ?? []
  const targets = gate.target_qubits ?? []
  return paulis.map((pauli, index) => ({ pauli, qubit: firstNumber(targets[index]) }))
}

export function absorptionLabel(absorption: AbsorptionInfo): string {
  if (absorption.effect === "transform_pauli") {
    const before = absorption.pauli_before ?? "?"
    const after = absorption.pauli_after ?? "?"
    return `${before}→${after} on ${qubitLabel(absorption.qubit)}`
  }
  const added = absorption.added_pauli ?? "?"
  return `add ${added} on ${qubitLabel(absorption.target_qubit)} from ${qubitLabel(absorption.source_qubit)}`
}

export function summarizeAbsorptions(absorptions?: AbsorptionInfo[]): AbsorptionSummaryEntry[] {
  if (!absorptions?.length) return []
  const counts = new Map<string, number>()
  absorptions.forEach((absorption) => {
    const label = absorptionLabel(absorption)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })
  return Array.from(counts, ([label, count]) => ({ label, count }))
}

/** Locate the MERGE / PPM_INTERPRET / SPLIT instructions belonging to a PPM or PPR gate. */
export function qisaWindowForGate(
  traceData: TraceResult,
  gate: GateTraceEntry
): QisaEventWindow | undefined {
  const { cycle_start: cycleStart, cycle_end: cycleEnd } = gate
  if (cycleStart === undefined || cycleEnd === undefined) return undefined

  const merge = traceData.patch.events.find(
    (event) => event.inst === "MERGE_INFO" && event.cycle === cycleStart
  )
  const split = traceData.patch.events.find(
    (event) => event.inst === "SPLIT_INFO" && event.cycle === cycleEnd
  )
  const ppm = traceData.instruction_trace?.find((instruction) => {
    if (instruction.inst !== "PPM_INTERPRET") return false
    if (merge && split) {
      return instruction.qisa_idx > merge.qisa_idx && instruction.qisa_idx < split.qisa_idx
    }
    return instruction.cycle >= cycleStart && instruction.cycle <= cycleEnd
  })

  return { merge, ppm, split }
}

export function isCurrentWindow(row: ScheduleRow, currentEvent?: PatchEvent | null): boolean {
  if (!currentEvent || !row.window?.merge || !row.window?.split) return false
  return currentEvent.seq >= row.window.merge.seq && currentEvent.seq <= row.window.split.seq
}

function canonicalOperatorKey(terms: Array<{ qubit: number; pauli: string }>): string {
  return [...terms]
    .sort((a, b) => a.qubit - b.qubit)
    .map((term) => `${term.pauli}${term.qubit}`)
    .join("|")
}

function oracleKeyFromSample(
  sample: OracleSampleInfo,
  lqToQubit: Map<number, number>
): string | null {
  const terms: Array<{ qubit: number; pauli: string }> = []
  for (let lqIdx = 0; lqIdx < sample.paulis.length; lqIdx++) {
    const pauli = sample.paulis[lqIdx]
    if (pauli === "I") continue
    const qubit = lqToQubit.get(lqIdx)
    // Measurements that involve an ancilla (magic / zero state) have no row in the user circuit.
    if (qubit === undefined) return null
    terms.push({ qubit, pauli })
  }
  return terms.length > 0 ? canonicalOperatorKey(terms) : null
}

function oracleKeyFromGate(gate: GateTraceEntry): string | null {
  const paulis = gate.pauli_product ?? []
  const targets = gate.target_qubits ?? []
  if (paulis.length === 0 || paulis.length !== targets.length) return null
  const terms: Array<{ qubit: number; pauli: string }> = []
  for (let index = 0; index < paulis.length; index++) {
    const qubit = firstNumber(targets[index])
    if (qubit === null) return null
    terms.push({ qubit, pauli: paulis[index] })
  }
  return canonicalOperatorKey(terms)
}

/**
 * Attach sampled measurement outcomes (emulate-mode oracle) to the PPM / SQM rows.
 *
 * Samples are recorded in execution order. The same operator can be measured
 * more than once, so samples are queued per operator key and rows consume them
 * in execution order (ascending `cycle_start`).
 */
export function attachOracleOutcomes(traceData: TraceResult, rows: ScheduleRow[]): void {
  const oracle = traceData.meta?.logical_oracle
  if (!oracle?.enabled || !oracle.samples?.length) return

  const lqToQubit = new Map<number, number>()
  traceData.logical_qubit_mapping?.forEach((lq) => {
    if (lq.role === "data" && lq.qubit_index !== undefined) {
      lqToQubit.set(lq.lq_idx, lq.qubit_index)
    }
  })
  if (lqToQubit.size === 0) return

  const queues = new Map<string, OracleSampleInfo[]>()
  oracle.samples.forEach((sample) => {
    const key = oracleKeyFromSample(sample, lqToQubit)
    if (!key) return
    const queue = queues.get(key) ?? []
    queue.push(sample)
    queues.set(key, queue)
  })

  const measurementRows = rows.filter(
    (row) => row.gate.execution_type === "ppm" || row.gate.execution_type === "sqm"
  )
  const executionOrdered = [...measurementRows].sort(
    (a, b) => (a.gate.cycle_start ?? Infinity) - (b.gate.cycle_start ?? Infinity)
  )
  executionOrdered.forEach((row) => {
    const key = oracleKeyFromGate(row.gate)
    if (!key) return
    const queue = queues.get(key)
    if (queue?.length) row.outcome = queue.shift()
  })
}

export function buildScheduleRows(traceData: TraceResult): ScheduleRow[] {
  const rows: ScheduleRow[] = (traceData.clifford_t_execution_trace?.gates ?? []).map((gate) => ({
    gate,
    observable: formatObservable(gate),
    absorptionSummary: summarizeAbsorptions(gate.absorbed_into),
    window: qisaWindowForGate(traceData, gate),
  }))
  attachOracleOutcomes(traceData, rows)
  return rows
}
