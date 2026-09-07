import { Card } from "@/components/ui/card"
import { useI18n } from "@/i18n/useI18n"
import type { PatchEvent } from "@/types/trace"

interface EventListProps {
  events: PatchEvent[]
  currentEventIndex: number
  onSelect: (index: number) => void
}

function eventButtonClass(active: boolean): string {
  return `w-full rounded-lg border p-3 text-left transition-all ${
    active
      ? "border-blue-400 bg-blue-50 shadow-sm"
      : "border-blue-100 bg-white hover:border-blue-300 hover:bg-blue-50/50"
  }`
}

/** Clickable list of every patch event, plus the initial state. */
export function EventList({ events, currentEventIndex, onSelect }: EventListProps) {
  const { t } = useI18n()

  return (
    <Card className="border-blue-200/50 bg-white/80 p-5 shadow-lg backdrop-blur-sm">
      <h3 className="mb-4 text-lg font-bold text-blue-700">{t.patch.eventList}</h3>
      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
        <button
          type="button"
          onClick={() => onSelect(-1)}
          className={eventButtonClass(currentEventIndex === -1)}
        >
          <span className="text-sm font-medium text-slate-700">{t.common.initialState}</span>
        </button>
        {events.map((event, index) => (
          <button
            type="button"
            key={event.seq}
            onClick={() => onSelect(index)}
            className={eventButtonClass(index === currentEventIndex)}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{event.inst}</span>
              <span className="font-mono text-xs text-slate-400">
                cycle {event.cycle.toLocaleString()}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}
