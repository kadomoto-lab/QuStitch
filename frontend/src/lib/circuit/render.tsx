import type { ReactElement } from "react"
import type { QuantumCircuit } from "./types"

export const GATE_WIDTH = 80
export const QUBIT_SPACING = 80
export const TOP_PADDING = 40
const CLASSICAL_SPACING = 60
const DEFAULT_LEFT_PADDING = 60

export interface RenderCircuitOptions {
  classicalLabel?: string
  leftPadding?: number
  quantumLabels?: string[]
  /** Reserve horizontal room for at least this many gate slots. */
  minGateSlots?: number
}

export interface RenderedCircuit {
  width: number
  height: number
  elements: ReactElement[]
}

export function getGateColor(type: string): string {
  switch (type) {
    case "h":
      return "#3b82f6"
    case "x":
      return "#ef4444"
    case "y":
      return "#10b981"
    case "z":
      return "#8b5cf6"
    case "cx":
      return "#f59e0b"
    case "s":
    case "t":
      return "#06b6d4"
    case "sdg":
    case "tdg":
      return "#6366f1"
    case "rx":
    case "ry":
    case "rz":
      return "#ec4899"
    case "measure":
      return "#14b8a6"
    case "ppm":
      return "#8b5cf6"
    case "ppr":
      return "#fb7185"
    default:
      return "#6b7280"
  }
}

export function getGateLabel(type: string, parameter?: number): string {
  if (parameter !== undefined) return `${type.toUpperCase()}(${parameter.toFixed(2)})`
  return type.toUpperCase()
}

