import { buildPatchMap, hasPPConnection, type PatchGroup } from "@/lib/patch/topology"
import type { BoundaryType, Patch } from "@/types/trace"
import type { CanvasColors, CanvasConfig } from "./theme"

interface BoundaryStyle {
  color: string
  lineWidth: number
  dash: number[]
}

/** Stroke style for a face boundary, or `null` when the face is not drawn. */
export function resolveBoundaryStyle(
  boundary: BoundaryType,
  config: CanvasConfig,
  colors: CanvasColors
): BoundaryStyle | null {
  const { borderWidth, idleBorderWidth } = config
  switch (boundary) {
    case "x":
      return { color: colors.boundaryX, lineWidth: borderWidth, dash: [] }
    case "z":
    case "ze":
      return { color: colors.boundaryZ, lineWidth: borderWidth, dash: [] }
    case "y":
      return { color: colors.boundaryY, lineWidth: borderWidth, dash: [7, 4] }
    case "ye":
      return { color: colors.boundaryY, lineWidth: borderWidth, dash: [3, 4] }
    case "lp":
      return { color: colors.boundaryLP, lineWidth: borderWidth, dash: [12, 5, 3, 5] }
    case "c":
      return { color: colors.boundaryCorner, lineWidth: borderWidth, dash: [] }
    case "ie":
      return { color: colors.boundaryIdle, lineWidth: idleBorderWidth, dash: [4, 5] }
    case "i":
    case "pp":
    case "mp":
      return null
  }
}

interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

function faceSegments(patch: Patch, config: CanvasConfig): Record<"n" | "s" | "w" | "e", Segment> {
  const { padding, cellSize, borderWidth } = config
  const inset = Math.max(2, borderWidth * 0.75)
  const x = padding + patch.col * cellSize
  const y = padding + patch.row * cellSize
  return {
    n: { x1: x + inset, y1: y + inset, x2: x + cellSize - inset, y2: y + inset },
    s: {
      x1: x + inset,
      y1: y + cellSize - inset,
      x2: x + cellSize - inset,
      y2: y + cellSize - inset,
    },
    w: { x1: x + inset, y1: y + inset, x2: x + inset, y2: y + cellSize - inset },
    e: {
      x1: x + cellSize - inset,
      y1: y + inset,
      x2: x + cellSize - inset,
      y2: y + cellSize - inset,
    },
  }
}

/**
 * Draw the X / Z / Y / logical boundaries of every patch. Faces that are
 * joined to a neighbour through an open boundary are skipped so merged
 * regions appear as one shape.
 */
export function drawPatchBoundaries(
  ctx: CanvasRenderingContext2D,
  patchGroups: PatchGroup[],
  config: CanvasConfig,
  colors: CanvasColors
): void {
  patchGroups.forEach((group) => {
    const groupPatchMap = buildPatchMap(group.patches)

    group.patches.forEach((patch) => {
      const segments = faceSegments(patch, config)
      ;(["n", "s", "w", "e"] as const).forEach((face) => {
        if (hasPPConnection(patch, groupPatchMap, face)) return
        const style = resolveBoundaryStyle(patch.facebd[face], config, colors)
        if (!style) return

        const { x1, y1, x2, y2 } = segments[face]
        ctx.save()
        ctx.strokeStyle = style.color
        ctx.lineWidth = style.lineWidth
        ctx.lineCap = "round"
        ctx.setLineDash(style.dash)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.restore()
      })
    })
  })
}
