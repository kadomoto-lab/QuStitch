import { buildPatchRoleMaps } from "@/lib/patch/roles"
import type { PatchGroup } from "@/lib/patch/topology"
import type { LogicalQubitMapping, Patch } from "@/types/trace"
import type { FadeAnimation, MicrowaveAnimation, PatchGroupAnimation } from "./animations"
import { drawPatchBoundaries } from "./boundaries"
import { drawActivePatchGroups, drawFadeOutPatches, drawIdlePatches } from "./patches"
import { drawPhysicalQubits, drawStabilizers } from "./stabilizers"
import { CANVAS_COLORS, CANVAS_CONFIG, MICROWAVE_WAVES, type CanvasConfig } from "./theme"

export interface PatchSceneOptions {
  showOnlyDataQubits: boolean
  showStabilizers: boolean
  showPhysicalQubits: boolean
}

export const DEFAULT_SCENE_OPTIONS: PatchSceneOptions = {
  showOnlyDataQubits: true,
  showStabilizers: false,
  showPhysicalQubits: false,
}

export interface PatchScene {
  grid: { rows: number; cols: number }
  codeDistance?: number
  patches: Patch[]
  patchGroups: PatchGroup[]
  patchToQubitMap: Map<number, LogicalQubitMapping>
  fadeAnimations: Map<number, FadeAnimation>
  patchGroupAnimations: Map<number, PatchGroupAnimation>
  microwaveAnimation: MicrowaveAnimation | null
  options: PatchSceneOptions
}

/** Size the canvas for the grid (2x for HiDPI) and return a scaled context. */
function setupCanvas(
  canvas: HTMLCanvasElement,
  grid: PatchScene["grid"],
  config: CanvasConfig
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  const width = grid.cols * config.cellSize + config.padding * 2
  const height = (grid.rows * config.cellSize + config.padding * 2) * 1.5
  canvas.width = width * 2
  canvas.height = height * 2
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.scale(2, 2)
  return ctx
}

function drawMicrowaveAnimation(
  ctx: CanvasRenderingContext2D,
  animation: MicrowaveAnimation | null,
  config: CanvasConfig,
  now: number
): void {
  if (!animation) return
  const elapsed = now - animation.startTime
  if (elapsed >= animation.duration) return

  const { padding, cellSize } = config
  animation.patchPositions.forEach(({ row, col }) => {
    const centerX = padding + col * cellSize + cellSize / 2
    const centerY = padding + row * cellSize + cellSize / 2

    MICROWAVE_WAVES.forEach(({ period, radiusFactor, color }) => {
      const waveProgress = (elapsed % period) / period
      const radius = cellSize * radiusFactor * (0.5 + waveProgress * 0.5)
      ctx.save()
      ctx.globalAlpha = 1 - waveProgress
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    })
  })
}

/** Render one frame of the patch view onto `canvas`. */
export function renderPatchScene(canvas: HTMLCanvasElement, scene: PatchScene): void {
  const config = CANVAS_CONFIG
  const colors = CANVAS_COLORS
  const ctx = setupCanvas(canvas, scene.grid, config)
  if (!ctx) return

  const now = Date.now()
  const { patches, patchGroups, patchToQubitMap, options } = scene
  const { groupRoleMap, rolePatchIndices } = buildPatchRoleMaps(
    patches,
    patchGroups,
    patchToQubitMap
  )
  const draw = {
    ctx,
    config,
    colors,
    patchToQubitMap,
    rolePatchIndices,
    showOnlyDataQubits: options.showOnlyDataQubits,
    now,
  }

  if (!options.showStabilizers) {
    const drawn = drawActivePatchGroups(draw, {
      patchGroups,
      groupRoleMap,
      fadeAnimations: scene.fadeAnimations,
      patchGroupAnimations: scene.patchGroupAnimations,
    })
    drawIdlePatches(draw, patches, drawn, scene.fadeAnimations)
    drawFadeOutPatches(draw, scene.fadeAnimations)
    drawMicrowaveAnimation(ctx, scene.microwaveAnimation, config, now)
    drawPatchBoundaries(ctx, patchGroups, config, colors)
    return
  }

  if (scene.codeDistance) {
    drawStabilizers(ctx, patchGroups, scene.codeDistance, config)
    if (options.showPhysicalQubits) {
      drawPhysicalQubits(ctx, patchGroups, scene.codeDistance, config)
    }
  }
}
