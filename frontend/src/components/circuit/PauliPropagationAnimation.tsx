import { useEffect, useMemo, useRef, useState } from "react"
import { PanZoomViewport } from "@/components/controls/PanZoomViewport"
import { PlaybackControls } from "@/components/controls/PlaybackControls"
import { ZoomControls } from "@/components/controls/ZoomControls"
import { usePanZoom } from "@/hooks/usePanZoom"
import { usePlayback } from "@/hooks/usePlayback"
import { useI18n } from "@/i18n/useI18n"
import { PROPAGATION_LEFT_PADDING } from "@/lib/circuit/layout"
import {
  annotateMeasurementBases,
  buildResultCircuit,
  makeFrames,
  visibleBlockCount,
  type PropagationFrame,
} from "@/lib/circuit/propagationFrames"
import { parseQasm } from "@/lib/circuit/qasm"
import { renderCircuitSVG } from "@/lib/circuit/render"
import type { TraceResult } from "@/types/trace"
import { FlowArrow } from "./propagation/FlowArrow"
import { PropagationLegend } from "./propagation/PropagationLegend"
import { RelatedInputHighlights } from "./propagation/RelatedInputHighlights"
import { ResultHighlight } from "./propagation/ResultHighlight"

interface PauliPropagationAnimationProps {
  traceData: TraceResult
}

const PANEL_GAP = 60
const HEADER_HEIGHT = 44

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[560px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
      {text}
    </div>
  )
}

/**
 * Step-by-step animation of the Pauli propagation: each measurement / T gate
 * of the input circuit becomes one PPM / PPR / SQM primitive in the result.
 */
