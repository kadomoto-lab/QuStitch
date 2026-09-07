import type { ReactNode, RefObject } from "react"
import type { PanZoom } from "@/hooks/usePanZoom"
import { cn } from "@/lib/utils"

interface PanZoomViewportProps {
  containerRef: RefObject<HTMLDivElement>
  panZoom: PanZoom
  className?: string
  contentClassName?: string
  children: ReactNode
  /** Elements positioned over the viewport that must not pan or zoom. */
  overlays?: ReactNode
}

/** A drag-to-pan, wheel-to-zoom container. */
export function PanZoomViewport({
  containerRef,
  panZoom,
  className,
  contentClassName,
  children,
  overlays,
}: PanZoomViewportProps) {
  const { panOffset, zoomLevel, isPanning, handleMouseDown, handleMouseMove, handleMouseUp } =
    panZoom

  return (
    <div
      ref={containerRef}
      className={cn("relative select-none overflow-hidden", className)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isPanning ? "grabbing" : "grab", touchAction: "none" }}
    >
      <div
        className={contentClassName}
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          transformOrigin: "center center",
          transition: isPanning ? "none" : "transform 0.1s ease-out",
        }}
      >
        {children}
      </div>
      {overlays}
    </div>
  )
}
