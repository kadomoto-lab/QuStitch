import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { SAMPLE_FILES } from "@/data/sampleFiles"
import { messages } from "@/i18n/messages"
import { makeFrames } from "@/lib/circuit/propagationFrames"
import { parseQasm } from "@/lib/circuit/qasm"
import { getBoundaryChanges } from "@/lib/patch/changes"
import { buildPatchToQubitMap } from "@/lib/patch/roles"
import { computeConnectedComponents, computePatchGroups } from "@/lib/patch/topology"
import { getGateExecutionState } from "./gateState"
import { isTracePayload, normalizeTraceResult } from "./normalize"
import { buildScheduleRows } from "./schedule"
import { getPatchStateAtEvent } from "./timeline"
import { buildTransformationBlocks, buildTransformedCircuit } from "./transformationBlocks"

const PUBLIC_DIR = join(__dirname, "../../../public")

/**
 * Every bundled sample must load and pass through all derivation steps used by
 * the UI. This guards against schema drift between backend and frontend.
 */
describe.each(SAMPLE_FILES)("sample $id", ({ file }) => {
  const payload: unknown = JSON.parse(readFileSync(join(PUBLIC_DIR, file), "utf-8"))

  it("is a valid trace payload", () => {
    expect(isTracePayload(payload)).toBe(true)
  })

  const trace = normalizeTraceResult(payload as Parameters<typeof normalizeTraceResult>[0])

  it("normalises metadata", () => {
    expect(trace.schema_version).toBe("1.1.0")
    expect(trace.meta.provenance).toBeDefined()
    expect(Array.isArray(trace.meta.warnings)).toBe(true)
  })

  it("replays every event into a consistent patch layout", () => {
    const patchCount = trace.patch.initial.length
    for (let index = -1; index < trace.patch.events.length; index++) {
      const patches = getPatchStateAtEvent(trace, index)
      expect(patches).toHaveLength(patchCount)
      const groups = computePatchGroups(patches, computeConnectedComponents(patches))
      expect(groups.reduce((sum, group) => sum + group.patches.length, 0)).toBe(patchCount)
      if (index >= 0) {
        getBoundaryChanges(patches, getPatchStateAtEvent(trace, index - 1))
      }
    }
  })

  it("derives the circuit views", () => {
    const circuit = parseQasm(trace.input.qasm)
    expect(circuit.qubits).toBe(trace.input.num_qasm_qubits)

    const rows = buildScheduleRows(trace)
    expect(rows).toHaveLength(trace.clifford_t_execution_trace?.gates.length ?? 0)

    const blocks = buildTransformationBlocks(trace, rows)
    const transformed = buildTransformedCircuit(
      circuit.qubits,
      circuit.classicalBits,
      trace.clifford_t_execution_trace?.gates ?? [],
      blocks
    )
    expect(transformed?.gates.length).toBeGreaterThan(0)

    const frames = makeFrames(
      trace.clifford_t_execution_trace?.pauli_product_blocks ?? [],
      trace.clifford_t_execution_trace?.gates ?? [],
      messages.en.propagation.frames
    )
    expect(frames.length).toBeGreaterThan(0)

    // SQM windows close at total_cycles inclusive, so one cycle later everything is done.
    const state = getGateExecutionState(
      trace.clifford_t_execution_trace,
      trace.meta.total_cycles + 1
    )
    expect(state.executing).toHaveLength(0)
    expect(state.waiting).toHaveLength(0)
    expect(state.completed).toHaveLength(trace.clifford_t_execution_trace?.gates.length ?? 0)
    expect(buildPatchToQubitMap(trace.logical_qubit_mapping).size).toBeGreaterThan(0)
  })
})
