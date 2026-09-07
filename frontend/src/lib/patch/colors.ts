import type { PatchRoleKey } from "./roles"

export interface PatchColor {
  bg: string
  border: string
}

/** Base hue per logical-qubit role (HSL degrees). */
const ROLE_BASE_HUES: Record<PatchRoleKey, number> = {
  data: 142,
  z_ancilla: 217,
  m_ancilla: 271,
  padding: 0,
  unknown: 200,
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const saturation = s / 100
  const lightness = l / 100
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lightness - c / 2
  const sector = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function saturationAndLightness(role: PatchRoleKey, index: number): [number, number] {
  switch (role) {
    case "padding":
      return [0, 70 + (index % 5) * 3]
    case "data":
      return [60 + (index % 4) * 8, 75 + (index % 3) * 3]
    case "z_ancilla":
      return [65 + (index % 4) * 8, 72 + (index % 3) * 3]
    case "m_ancilla":
      return [70 + (index % 4) * 8, 70 + (index % 3) * 3]
    default:
      return [55 + (index % 4) * 8, 68 + (index % 3) * 3]
  }
}

/**
 * Colour for a patch given its role and its ordinal among patches of the same
 * role. Patches of one role share a hue family and differ slightly in hue,
 * saturation and lightness so neighbouring patches remain distinguishable.
 */
export function getPatchColor(role: PatchRoleKey, patchIndexInRole: number): PatchColor {
  const baseHue = ROLE_BASE_HUES[role] ?? ROLE_BASE_HUES.unknown
  const hueVariation = (patchIndexInRole % 7) * 8 - 24
  const hue = (baseHue + hueVariation + 360) % 360
  const [saturation, lightness] = saturationAndLightness(role, patchIndexInRole)
  const [r, g, b] = hslToRgb(hue, saturation, lightness)
  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.25)`,
    border: `rgba(${r}, ${g}, ${b}, 0.6)`,
  }
}

/** Representative colour of a role for the legend (same as its first patch). */
export function getRoleLegendColor(role: PatchRoleKey): PatchColor {
  return getPatchColor(role, 0)
}
