import * as React from "react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { SelectionPanel } from "@/features/shared/selection-panel"
import type { ProjectSummary, ProjectTarget } from "@/lib/types"

export function ProjectSelectionPanel({
  open,
  onOpenChange,
  projects,
  target,
  onSelect,
  trigger,
  footer,
  align = "start",
  label = "Projetos",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: ProjectSummary[]
  target: ProjectTarget | null
  onSelect: (target: ProjectTarget) => void
  trigger: React.ReactNode
  footer?: React.ReactNode
  align?: "start" | "end" | "center"
  label?: string
}) {
  const [query, setQuery] = React.useState("")
  const visible = projects.filter(
    (project) =>
      !project.archivedAt &&
      [project.displayName, project.id, project.repositoryPath ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  )
  return (
    <SelectionPanel
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery("")
      }}
      align={align}
      label={label}
      trigger={trigger}
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
      footer={footer}
    >
      <Button
        type="button"
        variant={target?.kind === "all" ? "secondary" : "ghost"}
        className="justify-start"
        onClick={() => onSelect({ kind: "all" })}
      >
        Todos os projetos
      </Button>
      {visible.length === 0 ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">
          Nenhum projeto ativo corresponde à busca.
        </p>
      ) : (
        visible.map((project) => (
          <Button
            key={project.id}
            type="button"
            variant={
              target?.kind === "project" && target.projectId === project.id
                ? "secondary"
                : "ghost"
            }
            className="h-auto min-w-0 justify-start"
            onClick={() => onSelect({ kind: "project", projectId: project.id })}
          >
            <span className="flex min-w-0 flex-col items-start">
              <span className="truncate">
                {project.displayName || project.id}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {project.resolvedRepositoryPath ||
                  project.repositoryPath ||
                  project.id}
              </span>
            </span>
          </Button>
        ))
      )}
    </SelectionPanel>
  )
}
