import { gateX, qubitY } from "@/lib/circuit/layout"
import type { PropagationFrame } from "@/lib/circuit/propagationFrames"

interface ResultHighlightProps {
  frame: PropagationFrame
  /** Number of qubits in the input circuit (the ancilla row follows them). */
  sourceQubitCount: number
}

/** Highlight the primitive being previewed or just added in the result circuit. */
export function ResultHighlight({ frame, sourceQubitCount }: ResultHighlightProps) {
  if ((frame.phase !== "preview" && frame.phase !== "added") || frame.blockIndex === undefined) {
    return null
  }

  const x = gateX(frame.blockIndex)
  const terms = frame.terms
  const isSqm = frame.block?.op_type.toLowerCase() === "sqm"
  const anchorY = isSqm ? qubitY(terms[0]?.qubit ?? 0) : qubitY(sourceQubitCount)
  const ys = terms.map((term) => qubitY(term.qubit))
  const minY = Math.min(...ys, anchorY) - 42
  const maxY = Math.max(...ys, anchorY) + 42

  return (
    <rect
      x={x - 44}
      y={minY}
      width="88"
      height={maxY - minY}
      rx="14"
      fill="#ecfdf5"
      stroke="#10b981"
      strokeWidth="3"
      opacity={frame.phase === "preview" ? "0.72" : "0.42"}
    >
      {frame.phase === "preview" && (
        <animate
          attributeName="opacity"
          values="0.24;0.82;0.24"
          dur="1s"
          repeatCount="indefinite"
        />
      )}
    </rect>
  )
}
