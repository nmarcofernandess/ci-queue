import * as React from "react"
import { ChevronDownIcon, FolderIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProjectSelectionPanel } from "@/features/projects/project-selection-panel"
import { useProjectContext } from "@/features/projects/project-context"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import { mutateProjects } from "@/lib/api"
import { toast } from "sonner"

export function ProjectSwitcher({ onManage }: { onManage: () => void }) {
  return <ProjectSwitcherMenu onManage={onManage} />
}

function ProjectSwitcherMenu({ onManage }: { onManage: () => void }) {
  const {
    scope,
    projects,
    registryRevision,
    requestScopeChange,
    reloadProjects,
  } = useProjectContext()
  const session = useDashboardSession()
  const [open, setOpen] = React.useState(false)
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

  return (
    <ProjectSelectionPanel
      open={open}
      onOpenChange={setOpen}
      projects={projects}
      target={scope?.kind === "project" || scope?.kind === "all" ? scope : null}
      onSelect={(target) => {
        requestScopeChange(target)
        setOpen(false)
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
                      reason instanceof Error
                        ? reason.message
                        : "Falha ao restaurar."
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
    />
  )
}
