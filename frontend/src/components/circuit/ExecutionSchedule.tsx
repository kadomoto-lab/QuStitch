import { useMemo } from "react"
import { useI18n } from "@/i18n/useI18n"
import type { Messages } from "@/i18n/messages"
import { formatGate } from "@/lib/trace/labels"
import { buildScheduleRows, isCurrentWindow, type ScheduleRow } from "@/lib/trace/schedule"
import type { GateTraceEntry, PatchEvent, TraceResult } from "@/types/trace"

interface ExecutionScheduleProps {
  traceData: TraceResult
  currentEvent?: PatchEvent | null
}

function kindLabel(gate: GateTraceEntry, t: Messages["schedule"]): string {
  switch (gate.execution_type) {
    case "ppm":
      return t.ppm
    case "ppr":
      return t.ppr
    case "sqm":
      return t.sqm
    case "pauli_frame":
      return t.pauliFrame
    default:
      return t.noEffect
  }
}

function kindClass(gate: GateTraceEntry): string {
  switch (gate.execution_type) {
    case "ppm":
      return "border-violet-200 bg-violet-50 text-violet-800"
    case "ppr":
      return "border-rose-200 bg-rose-50 text-rose-800"
    case "sqm":
      return "border-teal-200 bg-teal-50 text-teal-800"
    case "pauli_frame":
      return "border-slate-200 bg-slate-50 text-slate-700"
    default:
      return "border-gray-200 bg-gray-50 text-gray-500"
  }
}

function pauliClass(pauli: string): string {
  switch (pauli) {
    case "X":
      return "border-red-200 bg-red-50 text-red-700"
    case "Y":
      return "border-purple-200 bg-purple-50 text-purple-700"
    case "Z":
      return "border-blue-200 bg-blue-50 text-blue-700"
    default:
      return "border-slate-200 bg-slate-50 text-slate-500"
  }
}

function Observable({ row }: { row: ScheduleRow }) {
  if (row.observable.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.observable.map((operand, index) => (
        <span key={`${row.gate.gate_idx}-${index}`} className="flex items-center gap-1">
          {index > 0 && <span className="text-slate-400">⊗</span>}
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold ${pauliClass(operand.pauli)}`}
          >
            {operand.pauli}(q{operand.qubit ?? "?"})
          </span>
        </span>
      ))}
    </div>
  )
}

function ScheduleCard({ row, active }: { row: ScheduleRow; active: boolean }) {
  const { t } = useI18n()
  const { window, outcome } = row

  return (
    <div
      className={`rounded-md border p-2 transition-colors ${
        active ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
              #{row.gate.gate_idx}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-800">
              {formatGate(row.gate)}
            </span>
            {active && (
              <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {t.schedule.current}
              </span>
            )}
          </div>
          <div className="mt-2">
            <Observable row={row} />
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${kindClass(row.gate)}`}
        >
          {kindLabel(row.gate, t.schedule)}
        </span>
      </div>

      {row.absorptionSummary.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[11px] font-medium text-slate-500">{t.schedule.absorbed}:</span>
          {row.absorptionSummary.map((item) => (
            <span
              key={item.label}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
            >
              {item.label}
              {item.count > 1 ? ` ×${item.count}` : ""}
            </span>
          ))}
        </div>
      )}

      {window?.merge && window?.split && (
        <div className="mt-2 text-[11px] text-slate-500">
          event {window.merge.seq} → {window.split.seq}
          {" · "}
          QISA {window.merge.qisa_idx}
          {window.ppm ? ` / ${window.ppm.qisa_idx}` : ""}
          {" / "}
          {window.split.qisa_idx}
        </div>
      )}

      {outcome && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="font-medium text-slate-500">{t.schedule.outcome}:</span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono font-semibold ${
              outcome.outcome === 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            {outcome.outcome}
            {outcome.outcome === 0 ? " (+1)" : " (−1)"}
          </span>
          <span className="text-slate-400">p₊={outcome.p_plus.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}

/** Per-gate list showing how each input gate is executed (PPM / PPR / SQM / Pauli frame). */
export function ExecutionSchedule({ traceData, currentEvent = null }: ExecutionScheduleProps) {
  const { t } = useI18n()
  const rows = useMemo(() => buildScheduleRows(traceData), [traceData])
  const summary = traceData.clifford_t_execution_trace?.summary

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-700">{t.schedule.title}</h4>
        {summary && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
              {t.schedule.summary}: {summary.total_gates}
            </span>
            <span className="rounded bg-violet-100 px-2 py-0.5 text-violet-700">
              PPM {summary.ppm_count}
            </span>
            <span className="rounded bg-teal-100 px-2 py-0.5 text-teal-700">
              SQM {summary.sqm_count}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
              frame {summary.pauli_frame_count}
            </span>
          </div>
        )}
      </div>

      {rows.some((row) => row.outcome) && (
        <p className="mb-2 text-[10px] text-slate-400">{t.schedule.legendOutcome}</p>
      )}

      {rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded bg-gray-50 text-sm text-gray-400">
          {t.schedule.noSchedule}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <ScheduleCard
              key={row.gate.gate_idx}
              row={row}
              active={isCurrentWindow(row, currentEvent)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
