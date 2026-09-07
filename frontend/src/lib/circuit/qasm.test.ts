import { describe, expect, it } from "vitest"
import { parseQasm } from "./qasm"

const BELL = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`

describe("parseQasm", () => {
  it("parses registers, gates and measurements", () => {
    const circuit = parseQasm(BELL)
    expect(circuit.qubits).toBe(2)
    expect(circuit.classicalBits).toBe(2)
    expect(circuit.gates).toEqual([
      { type: "h", targets: [0] },
      { type: "cx", control: 0, targets: [1] },
      { type: "measure", targets: [0], classical: 0 },
      { type: "measure", targets: [1], classical: 1 },
    ])
  })

  it("parses rotation parameters and ignores comments and unknown gates", () => {
    const circuit = parseQasm(`
      // comment
      qreg q[1];
      rz(0.5) q[0];
      barrier q[0];
      t q[0];
      tdg q[0];
    `)
    expect(circuit.gates).toEqual([
      { type: "rz", targets: [0], parameter: 0.5 },
      { type: "t", targets: [0] },
      { type: "tdg", targets: [0] },
    ])
  })

  it("accepts cnot as an alias of cx", () => {
    const circuit = parseQasm("qreg q[3];\ncnot q[2],q[0];")
    expect(circuit.gates).toEqual([{ type: "cx", control: 2, targets: [0] }])
  })
})
