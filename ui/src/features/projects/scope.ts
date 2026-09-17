export type ReadScope =
  | { kind: "project"; projectId: string }
  | { kind: "all" }
  | { kind: "unassigned" }

export type ProjectScope = Extract<ReadScope, { kind: "project" }>

export function scopeKey(scope: ReadScope): string {
  return scope.kind === "project"
    ? `project:${encodeURIComponent(scope.projectId)}`
    : scope.kind
}

export function scopeQuery(scope: ReadScope): Record<string, string> {
  return scope.kind === "project"
    ? { projectId: scope.projectId }
    : { context: scope.kind }
}

export function parseScopeSearch(search: string): ReadScope | null {
  const params = new URLSearchParams(search)
  const projectId = params.get("projectId")
  const context = params.get("context")
  if (projectId && (context === "unassigned" || context === "all")) {
    throw new Error("projectId e context são mutuamente exclusivos")
  }
  if (context === "unassigned") {
    return { kind: "unassigned" }
  }
  if (context === "all") {
    return { kind: "all" }
  }
  if (projectId) {
    return { kind: "project", projectId }
  }
  return null
}

const PROJECT_SCOPED_SEARCH_KEYS = [
  "analysisMetric",
  "analysisPeriod",
  "analysisMode",
  "analysisPreset",
  "durationPreset",
] as const

function stripProjectScopedSearch(params: URLSearchParams) {
  for (const key of PROJECT_SCOPED_SEARCH_KEYS) {
    params.delete(key)
  }
}

export function writeScopeSearch(search: string, scope: ReadScope): string {
  const params = new URLSearchParams(search)
  const previousProject = params.get("projectId")
  const previousContext = params.get("context")
  params.delete("projectId")
  params.delete("context")
  if (scope.kind === "project") {
    if (
      previousContext === "unassigned" ||
      previousContext === "all" ||
      (previousProject !== null && previousProject !== scope.projectId)
    ) {
      stripProjectScopedSearch(params)
    }
    params.set("projectId", scope.projectId)
  } else {
    if (previousProject !== null || (previousContext && previousContext !== scope.kind)) {
      stripProjectScopedSearch(params)
    }
    params.set("context", scope.kind)
  }
  return params.toString()
}

export function matchesScope(payload: unknown, scope: ReadScope): boolean {
  if (!payload || typeof payload !== "object" || !("context" in payload)) {
    return true
  }
  const context = (payload as { context?: { kind?: string; projectId?: string } })
    .context
  if (!context) {
    return true
  }
  if (scope.kind === "project") {
    return context.kind === "project" && context.projectId === scope.projectId
  }
  return context.kind === scope.kind
}

export const LAST_PROJECT_KEY = "ci-queue.lastProjectId"

export function resolveInitialScope(input: {
  urlScope: ReadScope | null
  lastProjectId: string | null
  bootstrapProjectId: string | null
  activeIds: string[]
}): ReadScope | null {
  const { urlScope, lastProjectId, bootstrapProjectId, activeIds } = input
  if (urlScope) {
    return urlScope
  }
  if (lastProjectId && activeIds.includes(lastProjectId)) {
    return { kind: "project", projectId: lastProjectId }
  }
  if (bootstrapProjectId && activeIds.includes(bootstrapProjectId)) {
    return { kind: "project", projectId: bootstrapProjectId }
  }
  if (activeIds.length === 1) {
    return { kind: "project", projectId: activeIds[0] }
  }
  return null
}
