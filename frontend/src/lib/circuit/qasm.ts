import type { CircuitGate, QuantumCircuit } from "./types"

const SINGLE_QUBIT_GATES = new Set(["h", "x", "y", "z", "s", "t", "sdg", "tdg"])
const ROTATION_GATES = new Set(["rx", "ry", "rz"])

function parseQubitIndices(operands: string): number[] {
  return operands
    .split(",")
    .map((part) => part.trim().match(/\w+\[(\d+)\]/))
    .flatMap((match) => (match ? [Number.parseInt(match[1], 10)] : []))
}

/**
 * Minimal OpenQASM 2.0 parser covering the gate set used by the bundled
 * examples. Unknown gates are ignored so that partially supported circuits
 * still render.
 */
export function parseQasm(qasm: string): QuantumCircuit {
  const lines = qasm
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"))

  let qubits = 0
  let classicalBits = 0
  const gates: CircuitGate[] = []

  for (const line of lines) {
    if (line.startsWith("OPENQASM") || line.startsWith("include")) continue

    const qreg = line.match(/^qreg\s+\w+\[(\d+)\]/)
    if (qreg) {
      qubits = Math.max(qubits, Number.parseInt(qreg[1], 10))
      continue
    }

    const creg = line.match(/^creg\s+\w+\[(\d+)\]/)
    if (creg) {
      classicalBits = Math.max(classicalBits, Number.parseInt(creg[1], 10))
      continue
    }

    if (line.includes("measure")) {
      const match = line.match(/measure\s+\w+\[(\d+)\]\s*->\s*\w+\[(\d+)\]/)
      if (match) {
        gates.push({
          type: "measure",
          targets: [Number.parseInt(match[1], 10)],
          classical: Number.parseInt(match[2], 10),
        })
      }
      continue
    }

    const gateMatch = line.match(/^(\w+)(?:\(([^)]+)\))?\s+(.+?);?$/)
    if (!gateMatch) continue

    const [, rawType, parameter, operands] = gateMatch
    const type = rawType.toLowerCase()
    const targets = parseQubitIndices(operands)

    if (SINGLE_QUBIT_GATES.has(type)) {
      gates.push({ type: type as CircuitGate["type"], targets })
    } else if (ROTATION_GATES.has(type)) {
      gates.push({
        type: type as CircuitGate["type"],
        targets,
        parameter: parameter ? Number.parseFloat(parameter) : 0,
      })
    } else if ((type === "cx" || type === "cnot") && targets.length === 2) {
      gates.push({ type: "cx", control: targets[0], targets: [targets[1]] })
    }
  }

  return { qubits, classicalBits, gates }
}
