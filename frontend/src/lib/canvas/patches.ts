import { getPatchColor } from "@/lib/patch/colors"
import { resolvePatchRole, type PatchRoleKey } from "@/lib/patch/roles"
import {
  buildPatchMap,
  coordKey,
  hasPPConnection,
  isActivePatchGroup,
  type PatchGroup,
} from "@/lib/patch/topology"
import type { LogicalQubitMapping, Patch } from "@/types/trace"
import {
  fadeAlpha,
  groupAnimationProgress,
  type FadeAnimation,
  type PatchGroupAnimation,
} from "./animations"
import { roundedRectPath, variableRoundedRectPath } from "./shapes"
import {
  ACTIVE_LABEL_STYLE,
  IDLE_LABEL_STYLE,
  type CanvasColors,
  type CanvasConfig,
  type PatchLabelStyle,
} from "./theme"

export interface PatchDrawContext {
  ctx: CanvasRenderingContext2D
  config: CanvasConfig
  colors: CanvasColors
  patchToQubitMap: Map<number, LogicalQubitMapping>
  rolePatchIndices: Map<number, number>
  showOnlyDataQubits: boolean
  now: number
}

interface PatchBox {
  x: number
  y: number
  size: number
}

function patchBox(patch: Patch, config: CanvasConfig): PatchBox {
  const { padding, cellSize, innerPadding } = config
  return {
    x: padding + patch.col * cellSize + innerPadding,
    y: padding + patch.row * cellSize + innerPadding,
    size: cellSize - innerPadding * 2,
  }
}

function patchFill(patch: Patch, draw: PatchDrawContext, role: PatchRoleKey): string {
  const index = draw.rolePatchIndices.get(patch.pchidx) ?? 0
  return getPatchColor(role, index).bg
}

function drawPatchLabel(
  draw: PatchDrawContext,
  patch: Patch,
  box: PatchBox,
  style: PatchLabelStyle
): void {
  const { ctx, patchToQubitMap, showOnlyDataQubits } = draw
  const mapping = patchToQubitMap.get(patch.pchidx)
  const centerX = box.x + box.size / 2
  const centerY = box.y + box.size / 2

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  if (mapping?.role === "data") {
    // "q" with a smaller subscript index, e.g. q₀
    ctx.font = style.data.font
    ctx.fillStyle = style.data.color
    const qWidth = ctx.measureText("q").width
    ctx.fillText("q", centerX - qWidth / 2, centerY)
    ctx.font = style.data.indexFont
    ctx.textBaseline = "alphabetic"
    ctx.fillText(`${mapping.qubit_index}`, centerX + qWidth / 2, centerY + style.data.indexOffset)
    return
  }

  if (showOnlyDataQubits) return

  if (
    mapping?.role === "padding" ||
    mapping?.role === "z_ancilla" ||
    mapping?.role === "m_ancilla"
  ) {
    const roleStyle = style[mapping.role]
    const text = { padding: "Padding", z_ancilla: "Z-Anc", m_ancilla: "M-Anc" }[mapping.role]
    ctx.font = roleStyle.font
    ctx.fillStyle = roleStyle.color
    ctx.fillText(text, centerX, centerY)
    return
  }

  if (!mapping) {
    ctx.font = style.fallback.font
    ctx.fillStyle = style.fallback.color
    ctx.fillText(patch.pchtype.toUpperCase(), centerX, centerY)
  }
}

