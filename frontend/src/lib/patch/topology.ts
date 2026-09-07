import type { BoundaryType, Patch, PatchFace } from "@/types/trace"

export type PatchDirection = PatchFace

/** `row,col` key used for coordinate lookups. */
export function coordKey(row: number, col: number): string {
  return `${row},${col}`
}

/** A boundary that joins two patches into one merged region. */
export function isOpenBoundary(boundary: BoundaryType): boolean {
  return boundary === "pp" || boundary === "mp"
}

class UnionFind {
  private readonly parent: number[]
  private readonly rank: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index)
    this.rank = new Array<number>(size).fill(0)
  }

  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x])
    return this.parent[x]
  }

  union(x: number, y: number): void {
    const rootX = this.find(x)
    const rootY = this.find(y)
    if (rootX === rootY) return
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX
    } else {
      this.parent[rootY] = rootX
      this.rank[rootX]++
    }
  }
}

/**
 * Group patches that are joined through open (`pp` / `mp`) boundaries.
 *
 * Returns `pchidx → component id`. Treating open boundaries as "same region"
 * is a schematic approximation: a merge introduces new stabilizer checks along
 * the seam rather than simply opening a boundary.
 */
export function computeConnectedComponents(patches: Patch[]): Map<number, number> {
  const uf = new UnionFind(patches.length)
  const localIndexByCoord = new Map(
    patches.map((patch, index) => [coordKey(patch.row, patch.col), index])
  )

  patches.forEach((patch, localIndex) => {
    const { row, col, facebd } = patch

    const east = localIndexByCoord.get(coordKey(row, col + 1))
    if (
      east !== undefined &&
      (isOpenBoundary(facebd.e) || isOpenBoundary(patches[east].facebd.w))
    ) {
      uf.union(localIndex, east)
    }

    const south = localIndexByCoord.get(coordKey(row + 1, col))
    if (
      south !== undefined &&
      (isOpenBoundary(facebd.s) || isOpenBoundary(patches[south].facebd.n))
    ) {
      uf.union(localIndex, south)
    }
  })

  const componentMap = new Map<number, number>()
  const componentByRoot = new Map<number, number>()
  patches.forEach((patch, localIndex) => {
    const root = uf.find(localIndex)
    if (!componentByRoot.has(root)) componentByRoot.set(root, componentByRoot.size)
    componentMap.set(patch.pchidx, componentByRoot.get(root)!)
  })
  return componentMap
}

export interface PatchGroup {
  componentId: number
  patches: Patch[]
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
  /** `row,col` of every patch in the group. */
  patchCoordSet: Set<string>
}

export function computePatchGroups(
  patches: Patch[],
  componentMap: Map<number, number>
): PatchGroup[] {
  const patchesByComponent = new Map<number, Patch[]>()
  patches.forEach((patch) => {
    const componentId = componentMap.get(patch.pchidx) ?? 0
    const group = patchesByComponent.get(componentId) ?? []
    group.push(patch)
    patchesByComponent.set(componentId, group)
  })

  return Array.from(patchesByComponent, ([componentId, groupPatches]) => ({
    componentId,
    patches: groupPatches,
    minRow: Math.min(...groupPatches.map((patch) => patch.row)),
    maxRow: Math.max(...groupPatches.map((patch) => patch.row)),
    minCol: Math.min(...groupPatches.map((patch) => patch.col)),
    maxCol: Math.max(...groupPatches.map((patch) => patch.col)),
    patchCoordSet: new Set(groupPatches.map((patch) => coordKey(patch.row, patch.col))),
  }))
}

/** A group is active when any of its patches has a non-idle face boundary. */
export function isActivePatchGroup(group: PatchGroup): boolean {
  return group.patches.some(
    (patch) =>
      patch.facebd.n !== "i" ||
      patch.facebd.s !== "i" ||
      patch.facebd.e !== "i" ||
      patch.facebd.w !== "i"
  )
}

export function buildPatchMap(patches: Patch[]): Map<string, Patch> {
  return new Map(patches.map((patch) => [coordKey(patch.row, patch.col), patch]))
}

const NEIGHBOR_OFFSET: Record<PatchDirection, [number, number, PatchDirection]> = {
  n: [-1, 0, "s"],
  s: [1, 0, "n"],
  e: [0, 1, "w"],
  w: [0, -1, "e"],
}

/**
 * True when the patch and its neighbour in `direction` (looked up in
 * `patchMap`) share an open boundary on either side.
 */
export function hasPPConnection(
  patch: Patch,
  patchMap: Map<string, Patch>,
  direction: PatchDirection
): boolean {
  const [rowOffset, colOffset, oppositeFace] = NEIGHBOR_OFFSET[direction]
  const neighbor = patchMap.get(coordKey(patch.row + rowOffset, patch.col + colOffset))
  if (!neighbor) return false
  return isOpenBoundary(patch.facebd[direction]) || isOpenBoundary(neighbor.facebd[oppositeFace])
}
