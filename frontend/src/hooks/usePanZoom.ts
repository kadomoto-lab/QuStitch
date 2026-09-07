import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from "react"

interface Point {
  x: number
  y: number
}

export const ZOOM_RANGE = { min: 0.25, max: 3, wheelStep: 0.1, buttonStep: 0.25 }

export interface PanZoom {
  zoomLevel: number
  setZoomLevel: Dispatch<SetStateAction<number>>
  zoomIn: () => void
  zoomOut: () => void
  panOffset: Point
  isPanning: boolean
  handleMouseDown: (event: ReactMouseEvent) => void
  handleMouseMove: (event: ReactMouseEvent) => void
  handleMouseUp: () => void
  resetView: () => void
}

const clampZoom = (value: number) => Math.min(Math.max(ZOOM_RANGE.min, value), ZOOM_RANGE.max)

/** Mouse-wheel zoom and drag-to-pan for the element referenced by `containerRef`. */
export function usePanZoom(containerRef: RefObject<HTMLElement>): PanZoom {
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 })

  // A native listener is required so that `preventDefault` works (React wheel listeners are passive).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const delta = event.deltaY > 0 ? -ZOOM_RANGE.wheelStep : ZOOM_RANGE.wheelStep
      setZoomLevel((previous) => clampZoom(previous + delta))
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [containerRef])

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.button !== 0) return
      setIsPanning(true)
      setPanStart({ x: event.clientX - panOffset.x, y: event.clientY - panOffset.y })
    },
    [panOffset]
  )

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      if (!isPanning) return
      event.preventDefault()
      setPanOffset({ x: event.clientX - panStart.x, y: event.clientY - panStart.y })
    },
    [isPanning, panStart]
  )

  const handleMouseUp = useCallback(() => setIsPanning(false), [])

  const resetView = useCallback(() => {
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
  }, [])

  const zoomIn = useCallback(
    () => setZoomLevel((previous) => clampZoom(previous + ZOOM_RANGE.buttonStep)),
    []
  )
  const zoomOut = useCallback(
    () => setZoomLevel((previous) => clampZoom(previous - ZOOM_RANGE.buttonStep)),
    []
  )

  return {
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    panOffset,
    isPanning,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetView,
  }
}
