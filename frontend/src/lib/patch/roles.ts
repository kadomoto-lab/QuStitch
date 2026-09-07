import type { LogicalQubitMapping, LogicalQubitRole, Patch } from "@/types/trace"
import type { PatchGroup } from "./topology"

export type PatchRoleKey = LogicalQubitRole | "unknown"

export interface PatchRoleMaps {
  /** Dominant role of each connected component (by component id). */
  groupRoleMap: Map<number, PatchRoleKey>
  /** Ordinal of each patch among the patches that share its role (by pchidx). */
  rolePatchIndices: Map<number, number>
}

export function buildPatchToQubitMap(
  mappings: LogicalQubitMapping[] | undefined
): Map<number, LogicalQubitMapping> {
  const map = new Map<number, LogicalQubitMapping>()
  mappings?.forEach((mapping) => {
    mapping.patch_indices.forEach((pchidx) => map.set(pchidx, mapping))
  })
  return map
}

function dominantRole(counts: Map<LogicalQubitRole, number>): PatchRoleKey {
  let best: PatchRoleKey = "unknown"
  let bestCount = 0
  counts.forEach((count, role) => {
    if (count > bestCount) {
      bestCount = count
      best = role
    }
  })
  return best
}

/**
 * Derive the role of every patch group and an index for each patch within its
 * role, which drives the per-patch colour variation.
 */
export function buildPatchRoleMaps(
  patches: Patch[],
  patchGroups: PatchGroup[],
  patchToQubitMap: Map<number, LogicalQubitMapping>
): PatchRoleMaps {
  const groupRoleMap = new Map<number, PatchRoleKey>()
  patchGroups.forEach((group) => {
    const counts = new Map<LogicalQubitRole, number>()
    group.patches.forEach((patch) => {
      const role = patchToQubitMap.get(patch.pchidx)?.role
      if (role) counts.set(role, (counts.get(role) ?? 0) + 1)
    })
    if (counts.size > 0) groupRoleMap.set(group.componentId, dominantRole(counts))
  })

  const rolePatchIndices = new Map<number, number>()
  const roleCounts = new Map<PatchRoleKey, number>()
  patches.forEach((patch) => {
    let role: PatchRoleKey = patchToQubitMap.get(patch.pchidx)?.role ?? "unknown"
    if (role === "unknown") {
      const group = patchGroups.find((candidate) =>
        candidate.patches.some((member) => member.pchidx === patch.pchidx)
      )
      const groupRole = group ? groupRoleMap.get(group.componentId) : undefined
      if (groupRole) role = groupRole
    }
    const ordinal = roleCounts.get(role) ?? 0
    rolePatchIndices.set(patch.pchidx, ordinal)
    roleCounts.set(role, ordinal + 1)
  })

  return { groupRoleMap, rolePatchIndices }
}

/** Role of a patch: its own mapping first, otherwise the role of its group. */
export function resolvePatchRole(
  patch: Patch,
  patchToQubitMap: Map<number, LogicalQubitMapping>,
  fallbackRole: PatchRoleKey
): PatchRoleKey {
  return patchToQubitMap.get(patch.pchidx)?.role ?? fallbackRole
}
