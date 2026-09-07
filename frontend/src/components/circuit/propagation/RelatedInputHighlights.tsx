import { gateX, qubitY } from "@/lib/circuit/layout"
import { relatedGates, type PropagationFrame } from "@/lib/circuit/propagationFrames"
import { firstNumber } from "@/lib/trace/refs"

/** Outline the source gate and every absorbed Clifford of the current block. */
export function RelatedInputHighlights({ frame }: { frame: PropagationFrame }) {
  if (frame.phase === "complete" || frame.phase === "pauli-frame") return null
  const fallbackQubit = firstNumber(frame.block?.source_qubits?.[0])

  return (
    <g>
      {relatedGates(frame.block).map((gate) => {
        const x = gateX(gate.gateIdx)
        const ys = gate.qubits.length > 0 ? gate.qubits.map(qubitY) : [qubitY(fallbackQubit ?? 0)]
        const minY = Math.min(...ys) - 34
        const maxY = Math.max(...ys) + 34
        return (
          <rect
            key={`related-highlight-${gate.key}-${gate.gateIdx}`}
            x={x - 40}
            y={minY}
            width="80"
            height={maxY - minY}
            rx="12"
            fill="none"
            stroke={gate.color}
            strokeWidth="3"
            opacity="0.78"
          />
        )
      })}
    </g>
  )
}