function drawGroupBackgrounds(
  draw: PatchDrawContext,
  group: PatchGroup,
  groupRole: PatchRoleKey,
  animation: PatchGroupAnimation | undefined,
  progress: number,
  fadeAnimations: Map<number, FadeAnimation>
): void {
  const { ctx, config, now } = draw
  const { padding, cellSize, innerPadding, cornerRadius } = config
  const groupPatchMap = buildPatchMap(group.patches)

  group.patches.forEach((patch) => {
    const key = coordKey(patch.row, patch.col)
    let { x, y } = patchBox(patch, config)
    const { size } = patchBox(patch, config)
    let scale = 1
    let alpha = fadeAlpha(fadeAnimations.get(patch.pchidx), now)

    // Patches that just joined the group grow out of the previous bounding box.
    if (animation && progress < 1) {
      const wasInPrev = animation.fromPatches.has(key)
      const isInCurrent = animation.toPatches.has(key)
      if (isInCurrent && !wasInPrev) {
        const clampedRow = Math.max(animation.fromMinRow, Math.min(animation.fromMaxRow, patch.row))
        const clampedCol = Math.max(animation.fromMinCol, Math.min(animation.fromMaxCol, patch.col))
        const startX = padding + clampedCol * cellSize + innerPadding
        const startY = padding + clampedRow * cellSize + innerPadding
        x = startX + (x - startX) * progress
        y = startY + (y - startY) * progress
        scale = 0.3 + 0.7 * progress
        alpha = progress
      }
    }

    ctx.save()
    ctx.globalAlpha = alpha
    if (scale !== 1) {
      const centerX = x + size / 2
      const centerY = y + size / 2
      ctx.translate(centerX, centerY)
      ctx.scale(scale, scale)
      ctx.translate(-centerX, -centerY)
    }

    const north = hasPPConnection(patch, groupPatchMap, "n")
    const south = hasPPConnection(patch, groupPatchMap, "s")
    const east = hasPPConnection(patch, groupPatchMap, "e")
    const west = hasPPConnection(patch, groupPatchMap, "w")
    const radii = {
      topLeft: north || west ? 0 : cornerRadius,
      topRight: north || east ? 0 : cornerRadius,
      bottomRight: south || east ? 0 : cornerRadius,
      bottomLeft: south || west ? 0 : cornerRadius,
    }

    ctx.fillStyle = "#ffffff"
    variableRoundedRectPath(ctx, x, y, size, size, radii)
    ctx.fill()

    const role = resolvePatchRole(patch, draw.patchToQubitMap, groupRole)
    ctx.fillStyle = patchFill(patch, draw, role)
    variableRoundedRectPath(ctx, x, y, size, size, radii)
    ctx.fill()

    ctx.restore()
  })
}

/** Fill the gaps between patches that are joined through open boundaries. */
function drawGroupGaps(draw: PatchDrawContext, group: PatchGroup, groupRole: PatchRoleKey): void {
  const { ctx, config } = draw
  const { innerPadding } = config
  const groupPatchMap = buildPatchMap(group.patches)

  group.patches.forEach((patch) => {
    const { x, y, size } = patchBox(patch, config)
    const role = resolvePatchRole(patch, draw.patchToQubitMap, groupRole)
    const fill = patchFill(patch, draw, role)

    const east = hasPPConnection(patch, groupPatchMap, "e")
    const south = hasPPConnection(patch, groupPatchMap, "s")

    const fillGap = (gx: number, gy: number, gw: number, gh: number) => {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(gx, gy, gw, gh)
      ctx.fillStyle = fill
      ctx.fillRect(gx, gy, gw, gh)
    }

    if (east) fillGap(x + size, y, innerPadding * 2, size)
    if (south) fillGap(x, y + size, size, innerPadding * 2)

    const southPatch = groupPatchMap.get(coordKey(patch.row + 1, patch.col))
    const eastPatch = groupPatchMap.get(coordKey(patch.row, patch.col + 1))
    const diagonalJoined =
      group.patchCoordSet.has(coordKey(patch.row + 1, patch.col + 1)) &&
      east &&
      south &&
      ((southPatch ? hasPPConnection(southPatch, groupPatchMap, "e") : false) ||
        (eastPatch ? hasPPConnection(eastPatch, groupPatchMap, "s") : false))
    if (diagonalJoined) fillGap(x + size, y + size, innerPadding * 2, innerPadding * 2)
  })
}

