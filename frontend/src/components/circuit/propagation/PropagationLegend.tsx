import { useI18n } from "@/i18n/useI18n"
import { ABSORBED_GATE_COLOR, SOURCE_GATE_COLOR } from "@/lib/circuit/propagationFrames"
import { getGateColor } from "@/lib/circuit/render"

export function PropagationLegend() {
  const { t } = useI18n()
  const items: Array<{ label: string; swatch: React.CSSProperties; round?: boolean }> = [
    { label: t.propagation.legendSource, swatch: { borderColor: SOURCE_GATE_COLOR }, round: true },
    {
      label: t.propagation.legendAbsorbed,
      swatch: { borderColor: ABSORBED_GATE_COLOR },
      round: true,
    },
    {
      label: t.propagation.legendNew,
      swatch: { borderColor: "#10b981", backgroundColor: "#ecfdf5" },
    },
    { label: t.propagation.legendPpr, swatch: { backgroundColor: getGateColor("ppr") } },
    { label: t.propagation.legendPpm, swatch: { backgroundColor: getGateColor("ppm") } },
    { label: t.propagation.legendSqm, swatch: { backgroundColor: getGateColor("measure") } },
  ]

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-600">
      <span className="font-medium text-slate-500">{t.propagation.legend}:</span>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className={`h-3 w-3 shrink-0 ${item.round ? "rounded-full border-2" : "rounded-sm"} ${
              item.swatch.borderColor && !item.round ? "border-2" : ""
            }`}
            style={item.swatch}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
