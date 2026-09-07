import { useCallback } from "react"
import { isTracePayload, normalizeTraceResult } from "@/lib/trace/normalize"
import type { TraceResult } from "@/types/trace"

export type TraceLoadError = "fetch" | "parse" | "invalid"

interface UseTraceLoaderArgs {
  onLoaded: (trace: TraceResult) => void
  onError: (kind: TraceLoadError, detail: string) => void
}

export interface TraceLoader {
  /** Load one of the bundled sample traces from `public/`. */
  loadSample: (file: string) => Promise<void>
  /** Load a user-provided JSON file. */
  loadFile: (file: File) => Promise<void>
}

function parseTrace(json: unknown): TraceResult | null {
  return isTracePayload(json) ? normalizeTraceResult(json) : null
}

export function useTraceLoader({ onLoaded, onError }: UseTraceLoaderArgs): TraceLoader {
  const loadSample = useCallback(
    async (file: string) => {
      try {
        const response = await fetch(`/${file}`)
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const trace = parseTrace(await response.json())
        if (!trace) return onError("invalid", file)
        onLoaded(trace)
      } catch (error) {
        console.error("Failed to load sample trace:", error)
        onError("fetch", file)
      }
    },
    [onLoaded, onError]
  )

  const loadFile = useCallback(
    async (file: File) => {
      try {
        const trace = parseTrace(JSON.parse(await file.text()))
        if (!trace) return onError("invalid", file.name)
        onLoaded(trace)
      } catch (error) {
        console.error("Failed to parse trace JSON:", error)
        onError("parse", file.name)
      }
    },
    [onLoaded, onError]
  )

  return { loadSample, loadFile }
}
