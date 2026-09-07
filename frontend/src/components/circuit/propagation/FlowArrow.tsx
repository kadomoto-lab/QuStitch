import { averageQubitY, gateX, qubitY } from "@/lib/circuit/layout"
import { relatedGates, type PropagationFrame } from "@/lib/circuit/propagationFrames"
import { firstNumber } from "@/lib/trace/refs"

interface FlowArrowProps {
  frame: PropagationFrame | null
  inputOffsetX: number
  resultOffsetX: number
  headerHeight: number
}

function termCenterY(frame: PropagationFrame, fallbackQubit: number | null): number {
  if (frame.terms.length > 0) {
    return frame.terms.reduce((sum, term) => sum + qubitY(term.qubit), 0) / frame.terms.length
  }
  return qubitY(fallbackQubit ?? 0)
}

/** Animated arrows from the related input gates to the slot of the new primitive. */
export function FlowArrow({ frame, inputOffsetX, resultOffsetX, headerHeight }: FlowArrowProps) {
  if (
    !frame ||
    (frame.phase !== "forming" && frame.phase !== "preview") ||
    frame.blockIndex === undefined
  ) {
    return null
  }

  const sourceQubit = firstNumber(frame.block?.source_qubits?.[0])
  const endX = resultOffsetX + gateX(frame.blockIndex) - 48
  const endY = headerHeight + termCenterY(frame, sourceQubit)
  const gates = relatedGates(frame.block)

  return (
    <g pointerEvents="none">
      {gates.map((gate, index) => {
        const startX = inputOffsetX + gateX(gate.gateIdx) + 46
        const startY = headerHeight + averageQubitY(gate.qubits, sourceQubit)
        const laneOffset = (index - (gates.length - 1) / 2) * 16
        const path = `M ${startX} ${startY} C ${startX + 120} ${startY + laneOffset}, ${endX - 130} ${endY + laneOffset}, ${endX} ${endY}`
        const delay = `${index * 0.1}s`
        return (
          <g key={`related-arrow-${gate.key}-${gate.gateIdx}`}>
            <path d={path} stroke={gate.color} strokeWidth="4" fill="none" opacity="0.1" />
            <path
              d={path}
              stroke={gate.color}
              strokeWidth="3"
              strokeDasharray="10 8"
              strokeLinecap="round"
              fill="none"
              markerEnd="url(#flow-arrow-head)"
              opacity="0.85"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="36"
                to="0"
                dur="0.75s"
                begin={delay}
                repeatCount="indefinite"
              />
            </path>
            <circle r="5" fill={gate.color} opacity="0.9">
              <animateMotion dur="1.15s" begin={delay} repeatCount="indefinite" path={path} />
            </circle>
          </g>
        )
      })}
    </g>
  )
}
