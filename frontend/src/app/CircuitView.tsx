import { CircuitComparison } from "@/components/circuit/CircuitComparison"
import { ExecutionSchedule } from "@/components/circuit/ExecutionSchedule"
import { PauliPropagationAnimation } from "@/components/circuit/PauliPropagationAnimation"
import { Card } from "@/components/ui/card"
import { useI18n } from "@/i18n/useI18n"
import type { TraceResult } from "@/types/trace"

interface CircuitViewProps {
  traceData: TraceResult | null
}

/** First screen: how the input circuit is compiled into Pauli-product operations. */
export function CircuitView({ traceData }: CircuitViewProps) {
  const { t } = useI18n()

  if (!traceData) {
    return (
      <Card className="flex min-h-[620px] items-center justify-center border-blue-200/50 bg-white/80 text-slate-400 shadow-lg backdrop-blur-sm">
        {t.common.noData}
      </Card>
    )
  }

  return (
    <>
      <CircuitComparison traceData={traceData} />
      <Card className="border-blue-200/50 bg-white/80 p-6 shadow-lg backdrop-blur-sm">
        <div className="min-h-[620px] flex-1 rounded-xl">
          <PauliPropagationAnimation traceData={traceData} />
        </div>
      </Card>
      <ExecutionSchedule traceData={traceData} />
    </>
  )
}
