import {
  applyGateBackward,
  pauliProductLabel,
  termsFromPauliProduct,
  type PauliTerm,
} from "@/lib/circuit/pauli"
import type { CircuitGate, QuantumCircuit } from "@/lib/circuit/types"
import type { GateTraceEntry, PauliProductBlock, TraceResult } from "@/types/trace"
import { firstNumber } from "./refs"
import { qisaWindowForGate, type QisaEventWindow, type ScheduleRow } from "./schedule"

export type TransformationKind = "ppm" | "ppr" | "sqm"

/** Source Pauli → final Pauli product for one measurement / T gate. */
export interface TransformationBlock {
  outputGate: GateTraceEntry
  kind: TransformationKind
  source: PauliTerm[]
  derivedFinal: PauliTerm[]
  window?: QisaEventWindow
}

export function transformKind(gate: GateTraceEntry): TransformationKind | null {
  if (
    gate.execution_type === "ppm" ||
    gate.execution_type === "ppr" ||
    gate.execution_type === "sqm"
  ) {
    return gate.execution_type
  }
  return null
}

/**
 * Re-derive the Pauli propagation on the client for traces produced by older
 * backends that do not include `pauli_product_blocks`.
 */
function buildFallbackTransformationBlocks(
  traceData: TraceResult,
  scheduleRows: ScheduleRow[]
): TransformationBlock[] {
  const gates = traceData.clifford_t_execution_trace?.gates ?? []
  return scheduleRows.flatMap((row) => {
    const kind = transformKind(row.gate)
    if (!kind) return []

    const sourceQubit = firstNumber(row.gate.qubits[0])
    if (sourceQubit === null) return []

    let current: PauliTerm[] = [{ pauli: "Z", qubit: sourceQubit }]
    for (let index = row.gate.gate_idx - 1; index >= 0; index--) {
      const gate = gates[index]
      if (!gate) continue
      current = applyGateBackward(current, gate)
    }

    return [
      {
        outputGate: row.gate,
        kind,
        source: [{ pauli: "Z", qubit: sourceQubit }],
        derivedFinal: current,
        window: row.window,
      },
    ]
  })
}

function blockFromBackend(
  block: PauliProductBlock,
  gates: GateTraceEntry[],
  traceData: TraceResult
): TransformationBlock | null {
  const outputGate = gates.find((gate) => gate.gate_idx === block.source_gate_idx)
  const kind =
    block.op_type === "ppm" || block.op_type === "ppr" || block.op_type === "sqm"
      ? block.op_type
      : null
  if (!outputGate || !kind) return null

  const scheduleLikeGate: GateTraceEntry = {
    ...outputGate,
    cycle_start: block.cycle_start ?? outputGate.cycle_start,
    cycle_end: block.cycle_end ?? outputGate.cycle_end,
  }

  return {
    outputGate,
    kind,
    source: termsFromPauliProduct(block.source_pauli_product, block.source_target_qubits),
    derivedFinal: termsFromPauliProduct(block.final_pauli_product, block.target_qubits),
    window: qisaWindowForGate(traceData, scheduleLikeGate),
  }
}

export function buildTransformationBlocks(
  traceData: TraceResult,
  scheduleRows: ScheduleRow[]
): TransformationBlock[] {
  const backendBlocks = traceData.clifford_t_execution_trace?.pauli_product_blocks
  const gates = traceData.clifford_t_execution_trace?.gates ?? []
  if (backendBlocks?.length) {
    return backendBlocks
      .map((block) => blockFromBackend(block, gates, traceData))
      .filter((block): block is TransformationBlock => block !== null)
  }
  return buildFallbackTransformationBlocks(traceData, scheduleRows)
}

/**
 * Build the "after Pauli frame" circuit: every measurement / T gate becomes a
 * PPM / PPR / SQM primitive, Pauli gates that fell into the frame are kept as
 * plain X / Y / Z boxes, and everything else disappears.
 */
export function buildTransformedCircuit(
  originalQubitCount: number,
  originalClassicalBits: number,
  gateTrace: GateTraceEntry[],
  blocks: TransformationBlock[]
): QuantumCircuit | null {
  const hasProductLayer = blocks.some((block) => block.kind === "ppm" || block.kind === "ppr")
  const productRow = originalQubitCount
  const blockByGateIdx = new Map(blocks.map((block) => [block.outputGate.gate_idx, block]))
  const gates: CircuitGate[] = []

  gateTrace.forEach((gate) => {
    const block = blockByGateIdx.get(gate.gate_idx)

    if (block) {
      const terms = block.derivedFinal.length ? block.derivedFinal : block.source
      const label = pauliProductLabel(terms)
      if (block.kind === "sqm") {
        const term = terms[0]
        if (term) {
          gates.push({
            type: "measure",
            targets: [term.qubit],
            classical: firstNumber(gate.qubits[1]) ?? gates.length,
            pauliProductLabel: label || term.pauli,
          })
        }
      } else {
        gates.push({
          type: block.kind,
          targets: [productRow],
          classical: firstNumber(gate.qubits[1]) ?? gates.length,
          pauliProductLabel: label || block.kind.toUpperCase(),
          productTargets: terms.map((term) => term.qubit),
          productPaulis: terms.map((term) => term.pauli),
        })
      }
      return
    }

    if (gate.execution_type === "pauli_frame") {
      const gateName = gate.gate.toLowerCase()
      if (gateName === "x" || gateName === "y" || gateName === "z") {
        const qubit = firstNumber(gate.qubits[0])
        if (qubit !== null) gates.push({ type: gateName, targets: [qubit] })
      }
    }
  })

  if (gates.length === 0) return null

  const hasMeasurement = gates.some(
    (gate) => gate.type === "measure" || gate.type === "ppm" || gate.type === "ppr"
  )
  return {
    qubits: originalQubitCount + (hasProductLayer ? 1 : 0),
    classicalBits: hasMeasurement ? Math.max(originalClassicalBits, 1) : 0,
    gates,
  }
}
