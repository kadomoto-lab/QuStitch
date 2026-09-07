import type { GateTraceEntry, PauliProductBlock } from "@/types/trace"
import {
  classicalBracketLabel,
  classicalLabel,
  qubitBracketLabel,
  qubitLabel,
  type NumericRef,
} from "./refs"

export function gateDisplayName(gate: string): string {
  const normalized = gate.toLowerCase()
  if (normalized === "cx" || normalized === "cnot") return "CNOT"
  if (normalized === "measure") return "MEASURE"
  return gate.toUpperCase()
}

/** Compact label used by the execution schedule: `CNOT q0, q1`, `MEASURE q0 → c0`. */
export function formatGate(gate: GateTraceEntry): string {
  if (gate.gate === "cx" || gate.gate === "cnot") {
    return `CNOT ${qubitLabel(gate.qubits[0])}, ${qubitLabel(gate.qubits[1])}`
  }
  if (gate.gate === "measure") {
    return `MEASURE ${qubitLabel(gate.qubits[0])} → ${classicalLabel(gate.qubits[1])}`
  }
  const qubits = gate.qubits.map(qubitLabel).join(", ")
  const name = gate.gate.toUpperCase()
  return qubits ? `${name} ${qubits}` : name
}

/** Bracket-style label used by the propagation animation: `CNOT q[0], q[1]`. */
export function gateBracketLabel(gate: string, qubits?: NumericRef[]): string {
  const labels = (qubits ?? []).map(qubitBracketLabel).join(", ")
  return labels ? `${gateDisplayName(gate)} ${labels}` : gateDisplayName(gate)
}

/** Human-readable name of the gate that started a Pauli-product block. */
export function sourceGateLabel(block: PauliProductBlock): string {
  if (block.source_gate === "measure") {
    const qubit = qubitBracketLabel(block.source_qubits?.[0])
    return `MEASURE ${qubit} → ${classicalBracketLabel(block.classical_target)}`
  }
  if (block.source_gate) {
    return gateBracketLabel(block.source_gate, block.source_qubits)
  }
  return `gate #${block.source_gate_idx}`
}