/** Render a circuit as a list of SVG elements plus the required viewport size. */
export function renderCircuitSVG(
  circuit: QuantumCircuit,
  options: RenderCircuitOptions = {}
): RenderedCircuit {
  const leftPadding = options.leftPadding ?? DEFAULT_LEFT_PADDING
  const classicalLabel = options.classicalLabel ?? "c"
  const quantumLabels = options.quantumLabels ?? []

  const hasClassical = circuit.classicalBits > 0
  const gateSlots = Math.max(circuit.gates.length, options.minGateSlots ?? circuit.gates.length)
  const width = leftPadding * 2 + GATE_WIDTH * gateSlots + 40
  const height =
    TOP_PADDING * 2 +
    QUBIT_SPACING * circuit.qubits +
    (hasClassical ? CLASSICAL_SPACING + QUBIT_SPACING * 0.5 : 0)
  const classicalY = TOP_PADDING + circuit.qubits * QUBIT_SPACING + CLASSICAL_SPACING
  const qubitY = (qubit: number) => TOP_PADDING + qubit * QUBIT_SPACING

  const elements: ReactElement[] = []
  let measurementIndex = 0

  const renderMeasurementBox = (
    key: string,
    x: number,
    y: number,
    color: string,
    resultLabel: number,
    pauliLabel?: string
  ) => {
    const iconY = pauliLabel ? y + 7 : y
    return (
      <g key={key}>
        <rect x={x - 25} y={y - 20} width="50" height="40" rx="4" fill={color} opacity="0.9" />
        {pauliLabel && (
          <text
            x={x}
            y={y - 6}
            textAnchor="middle"
            className="font-mono text-[12px] font-bold fill-white"
          >
            {pauliLabel}
          </text>
        )}
        <path
          d={`M ${x - 10} ${iconY} Q ${x} ${iconY - 12} ${x + 10} ${iconY}`}
          stroke="white"
          strokeWidth="2"
          fill="none"
        />
        <line x1={x} y1={iconY} x2={x + 7} y2={iconY - 7} stroke="white" strokeWidth="2" />
        <line x1={x - 2} y1={y + 20} x2={x - 2} y2={classicalY} stroke={color} strokeWidth="2" />
        <line x1={x + 2} y1={y + 20} x2={x + 2} y2={classicalY} stroke={color} strokeWidth="2" />
        <circle cx={x} cy={classicalY} r="12" fill="white" stroke={color} strokeWidth="2" />
        <text
          x={x}
          y={classicalY + 5}
          textAnchor="middle"
          className="text-sm font-bold fill-foreground"
        >
          {resultLabel}
        </text>
      </g>
    )
  }

  for (let i = 0; i < circuit.qubits; i++) {
    elements.push(
      <g key={`qubit-${i}`}>
        <text x={20} y={qubitY(i) + 5} className="text-sm fill-foreground">
          {quantumLabels[i] ?? `q[${i}]`}
        </text>
        <line
          x1={leftPadding}
          y1={qubitY(i)}
          x2={width - leftPadding}
          y2={qubitY(i)}
          stroke="currentColor"
          strokeWidth="2"
          className="stroke-muted-foreground"
        />
      </g>
    )
  }

  if (hasClassical) {
    elements.push(
      <g key="classical">
        <text x={20} y={classicalY + 5} className="text-sm fill-foreground">
          {classicalLabel}
        </text>
        {[-3, 3].map((offset) => (
          <line
            key={offset}
            x1={leftPadding}
            y1={classicalY + offset}
            x2={width - leftPadding}
            y2={classicalY + offset}
            stroke="currentColor"
            strokeWidth="2"
            className="stroke-muted-foreground"
          />
        ))}
      </g>
    )
  }

  circuit.gates.forEach((gate, gateIndex) => {
    const x = leftPadding + gateIndex * GATE_WIDTH + 20

    if (gate.type === "measure" && gate.classical !== undefined) {
      const currentMeasureIndex = measurementIndex++
      elements.push(
        renderMeasurementBox(
          `gate-${gateIndex}`,
          x,
          qubitY(gate.targets[0]),
          getGateColor("measure"),
          currentMeasureIndex,
          gate.pauliProductLabel
        )
      )
      return
    }

    if ((gate.type === "ppm" || gate.type === "ppr") && gate.classical !== undefined) {
      const y = qubitY(gate.targets[0])
      const color = getGateColor(gate.type)
      const currentMeasureIndex = measurementIndex++
      const dataTargets = gate.productTargets ?? []
      const dataYs = dataTargets.map(qubitY)
      const minY = Math.min(y, ...dataYs)
      const maxY = Math.max(y, ...dataYs)

      elements.push(
        <g key={`gate-${gateIndex}`}>
          {gate.type === "ppr" && (
            <text
              x={x}
              y={minY - 14}
              textAnchor="middle"
              className="font-mono text-[11px] font-bold"
              fill={color}
            >
              PPR(π/8)
            </text>
          )}
          <line x1={x} y1={minY} x2={x} y2={maxY} stroke={color} strokeWidth="2.2" />
          {dataTargets.map((target, targetIndex) => {
            const dataY = qubitY(target)
            const pauli = gate.productPaulis?.[targetIndex]
            return (
              <g key={`ppm-target-${gateIndex}-${targetIndex}`}>
                <circle cx={x} cy={dataY} r="5" fill={color} />
                {pauli && (
                  <text
                    x={x - 16}
                    y={dataY + 4}
                    textAnchor="middle"
                    className="font-mono text-[12px] font-bold fill-foreground"
                  >
                    {pauli}
                  </text>
                )}
              </g>
            )
          })}
          {renderMeasurementBox(
            `ppm-box-${gateIndex}`,
            x,
            y,
            color,
            currentMeasureIndex,
            gate.pauliProductLabel ?? gate.type.toUpperCase()
          )}
        </g>
      )
      return
    }

    if (gate.type === "cx" && gate.control !== undefined) {
      const controlY = qubitY(gate.control)
      const targetY = qubitY(gate.targets[0])
      const color = getGateColor("cx")
      elements.push(
        <g key={`gate-${gateIndex}`}>
          <line x1={x} y1={controlY} x2={x} y2={targetY} stroke={color} strokeWidth="2" />
          <circle cx={x} cy={controlY} r="6" fill={color} />
          <circle cx={x} cy={targetY} r="15" fill="none" stroke={color} strokeWidth="2" />
          <line x1={x - 10} y1={targetY} x2={x + 10} y2={targetY} stroke={color} strokeWidth="2" />
          <line x1={x} y1={targetY - 10} x2={x} y2={targetY + 10} stroke={color} strokeWidth="2" />
        </g>
      )
      return
    }

    gate.targets.forEach((target, targetIndex) => {
      const y = qubitY(target)
      elements.push(
        <g key={`gate-${gateIndex}-${targetIndex}`}>
          <rect
            x={x - 25}
            y={y - 20}
            width="50"
            height="40"
            rx="4"
            fill={getGateColor(gate.type)}
            opacity="0.9"
          />
          <text x={x} y={y + 5} textAnchor="middle" className="text-xs font-bold fill-white">
            {getGateLabel(gate.type, gate.parameter)}
          </text>
        </g>
      )
    })
  })

  return { width, height, elements }
}
