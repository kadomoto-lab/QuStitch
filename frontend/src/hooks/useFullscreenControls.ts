import { useCallback, useEffect, useState, type RefObject } from "react"

export interface FullscreenControls {
  isFullscreen: boolean
  toggleFullscreen: () => Promise<void>
}

/**
 * Toggle fullscreen on `containerRef` and, while fullscreen, map the space
 * key to `onSpaceKey` (used to play / pause).
 */
export function useFullscreenControls(
  containerRef: RefObject<HTMLElement>,
  onSpaceKey: () => void
): FullscreenControls {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error)
    }
  }, [containerRef])

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", handleChange)
    return () => document.removeEventListener("fullscreenchange", handleChange)
  }, [])

  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return
      event.preventDefault()
      event.stopPropagation()
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      onSpaceKey()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isFullscreen, onSpaceKey])

  return { isFullscreen, toggleFullscreen }
}
