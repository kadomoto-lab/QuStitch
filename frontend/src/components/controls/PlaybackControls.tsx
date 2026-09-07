import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { PLAYBACK_SPEED_RANGE } from "@/hooks/usePlayback"
import { useI18n } from "@/i18n/useI18n"

interface PlaybackControlsProps {
  /** `-1` is the initial state, `0..maxIndex` are steps. */
  currentIndex: number
  maxIndex: number
  onIndexChange: (index: number) => void
  isPlaying: boolean
  onTogglePlay: () => void
  playbackSpeed: number
  onSpeedChange: (speed: number) => void
  disabled?: boolean
}

/** Timeline slider plus transport buttons and speed control shared by both views. */
export function PlaybackControls({
  currentIndex,
  maxIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onSpeedChange,
  disabled = false,
}: PlaybackControlsProps) {
  const { t } = useI18n()
  const stepLabel =
    currentIndex < 0 ? t.common.initialState : `${t.common.event} ${currentIndex + 1}`

  return (
    <div className="flex flex-col gap-4 border-t border-blue-100 pt-4">
      <div className="flex items-center gap-4">
        <span className="w-20 text-sm font-medium text-slate-600">{stepLabel}</span>
        <Slider
          value={[currentIndex + 1]}
          onValueChange={(value) => onIndexChange(value[0] - 1)}
          min={0}
          max={maxIndex + 1}
          step={1}
          className="flex-1"
          disabled={disabled}
          aria-label={t.common.event}
        />
        <span className="w-12 text-right font-mono text-sm text-slate-500">{maxIndex + 1}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => onIndexChange(-1)}
            disabled={disabled}
            className="h-9 w-9 border-blue-200 hover:bg-blue-50"
            title={t.common.restart}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => onIndexChange(Math.max(-1, currentIndex - 1))}
            disabled={disabled || currentIndex < 0}
            className="h-9 w-9 border-blue-200 hover:bg-blue-50"
            title={t.common.previous}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={onTogglePlay}
            disabled={disabled}
            className="h-10 w-10 bg-blue-500 text-white shadow-md hover:bg-blue-600"
            title={isPlaying ? t.common.pause : t.common.play}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => onIndexChange(Math.min(maxIndex, currentIndex + 1))}
            disabled={disabled || currentIndex >= maxIndex}
            className="h-9 w-9 border-blue-200 hover:bg-blue-50"
            title={t.common.next}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{t.common.speed}</span>
          <div className="w-28">
            <Slider
              value={[playbackSpeed]}
              onValueChange={(value) => onSpeedChange(value[0])}
              min={PLAYBACK_SPEED_RANGE.min}
              max={PLAYBACK_SPEED_RANGE.max}
              step={PLAYBACK_SPEED_RANGE.step}
              aria-label={t.common.speed}
            />
          </div>
          <span className="rounded bg-blue-100 px-2 py-1 font-mono text-sm text-blue-700">
            {playbackSpeed}ms
          </span>
        </div>
      </div>
    </div>
  )
}