/** Patches that left a group shrink towards the group's new centre. */
function drawRemovedGroupPatches(
  draw: PatchDrawContext,
  animation: PatchGroupAnimation | undefined,
  progress: number
): void {
  if (!animation || progress >= 1 || animation.removedPatches.length === 0) return
  const { ctx, config } = draw
  const { padding, cellSize, innerPadding, cornerRadius } = config

  const toCenterRow = (animation.toMinRow + animation.toMaxRow) / 2
  const toCenterCol = (animation.toMinCol + animation.toMaxCol) / 2
  const targetX = padding + toCenterCol * cellSize + innerPadding
  const targetY = padding + toCenterRow * cellSize + innerPadding

  animation.removedPatches.forEach((patch) => {
    const role = draw.patchToQubitMap.get(patch.pchidx)?.role ?? "unknown"
    const fill = patchFill(patch, draw, role)
    const { x: originalX, y: originalY, size } = patchBox(patch, config)

    const x = originalX + (targetX - originalX) * progress
    const y = originalY + (targetY - originalY) * progress
    const reverse = 1 - progress
    const scale = reverse * 0.7 + 0.3

    ctx.save()
    ctx.globalAlpha = reverse
    const centerX = x + size / 2
    const centerY = y + size / 2
    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)
    ctx.translate(-centerX, -centerY)

    ctx.fillStyle = "#ffffff"
    roundedRectPath(ctx, x, y, size, size, cornerRadius)
    ctx.fill()
    ctx.fillStyle = fill
    roundedRectPath(ctx, x, y, size, size, cornerRadius)
    ctx.fill()
    ctx.restore()
  })
}

export interface DrawActiveGroupsArgs {
  patchGroups: PatchGroup[]
  groupRoleMap: Map<number, PatchRoleKey>
  fadeAnimations: Map<number, FadeAnimation>
  patchGroupAnimations: Map<number, PatchGroupAnimation>
}

/** Draw every active (merged or bounded) group; returns the pchidx of the patches drawn. */
export function drawActivePatchGroups(
  draw: PatchDrawContext,
  { patchGroups, groupRoleMap, fadeAnimations, patchGroupAnimations }: DrawActiveGroupsArgs
): Set<number> {
  const drawn = new Set<number>()

  patchGroups.forEach((group) => {
    if (!isActivePatchGroup(group)) return
    group.patches.forEach((patch) => drawn.add(patch.pchidx))

    const animation = patchGroupAnimations.get(group.componentId)
    const progress = groupAnimationProgress(animation, draw.now)
    const groupRole = groupRoleMap.get(group.componentId) ?? "unknown"

    drawGroupBackgrounds(draw, group, groupRole, animation, progress, fadeAnimations)
    drawGroupGaps(draw, group, groupRole)
    group.patches.forEach((patch) => {
      drawPatchLabel(draw, patch, patchBox(patch, draw.config), ACTIVE_LABEL_STYLE)
    })
    drawRemovedGroupPatches(draw, animation, progress)
  })

  return drawn
}

/** Draw patches that are not part of an active group as faint idle cells. */
export function drawIdlePatches(
  draw: PatchDrawContext,
  patches: Patch[],
  skip: Set<number>,
  fadeAnimations: Map<number, FadeAnimation>
): void {
  const { ctx, config, colors, now } = draw
  const { padding, cellSize, cornerRadius } = config

  patches.forEach((patch) => {
    if (skip.has(patch.pchidx)) return
    const box = patchBox(patch, config)

    ctx.save()
    ctx.globalAlpha = fadeAlpha(fadeAnimations.get(patch.pchidx), now)

    ctx.fillStyle = colors.patchIdleBg
    roundedRectPath(ctx, box.x, box.y, box.size, box.size, cornerRadius)
    ctx.fill()
    ctx.strokeStyle = colors.patchIdleBorder
    ctx.lineWidth = 1
    ctx.stroke()

    drawPatchLabel(draw, patch, box, IDLE_LABEL_STYLE)

    // Faint cell outline so the grid stays visible.
    const cellX = padding + patch.col * cellSize
    const cellY = padding + patch.row * cellSize
    ctx.beginPath()
    ctx.rect(cellX, cellY, cellSize, cellSize)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.restore()
  })
}

/** Ghost of patches that disappeared with the current event. */
export function drawFadeOutPatches(
  draw: PatchDrawContext,
  fadeAnimations: Map<number, FadeAnimation>
): void {
  const { ctx, config, colors, now } = draw

  fadeAnimations.forEach((animation) => {
    if (animation.type !== "fadeOut") return
    const alpha = fadeAlpha(animation, now)
    if (alpha <= 0) return

    const { x, y, size } = patchBox(animation.patch, config)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = colors.patchIdleBg
    roundedRectPath(ctx, x, y, size, size, config.cornerRadius)
    ctx.fill()
    ctx.strokeStyle = colors.patchIdleBorder
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  })
}
