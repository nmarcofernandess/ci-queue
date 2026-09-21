import type { ProgressNode } from "@/lib/types"

export function formatProgressDetail(
  detail: ProgressNode["detail"],
): string | null {
  if (detail == null) return null
  if (typeof detail === "string") return detail
  return `${detail.completed} de ${detail.total}`
}

export function deepestActiveContext(
  rootId: string,
  active: readonly ProgressNode[],
): ProgressNode | undefined {
  const byId = new Map(active.map((node) => [node.id, node]))

  function depthUnderRoot(node: ProgressNode): number | null {
    let depth = 0
    let current: ProgressNode | undefined = node
    const seen = new Set<string>()
    while (current) {
      if (current.id === rootId) return depth
      if (!current.parentId || seen.has(current.id)) return null
      seen.add(current.id)
      depth += 1
      if (current.parentId === rootId) return depth
      current = byId.get(current.parentId)
    }
    return null
  }

  let best: ProgressNode | undefined
  let bestDepth = -1
  for (const node of active) {
    if (node.kind === "case") continue
    const depth = depthUnderRoot(node)
    if (depth === null) continue
    if (depth > bestDepth) {
      bestDepth = depth
      best = node
    }
  }
  return best
}

export function stageContextDescription(
  stage: ProgressNode,
  active: readonly ProgressNode[],
  planned: readonly (ProgressNode & { rootId: string })[],
): string | null {
  const current = deepestActiveContext(stage.id, active)
  const currentDetail = formatProgressDetail(current?.detail)
  if (currentDetail) return current?.id === stage.id ? currentDetail : `${current?.label} · ${currentDetail}`

  const next = planned.find((node) => node.rootId === stage.id && formatProgressDetail(node.detail))
  if (next) {
    const plannedDetail = `${next.label}: ${formatProgressDetail(next.detail)}`
    return current && current.id !== stage.id ? `${current.label} · ${plannedDetail}` : plannedDetail
  }

  const ownDetail = formatProgressDetail(stage.detail)
  if (ownDetail) return ownDetail
  return current && current.id !== stage.id ? current.label : null
}
