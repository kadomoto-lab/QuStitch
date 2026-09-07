import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { useI18n } from "@/i18n/useI18n"
import type { Patch, PatchEvent, TraceResult } from "@/types/trace"

interface TraceInspectorProps {
  traceData: TraceResult
  currentEvent: PatchEvent | null
  currentEventIndex: number
  currentCycle: number
  currentPatches: Patch[]
  boundaryChanges: Set<string>
}

type PillTone = "slate" | "blue" | "amber" | "emerald" | "rose" | "purple"

const PILL_CLASS: Record<PillTone, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
}

function ValuePill({ children, tone = "slate" }: { children: ReactNode; tone?: PillTone }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs ${PILL_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-700">{value}</span>
    </div>
  )
}

function SectionHeading({ title, pill }: { title: string; pill: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      {pill}
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
      {text}
    </div>
  )
}

const formatList = (values: unknown[] | undefined, fallback = "-") =>
  values && values.length > 0 ? values.map(String).join(", ") : fallback

const formatFacebd = (patch: Pick<Patch, "facebd">) =>
  `N:${patch.facebd.n} E:${patch.facebd.e} S:${patch.facebd.s} W:${patch.facebd.w}`

const formatCornerbd = (patch: Pick<Patch, "cornerbd">) =>
  `NW:${patch.cornerbd.nw} NE:${patch.cornerbd.ne} SW:${patch.cornerbd.sw} SE:${patch.cornerbd.se}`

