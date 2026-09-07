import { describe, expect, it } from "vitest"
import type { Patch, TraceResult } from "@/types/trace"
import { getBoundaryChanges } from "@/lib/patch/changes"
import { getPatchStateAtCycle, getPatchStateAtEvent } from "./timeline"

const basePatch = (pchidx: number, faces: Patch["facebd"]): Patch => ({
  pchidx,
  row: 0,
  col: pchidx,
  pchtype: "zt",
  merged: { reg: 0, mem: 0 },
  facebd: faces,
  cornerbd: { nw: "i", ne: "i", sw: "i", se: "i" },
})

const idle: Patch["facebd"] = { n: "i", s: "i", e: "i", w: "i" }

const trace = {
  patch: {
    initial: [basePatch(0, idle), basePatch(1, idle)],
    events: [
      {
        seq: 0,
        cycle: 10,
        qisa_idx: 0,
        inst: "MERGE_INFO",
        patch_delta: [basePatch(0, { ...idle, e: "pp" })],
      },
      { seq: 1, cycle: 20, qisa_idx: 1, inst: "SPLIT_INFO", patch_delta: [basePatch(0, idle)] },
    ],
  },
} as unknown as TraceResult

describe("getPatchStateAtCycle", () => {
  it("applies every event up to the cycle without mutating the initial layout", () => {
    expect(getPatchStateAtCycle(trace, 15)[0].facebd.e).toBe("pp")
    expect(getPatchStateAtCycle(trace, 25)[0].facebd.e).toBe("i")
    expect(trace.patch.initial[0].facebd.e).toBe("i")
  })
})

describe("getPatchStateAtEvent", () => {
  it("returns the initial layout for negative indices", () => {
    expect(getPatchStateAtEvent(trace, -1)).toBe(trace.patch.initial)
    expect(getPatchStateAtEvent(trace, 0)[0].facebd.e).toBe("pp")
  })
})

describe("getBoundaryChanges", () => {
  it("lists changed faces as pchidx-face keys", () => {
    const before = getPatchStateAtEvent(trace, -1)
    const after = getPatchStateAtEvent(trace, 0)
    expect([...getBoundaryChanges(after, before)]).toEqual(["0-e"])
  })
})
