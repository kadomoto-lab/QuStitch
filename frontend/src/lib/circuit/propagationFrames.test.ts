import { describe, expect, it } from "vitest"
import { messages } from "@/i18n/messages"
import type { PauliProductBlock } from "@/types/trace"
import {
  buildResultCircuit,
  makeFrames,
  relatedGates,
  visibleBlockCount,
} from "./propagationFrames"
import { parseQasm } from "./qasm"

const block = (
  id: string,
  opType: string,
  sourceGateIdx: number,
  paulis: string[],
  qubits: number[]
): PauliProductBlock => ({
  block_id: id,
  op_type: opType,
  source_gate_idx: sourceGateIdx,
  source_gate: opType === "ppr" ? "t" : "measure",
  source_qubits: [qubits[0]],
  source_pauli_product: ["Z"],
  source_target_qubits: [qubits[0]],
  final_pauli_product: paulis,
  target_qubits: qubits,
  transformation_steps: [{ gate_idx: 1, gate: "cx", qubits: [0, 1], before: [], after: [] }],
})

const blocks = [block("PPM:0", "ppm", 2, ["Z", "Z"], [0, 1]), block("SQM:1", "sqm", 3, ["X"], [0])]

describe("makeFrames", () => {
  it("creates three frames per block plus a completion frame", () => {
    const frames = makeFrames(blocks, [], messages.en.propagation.frames)
    expect(frames.map((frame) => frame.phase)).toEqual([
      "forming",
      "preview",
      "added",
      "forming",
      "preview",
      "added",
      "complete",
    ])
    expect(frames[0].title).toBe("PPM ZZ")
    expect(frames[0].detail).toContain("MEASURE q[0]")
  })

  it("adds a Pauli-frame frame when Pauli gates were absorbed", () => {
    const frames = makeFrames(
      blocks,
      [{ gate_idx: 0, gate: "x", qubits: [[0]], execution_type: "pauli_frame" }],
      messages.en.propagation.frames
    )
    expect(frames.at(-1)?.phase).toBe("pauli-frame")
  })
})

describe("visibleBlockCount", () => {
  it("shows a block only once it has been added", () => {
    const frames = makeFrames(blocks, [], messages.en.propagation.frames)
    expect(visibleBlockCount(null, 2)).toBe(0)
    expect(visibleBlockCount(frames[0], 2)).toBe(0)
    expect(visibleBlockCount(frames[1], 2)).toBe(1)
    expect(visibleBlockCount(frames[5], 2)).toBe(2)
    expect(visibleBlockCount(frames[6], 2)).toBe(2)
  })
})

describe("buildResultCircuit", () => {
  it("adds an ancilla wire for PPM blocks and places SQMs on data qubits", () => {
    const source = parseQasm("qreg q[2];\ncreg c[2];")
    const circuit = buildResultCircuit(source, blocks, 2)
    expect(circuit.qubits).toBe(3)
    expect(circuit.gates[0]).toMatchObject({ type: "ppm", targets: [2], productTargets: [0, 1] })
    expect(circuit.gates[1]).toMatchObject({
      type: "measure",
      targets: [0],
      pauliProductLabel: "X",
    })
  })
})

describe("relatedGates", () => {
  it("lists the source gate and absorbed gates sorted by index", () => {
    expect(relatedGates(blocks[0]).map((gate) => [gate.gateIdx, gate.key])).toEqual([
      [1, "absorbed-0"],
      [2, "source"],
    ])
  })
})
