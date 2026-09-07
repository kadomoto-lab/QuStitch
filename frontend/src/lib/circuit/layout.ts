import { GATE_WIDTH, QUBIT_SPACING, TOP_PADDING } from "./render"

/** Left padding used by both panels of the Pauli-propagation animation. */
export const PROPAGATION_LEFT_PADDING = 110

/** X centre of the gate slot at `gateIdx` (matches `renderCircuitSVG`). */
export function gateX(gateIdx: number): number {
  return PROPAGATION_LEFT_PADDING + gateIdx * GATE_WIDTH + 20
}

/** Y of the wire for `qubit` (matches `renderCircuitSVG`). */
export function qubitY(qubit: number): number {
  return TOP_PADDING + qubit * QUBIT_SPACING
}

export function averageQubitY(qubits: number[], fallbackQubit: number | null): number {
  if (qubits.length > 0) {
    return qubits.reduce((sum, qubit) => sum + qubitY(qubit), 0) / qubits.length
  }
  return qubitY(fallbackQubit ?? 0)
}
