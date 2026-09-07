import { useEffect, useRef, useState, type MutableRefObject } from "react"
import {
  FADE_DURATION_MS,
  GROUP_ANIMATION_DURATION_MS,
  isFinished,
  MICROWAVE_DURATION_MS,
  type FadeAnimation,
  type MicrowaveAnimation,
  type PatchGroupAnimation,
} from "@/lib/canvas/animations"
import { coordKey, isActivePatchGroup, type PatchGroup } from "@/lib/patch/topology"
import type { Patch, PatchEvent, TraceResult } from "@/types/trace"

interface UsePatchAnimationsArgs {
  traceData: TraceResult | null
  currentEventIndex: number
  currentEvent: PatchEvent | null
  currentPatches: Patch[]
  prevPatches: Patch[]
  patchGroups: PatchGroup[]
}

export interface PatchAnimations {
  microwaveAnimation: MicrowaveAnimation | null
  /** Increments on every animation frame; include it in canvas effect deps to redraw. */
  animationTick: number
  fadeAnimationsRef: MutableRefObject<Map<number, FadeAnimation>>
  patchGroupAnimationsRef: MutableRefObject<Map<number, PatchGroupAnimation>>
}

function areFadeAnimationsEqual(
  current: Map<number, FadeAnimation>,
  next: Map<number, FadeAnimation>
): boolean {
  if (current.size !== next.size) return false
  for (const [pchidx, nextAnimation] of next) {
    const currentAnimation = current.get(pchidx)
    if (
      !currentAnimation ||
      currentAnimation.type !== nextAnimation.type ||
      currentAnimation.startTime !== nextAnimation.startTime ||
      currentAnimation.duration !== nextAnimation.duration ||
      currentAnimation.patch !== nextAnimation.patch
    ) {
      return false
    }
  }
  return true
}

function areGroupAnimationsEqual(
  current: Map<number, PatchGroupAnimation>,
  next: Map<number, PatchGroupAnimation>
): boolean {
  if (current.size !== next.size) return false
  for (const [componentId, animation] of next) {
    if (current.get(componentId)?.startTime !== animation.startTime) return false
  }
  return true
}

/** Find the previous active group with the largest overlap in patch coordinates. */
function findMatchingPreviousGroup(
  group: PatchGroup,
  previousGroups: PatchGroup[]
): PatchGroup | null {
  let best: PatchGroup | null = null
  let bestOverlap = 0
  previousGroups.forEach((candidate) => {
    if (!isActivePatchGroup(candidate)) return
    let overlap = 0
    group.patchCoordSet.forEach((coord) => {
      if (candidate.patchCoordSet.has(coord)) overlap++
    })
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = candidate
    }
  })
  return best
}

/**
 * Detect patch appearance / disappearance, merged-region growth / shrink and
 * event "microwave" pulses, and drive a requestAnimationFrame loop while any
 * of them is active.
 */
