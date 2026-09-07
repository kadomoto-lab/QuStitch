import type { Patch } from "@/types/trace"

/** Expanding rings drawn around the patches touched by the current event. */
export interface MicrowaveAnimation {
  startTime: number
  duration: number
  patchPositions: Array<{ pchidx: number; row: number; col: number }>
}

/** A patch appearing or disappearing between two events. */
export interface FadeAnimation {
  type: "fadeIn" | "fadeOut"
  startTime: number
  duration: number
  patch: Patch
}

/** A merged region growing or shrinking between two events. */
export interface PatchGroupAnimation {
  componentId: number
  startTime: number
  duration: number
  fromMinRow: number
  fromMaxRow: number
  fromMinCol: number
  fromMaxCol: number
  fromPatches: Set<string>
  toMinRow: number
  toMaxRow: number
  toMinCol: number
  toMaxCol: number
  toPatches: Set<string>
  /** Patches that left the group (drawn shrinking towards the new centre). */
  removedPatches: Patch[]
}

export const FADE_DURATION_MS = 1000
export const GROUP_ANIMATION_DURATION_MS = 800
export const MICROWAVE_DURATION_MS = 5000

export function fadeAlpha(animation: FadeAnimation | undefined, now: number): number {
  if (!animation) return 1
  const progress = Math.min((now - animation.startTime) / animation.duration, 1)
  return animation.type === "fadeIn" ? progress : 1 - progress
}

/** Eased (cubic ease-out) progress of a group animation, `1` when there is none. */
export function groupAnimationProgress(
  animation: PatchGroupAnimation | undefined,
  now: number
): number {
  if (!animation) return 1
  const progress = Math.min((now - animation.startTime) / animation.duration, 1)
  return 1 - Math.pow(1 - progress, 3)
}

export function isFinished(
  animation: { startTime: number; duration: number },
  now: number
): boolean {
  return now - animation.startTime >= animation.duration
}
