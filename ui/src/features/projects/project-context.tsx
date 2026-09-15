/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import { getProjects } from "@/lib/api"
import type { ProjectSummary } from "@/lib/types"

import {
  LAST_PROJECT_KEY,
  parseScopeSearch,
  resolveInitialScope,
  scopeKey,
  writeScopeSearch,
  type ReadScope,
} from "./scope"

type ProjectContextValue = {
  scope: ReadScope | null
  projects: ProjectSummary[]
  registryRevision: number
  bootstrapProjectId: string | null
  loading: boolean
  error: Error | undefined
  requestScopeChange: (scope: ReadScope) => void
  reloadProjects: () => void
  saveDraft: (projectId: string, draft: unknown) => void
  takeDraft: (projectId: string) => unknown
}

const ProjectContext = React.createContext<ProjectContextValue | null>(null)

function replaceSearch(search: string) {
  const url = new URL(window.location.href)
  url.search = search
  window.history.replaceState(window.history.state, "", url)
}

function pushSearch(search: string) {
  const url = new URL(window.location.href)
  url.search = search
  window.history.pushState(window.history.state, "", url)
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([])
  const [registryRevision, setRegistryRevision] = React.useState(0)
  const [bootstrapProjectId, setBootstrapProjectId] = React.useState<string | null>(
    null
  )
  const [scope, setScope] = React.useState<ReadScope | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<Error>()
  const [revision, setRevision] = React.useState(0)
  const drafts = React.useRef(new Map<string, unknown>())
  const resolved = React.useRef(false)

  const reloadProjects = React.useCallback(() => {
    setRevision((value) => value + 1)
  }, [])

  React.useEffect(() => {
    let disposed = false
    void getProjects()
      .then((payload) => {
        if (disposed) {
          return
        }
        const active = payload.projects
          .filter((item) => !item.archivedAt)
          .map((item) => item.id)
        const urlScope = parseScopeSearch(window.location.search)
        const nextScope = resolveInitialScope({
          urlScope,
          lastProjectId: window.localStorage.getItem(LAST_PROJECT_KEY),
          bootstrapProjectId: payload.bootstrapProjectId,
          activeIds: active,
        })
        setProjects(payload.projects)
        setRegistryRevision(payload.registryRevision)
        setBootstrapProjectId(payload.bootstrapProjectId)
        setScope(nextScope)
        setError(undefined)
        if (nextScope && !urlScope) {
          replaceSearch(writeScopeSearch(window.location.search, nextScope))
        }
        resolved.current = true
      })
      .catch((reason) => {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason
              : new Error("Não foi possível ler o cadastro de projetos.")
          )
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false)
        }
      })
    return () => {
      disposed = true
    }
  }, [revision])

  React.useEffect(() => {
    const syncFromUrl = () => {
      try {
        const urlScope = parseScopeSearch(window.location.search)
        if (urlScope) {
          setScope(urlScope)
        }
      } catch (reason) {
        setError(
          reason instanceof Error ? reason : new Error("Contexto de projeto inválido.")
        )
      }
    }
    window.addEventListener("popstate", syncFromUrl)
    window.addEventListener("hashchange", syncFromUrl)
    return () => {
      window.removeEventListener("popstate", syncFromUrl)
      window.removeEventListener("hashchange", syncFromUrl)
    }
  }, [])

  const requestScopeChange = React.useCallback((next: ReadScope) => {
    setScope(next)
    pushSearch(writeScopeSearch(window.location.search, next))
    if (next.kind === "project") {
      window.localStorage.setItem(LAST_PROJECT_KEY, next.projectId)
    }
  }, [])

  const saveDraft = React.useCallback((projectId: string, draft: unknown) => {
    drafts.current.set(projectId, draft)
  }, [])

  const takeDraft = React.useCallback((projectId: string) => {
    return drafts.current.get(projectId)
  }, [])

  const value = React.useMemo<ProjectContextValue>(
    () => ({
      scope,
      projects,
      registryRevision,
      bootstrapProjectId,
      loading,
      error,
      requestScopeChange,
      reloadProjects,
      saveDraft,
      takeDraft,
    }),
    [
      bootstrapProjectId,
      error,
      loading,
      projects,
      registryRevision,
      reloadProjects,
      requestScopeChange,
      saveDraft,
      scope,
      takeDraft,
    ]
  )

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  )
}

export function useProjectContext() {
  const value = React.useContext(ProjectContext)
  if (!value) {
    throw new Error("useProjectContext exige ProjectProvider")
  }
  return value
}

export function ProjectScopeBoundary({
  children,
}: {
  children: React.ReactNode
}) {
  const { scope, registryRevision } = useProjectContext()
  return (
    <React.Fragment key={`${scope ? scopeKey(scope) : "none"}:${registryRevision}`}>
      {children}
    </React.Fragment>
  )
}

export function useRequiredProject(): Extract<ReadScope, { kind: "project" }> | null {
  const { scope } = useProjectContext()
  return scope?.kind === "project" ? scope : null
}
