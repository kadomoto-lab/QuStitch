import { useMemo } from "react"
import { getBoundaryChanges } from "@/lib/patch/changes"
import { buildPatchToQubitMap } from "@/lib/patch/roles"
import {
  computeConnectedComponents,
  computePatchGroups,
  type PatchGroup,
} from "@/lib/patch/topology"
import { getGateExecutionState, type GateExecutionState } from "@/lib/trace/gateState"
import type { LogicalQubitMapping, Patch, TraceResult } from "@/types/trace"

interface UsePatchDerivedStateArgs {
  traceData: TraceResult | null
  currentEventIndex: number
  currentCycle: number
  currentPatches: Patch[]
  prevPatches: Patch[]
}

export interface PatchDerivedState {
  boundaryChanges: Set<string>
  componentCount: number
  patchGroups: PatchGroup[]
  patchToQubitMap: Map<number, LogicalQubitMapping>
  gateState: GateExecutionState
}

/** Topology, boundary diff and gate status derived from the current patch layout. */
export function usePatchDerivedState({
  traceData,
  currentEventIndex,
  currentCycle,
  currentPatches,
  prevPatches,
}: UsePatchDerivedStateArgs): PatchDerivedState {
  const { boundaryChanges, componentCount, patchGroups } = useMemo(() => {
    if (!traceData || currentPatches.length === 0) {
      return {
        boundaryChanges: new Set<string>(),
        componentCount: 0,
        patchGroups: [] as PatchGroup[],
      }
    }
    const componentMap = computeConnectedComponents(currentPatches)
    return {
      boundaryChanges:
        currentEventIndex >= 0
          ? getBoundaryChanges(currentPatches, prevPatches)
          : new Set<string>(),
      componentCount: new Set(componentMap.values()).size,
      patchGroups: computePatchGroups(currentPatches, componentMap),
    }
  }, [traceData, currentEventIndex, currentPatches, prevPatches])

  const patchToQubitMap = useMemo(
    () => buildPatchToQubitMap(traceData?.logical_qubit_mapping),
    [traceData?.logical_qubit_mapping]
  )

  const gateState = useMemo(
    () => getGateExecutionState(traceData?.clifford_t_execution_trace, currentCycle),
    [traceData?.clifford_t_execution_trace, currentCycle]
  )

  return { boundaryChanges, componentCount, patchGroups, patchToQubitMap, gateState }
}
