import type { TraceResponse, TraceResult } from "@/types/trace"

export type TracePayload = TraceResult | TraceResponse

/** Loose structural check used before normalising uploaded JSON. */
export function isTracePayload(value: unknown): value is TracePayload {
  if (typeof value !== "object" || value === null) return false
  const candidate = "result" in value ? (value as { result: unknown }).result : value
  if (typeof candidate !== "object" || candidate === null) return false
  const trace = candidate as Partial<TraceResult>
  return (
    typeof trace.meta === "object" &&
    trace.meta !== null &&
    typeof trace.patch === "object" &&
    trace.patch !== null &&
    Array.isArray(trace.patch.initial) &&
    Array.isArray(trace.patch.events)
  )
}

function normalizeIssueList(items: unknown[] | undefined): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) return []
  return items.map((item) =>
    typeof item === "object" && item !== null
      ? (item as Record<string, unknown>)
      : { message: String(item) }
  )
}

/**
 * Unwrap an API envelope and fill in the optional metadata fields that older
 * traces (schema < 1.1.0) do not carry, so the UI can rely on their presence.
 */
export function normalizeTraceResult(payload: TracePayload): TraceResult {
  const result = "result" in payload ? payload.result : payload
  const schemaVersion = result.schema_version ?? result.meta.schema_version ?? "0"

  return {
    ...result,
    schema_version: schemaVersion,
    meta: {
      ...result.meta,
      schema_version: result.meta.schema_version ?? schemaVersion,
      generation_mode: result.meta.generation_mode ?? {
        skip_pqsim: true,
        physical_schedule_included: Boolean(result.physical_schedule?.length),
        physical_schedule_window: null,
      },
      provenance: result.meta.provenance ?? {
        patch: "xqsim",
        instruction_trace: result.instruction_trace ? "xqsim" : "unavailable",
        surgery_faces: result.surgery_faces ? "derived" : "unavailable",
        surgery_seams: result.surgery_seams ? "derived" : "unavailable",
        physical_layout: result.physical_layout ? "xqsim" : "unavailable",
        physical_schedule: result.physical_schedule ? "xqsim" : "unavailable",
        stabilizer_support: "unavailable",
        syndrome: "unavailable",
      },
      truncation: result.meta.truncation ?? {
        physical_schedule: false,
        reason: null,
      },
      forced_terminations: normalizeIssueList(result.meta.forced_terminations),
      stability_check_failures: normalizeIssueList(result.meta.stability_check_failures),
      warnings: Array.isArray(result.meta.warnings) ? result.meta.warnings : [],
    },
  }
}
