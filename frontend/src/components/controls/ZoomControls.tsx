import { Maximize, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/useI18n"

interface ZoomControlsProps {
  zoomLevel: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  fullscreen?: {
    isFullscreen: boolean
    onToggle: () => void
  }
}

/** Floating zoom toolbar shown in the bottom-right corner of a viewport. */
export function ZoomControls({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onReset,
  fullscreen,
}: ZoomControlsProps) {
  const { t } = useI18n()
  const buttonClass = "h-7 w-7 hover:bg-blue-50"

  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-blue-200 bg-white/90 p-1 shadow-md backdrop-blur-sm">
      <Button
        size="icon"
        variant="ghost"
        onClick={onZoomOut}
        className={buttonClass}
        title={t.common.zoomOut}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <span className="w-12 text-center font-mono text-xs text-slate-600">
        {Math.round(zoomLevel * 100)}%
      </span>
      <Button
        size="icon"
        variant="ghost"
        onClick={onZoomIn}
        className={buttonClass}
        title={t.common.zoomIn}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <div className="mx-1 h-5 w-px bg-blue-200" />
      <Button
        size="icon"
        variant="ghost"
        onClick={onReset}
        className={buttonClass}
        title={t.common.resetView}
      >
        <Maximize className="h-4 w-4" />
      </Button>
      {fullscreen && (
        <>
          <div className="mx-1 h-5 w-px bg-blue-200" />
          <Button
            size="icon"
            variant="ghost"
            onClick={fullscreen.onToggle}
            className={buttonClass}
            title={fullscreen.isFullscreen ? t.common.exitFullscreen : t.common.fullscreen}
          >
            {fullscreen.isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
    </div>
  )
}
