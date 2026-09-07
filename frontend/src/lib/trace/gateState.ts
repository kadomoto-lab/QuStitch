import type { CliffordTExecutionTrace, GateTraceEntry } from "@/types/trace"

export interface GateExecutionState {
  executing: GateTraceEntry[]
  completed: GateTraceEntry[]
  waiting: GateTraceEntry[]
}

export const EMPTY_GATE_STATE: GateExecutionState = { executing: [], completed: [], waiting: [] }

/**
 * Classify every gate of the execution trace relative to `cycle`.
 *
 * PPM / PPR gates run between their MERGE and SPLIT cycles and SQM gates
 * between `cycle_after` and `cycle_before`. Pauli-frame and no-effect gates
 * never execute on the patch grid, so they count as complete from the start.
 */
export function getGateExecutionState(
  trace: CliffordTExecutionTrace | undefined,
  cycle: number
): GateExecutionState {
  if (!trace) return EMPTY_GATE_STATE

  const executing: GateTraceEntry[] = []
  const completed: GateTraceEntry[] = []
  const waiting: GateTraceEntry[] = []

  for (const gate of trace.gates) {
    let window: [number, number] | null = null
    if (gate.execution_type === "ppr" || gate.execution_type === "ppm") {
      if (gate.cycle_start !== undefined && gate.cycle_end !== undefined) {
        window = [gate.cycle_start, gate.cycle_end]
      }
    } else if (gate.execution_type === "sqm") {
      if (gate.cycle_after !== undefined && gate.cycle_before !== undefined) {
        window = [gate.cycle_after, gate.cycle_before]
      }
    } else {
      completed.push(gate)
      continue
    }

    if (window === null) {
      waiting.push(gate)
    } else if (cycle >= window[0] && cycle <= window[1]) {
      executing.push(gate)
    } else if (cycle > window[1]) {
      completed.push(gate)
    } else {
      waiting.push(gate)
    }
  }

  return { executing, completed, waiting }
}
