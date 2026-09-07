import { describe, expect, it } from "vitest"
import type { GateTraceEntry } from "@/types/trace"
import {
  applyGateBackward,
  multiplyPauli,
  multiplyTerms,
  termsFromPauliProduct,
  type PauliTerm,
} from "./pauli"

const gate = (name: string, ...qubits: number[]): GateTraceEntry => ({
  gate_idx: 0,
  gate: name,
  qubits: qubits.map((qubit) => [qubit]),
  execution_type: "pauli_frame",
})

describe("multiplyPauli", () => {
  it("follows the Pauli group up to phase", () => {
    expect(multiplyPauli("X", "Z")).toBe("Y")
    expect(multiplyPauli("Y", "Z")).toBe("X")
    expect(multiplyPauli("X", "Y")).toBe("Z")
    expect(multiplyPauli("X", "X")).toBeNull()
    expect(multiplyPauli(undefined, "Z")).toBe("Z")
  })
})

describe("multiplyTerms", () => {
  it("cancels identical Paulis on the same qubit", () => {
    const terms: PauliTerm[] = [
      { qubit: 1, pauli: "Z" },
      { qubit: 0, pauli: "X" },
      { qubit: 1, pauli: "Z" },
    ]
    expect(multiplyTerms(terms)).toEqual([{ qubit: 0, pauli: "X" }])
  })
})

describe("applyGateBackward", () => {
  it("conjugates X and Z through H", () => {
    expect(applyGateBackward([{ qubit: 0, pauli: "Z" }], gate("h", 0))).toEqual([
      { qubit: 0, pauli: "X" },
    ])
  })

  it("propagates Z on the CNOT target to the control", () => {
    expect(applyGateBackward([{ qubit: 1, pauli: "Z" }], gate("cx", 0, 1))).toEqual([
      { qubit: 0, pauli: "Z" },
      { qubit: 1, pauli: "Z" },
    ])
  })

  it("propagates X on the CNOT control to the target", () => {
    expect(applyGateBackward([{ qubit: 0, pauli: "X" }], gate("cx", 0, 1))).toEqual([
      { qubit: 0, pauli: "X" },
      { qubit: 1, pauli: "X" },
    ])
  })

  it("leaves unrelated qubits alone", () => {
    const terms: PauliTerm[] = [{ qubit: 2, pauli: "Y" }]
    expect(applyGateBackward(terms, gate("cx", 0, 1))).toEqual(terms)
  })
})

describe("termsFromPauliProduct", () => {
  it("drops identities and sorts by qubit", () => {
    expect(termsFromPauliProduct(["Z", "I", "X"], [[2], 1, [[0]]])).toEqual([
      { qubit: 0, pauli: "X" },
      { qubit: 2, pauli: "Z" },
    ])
  })
})
