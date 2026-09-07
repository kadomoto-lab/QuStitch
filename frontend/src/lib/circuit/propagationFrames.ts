import { firstNumber, numericList, type NumericRef } from "@/lib/trace/refs"
import { sourceGateLabel } from "@/lib/trace/labels"
import type { GateTraceEntry, PauliProductBlock } from "@/types/trace"
import type { CircuitGate, QuantumCircuit } from "./types"

export type FramePhase = "forming" | "preview" | "added" | "complete" | "pauli-frame"

export interface PropagationTerm {
  pauli: string
  qubit: number
}

/** One step of the Pauli-propagation animation. */
export interface PropagationFrame {
  id: string
  phase: FramePhase
  block?: PauliProductBlock
  blockIndex?: number
  activeGateIdx?: number
  terms: PropagationTerm[]
  title: string
  detail: string
}

/** Language-specific text builders for frame titles and details. */
export interface PropagationFrameText {
  sourceSummary: (source: string, absorbedCount: number, terms: string) => string
  formingDetail: (summary: string) => string
  previewDetail: (summary: string) => string
  addedDetail: (terms: string) => string
  completeTitle: string
  completeDetail: string
  pauliFrameDetail: (count: number) => string
}

export interface RelatedGate {
  gateIdx: number
  qubits: number[]
  color: string
  key: string
}

export const SOURCE_GATE_COLOR = "#38bdf8"
export const ABSORBED_GATE_COLOR = "#f59e0b"

/** Terms from parallel `paulis` / `qubits` arrays, keeping every letter (including `I`). */
export function termsFromProduct(paulis?: string[], qubits?: NumericRef[]): PropagationTerm[] {
  if (!paulis || !qubits) return []
  return paulis
    .flatMap((pauli, index) => {
      const qubit = firstNumber(qubits[index])
      return qubit === null ? [] : [{ pauli, qubit }]
    })
    .sort((a, b) => a.qubit - b.qubit)
}

export function productLabel(terms: PropagationTerm[]): string {
  return terms.map((term) => term.pauli).join("") || "I"
}

export function termsLabel(terms: PropagationTerm[]): string {
  if (terms.length === 0) return "I"
  return terms.map((term) => `${term.pauli}(q${term.qubit})`).join(" ⊗ ")
}

/** Label input measurements with the basis the compiler assigned to them. */
export function annotateMeasurementBases(
  circuit: QuantumCircuit,
  blocks: PauliProductBlock[]
): QuantumCircuit {
  const blockBySourceGate = new Map<number, PauliProductBlock>()
  blocks.forEach((block) => {
    if (block.source_gate === "measure" && block.source_gate_idx !== undefined) {
      blockBySourceGate.set(block.source_gate_idx, block)
    }
  })

  return {
    ...circuit,
    gates: circuit.gates.map((gate, gateIndex) => {
      if (gate.type !== "measure") return gate
      const block =
        blockBySourceGate.get(gateIndex) ??
        blocks.find((candidate) => {
          if (candidate.source_gate !== "measure") return false
          const qubit = firstNumber(candidate.source_qubits?.[0])
          const classical = firstNumber(candidate.classical_target)
          return (
            qubit === gate.targets[0] &&
            (gate.classical === undefined || classical === gate.classical)
          )
        })
      const basis = block?.source_pauli_product?.length === 1 ? block.source_pauli_product[0] : "Z"
      return { ...gate, pauliProductLabel: basis }
    }),
  }
}

