import {
  buildPatchMap,
  hasPPConnection,
  isActivePatchGroup,
  type PatchDirection,
  type PatchGroup,
} from "@/lib/patch/topology"
import type { BoundaryType, Patch } from "@/types/trace"
import { STABILIZER_COLORS, type CanvasConfig } from "./theme"

type CheckKind = "z" | "x"

function boundaryCheckKind(boundary: BoundaryType): CheckKind | null {
  if (boundary === "z" || boundary === "ze") return "z"
  if (boundary === "x") return "x"
  return null
}

/**
 * Schematic stabilizer layout of a rotated surface-code patch: a
 * checkerboard of (d-1)² bulk checks plus semicircular weight-2 checks on the
 * X / Z boundaries. Checks are extended across open seams so a merged region
 * looks continuous.
 */
export function drawStabilizers(
  ctx: CanvasRenderingContext2D,
  patchGroups: PatchGroup[],
  codeDistance: number,
  config: CanvasConfig
): void {
  const { padding, cellSize } = config
  const checksPerPatch = codeDistance - 1
  const step = cellSize / codeDistance

  const isZCheck = (patch: Patch, i: number, j: number): boolean => {
    const globalI = patch.col * codeDistance + i
    const globalJ = patch.row * codeDistance + j
    return (globalI + globalJ) % 2 === 0
  }

  const drawCheckTile = (x: number, y: number, isZ: boolean, alpha = 1) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = isZ ? STABILIZER_COLORS.zCheck : STABILIZER_COLORS.xCheck
    ctx.strokeStyle = STABILIZER_COLORS.checkBorder
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(x, y, step, step)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  const drawBoundaryCap = (x: number, y: number, direction: PatchDirection, kind: CheckKind) => {
    const radius = step / 2
    const arcs: Record<PatchDirection, [number, number]> = {
      n: [Math.PI, 0],
      s: [0, Math.PI],
      w: [Math.PI / 2, -Math.PI / 2],
      e: [-Math.PI / 2, Math.PI / 2],
    }
    ctx.save()
    ctx.fillStyle = kind === "z" ? STABILIZER_COLORS.zCheck : STABILIZER_COLORS.xCheck
    ctx.strokeStyle = STABILIZER_COLORS.checkBorder
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(x, y, radius, arcs[direction][0], arcs[direction][1], false)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // Boundary checks alternate along a face; the first slot depends on the
  // face, the check kind, and the parity of the patch position.
  const boundarySlotStart = (patch: Patch, direction: PatchDirection, kind: CheckKind): number => {
    let start: number
    if (direction === "n") start = kind === "x" ? 0 : 1
    else if (direction === "e") start = kind === "x" ? 1 : 0
    else if (direction === "s") start = kind === "x" ? 1 : 0
    else start = kind === "x" ? 0 : 1
    return (patch.row + patch.col) % 2 === 0 ? start : 1 - start
  }

  const drawablePatches = patchGroups.filter(isActivePatchGroup).flatMap((group) => group.patches)
  const patchMap = buildPatchMap(drawablePatches)

  drawablePatches.forEach((patch) => {
    const baseX = padding + patch.col * cellSize
    const baseY = padding + patch.row * cellSize

    for (let i = 0; i < checksPerPatch; i++) {
      for (let j = 0; j < checksPerPatch; j++) {
        drawCheckTile(baseX + (i + 0.5) * step, baseY + (j + 0.5) * step, isZCheck(patch, i, j))
      }
    }

    const caps: Array<[PatchDirection, CheckKind | null]> = [
      ["n", boundaryCheckKind(patch.facebd.n)],
      ["s", boundaryCheckKind(patch.facebd.s)],
      ["w", boundaryCheckKind(patch.facebd.w)],
      ["e", boundaryCheckKind(patch.facebd.e)],
    ]
    caps.forEach(([direction, kind]) => {
      if (!kind || hasPPConnection(patch, patchMap, direction)) return
      for (let slot = boundarySlotStart(patch, direction, kind); slot < checksPerPatch; slot += 2) {
        switch (direction) {
          case "n":
            drawBoundaryCap(baseX + (slot + 1) * step, baseY + 0.5 * step, "n", kind)
            break
          case "s":
            drawBoundaryCap(
              baseX + (slot + 1) * step,
              baseY + (codeDistance - 0.5) * step,
              "s",
              kind
            )
            break
          case "w":
            drawBoundaryCap(baseX + 0.5 * step, baseY + (slot + 1) * step, "w", kind)
            break
          case "e":
            drawBoundaryCap(
              baseX + (codeDistance - 0.5) * step,
              baseY + (slot + 1) * step,
              "e",
              kind
            )
            break
        }
      }
    })

    // Extra column / row of checks across an open seam.
    if (hasPPConnection(patch, patchMap, "e")) {
      for (let j = 0; j < checksPerPatch; j++) {
        drawCheckTile(
          baseX + cellSize - step / 2,
          baseY + (j + 0.5) * step,
          isZCheck(patch, checksPerPatch, j),
          0.95
        )
      }
    }
    if (hasPPConnection(patch, patchMap, "s")) {
      for (let i = 0; i < checksPerPatch; i++) {
        drawCheckTile(
          baseX + (i + 0.5) * step,
          baseY + cellSize - step / 2,
          isZCheck(patch, i, checksPerPatch),
          0.95
        )
      }
    }
  })
}

/** d×d data qubits of every active patch, drawn as small circles. */
export function drawPhysicalQubits(
  ctx: CanvasRenderingContext2D,
  patchGroups: PatchGroup[],
  codeDistance: number,
  config: CanvasConfig
): void {
  const { padding, cellSize } = config
  const step = cellSize / codeDistance
  const radius = Math.max(1.75, Math.min(2.75, step * 0.09))
  const drawn = new Set<string>()

  const drawablePatches = patchGroups.filter(isActivePatchGroup).flatMap((group) => group.patches)

  drawablePatches.forEach((patch) => {
    const baseX = padding + patch.col * cellSize
    const baseY = padding + patch.row * cellSize

    for (let i = 0; i < codeDistance; i++) {
      for (let j = 0; j < codeDistance; j++) {
        const x = baseX + (i + 0.5) * step
        const y = baseY + (j + 0.5) * step
        const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}`
        if (drawn.has(key)) continue
        drawn.add(key)

        ctx.save()
        ctx.fillStyle = STABILIZER_COLORS.dataQubitFill
        ctx.strokeStyle = STABILIZER_COLORS.dataQubitStroke
        ctx.lineWidth = 0.9
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }
  })
}
