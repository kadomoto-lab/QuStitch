import { useEffect, useRef } from "react"
import { renderPatchScene, type PatchScene } from "@/lib/canvas/scene"

interface PatchCanvasProps {
  scene: PatchScene
  /** Changes on every animation frame so the canvas is redrawn while animating. */
  redrawKey: number
}

/** The patch grid, drawn with the Canvas API on every scene change. */
export function PatchCanvas({ scene, redrawKey }: PatchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) renderPatchScene(canvas, scene)
  }, [scene, redrawKey])

  return <canvas ref={canvasRef} className="block" />
}
