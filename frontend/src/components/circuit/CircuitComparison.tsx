/**
 * Circuit-to-Pauli-product transformation view.
 *
 * This intentionally does not present `compiled.clifford_t_qasm` as the
 * lattice-surgery result. The surface-code execution path is the PPM/PPR/SQM
 * schedule produced by XQsim's Pauli propagation and QISA compilation.
 */

import { useMemo } from "react"
import { useI18n } from "@/i18n/useI18n"
import { parseQasm } from "@/lib/circuit/qasm"
import { renderCircuitSVG } from "@/lib/circuit/render"
import { buildScheduleRows } from "@/lib/trace/schedule"
import {
  buildTransformationBlocks,
  buildTransformedCircuit,
} from "@/lib/trace/transformationBlocks"
import type { TraceResult } from "@/types/trace"
import { CircuitDiagram } from "./CircuitDiagram"

interface CircuitComparisonProps {
  traceData: TraceResult
}

const LEFT_PADDING = 110

function SourceBlock({
  label,
  text,
  fallback,
}: {
  label: string
  text?: string
  fallback: string
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>
      <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs">
        {text || fallback}
      </pre>
    </div>
  )
}

export function CircuitComparison({ traceData }: CircuitComparisonProps) {
  const { t } = useI18n()

  const originalCircuit = useMemo(() => {
    try {
      return parseQasm(traceData.input.qasm)
    } catch (error) {
      console.error("Failed to parse input QASM:", error)
      return null
    }
  }, [traceData.input.qasm])

  const originalSVG = useMemo(
    () =>
      originalCircuit
        ? renderCircuitSVG(originalCircuit, { classicalLabel: "meas.", leftPadding: LEFT_PADDING })
        : null,
    [originalCircuit]
  )

  const transformedSVG = useMemo(() => {
    if (!originalCircuit) return null
    const scheduleRows = buildScheduleRows(traceData)
    const blocks = buildTransformationBlocks(traceData, scheduleRows)
    const transformed = buildTransformedCircuit(
      originalCircuit.qubits,
      originalCircuit.classicalBits,
      traceData.clifford_t_execution_trace?.gates ?? [],
      blocks
    )
    if (!transformed) return null
    const quantumLabels = Array.from({ length: transformed.qubits }, (_, index) =>
      index < originalCircuit.qubits ? `q[${index}]` : "ancilla"
    )
    return renderCircuitSVG(transformed, {
      classicalLabel: "meas.",
      leftPadding: LEFT_PADDING,
      quantumLabels,
    })
  }, [originalCircuit, traceData])

  const width = Math.max(originalSVG?.width ?? 0, transformedSVG?.width ?? 0)
  const height = Math.max(originalSVG?.height ?? 0, transformedSVG?.height ?? 0)

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900">{t.comparison.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.comparison.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <h4 className="mb-2 text-sm font-medium text-gray-700">{t.comparison.originalCircuit}</h4>
          {originalSVG ? (
            <CircuitDiagram rendered={originalSVG} width={width} height={height} />
          ) : (
            <EmptyPanel text={t.comparison.noCircuitData} />
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <h4 className="mb-2 text-sm font-medium text-gray-700">
            {t.comparison.transformedCircuit}
          </h4>
          {transformedSVG ? (
            <CircuitDiagram rendered={transformedSVG} width={width} height={height} />
          ) : (
            <EmptyPanel text={t.comparison.noTransformations} />
          )}
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
          {t.comparison.sourceDetails}
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SourceBlock
            label={t.comparison.originalQasm}
            text={traceData.input.qasm}
            fallback={t.comparison.none}
          />
          <SourceBlock
            label={t.comparison.normalizedQasm}
            text={traceData.compiled.clifford_t_qasm}
            fallback={t.comparison.none}
          />
          <SourceBlock
            label={t.comparison.qisa}
            text={traceData.compiled.qisa?.join("\n")}
            fallback={t.comparison.none}
          />
        </div>
      </details>
    </section>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center bg-gray-50 text-sm text-gray-400">
      {text}
    </div>
  )
}
