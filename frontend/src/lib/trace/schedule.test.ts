import { describe, expect, it } from "vitest"
import type { GateTraceEntry, TraceResult } from "@/types/trace"
import { attachOracleOutcomes, summarizeAbsorptions, type ScheduleRow } from "./schedule"

const measurement = (gateIdx: number, qubit: number, cycleStart: number): GateTraceEntry => ({
  gate_idx: gateIdx,
  gate: "measure",
  qubits: [[qubit], [qubit]],
  execution_type: "sqm",
  pauli_product: ["Z"],
  target_qubits: [[qubit]],
  cycle_start: cycleStart,
})

describe("attachOracleOutcomes", () => {
  it("matches samples to measurement rows by operator, in execution order", () => {
    const trace = {
      meta: {
        logical_oracle: {
          enabled: true,
          samples: [
            { paulis: "IIZI", outcome: 1, p_plus: 0.5 },
            { paulis: "IIIZ", outcome: 0, p_plus: 1 },
            { paulis: "ZIII", outcome: 0, p_plus: 1 }, // ancilla measurement, no row
          ],
        },
      },
      logical_qubit_mapping: [
        { lq_idx: 0, role: "z_ancilla" },
        { lq_idx: 1, role: "m_ancilla" },
        { lq_idx: 2, role: "data", qubit_index: 0 },
        { lq_idx: 3, role: "data", qubit_index: 1 },
      ],
    } as unknown as TraceResult

    const rows: ScheduleRow[] = [
      { gate: measurement(5, 1, 300), observable: [], absorptionSummary: [] },
      { gate: measurement(4, 0, 100), observable: [], absorptionSummary: [] },
    ]
    attachOracleOutcomes(trace, rows)

    expect(rows[1].outcome).toEqual({ paulis: "IIZI", outcome: 1, p_plus: 0.5 })
    expect(rows[0].outcome).toEqual({ paulis: "IIIZ", outcome: 0, p_plus: 1 })
  })

  it("does nothing when the oracle is disabled", () => {
    const rows: ScheduleRow[] = [
      { gate: measurement(0, 0, 0), observable: [], absorptionSummary: [] },
    ]
    attachOracleOutcomes(
      { meta: { logical_oracle: { enabled: false } } } as unknown as TraceResult,
      rows
    )
    expect(rows[0].outcome).toBeUndefined()
  })
})

describe("summarizeAbsorptions", () => {
  it("counts identical absorption effects", () => {
    const summary = summarizeAbsorptions([
      { effect: "transform_pauli", pauli_before: "Z", pauli_after: "X", qubit: [0] },
      { effect: "transform_pauli", pauli_before: "Z", pauli_after: "X", qubit: [0] },
      { effect: "propagate_pauli", added_pauli: "X", source_qubit: [0], target_qubit: [1] },
    ])
    expect(summary).toEqual([
      { label: "Z→X on q0", count: 2 },
      { label: "add X on q1 from q0", count: 1 },
    ])
  })
})
