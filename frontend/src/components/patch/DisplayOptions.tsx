import { useI18n } from "@/i18n/useI18n"
import type { PatchSceneOptions } from "@/lib/canvas/scene"

interface DisplayOptionsProps {
  options: PatchSceneOptions
  onChange: (options: PatchSceneOptions) => void
}

/** Checkboxes controlling what the patch canvas draws. */
export function DisplayOptions({ options, onChange }: DisplayOptionsProps) {
  const { t } = useI18n()
  const checkboxClass =
    "rounded border-blue-300 text-blue-500 focus:ring-blue-400 disabled:cursor-not-allowed"

  const update = (patch: Partial<PatchSceneOptions>) => {
    const next = { ...options, ...patch }
    // Physical qubits are only meaningful on top of the stabilizer layout.
    if (!next.showStabilizers) next.showPhysicalQubits = false
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-6 text-sm">
      <label className="flex cursor-pointer items-center gap-2 transition-colors hover:text-blue-600">
        <input
          type="checkbox"
          checked={options.showOnlyDataQubits}
          onChange={(event) => update({ showOnlyDataQubits: event.target.checked })}
          className={checkboxClass}
        />
        <span>{t.patch.onlyDataQubits}</span>
      </label>
      <label
        className={`flex items-center gap-2 transition-colors ${
          options.showStabilizers
            ? "cursor-pointer hover:text-blue-600"
            : "cursor-not-allowed opacity-50"
        }`}
      >
        <input
          type="checkbox"
          checked={options.showPhysicalQubits}
          onChange={(event) => update({ showPhysicalQubits: event.target.checked })}
          disabled={!options.showStabilizers}
          className={checkboxClass}
        />
        <span>
          {t.patch.physicalQubits}
          {!options.showStabilizers && t.patch.physicalQubitsRequired}
        </span>
      </label>
      <label className="flex cursor-pointer items-center gap-2 transition-colors hover:text-blue-600">
        <input
          type="checkbox"
          checked={options.showStabilizers}
          onChange={(event) => update({ showStabilizers: event.target.checked })}
          className={checkboxClass}
        />
        <span>{t.patch.stabilizers}</span>
      </label>
    </div>
  )
}
