import { describe, expect, it } from "vitest"
import type { BoundaryType, Patch } from "@/types/trace"
import {
  buildPatchMap,
  computeConnectedComponents,
  computePatchGroups,
  hasPPConnection,
  isActivePatchGroup,
} from "./topology"

function patch(
  pchidx: number,
  row: number,
  col: number,
  faces: Partial<Record<"n" | "s" | "e" | "w", BoundaryType>> = {}
): Patch {
  return {
    pchidx,
    row,
    col,
    pchtype: "zt",
    merged: { reg: 0, mem: 0 },
    facebd: { n: "i", s: "i", e: "i", w: "i", ...faces },
    cornerbd: { nw: "i", ne: "i", sw: "i", se: "i" },
  }
}

describe("computeConnectedComponents", () => {
  it("joins horizontal neighbours through a pp boundary on either side", () => {
    const patches = [patch(0, 0, 0, { e: "pp" }), patch(1, 0, 1), patch(2, 0, 2)]
    const components = computeConnectedComponents(patches)
    expect(components.get(0)).toBe(components.get(1))
    expect(components.get(2)).not.toBe(components.get(0))
  })

  it("joins vertical neighbours through mp on the lower patch", () => {
    const patches = [patch(0, 0, 0), patch(1, 1, 0, { n: "mp" })]
    const components = computeConnectedComponents(patches)
    expect(components.get(0)).toBe(components.get(1))
  })

  it("does not join through closed boundaries", () => {
    const patches = [patch(0, 0, 0, { e: "x" }), patch(1, 0, 1, { w: "z" })]
    const components = computeConnectedComponents(patches)
    expect(new Set(components.values()).size).toBe(2)
  })
})

describe("computePatchGroups", () => {
  it("computes bounding boxes and coordinate sets per component", () => {
    const patches = [
      patch(0, 0, 0, { e: "pp" }),
      patch(1, 0, 1, { s: "pp" }),
      patch(2, 1, 1),
      patch(3, 2, 2),
    ]
    const groups = computePatchGroups(patches, computeConnectedComponents(patches))
    const merged = groups.find((group) => group.patches.length === 3)!
    expect(merged.minRow).toBe(0)
    expect(merged.maxRow).toBe(1)
    expect(merged.minCol).toBe(0)
    expect(merged.maxCol).toBe(1)
    expect([...merged.patchCoordSet].sort()).toEqual(["0,0", "0,1", "1,1"])
    expect(isActivePatchGroup(merged)).toBe(true)
    expect(isActivePatchGroup(groups.find((group) => group.patches[0].pchidx === 3)!)).toBe(false)
  })
})

describe("hasPPConnection", () => {
  it("checks the boundary of the patch and of its neighbour", () => {
    const patches = [patch(0, 0, 0), patch(1, 0, 1, { w: "pp" })]
    const map = buildPatchMap(patches)
    expect(hasPPConnection(patches[0], map, "e")).toBe(true)
    expect(hasPPConnection(patches[1], map, "w")).toBe(true)
    expect(hasPPConnection(patches[0], map, "w")).toBe(false)
  })
})
