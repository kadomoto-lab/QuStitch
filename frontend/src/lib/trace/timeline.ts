import type { Patch, PatchEvent, TraceResult } from "@/types/trace"

/**
 * Reconstruct the full patch layout at `targetCycle` by replaying every event
 * whose cycle is at or before it on top of the initial layout.
 */
export function getPatchStateAtCycle(result: TraceResult, targetCycle: number): Patch[] {
  const patches = structuredClone(result.patch.initial)
  const indexByPchidx = new Map(patches.map((patch, index) => [patch.pchidx, index]))

  for (const event of result.patch.events) {
    if (event.cycle > targetCycle) break
    for (const delta of event.patch_delta) {
      const index = indexByPchidx.get(delta.pchidx)
      if (index !== undefined) patches[index] = delta
    }
  }

  return patches
}

/** Patch layout after the event at `eventIndex`, or the initial layout for `-1`. */
export function getPatchStateAtEvent(result: TraceResult, eventIndex: number): Patch[] {
  if (eventIndex < 0) return result.patch.initial
  const event = result.patch.events[eventIndex]
  if (!event) return result.patch.initial
  return getPatchStateAtCycle(result, event.cycle)
}

export function getEventAt(result: TraceResult | null, eventIndex: number): PatchEvent | null {
  if (!result || eventIndex < 0) return null
  return result.patch.events[eventIndex] ?? null
}
