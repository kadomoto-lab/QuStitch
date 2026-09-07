/**
 * Qubit / classical-bit references in the trace are not always plain numbers:
 * depending on the backend version they may be nested arrays such as `[[0]]`.
 * These helpers extract the first numeric value.
 */
export type NumericRef = number | NumericRef[] | null | undefined

export function firstNumber(value?: NumericRef): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (!Array.isArray(value)) return null
  for (const entry of value) {
    const found = firstNumber(entry)
    if (found !== null) return found
  }
  return null
}

export function numericList(values?: NumericRef[]): number[] {
  return (values ?? []).flatMap((value) => {
    const number = firstNumber(value)
    return number === null ? [] : [number]
  })
}

/** `q0` / `q?` style label. */
export function qubitLabel(value?: NumericRef): string {
  const index = firstNumber(value)
  return index === null ? "q?" : `q${index}`
}

/** `c0` / `c?` style label. */
export function classicalLabel(value?: NumericRef): string {
  const index = firstNumber(value)
  return index === null ? "c?" : `c${index}`
}

/** `q[0]` / `q[?]` style label. */
export function qubitBracketLabel(value?: NumericRef): string {
  const index = firstNumber(value)
  return index === null ? "q[?]" : `q[${index}]`
}

/** `c[0]` / `c[?]` style label. */
export function classicalBracketLabel(value?: NumericRef): string {
  const index = firstNumber(value)
  return index === null ? "c[?]" : `c[${index}]`
}
