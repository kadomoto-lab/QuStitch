import { useI18n } from "@/i18n/useI18n"
import type { TraceResult } from "@/types/trace"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono font-medium text-slate-600">{value}</span>
    </span>
  )
}

export function TraceFooter({ traceData }: { traceData: TraceResult }) {
  const { t } = useI18n()
  const { rows, cols } = traceData.meta.patch_grid

  return (
    <footer className="border-t border-blue-200/50 pt-4 text-sm text-slate-500">
      <div className="flex flex-wrap gap-6">
        <Stat label={t.patch.grid} value={`${rows}×${cols}`} />
        <Stat label={t.patch.totalCycles} value={traceData.meta.total_cycles.toLocaleString()} />
        <Stat label={t.patch.events} value={String(traceData.patch.events.length)} />
        <Stat label={t.patch.qasm} value={`${traceData.input.num_qasm_qubits} ${t.patch.qubits}`} />
      </div>
    </footer>
  )
}