export function PauliPropagationAnimation({ traceData }: PauliPropagationAnimationProps) {
  const { t } = useI18n()
  const diagramContainerRef = useRef<HTMLDivElement>(null)

  const inputQasm = traceData.input?.qasm ?? ""
  const gateTrace = useMemo(() => traceData.clifford_t_execution_trace?.gates ?? [], [traceData])
  const blocks = useMemo(
    () => traceData.clifford_t_execution_trace?.pauli_product_blocks ?? [],
    [traceData]
  )

  const circuit = useMemo(() => {
    if (!inputQasm.trim()) return null
    try {
      return parseQasm(inputQasm)
    } catch (error) {
      console.error("Failed to parse input QASM for Pauli propagation:", error)
      return null
    }
  }, [inputQasm])

  const frames = useMemo(
    () => makeFrames(blocks, gateTrace, t.propagation.frames),
    [blocks, gateTrace, t]
  )
  const [currentIndex, setCurrentIndex] = useState(-1)
  const maxIndex = Math.max(0, frames.length - 1)
  const frame: PropagationFrame | null =
    currentIndex >= 0 ? frames[Math.min(currentIndex, frames.length - 1)] : null
  const shownBlocks = visibleBlockCount(frame, blocks.length)

  const rendered = useMemo(() => {
    if (!circuit) return null
    const outputCircuit = buildResultCircuit(circuit, blocks, shownBlocks)
    const outputLabels = Array.from({ length: outputCircuit.qubits }, (_, index) =>
      index < circuit.qubits ? `q[${index}]` : "ancilla"
    )
    return {
      input: renderCircuitSVG(annotateMeasurementBases(circuit, blocks), {
        classicalLabel: "meas.",
        leftPadding: PROPAGATION_LEFT_PADDING,
      }),
      result: renderCircuitSVG(outputCircuit, {
        classicalLabel: "meas.",
        leftPadding: PROPAGATION_LEFT_PADDING,
        quantumLabels: outputLabels,
        minGateSlots: Math.max(blocks.length, 1),
      }),
    }
  }, [circuit, blocks, shownBlocks])

  const playback = usePlayback(true, maxIndex, setCurrentIndex)
  const panZoom = usePanZoom(diagramContainerRef)

  useEffect(() => {
    setCurrentIndex(-1)
  }, [traceData])

  if (!circuit || !rendered) return <EmptyState text={t.propagation.noCircuit} />
  if (blocks.length === 0) return <EmptyState text={t.propagation.noBlocks} />

  const panelWidth = Math.max(rendered.input.width, rendered.result.width)
  const resultPanelX = panelWidth + PANEL_GAP
  const inputContentX = (panelWidth - rendered.input.width) / 2
  const resultContentX = resultPanelX + (panelWidth - rendered.result.width) / 2
  const viewWidth = panelWidth * 2 + PANEL_GAP
  const viewHeight = HEADER_HEIGHT + Math.max(rendered.input.height, rendered.result.height)

  const phaseLabel = (() => {
    if (!frame) return t.common.initialState
    switch (frame.phase) {
      case "forming":
        return t.propagation.phase.forming
      case "preview":
        return t.propagation.phase.preview
      case "complete":
        return t.propagation.phase.complete
      case "pauli-frame":
        return t.propagation.phase.pauliFrame
      default:
        return t.propagation.phase.added
    }
  })()

  return (
    <div className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{t.propagation.title}</h3>
          <p className="mt-1 max-w-5xl text-sm leading-relaxed text-slate-600">
            {t.propagation.subtitle}
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-semibold text-slate-600">
          {shownBlocks} / {blocks.length}
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {phaseLabel}
        </div>
        <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
          {frame?.title ?? t.common.initialState}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {frame?.detail ?? t.propagation.initialDetail}
        </div>
      </div>

      <PanZoomViewport
        containerRef={diagramContainerRef}
        panZoom={panZoom}
        className="min-h-0 flex-1 rounded-lg border border-slate-200 bg-white"
        contentClassName="flex min-h-full items-center justify-center"
        overlays={
          <ZoomControls
            zoomLevel={panZoom.zoomLevel}
            onZoomIn={panZoom.zoomIn}
            onZoomOut={panZoom.zoomOut}
            onReset={panZoom.resetView}
          />
        }
      >
        <svg
          width={viewWidth}
          height={viewHeight}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          className="block"
        >
          <defs>
            <marker
              id="flow-arrow-head"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>

          {[0, resultPanelX].map((panelX) => (
            <rect
              key={panelX}
              x={panelX + 8}
              y={8}
              width={panelWidth - 16}
              height={viewHeight - 16}
              rx="10"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1.5"
            />
          ))}

          <text x={20} y={26} className="fill-slate-800 text-[18px] font-bold">
            {t.propagation.inputCircuit}
          </text>
          <text x={resultPanelX + 20} y={26} className="fill-slate-800 text-[18px] font-bold">
            {t.propagation.resultCircuit}
          </text>

          <g transform={`translate(${inputContentX} ${HEADER_HEIGHT})`} opacity="0.92">
            {rendered.input.elements}
            {frame && <RelatedInputHighlights frame={frame} />}
          </g>

          <FlowArrow
            key={frame?.id ?? "initial"}
            frame={frame}
            inputOffsetX={inputContentX}
            resultOffsetX={resultContentX}
            headerHeight={HEADER_HEIGHT}
          />

          <g transform={`translate(${resultContentX} ${HEADER_HEIGHT})`} opacity="0.96">
            {rendered.result.elements}
            {frame && <ResultHighlight frame={frame} sourceQubitCount={circuit.qubits} />}
          </g>
        </svg>
      </PanZoomViewport>

      <PropagationLegend />

      <PlaybackControls
        currentIndex={currentIndex}
        maxIndex={maxIndex}
        onIndexChange={setCurrentIndex}
        isPlaying={playback.isPlaying}
        onTogglePlay={playback.togglePlayback}
        playbackSpeed={playback.playbackSpeed}
        onSpeedChange={playback.setPlaybackSpeed}
      />
    </div>
  )
}
