/** Gate types understood by the circuit renderer. `ppm` / `ppr` are the lattice-surgery primitives. */
export type CircuitGateType =
  | "h"
  | "x"
  | "y"
  | "z"
  | "cx"
  | "s"
  | "t"
  | "sdg"
  | "tdg"
  | "rx"
  | "ry"
  | "rz"
  | "measure"
  | "ppm"
  | "ppr"

export interface CircuitGate {
  type: CircuitGateType
  targets: number[]
  control?: number
  parameter?: number
  classical?: number
  /** Text shown inside measurement / Pauli-product boxes (for example `XZ`). */
  pauliProductLabel?: string
  /** Data qubits touched by a PPM / PPR, in the same order as `productPaulis`. */
  productTargets?: number[]
  productPaulis?: string[]
}

export interface QuantumCircuit {
  qubits: number
  classicalBits: number
  gates: CircuitGate[]
}
