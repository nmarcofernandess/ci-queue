import type { ProjectProbe, ProjectSummary } from "@/lib/types"

export function editFormFromProject(item: ProjectSummary) {
  return {
    displayName: item.displayName || item.id,
    path: item.resolvedRepositoryPath || item.repositoryPath || "",
    configPath: item.configPath || "",
  }
}

export function editLinkMutation(
  selected: ProjectSummary,
  path: string,
  configPath: string,
  signature: ProjectProbe["signature"]
) {
  const relocating = Boolean(path && path !== (selected.repositoryPath || ""))
  return {
    action: relocating ? "relocate" : "link-config",
    projectId: selected.id,
    ...(relocating ? { repositoryPath: path } : {}),
    configPath: configPath || null,
    signature,
  }
}

export function registerIdentitySource(input: {
  observedId: string
  catalogValid: boolean | undefined
}) {
  if (input.observedId) {
    return "observed"
  }
  return input.catalogValid ? "config" : "new"
}