/** Raw trace details for the selected event: instruction, surgery seams, patch deltas, metadata. */
export function TraceInspector({
  traceData,
  currentEvent,
  currentEventIndex,
  currentCycle,
  currentPatches,
  boundaryChanges,
}: TraceInspectorProps) {
  const { t } = useI18n()
  const schemaVersion = traceData.schema_version ?? traceData.meta.schema_version ?? "0"
  const provenance = traceData.meta.provenance ?? {}
  const generationMode = traceData.meta.generation_mode
  const physicalSchedule = traceData.physical_schedule ?? []
  const physicalScheduleTruncated = Boolean(traceData.meta.truncation?.physical_schedule)
  const instruction = currentEvent
    ? typeof currentEvent.instruction_trace_idx === "number"
      ? traceData.instruction_trace?.[currentEvent.instruction_trace_idx]
      : traceData.instruction_trace?.find((entry) => entry.patch_event_seq === currentEvent.seq)
    : null
  const surgerySeams = currentEvent
    ? (traceData.surgery_seams?.filter((seam) => seam.event_seq === currentEvent.seq) ?? [])
    : []
  const enumValues = traceData.meta.trace_summary?.enum_values
  const deltaPreview = currentEvent?.patch_delta.slice(0, 10) ?? []

  return (
    <Card className="border-blue-200/50 bg-white/80 p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-blue-700">{t.inspector.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <ValuePill tone="blue">
                {t.inspector.schema}: {schemaVersion}
              </ValuePill>
              <ValuePill>
                {t.inspector.termination}: {traceData.meta.termination_reason}
              </ValuePill>
              <ValuePill tone={generationMode?.skip_pqsim ? "amber" : "emerald"}>
                {t.inspector.pqsim}:{" "}
                {generationMode?.skip_pqsim ? t.inspector.skipped : t.inspector.included}
              </ValuePill>
              <ValuePill tone={traceData.physical_layout ? "emerald" : "slate"}>
                {t.inspector.physicalLayout}:{" "}
                {traceData.physical_layout?.source ?? t.inspector.unavailable}
              </ValuePill>
              <ValuePill tone={physicalSchedule.length > 0 ? "emerald" : "slate"}>
                {t.inspector.physicalSchedule}: {physicalSchedule.length}
                {physicalScheduleTruncated ? ` ${t.inspector.truncated}` : ""}
              </ValuePill>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>
              cycle{" "}
              <span className="font-mono text-slate-700">{currentCycle.toLocaleString()}</span>
            </div>
            <div>
              {currentPatches.length} {t.inspector.patches}
            </div>
            <div>
              {boundaryChanges.size} {t.inspector.changedBoundaries}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-md border border-blue-100 bg-blue-50/40 p-3">
            <SectionHeading
              title={t.inspector.event}
              pill={
                <ValuePill tone={currentEvent ? "blue" : "slate"}>
                  {currentEvent
                    ? `#${currentEventIndex + 1} seq ${currentEvent.seq}`
                    : t.inspector.initial}
                </ValuePill>
              }
            />
            {currentEvent ? (
              <div className="space-y-2 text-sm">
                <KeyValue label={t.inspector.operation} value={currentEvent.inst} />
                <KeyValue
                  label={t.inspector.qisa}
                  value={currentEvent.qisa_raw ?? instruction?.raw_line ?? "-"}
                />
                <KeyValue
                  label={t.inspector.source}
                  value={currentEvent.source ?? provenance.patch ?? "-"}
                />
              </div>
            ) : (
              <div className="text-sm text-slate-500">{t.inspector.initial}</div>
            )}
          </section>

          <section className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <SectionHeading
              title={t.inspector.instruction}
              pill={
                <ValuePill tone={instruction ? "purple" : "slate"}>
                  {instruction ? `#${instruction.seq}` : "-"}
                </ValuePill>
              }
            />
            {instruction ? (
              <div className="space-y-2 text-sm">
                <KeyValue label={t.inspector.operation} value={instruction.inst ?? "-"} />
                <KeyValue label={t.inspector.rawLine} value={instruction.raw_line ?? "-"} />
                <KeyValue
                  label={t.inspector.operands}
                  value={
                    instruction.patches
                      .map((patch) => `${patch.pchidx}${patch.selected ? "*" : ""}`)
                      .join(", ") || "-"
                  }
                />
              </div>
            ) : (
              <div className="text-sm text-slate-500">-</div>
            )}
          </section>
        </div>

        <section>
          <SectionHeading
            title={t.inspector.surgerySeams}
            pill={
              <ValuePill tone={surgerySeams.length > 0 ? "amber" : "slate"}>
                {surgerySeams.length}
              </ValuePill>
            }
          />
          {surgerySeams.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {surgerySeams.map((seam) => (
                <div
                  key={seam.id}
                  className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <ValuePill tone="amber">{seam.kind}</ValuePill>
                    <ValuePill>{formatList(seam.paulis)}</ValuePill>
                    <ValuePill>
                      {seam.source}
                      {seam.inferred ? " inferred" : ""}
                    </ValuePill>
                    <ValuePill>{seam.edge_scope}</ValuePill>
                  </div>
                  <div className="font-mono text-xs leading-relaxed text-slate-700">
                    {seam.edges.map((edge) => (
                      <div key={`${seam.id}-${edge.edge_key}`}>
                        {edge.edge_key} {edge.boundary} pauli:{edge.pauli ?? "-"} src:{edge.source}
                        {edge.inferred ? " inferred" : ""}
                      </div>
                    ))}
                    {seam.operands.length > 0 && (
                      <div className="mt-1 text-slate-500">
                        operands:{" "}
                        {seam.operands
                          .map(
                            (operand) => `p${operand.pchidx}:${formatList(operand.active_paulis)}`
                          )
                          .join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote text={t.inspector.noSurgerySeams} />
          )}
        </section>

        <section>
          <SectionHeading
            title={t.inspector.patchDeltas}
            pill={
              <ValuePill tone={currentEvent?.patch_delta.length ? "blue" : "slate"}>
                {currentEvent?.patch_delta.length ?? 0}
              </ValuePill>
            }
          />
          {deltaPreview.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {["patch", "type", "facebd", "cornerbd", "pchpp", "op"].map((column) => (
                      <th key={column} className="px-3 py-2 font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white/70 font-mono text-slate-700">
                  {deltaPreview.map((patch) => (
                    <tr key={patch.pchidx}>
                      <td className="px-3 py-2">
                        p{patch.pchidx} r{patch.row}c{patch.col}
                      </td>
                      <td className="px-3 py-2">{patch.pchtype}</td>
                      <td className="px-3 py-2">{formatFacebd(patch)}</td>
                      <td className="px-3 py-2">{formatCornerbd(patch)}</td>
                      <td className="px-3 py-2">{formatList(patch.operation?.pchpp ?? [])}</td>
                      <td className="px-3 py-2">{formatList(patch.operation?.pchop ?? [])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyNote text={t.inspector.noPatchDeltas} />
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <h4 className="mb-2 text-sm font-semibold text-slate-700">
              {t.inspector.boundaryEnums}
            </h4>
            <div className="space-y-1 font-mono text-xs text-slate-600">
              <div>facebd: {formatList(enumValues?.facebd)}</div>
              <div>cornerbd: {formatList(enumValues?.cornerbd)}</div>
              <div>pchpp: {formatList(enumValues?.pchpp)}</div>
              <div>seam pauli: {formatList(enumValues?.surgery_seam_paulis)}</div>
              <div>patch: {formatList(enumValues?.patch_types)}</div>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
            <h4 className="mb-2 text-sm font-semibold text-slate-700">{t.inspector.warnings}</h4>
            <div className="space-y-1 text-xs text-slate-600">
              {traceData.meta.warnings.length > 0 ? (
                traceData.meta.warnings.map((warning, index) => (
                  <div key={index}>{String(warning)}</div>
                ))
              ) : (
                <div>-</div>
              )}
              {traceData.meta.truncation?.reason && <div>{traceData.meta.truncation.reason}</div>}
            </div>
          </div>
        </section>
      </div>
    </Card>
  )
}
