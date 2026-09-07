import { useI18n } from "@/i18n/useI18n"
import { getRoleLegendColor } from "@/lib/patch/colors"
import type { PatchRoleKey } from "@/lib/patch/roles"

interface PatchLegendProps {
  showStabilizers: boolean
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {swatch}
      <span className="text-slate-600">{label}</span>
    </div>
  )
}

/** Boundary / stabilizer symbols and patch-role colours, matching the canvas exactly. */
export function PatchLegend({ showStabilizers }: PatchLegendProps) {
  const { t } = useI18n()
  const roles: Array<[PatchRoleKey, string]> = [
    ["data", t.patch.roleData],
    ["padding", t.patch.rolePadding],
    ["z_ancilla", t.patch.roleZAncilla],
    ["m_ancilla", t.patch.roleMAncilla],
  ]

  return (
    <div className="pointer-events-none absolute right-3 top-3 max-w-[22rem] rounded-lg border border-blue-200 bg-white/90 p-3 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-2 text-sm font-bold text-blue-700">{t.patch.legend}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <LegendItem
          swatch={<div className="h-1 w-6 rounded-full bg-red-500" />}
          label={t.patch.xBoundary}
        />
        <LegendItem
          swatch={<div className="h-1 w-6 rounded-full bg-blue-500" />}
          label={t.patch.zBoundary}
        />
        {showStabilizers ? (
          <>
            <LegendItem
              swatch={<div className="h-4 w-4 rounded-sm border border-stone-400 bg-yellow-100" />}
              label={t.patch.zStab}
            />
            <LegendItem
              swatch={<div className="h-4 w-4 rounded-sm border border-stone-500 bg-stone-400" />}
              label={t.patch.xStab}
            />
            <LegendItem
              swatch={<div className="h-3 w-3 rounded-full border-2 border-slate-800 bg-white" />}
              label={t.patch.dataQubit}
            />
          </>
        ) : (
          <>
            <LegendItem
              swatch={<div className="h-1 w-6 rounded-full bg-teal-500" />}
              label={t.patch.lpBoundary}
            />
            <LegendItem
              swatch={
                <div className="h-3.5 w-3.5 rounded-full border-2 border-violet-600 bg-white" />
              }
              label={t.patch.yBoundary}
            />
            <LegendItem
              swatch={<div className="h-3 w-3 rotate-45 bg-slate-800" />}
              label={t.patch.cornerMarker}
            />
          </>
        )}
      </div>
      <div className="mt-2 border-t border-blue-100 pt-2">
        <div className="mb-1.5 font-semibold text-slate-500">{t.patch.patchRoles}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {roles.map(([role, label]) => {
            const color = getRoleLegendColor(role)
            return (
              <LegendItem
                key={role}
                swatch={
                  <div
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: color.bg, border: `1.5px solid ${color.border}` }}
                  />
                }
                label={label}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
