import { Card } from "@/components/ui/card"
import { useI18n } from "@/i18n/useI18n"
import type { PatchEvent } from "@/types/trace"

interface CurrentEventCardProps {
  hasTrace: boolean
  currentEvent: PatchEvent | null
  changedBoundaryCount: number
  componentCount: number
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      {value}
    </div>
  )
}

export function CurrentEventCard({
  hasTrace,
  currentEvent,
  changedBoundaryCount,
  componentCount,
}: CurrentEventCardProps) {
  const { t } = useI18n()

  return (
    <Card className="border-blue-200/50 bg-white/80 p-5 shadow-lg backdrop-blur-sm">
      <h3 className="mb-4 text-lg font-bold text-blue-700">{t.patch.currentState}</h3>
      {hasTrace ? (
        <div className="space-y-3">
          {currentEvent ? (
            <>
              <Row
                label={t.patch.instruction}
                value={
                  <span className="rounded bg-blue-50 px-2 py-1 font-mono font-bold text-blue-600">
                    {currentEvent.inst}
                  </span>
                }
              />
              <Row
                label={t.patch.cycle}
                value={
                  <span className="font-mono text-slate-700">
                    {currentEvent.cycle.toLocaleString()}
                  </span>
                }
              />
              <Row
                label={t.patch.changedPatches}
                value={
                  <span className="font-mono text-slate-700">
                    {currentEvent.patch_delta.length}
                  </span>
                }
              />
              <Row
                label={t.patch.changedBoundaries}
                value={
                  <span className="rounded bg-amber-50 px-2 py-1 font-mono font-bold text-amber-600">
                    {changedBoundaryCount}
                  </span>
                }
              />
            </>
          ) : (
            <p className="italic text-slate-400">{t.common.initialState}</p>
          )}
          <div className="mt-3 border-t border-blue-100 pt-3">
            <Row
              label={t.patch.componentCount}
              value={
                <span className="rounded bg-purple-50 px-2 py-1 font-mono font-bold text-purple-600">
                  {componentCount}
                </span>
              }
            />
          </div>
        </div>
      ) : (
        <p className="text-slate-400">{t.patch.noDataState}</p>
      )}
    </Card>
  )
}
