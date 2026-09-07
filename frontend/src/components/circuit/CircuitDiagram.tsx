import type { RenderedCircuit } from "@/lib/circuit/render"

interface CircuitDiagramProps {
  rendered: RenderedCircuit
  /** Override the viewport so side-by-side diagrams share a scale. */
  width?: number
  height?: number
}

export function CircuitDiagram({ rendered, width, height }: CircuitDiagramProps) {
  const viewWidth = width || rendered.width
  const viewHeight = height || rendered.height
  return (
    <div className="overflow-x-auto">
      <svg
        width={viewWidth}
        height={viewHeight}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="h-auto w-full"
        role="img"
      >
        {rendered.elements}
      </svg>
    </div>
  )
}
