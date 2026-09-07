import { useCallback, useEffect, useState } from "react"
import { AppHeader } from "@/app/AppHeader"
import { CircuitView } from "@/app/CircuitView"
import { PatchView } from "@/app/PatchView"
import { DEFAULT_SAMPLE_FILE, findSampleFile } from "@/data/sampleFiles"
import { useTraceLoader, type TraceLoadError } from "@/hooks/useTraceLoader"
import { useI18n } from "@/i18n/useI18n"
import type { TraceResult } from "@/types/trace"

type ViewMode = "circuit" | "patch"

export default function App() {
  const { t } = useI18n()
  const [view, setView] = useState<ViewMode>("circuit")
  const [traceData, setTraceData] = useState<TraceResult | null>(null)
  const [selectedSample, setSelectedSample] = useState(DEFAULT_SAMPLE_FILE.id)
  const [currentEventIndex, setCurrentEventIndex] = useState(-1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleLoaded = useCallback((trace: TraceResult) => {
    setTraceData(trace)
    setCurrentEventIndex(-1)
    setErrorMessage(null)
  }, [])

  const handleError = useCallback(
    (kind: TraceLoadError, detail: string) => {
      const message = {
        fetch: t.common.loadError,
        parse: t.common.parseError,
        invalid: t.common.invalidTrace,
      }[kind]
      setErrorMessage(message(detail))
    },
    [t]
  )

  const { loadSample, loadFile } = useTraceLoader({ onLoaded: handleLoaded, onError: handleError })

  useEffect(() => {
    const sample = findSampleFile(selectedSample)
    if (sample) void loadSample(sample.file)
  }, [selectedSample, loadSample])

  const headerAction =
    view === "circuit"
      ? { label: t.header.toPatchView, onClick: () => setView("patch"), disabled: !traceData }
      : { label: t.header.toCircuitView, onClick: () => setView("circuit") }

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 md:p-8">
      <AppHeader
        subtitle={view === "circuit" ? t.header.circuitSubtitle : t.header.patchSubtitle}
        action={headerAction}
        selectedSample={selectedSample}
        onSampleChange={setSelectedSample}
        onFileSelected={(file) => void loadFile(file)}
      />

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {errorMessage}
        </div>
      )}

      <main className="flex flex-1 flex-col gap-6">
        {view === "circuit" ? (
          <CircuitView traceData={traceData} />
        ) : (
          <PatchView
            traceData={traceData}
            currentEventIndex={currentEventIndex}
            setCurrentEventIndex={setCurrentEventIndex}
          />
        )}
      </main>
    </div>
  )
}