export function makeFrames(
  blocks: PauliProductBlock[],
  pauliFrameGates: GateTraceEntry[],
  text: PropagationFrameText
): PropagationFrame[] {
  const frames: PropagationFrame[] = []

  blocks.forEach((block, blockIndex) => {
    const finalTerms = termsFromProduct(block.final_pauli_product, block.target_qubits)
    const absorbedGateCount = new Set(
      (block.transformation_steps ?? []).map((step) => step.gate_idx)
    ).size
    const title = `${block.op_type.toUpperCase()} ${productLabel(finalTerms)}`
    const summary = text.sourceSummary(
      sourceGateLabel(block),
      absorbedGateCount,
      termsLabel(finalTerms)
    )
    const base = {
      block,
      blockIndex,
      activeGateIdx: block.source_gate_idx,
      terms: finalTerms,
      title,
    }

    frames.push(
      {
        ...base,
        id: `${block.block_id}:forming`,
        phase: "forming",
        detail: text.formingDetail(summary),
      },
      {
        ...base,
        id: `${block.block_id}:preview`,
        phase: "preview",
        detail: text.previewDetail(summary),
      },
      {
        ...base,
        id: `${block.block_id}:added`,
        phase: "added",
        detail: text.addedDetail(termsLabel(finalTerms)),
      }
    )
  })

  frames.push({
    id: "complete",
    phase: "complete",
    terms: [],
    title: text.completeTitle,
    detail: text.completeDetail,
  })

  const pauliOnly = pauliFrameGates.filter((gate) =>
    ["x", "y", "z"].includes(gate.gate.toLowerCase())
  )
  if (pauliOnly.length > 0) {
    frames.push({
      id: "pauli-frame",
      phase: "pauli-frame",
      activeGateIdx: pauliOnly[0].gate_idx,
      terms: [],
      title: "X/Y/Z → Pauli frame",
      detail: text.pauliFrameDetail(pauliOnly.length),
    })
  }

  return frames
}

/** Number of result primitives that are visible at `frame`. */
export function visibleBlockCount(frame: PropagationFrame | null, totalBlocks: number): number {
  if (!frame) return 0
  if (frame.phase === "complete" || frame.phase === "pauli-frame") return totalBlocks
  if (frame.blockIndex === undefined) return 0
  return frame.phase === "forming" ? frame.blockIndex : frame.blockIndex + 1
}

function blockToResultGate(
  block: PauliProductBlock,
  classicalIndex: number,
  ancillaQubit: number
): CircuitGate | null {
  const terms = termsFromProduct(block.final_pauli_product, block.target_qubits)
  if (terms.length === 0) return null

  const op = block.op_type.toLowerCase()
  if (op === "sqm" && terms.length === 1) {
    return {
      type: "measure",
      targets: [terms[0].qubit],
      classical: classicalIndex,
      pauliProductLabel: terms[0].pauli,
    }
  }

  return {
    type: op === "ppr" ? "ppr" : "ppm",
    targets: [ancillaQubit],
    classical: classicalIndex,
    pauliProductLabel: productLabel(terms),
    productTargets: terms.map((term) => term.qubit),
    productPaulis: terms.map((term) => term.pauli),
  }
}

/** The result circuit with the first `visibleBlocks` primitives placed. */
export function buildResultCircuit(
  sourceCircuit: QuantumCircuit,
  blocks: PauliProductBlock[],
  visibleBlocks: number
): QuantumCircuit {
  const needsAncilla = blocks.some((block) => block.op_type.toLowerCase() !== "sqm")
  const ancillaQubit = sourceCircuit.qubits
  const gates = blocks
    .slice(0, visibleBlocks)
    .map((block, index) => blockToResultGate(block, index, ancillaQubit))
    .filter((gate): gate is CircuitGate => gate !== null)

  return {
    qubits: sourceCircuit.qubits + (needsAncilla ? 1 : 0),
    classicalBits: blocks.length > 0 ? Math.max(1, blocks.length) : sourceCircuit.classicalBits,
    gates,
  }
}

/** Input gates involved in a block: its source gate plus every absorbed Clifford. */
export function relatedGates(block?: PauliProductBlock): RelatedGate[] {
  if (!block) return []
  const gates = new Map<number, RelatedGate>()
  gates.set(block.source_gate_idx, {
    gateIdx: block.source_gate_idx,
    qubits: numericList(block.source_qubits),
    color: SOURCE_GATE_COLOR,
    key: "source",
  })
  ;(block.transformation_steps ?? []).forEach((step, index) => {
    if (gates.has(step.gate_idx)) return
    gates.set(step.gate_idx, {
      gateIdx: step.gate_idx,
      qubits: numericList(step.qubits),
      color: ABSORBED_GATE_COLOR,
      key: `absorbed-${index}`,
    })
  })
  return [...gates.values()].sort((a, b) => a.gateIdx - b.gateIdx)
}
