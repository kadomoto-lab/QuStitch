/** Geometry of the patch canvas (CSS pixels; the canvas is rendered at 2x). */
export interface CanvasConfig {
  /** Margin around the patch grid. */
  padding: number
  /** Size of one patch cell (square). */
  cellSize: number
  /** Gap between a patch body and its cell edge. */
  innerPadding: number
  borderWidth: number
  idleBorderWidth: number
  cornerRadius: number
}

export const CANVAS_CONFIG: CanvasConfig = {
  padding: 60,
  cellSize: 100,
  innerPadding: 6,
  borderWidth: 4,
  idleBorderWidth: 1,
  cornerRadius: 12,
}

export interface CanvasColors {
  patchIdleBg: string
  patchIdleBorder: string
  boundaryX: string
  boundaryZ: string
  boundaryY: string
  boundaryPP: string
  boundaryLP: string
  boundaryIdle: string
  boundaryCorner: string
  textActive: string
  textIdle: string
}

export const CANVAS_COLORS: CanvasColors = {
  patchIdleBg: "rgba(241, 245, 249, 0.8)",
  patchIdleBorder: "rgba(203, 213, 225, 0.6)",
  boundaryX: "#ef4444",
  boundaryZ: "#3b82f6",
  boundaryY: "#7c3aed",
  boundaryPP: "#a855f7",
  boundaryLP: "#14b8a6",
  boundaryIdle: "#cbd5e1",
  boundaryCorner: "#1e293b",
  textActive: "#78350f",
  textIdle: "#94a3b8",
}

export interface RoleLabelStyle {
  font: string
  color: string
}

export interface DataLabelStyle extends RoleLabelStyle {
  indexFont: string
  indexOffset: number
}

export interface PatchLabelStyle {
  data: DataLabelStyle
  padding: RoleLabelStyle
  z_ancilla: RoleLabelStyle
  m_ancilla: RoleLabelStyle
  /** Patches without a logical-qubit mapping (labelled with their patch type). */
  fallback: RoleLabelStyle
}

const MONO = "'SF Mono', Monaco, monospace"
const SANS = "system-ui, sans-serif"

export const ACTIVE_LABEL_STYLE: PatchLabelStyle = {
  data: {
    font: `bold 18px ${MONO}`,
    indexFont: `bold 12px ${MONO}`,
    color: "#16a34a",
    indexOffset: 6,
  },
  padding: { font: `bold 12px ${SANS}`, color: "#9ca3af" },
  z_ancilla: { font: `bold 14px ${SANS}`, color: "#3b82f6" },
  m_ancilla: { font: `bold 14px ${SANS}`, color: "#8b5cf6" },
  fallback: { font: `bold 12px ${SANS}`, color: CANVAS_COLORS.textActive },
}

export const IDLE_LABEL_STYLE: PatchLabelStyle = {
  data: {
    font: `bold 16px ${MONO}`,
    indexFont: `bold 10px ${MONO}`,
    color: "#86efac",
    indexOffset: 5,
  },
  padding: { font: `bold 11px ${SANS}`, color: CANVAS_COLORS.textIdle },
  z_ancilla: { font: `bold 12px ${SANS}`, color: "#93c5fd" },
  m_ancilla: { font: `bold 12px ${SANS}`, color: "#c4b5fd" },
  fallback: { font: `11px ${SANS}`, color: CANVAS_COLORS.textIdle },
}

export const STABILIZER_COLORS = {
  zCheck: "#fef9c3",
  xCheck: "#a8a29e",
  checkBorder: "#57534e",
  dataQubitFill: "#ffffff",
  dataQubitStroke: "#1e293b",
}

export const MICROWAVE_WAVES = [
  { period: 1500, radiusFactor: 0.75, color: "rgba(96, 165, 250, 0.4)" },
  { period: 2000, radiusFactor: 1.0, color: "rgba(147, 197, 253, 0.3)" },
]
