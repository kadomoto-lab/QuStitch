import type { Patch, PatchCorner, PatchFace } from "@/types/trace"

const FACES: PatchFace[] = ["n", "s", "e", "w"]
const CORNERS: PatchCorner[] = ["nw", "ne", "sw", "se"]

/**
 * Keys (`<pchidx>-<face|corner>`) of every boundary that differs between the
 * previous and the current patch layout.
 */
export function getBoundaryChanges(currentPatches: Patch[], prevPatches: Patch[]): Set<string> {
  const changes = new Set<string>()
  const prevByPchidx = new Map(prevPatches.map((patch) => [patch.pchidx, patch]))

  currentPatches.forEach((patch) => {
    const prev = prevByPchidx.get(patch.pchidx)
    if (!prev) return
    FACES.forEach((face) => {
      if (patch.facebd[face] !== prev.facebd[face]) changes.add(`${patch.pchidx}-${face}`)
    })
    CORNERS.forEach((corner) => {
      if (patch.cornerbd[corner] !== prev.cornerbd[corner]) changes.add(`${patch.pchidx}-${corner}`)
    })
  })

  return changes
}
