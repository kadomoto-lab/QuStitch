import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react"

export const PLAYBACK_SPEED_RANGE = { min: 200, max: 2000, step: 100, initial: 1000 }

export interface Playback {
  isPlaying: boolean
  setIsPlaying: Dispatch<SetStateAction<boolean>>
  /** Interval between steps in milliseconds. */
  playbackSpeed: number
  setPlaybackSpeed: Dispatch<SetStateAction<number>>
  togglePlayback: () => void
}

/** Advance `setIndex` one step per interval while playing; stops at `maxIndex`. */
export function usePlayback(
  enabled: boolean,
  maxIndex: number,
  setIndex: Dispatch<SetStateAction<number>>
): Playback {
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(PLAYBACK_SPEED_RANGE.initial)

  const togglePlayback = useCallback(() => setIsPlaying((previous) => !previous), [])

  useEffect(() => {
    if (!isPlaying || !enabled) return

    const interval = setInterval(() => {
      setIndex((previous) => {
        if (previous >= maxIndex) {
          setIsPlaying(false)
          return previous
        }
        return previous + 1
      })
    }, playbackSpeed)

    return () => clearInterval(interval)
  }, [isPlaying, playbackSpeed, maxIndex, enabled, setIndex])

  return { isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed, togglePlayback }
}
