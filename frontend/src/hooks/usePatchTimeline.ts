import { useMemo } from "react"
import { getEventAt, getPatchStateAtEvent } from "@/lib/trace/timeline"
import type { Patch, PatchEvent, TraceResult } from "@/types/trace"

export interface PatchTimeline {
  maxEventIndex: number
  currentPatches: Patch[]
  prevPatches: Patch[]
  currentEvent: PatchEvent | null
  currentCycle: number
}

/** Patch layouts and event metadata for the selected position on the timeline. */
export function usePatchTimeline(
  traceData: TraceResult | null,
  currentEventIndex: number
): PatchTimeline {
  const maxEventIndex = traceData ? traceData.patch.events.length - 1 : -1

  const currentPatches = useMemo(
    () => (traceData ? getPatchStateAtEvent(traceData, currentEventIndex) : []),
    [traceData, currentEventIndex]
  )
  const prevPatches = useMemo(
    () => (traceData ? getPatchStateAtEvent(traceData, currentEventIndex - 1) : []),
    [traceData, currentEventIndex]
  )
  const currentEvent = useMemo(
    () => getEventAt(traceData, currentEventIndex),
    [traceData, currentEventIndex]
  )

  return {
    maxEventIndex,
    currentPatches,
    prevPatches,
    currentEvent,
    currentCycle: currentEvent?.cycle ?? 0,
  }
}