export function usePatchAnimations({
  traceData,
  currentEventIndex,
  currentEvent,
  currentPatches,
  prevPatches,
  patchGroups,
}: UsePatchAnimationsArgs): PatchAnimations {
  const [microwaveAnimation, setMicrowaveAnimation] = useState<MicrowaveAnimation | null>(null)
  const microwaveAnimationRef = useRef<MicrowaveAnimation | null>(null)
  const [animationTick, setAnimationTick] = useState(0)
  const animationFrameRef = useRef<number | null>(null)

  const fadeAnimationsRef = useRef<Map<number, FadeAnimation>>(new Map())
  const [fadeAnimations, setFadeAnimations] = useState<Map<number, FadeAnimation>>(new Map())
  const prevPatchIdsRef = useRef<Set<number>>(new Set())

  const patchGroupAnimationsRef = useRef<Map<number, PatchGroupAnimation>>(new Map())
  const [patchGroupAnimations, setPatchGroupAnimations] = useState<
    Map<number, PatchGroupAnimation>
  >(new Map())
  const prevPatchGroupsRef = useRef<PatchGroup[]>([])

  // Reset everything when the trace changes or the timeline returns to the initial state.
  useEffect(() => {
    if (traceData && currentEventIndex >= 0) return

    microwaveAnimationRef.current = null
    setMicrowaveAnimation(null)
    fadeAnimationsRef.current = new Map()
    setFadeAnimations(new Map())
    prevPatchIdsRef.current = new Set()
    patchGroupAnimationsRef.current = new Map()
    setPatchGroupAnimations(new Map())
    prevPatchGroupsRef.current = []

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [traceData, currentEventIndex])

  // Fade in patches that appeared and fade out patches that disappeared.
  useEffect(() => {
    if (!traceData) return

    const currentIds = new Set(currentPatches.map((patch) => patch.pchidx))
    const prevIds = prevPatchIdsRef.current
    const now = Date.now()
    const next = new Map(fadeAnimationsRef.current)

    prevPatches.forEach((patch) => {
      if (!currentIds.has(patch.pchidx)) {
        next.set(patch.pchidx, {
          type: "fadeOut",
          startTime: now,
          duration: FADE_DURATION_MS,
          patch,
        })
      }
    })
    currentPatches.forEach((patch) => {
      if (!prevIds.has(patch.pchidx)) {
        next.set(patch.pchidx, {
          type: "fadeIn",
          startTime: now,
          duration: FADE_DURATION_MS,
          patch,
        })
      }
    })

    prevPatchIdsRef.current = currentIds
    if (!areFadeAnimationsEqual(fadeAnimationsRef.current, next)) {
      fadeAnimationsRef.current = next
      setFadeAnimations(new Map(next))
    }
  }, [traceData, currentEventIndex, currentPatches, prevPatches])

  // Animate merged regions whose bounding box changed since the previous event.
  useEffect(() => {
    if (!traceData) return

    const previousGroups = prevPatchGroupsRef.current
    const now = Date.now()
    const next = new Map(patchGroupAnimationsRef.current)

    patchGroups.forEach((group) => {
      if (!isActivePatchGroup(group)) return
      const previous = findMatchingPreviousGroup(group, previousGroups)
      if (!previous) return

      const sizeChanged =
        previous.minRow !== group.minRow ||
        previous.maxRow !== group.maxRow ||
        previous.minCol !== group.minCol ||
        previous.maxCol !== group.maxCol ||
        previous.patchCoordSet.size !== group.patchCoordSet.size
      if (!sizeChanged) return

      const removedPatches = previous.patches.filter(
        (patch) => !group.patchCoordSet.has(coordKey(patch.row, patch.col))
      )

      next.set(group.componentId, {
        componentId: group.componentId,
        startTime: now,
        duration: GROUP_ANIMATION_DURATION_MS,
        fromMinRow: previous.minRow,
        fromMaxRow: previous.maxRow,
        fromMinCol: previous.minCol,
        fromMaxCol: previous.maxCol,
        fromPatches: new Set(previous.patchCoordSet),
        toMinRow: group.minRow,
        toMaxRow: group.maxRow,
        toMinCol: group.minCol,
        toMaxCol: group.maxCol,
        toPatches: new Set(group.patchCoordSet),
        removedPatches,
      })
    })

    prevPatchGroupsRef.current = patchGroups
    if (!areGroupAnimationsEqual(patchGroupAnimationsRef.current, next)) {
      patchGroupAnimationsRef.current = next
      setPatchGroupAnimations(new Map(next))
    }
  }, [traceData, patchGroups])

  // Pulse around every patch touched by the current event.
  useEffect(() => {
    if (currentEventIndex < 0 || !currentEvent || currentEvent.patch_delta.length === 0) {
      microwaveAnimationRef.current = null
      setMicrowaveAnimation(null)
      return
    }

    const patchPositions = currentEvent.patch_delta.flatMap((delta) => {
      const patch = currentPatches.find((candidate) => candidate.pchidx === delta.pchidx)
      return patch ? [{ pchidx: delta.pchidx, row: patch.row, col: patch.col }] : []
    })
    if (patchPositions.length === 0) return

    const animation: MicrowaveAnimation = {
      startTime: Date.now(),
      duration: MICROWAVE_DURATION_MS,
      patchPositions,
    }
    microwaveAnimationRef.current = animation
    setMicrowaveAnimation(animation)
  }, [currentEventIndex, currentEvent, currentPatches])

  // Frame loop: expire finished animations and bump the tick so the canvas redraws.
  useEffect(() => {
    const hasAnimations =
      microwaveAnimation !== null || fadeAnimations.size > 0 || patchGroupAnimations.size > 0
    if (!hasAnimations) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    const animate = () => {
      const now = Date.now()
      let needsContinue = false

      const microwave = microwaveAnimationRef.current
      if (microwave) {
        if (isFinished(microwave, now)) {
          microwaveAnimationRef.current = null
          setMicrowaveAnimation(null)
        } else {
          needsContinue = true
        }
      }

      const expire = <T extends { startTime: number; duration: number }>(
        ref: MutableRefObject<Map<number, T>>,
        setState: (value: Map<number, T>) => void
      ) => {
        const updated = new Map(ref.current)
        let changed = false
        updated.forEach((animation, key) => {
          if (isFinished(animation, now)) {
            updated.delete(key)
            changed = true
          } else {
            needsContinue = true
          }
        })
        if (changed) {
          ref.current = updated
          setState(new Map(updated))
        }
      }
      expire(fadeAnimationsRef, setFadeAnimations)
      expire(patchGroupAnimationsRef, setPatchGroupAnimations)

      setAnimationTick((tick) => tick + 1)
      animationFrameRef.current = needsContinue ? requestAnimationFrame(animate) : null
    }

    animationFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [microwaveAnimation, fadeAnimations, patchGroupAnimations])

  return { microwaveAnimation, animationTick, fadeAnimationsRef, patchGroupAnimationsRef }
}
