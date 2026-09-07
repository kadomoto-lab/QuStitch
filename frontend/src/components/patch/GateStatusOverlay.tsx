import { useI18n } from "@/i18n/useI18n"
import type { GateExecutionState } from "@/lib/trace/gateState"
import { firstNumber } from "@/lib/trace/refs"
import type { GateTraceEntry } from "@/types/trace"

interface GateStatusOverlayProps {
  gateState: GateExecutionState
  currentCycle: number
}

function qubitsLabel(gate: GateTraceEntry): string {
  const first = firstNumber(gate.qubits[0])
  const second = firstNumber(gate.qubits[1])
  const label = `q[${first ?? "?"}]`
  return second !== null && second !== first ? `${label}, q[${second}]` : label
}

function gateNames(gates: GateTraceEntry[]): string {
  return gates.map((gate) => gate.gate.toUpperCase()).join(" → ")
}

/** Which gates are executing / done / pending at the current cycle. */
export function GateStatusOverlay({ gateState, currentCycle }: GateStatusOverlayProps) {
  const { t } = useI18n()
  const { executing, completed, waiting } = gateState
  const isEmpty = executing.length === 0 && completed.length === 0 && waiting.length === 0

  return (
    <div className="absolute left-3 top-3 w-64 rounded-lg bg-black/70 p-3 text-xs text-white shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-gray-300">{t.patch.cycle}:</span>
        <span className="font-mono text-blue-300">{currentCycle.toLocaleString()}</span>
      </div>

      {executing.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <span className="font-medium text-green-300">{t.patch.executingGate}</span>
          </div>
          <div className="space-y-0.5 pl-3">
            {executing.map((gate) => (
              <div key={gate.gate_idx} className="flex items-center gap-2">
                <span className="font-mono text-white">{gate.gate.toUpperCase()}</span>
                <span className="text-gray-400">{qubitsLabel(gate)}</span>
                <span className="text-[10px] text-gray-500">({gate.execution_type})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            <span className="font-medium text-gray-400">{t.patch.completedGates}</span>
            <span className="text-gray-500">({completed.length})</span>
          </div>
          <div className="pl-3 text-[10px] text-gray-500">{gateNames(completed)}</div>
        </div>
      )}

      {waiting.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-yellow-400/50" />
            <span className="font-medium text-yellow-300/70">{t.patch.waitingGates}</span>
            <span className="text-gray-500">({waiting.length})</span>
          </div>
          <div className="pl-3 text-[10px] text-gray-500">{gateNames(waiting)}</div>
        </div>
      )}

      {isEmpty && <div className="text-gray-500">{t.patch.noGateTrace}</div>}
    </div>
  )
}
