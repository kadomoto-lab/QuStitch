export interface CornerRadii {
  topLeft: number
  topRight: number
  bottomRight: number
  bottomLeft: number
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/** Rounded rectangle whose corners can be squared off individually (used for merged patches). */
export function variableRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii
): void {
  const { topLeft, topRight, bottomRight, bottomLeft } = radii

  ctx.beginPath()
  ctx.moveTo(x + topLeft, y)
  ctx.lineTo(x + width - topRight, y)
  if (topRight > 0) ctx.arcTo(x + width, y, x + width, y + topRight, topRight)
  else ctx.lineTo(x + width, y)
  ctx.lineTo(x + width, y + height - bottomRight)
  if (bottomRight > 0) {
    ctx.arcTo(x + width, y + height, x + width - bottomRight, y + height, bottomRight)
  } else {
    ctx.lineTo(x + width, y + height)
  }
  ctx.lineTo(x + bottomLeft, y + height)
  if (bottomLeft > 0) ctx.arcTo(x, y + height, x, y + height - bottomLeft, bottomLeft)
  else ctx.lineTo(x, y + height)
  ctx.lineTo(x, y + topLeft)
  if (topLeft > 0) ctx.arcTo(x, y, x + topLeft, y, topLeft)
  else ctx.lineTo(x, y)
  ctx.closePath()
}
