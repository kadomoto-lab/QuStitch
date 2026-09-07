import { firstNumber, type NumericRef } from "@/lib/trace/refs"
import type { GateTraceEntry } from "@/types/trace"

export type PauliLetter = "X" | "Y" | "Z"

export interface PauliTerm {
  qubit: number
  pauli: PauliLetter
}

export function isPauliLetter(value: string): value is PauliLetter {
  return value === "X" || value === "Y" || value === "Z"
}

export function normalizeTerms(terms: PauliTerm[]): PauliTerm[] {
  return [...terms].sort((a, b) => a.qubit - b.qubit)
}

/** Product of two single-qubit Paulis, ignoring the phase. `null` means identity. */
export function multiplyPauli(a?: PauliLetter, b?: PauliLetter): PauliLetter | null {
  if (!a) return b ?? null
  if (!b) return a
  if (a === b) return null
  if ((a === "X" && b === "Z") || (a === "Z" && b === "X")) return "Y"
  if ((a === "X" && b === "Y") || (a === "Y" && b === "X")) return "Z"
  return "X"
}

/** Multiply all terms acting on the same qubit and drop identities. */
export function multiplyTerms(terms: PauliTerm[]): PauliTerm[] {
  const byQubit = new Map<number, PauliLetter>()
  terms.forEach((term) => {
    const next = multiplyPauli(byQubit.get(term.qubit), term.pauli)
    if (next) byQubit.set(term.qubit, next)
    else byQubit.delete(term.qubit)
  })
  return normalizeTerms(Array.from(byQubit, ([qubit, pauli]) => ({ qubit, pauli })))
}

/** Conjugate a Pauli by H or S (phase ignored). */
export function conjugateSingleQubitPauli(pauli: PauliLetter, gate: string): PauliLetter {
  if (gate === "h") {
    if (pauli === "X") return "Z"
    if (pauli === "Z") return "X"
    return "Y"
  }
  if (gate === "s") {
    if (pauli === "X") return "Y"
    if (pauli === "Y") return "X"
    return "Z"
  }
  return pauli
}

/**
 * Push a Pauli product backwards through one Clifford gate (H, S or CNOT),
 * as done by the Pauli-propagation step of the compiler.
 */
export function applyGateBackward(terms: PauliTerm[], gate: GateTraceEntry): PauliTerm[] {
  const gateName = gate.gate.toLowerCase()

  if (gateName === "h" || gateName === "s") {
    const qubit = firstNumber(gate.qubits[0])
    if (qubit === null) return terms
    return normalizeTerms(
      terms.map((term) =>
        term.qubit === qubit
          ? { ...term, pauli: conjugateSingleQubitPauli(term.pauli, gateName) }
          : term
      )
    )
  }

  if (gateName === "cx" || gateName === "cnot") {
    const control = firstNumber(gate.qubits[0])
    const target = firstNumber(gate.qubits[1])
    if (control === null || target === null) return terms

    const expanded: PauliTerm[] = []
    terms.forEach((term) => {
      if (term.qubit === control) {
        if (term.pauli === "X") {
          expanded.push({ qubit: control, pauli: "X" }, { qubit: target, pauli: "X" })
        } else if (term.pauli === "Y") {
          expanded.push({ qubit: control, pauli: "Y" }, { qubit: target, pauli: "X" })
        } else {
          expanded.push(term)
        }
      } else if (term.qubit === target) {
        if (term.pauli === "Z") {
          expanded.push({ qubit: control, pauli: "Z" }, { qubit: target, pauli: "Z" })
        } else if (term.pauli === "Y") {
          expanded.push({ qubit: control, pauli: "Z" }, { qubit: target, pauli: "Y" })
        } else {
          expanded.push(term)
        }
      } else {
        expanded.push(term)
      }
    })
    return multiplyTerms(expanded)
  }

  return terms
}

/** Build sorted Pauli terms from parallel `paulis` / `qubits` arrays, dropping identities. */
export function termsFromPauliProduct(paulis?: string[], qubits?: NumericRef[]): PauliTerm[] {
  if (!paulis || !qubits) return []
  return normalizeTerms(
    paulis.flatMap((pauli, index) => {
      if (!isPauliLetter(pauli)) return []
      const qubit = firstNumber(qubits[index])
      return qubit === null ? [] : [{ pauli, qubit }]
    })
  )
}

export function pauliProductLabel(terms: Array<{ pauli: string }>): string {
  return terms.map((term) => term.pauli).join("")
}
