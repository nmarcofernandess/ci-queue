import type {
  DashboardAllState,
  DashboardPending,
  DashboardProjectState,
} from "@/lib/types"

export function metaPreviewRows(
  state: DashboardAllState,
  limit: number
): DashboardProjectState[] {
  return state.projects
    .filter((project) => project.meta)
    .sort(
      (a, b) =>
        a.projectName.localeCompare(b.projectName, "pt-BR") ||
        a.projectId.localeCompare(b.projectId)
    )
    .slice(0, limit)
}

export function pendingPreviewRows(
  state: DashboardAllState,
  limit: number
): Array<{
  projectId: string
  projectName: string
  item: DashboardPending
}> {
  return state.projects
    .flatMap((project) =>
      project.pending.map((item) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        item,
      }))
    )
    .sort(
      (a, b) =>
        b.item.createdAt.localeCompare(a.item.createdAt) ||
        a.projectId.localeCompare(b.projectId) ||
        a.item.id.localeCompare(b.item.id)
    )
    .slice(0, limit)
}
