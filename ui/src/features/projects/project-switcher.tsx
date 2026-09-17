import * as React from "react"
import { ChevronDownIcon, FolderIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { SelectionPanel } from "@/features/shared/selection-panel"
import { useProjectContext } from "@/features/projects/project-context"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import { mutateProjects } from "@/lib/api"
import type { ProjectSummary } from "@/lib/types"
import { toast } from "sonner"

function matchesQuery(project: ProjectSummary, query: string) {
  const haystack = [
    project.displayName,
    project.id,
    project.repositoryPath ?? "",
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

export function ProjectSwitcher({
  onManage,
}: {
  onManage: () => void
}) {
  return <ProjectSwitcherMenu onManage={onManage} />
}

function ProjectSwitcherMenu({
  onManage,
}: {
  onManage: () => void
}) {
  const { scope, projects, registryRevision, requestScopeChange, reloadProjects } =
    useProjectContext()
  const session = useDashboardSession()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const active = projects.filter((item) => !item.archivedAt)
  const selected =
    scope?.kind === "project"
      ? projects.find((item) => item.id === scope.projectId)
      : undefined
  const label =
    scope?.kind === "all"
      ? "Todos os projetos"
      : scope?.kind === "unassigned"
        ? "Histórico sem projeto"
        : selected?.archivedAt
          ? `${selected.displayName || selected.id} (arquivado)`
          : selected?.displayName || selected?.id || "Selecionar projeto"
  const visible = active.filter((item) => matchesQuery(item, query))

  return (
    <SelectionPanel
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery("")
        }
      }}
      align="end"
      label="Projetos"
      trigger={
        <Button
          type="button"
          variant="outline"
          className="max-w-[min(24rem,50%)] min-w-0 max-[639px]:max-w-[45vw]"
          title={label}
        >
          <FolderIcon />
          <span className="truncate">{label}</span>
          <ChevronDownIcon />
        </Button>
      }
      header={
        <InputGroup>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar projeto…"
            aria-label="Buscar projeto"
          />
        </InputGroup>
      }
      footer={
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            onClick={() => {
              requestScopeChange({ kind: "unassigned" })
              setOpen(false)
            }}
          >
            Histórico sem projeto
          </Button>
          {selected?.archivedAt ? (
            <Button
              type="button"
              variant="ghost"
              className="justify-start"
              onClick={() => {
                const token = session.data?.csrfToken
                if (!token) {
                  toast.error("A sessão da bridge não está disponível.")
                  return
                }
                void mutateProjects(token, {
                  action: "restore",
                  expectedRevision: registryRevision,
                  projectId: selected.id,
                })
                  .then(() => {
                    reloadProjects()
                    toast.success("Projeto restaurado.")
                    setOpen(false)
                  })
                  .catch((reason) => {
                    toast.error(
                      reason instanceof Error ? reason.message : "Falha ao restaurar."
                    )
                  })
              }}
            >
              Restaurar este projeto
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            Gerenciar projetos
          </Button>
        </div>
      }
      >
      <Button
        type="button"
        variant={scope?.kind === "all" ? "secondary" : "ghost"}
        className="justify-start"
        onClick={() => {
          requestScopeChange({ kind: "all" })
          setOpen(false)
        }}
      >
        Todos os projetos
      </Button>
      {visible.length === 0 ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">
          Nenhum projeto ativo corresponde à busca.
        </p>
      ) : (
        visible.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={scope?.kind === "project" && scope.projectId === item.id ? "secondary" : "ghost"}
            className="h-auto min-w-0 justify-start"
            onClick={() => {
              requestScopeChange({ kind: "project", projectId: item.id })
              setOpen(false)
            }}
          >
            <span className="flex min-w-0 flex-col items-start">
              <span className="truncate">{item.displayName || item.id}</span>
              <span className="truncate text-xs text-muted-foreground">
                {item.resolvedRepositoryPath || item.repositoryPath || item.id}
              </span>
            </span>
          </Button>
        ))
      )}
    </SelectionPanel>
  )
}
