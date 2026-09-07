import { useRef, useState, type Dispatch, type SetStateAction } from "react"
import { CircuitComparison } from "@/components/circuit/CircuitComparison"
import { ExecutionSchedule } from "@/components/circuit/ExecutionSchedule"
import { PanZoomViewport } from "@/components/controls/PanZoomViewport"
import { PlaybackControls } from "@/components/controls/PlaybackControls"
import { ZoomControls } from "@/components/controls/ZoomControls"
import { CurrentEventCard } from "@/components/patch/CurrentEventCard"
import { DisplayOptions } from "@/components/patch/DisplayOptions"
import { EventList } from "@/components/patch/EventList"
import { GateStatusOverlay } from "@/components/patch/GateStatusOverlay"
import { PatchCanvas } from "@/components/patch/PatchCanvas"
import { PatchLegend } from "@/components/patch/PatchLegend"
import { TraceFooter } from "@/components/patch/TraceFooter"
import { TraceInspector } from "@/components/patch/TraceInspector"
import { Card } from "@/components/ui/card"
import { useFullscreenControls } from "@/hooks/useFullscreenControls"
import { usePanZoom } from "@/hooks/usePanZoom"
import { usePatchAnimations } from "@/hooks/usePatchAnimations"
import { usePatchDerivedState } from "@/hooks/usePatchDerivedState"
import { usePatchTimeline } from "@/hooks/usePatchTimeline"
import { usePlayback } from "@/hooks/usePlayback"
import { useI18n } from "@/i18n/useI18n"
import { DEFAULT_SCENE_OPTIONS, type PatchScene, type PatchSceneOptions } from "@/lib/canvas/scene"
import type { TraceResult } from "@/types/trace"

interface PatchViewProps {
  traceData: TraceResult | null
  currentEventIndex: number
  setCurrentEventIndex: Dispatch<SetStateAction<number>>
}

/** Second screen: lattice-surgery patch operations animated on the patch grid. */
export function PatchView({ traceData, currentEventIndex, setCurrentEventIndex }: PatchViewProps) {
  const { t } = useI18n()
  const [options, setOptions] = useState<PatchSceneOptions>(DEFAULT_SCENE_OPTIONS)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const timeline = usePatchTimeline(traceData, currentEventIndex)
  const { maxEventIndex, currentPatches, prevPatches, currentEvent, currentCycle } = timeline
  const playback = usePlayback(traceData !== null, maxEventIndex, setCurrentEventIndex)
  const panZoom = usePanZoom(canvasContainerRef)
  const { isFullscreen, toggleFullscreen } = useFullscreenControls(
    canvasContainerRef,
    playback.togglePlayback
  )
  const derived = usePatchDerivedState({
    traceData,
    currentEventIndex,
    currentCycle,
    currentPatches,
    prevPatches,
  })
  const animations = usePatchAnimations({
    traceData,
    currentEventIndex,
    currentEvent,
    currentPatches,
    prevPatches,
    patchGroups: derived.patchGroups,
  })

  const scene: PatchScene | null = traceData
    ? {
        grid: traceData.meta.patch_grid,
        codeDistance: traceData.meta.code_distance,
        patches: currentPatches,
        patchGroups: derived.patchGroups,
        patchToQubitMap: derived.patchToQubitMap,
        fadeAnimations: animations.fadeAnimationsRef.current,
        patchGroupAnimations: animations.patchGroupAnimationsRef.current,
        microwaveAnimation: animations.microwaveAnimation,
        options,
      }
    : null

  return (
    <>
      {traceData && <CircuitComparison traceData={traceData} />}

      <Card className="border-blue-200/50 bg-white/80 p-6 shadow-lg backdrop-blur-sm">
        <div className="flex h-full flex-col gap-4">
          <DisplayOptions options={options} onChange={setOptions} />

          <PanZoomViewport
            containerRef={canvasContainerRef}
            panZoom={panZoom}
            className="flex min-h-[420px] flex-1 items-center justify-center rounded-xl border-2 border-blue-100 bg-white shadow-inner"
            overlays={
              traceData && (
                <>
                  {traceData.clifford_t_execution_trace && (
                    <GateStatusOverlay gateState={derived.gateState} currentCycle={currentCycle} />
                  )}
                  <PatchLegend showStabilizers={options.showStabilizers} />
                  <ZoomControls
                    zoomLevel={panZoom.zoomLevel}
                    onZoomIn={panZoom.zoomIn}
                    onZoomOut={panZoom.zoomOut}
                    onReset={panZoom.resetView}
                    fullscreen={{ isFullscreen, onToggle: toggleFullscreen }}
                  />
                </>
              )
            }
          >
            {scene ? (
              <PatchCanvas scene={scene} redrawKey={animations.animationTick} />
            ) : (
              <p className="text-slate-400">{t.common.noData}</p>
            )}
          </PanZoomViewport>

          <PlaybackControls
            currentIndex={currentEventIndex}
            maxIndex={maxEventIndex}
            onIndexChange={setCurrentEventIndex}
            isPlaying={playback.isPlaying}
            onTogglePlay={playback.togglePlayback}
            playbackSpeed={playback.playbackSpeed}
            onSpeedChange={playback.setPlaybackSpeed}
            disabled={!traceData}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <CurrentEventCard
          hasTrace={traceData !== null}
          currentEvent={currentEvent}
          changedBoundaryCount={derived.boundaryChanges.size}
          componentCount={derived.componentCount}
        />
        <EventList
          events={traceData?.patch.events ?? []}
          currentEventIndex={currentEventIndex}
          onSelect={setCurrentEventIndex}
        />
      </div>

      {traceData && (
        <>
          <TraceInspector
            traceData={traceData}
            currentEvent={currentEvent}
            currentEventIndex={currentEventIndex}
            currentCycle={currentCycle}
            currentPatches={currentPatches}
            boundaryChanges={derived.boundaryChanges}
          />
          <TraceFooter traceData={traceData} />
          <ExecutionSchedule traceData={traceData} currentEvent={currentEvent} />
        </>
      )}
    </>
  )
}
