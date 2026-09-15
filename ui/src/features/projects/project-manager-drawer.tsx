import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerFooter,
  DetailDrawerHeader,
} from "@/features/shared/detail-drawer"
import { FactsTable } from "@/features/shared/facts-table"
import { useProjectContext } from "@/features/projects/project-context"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import {
  ApiError,
  getProjects,
  mutateProjects,
  pickHostPath,
  probeProject,
} from "@/lib/api"
import type { ProjectProbe, ProjectSummary } from "@/lib/types"

type Mode = { kind: "list" } | { kind: "register" } | { kind: "edit"; id: string }

function HostPathField({
  id,
  label,
  value,
  onChange,
  placeholder,
  kind,
  canPick,
  disabled,
  token,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  kind: "directory" | "file"
  canPick: boolean
  disabled?: boolean
  token: string | undefined
}) {
  const [picking, setPicking] = React.useState(false)
  const pick = async () => {
    if (!token) {
      toast.error("A sessão da bridge não está disponível.")
      return
    }
    setPicking(true)
    try {
      const picked = await pickHostPath(token, kind)
      onChange(picked.path)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        return
      }
      toast.error(
        reason instanceof Error ? reason.message : "Falha ao abrir o procurador de pasta."
      )
    } finally {
      setPicking(false)
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        {canPick ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              disabled={disabled || picking || !token}
              onClick={() => void pick()}
            >
              Procurar…
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </Field>
  )
}

export function ProjectManagerDrawer({ onClose }: { onClose: () => void }) {
  const { projects, registryRevision, reloadProjects, requestScopeChange, scope } =
    useProjectContext()
  const session = useDashboardSession()
  const [mode, setMode] = React.useState<Mode>({ kind: "list" })
  const [observed, setObserved] = React.useState<string[]>([])
  const [path, setPath] = React.useState("")
  const [configPath, setConfigPath] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [preview, setPreview] = React.useState<ProjectProbe>()
  const [observedId, setObservedId] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [archiveId, setArchiveId] = React.useState<string>()

  React.useEffect(() => {
    void getProjects(true).then((payload) => {
      setObserved(payload.observedUnregistered)
    })
  }, [])

  const token = session.data?.csrfToken
  const canPick = Boolean(session.data?.canPick)
  const selected = mode.kind === "edit"
    ? projects.find((item) => item.id === mode.id)
    : undefined

  const run = async (body: Record<string, unknown>) => {
    if (!token) {
      toast.error("A sessão da bridge não está disponível.")
      return
    }
    const known = new Set(projects.map((item) => item.id))
    setBusy(true)
    try {
      const payload = await mutateProjects(token, {
        ...body,
        expectedRevision: registryRevision,
      })
      reloadProjects()
      if (body.action === "register") {
        const created =
          payload.projects.find((item) => !known.has(item.id)) ??
          payload.projects.find(
            (item) => item.id === preview?.projectId || item.id === observedId
          )
        if (created) {
          requestScopeChange({ kind: "project", projectId: created.id })
        }
      }
      toast.success("Cadastro atualizado.")
      setMode({ kind: "list" })
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Falha ao atualizar o cadastro.")
    } finally {
      setBusy(false)
    }
  }

  const conferir = async () => {
    if (!token) {
      toast.error("A sessão da bridge não está disponível.")
      return
    }
    setBusy(true)
    try {
      const result = await probeProject(token, {
        repositoryPath: path || undefined,
        configPath: configPath || null,
        existingProjectId: selected?.id ?? (observedId || null),
      })
      setPreview(result)
      if (result.displayName && !displayName) {
        setDisplayName(result.displayName)
      }
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Falha ao conferir a pasta.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailDrawer onClose={onClose}>
      <DetailDrawerHeader
        title="Projetos locais"
        description="Cadastro persistente desta instalação. Arquivar não cancela jobs nem impede a CLI."
        closeLabel="Fechar gerenciamento de projetos"
      />
      <DetailDrawerBody>
        {mode.kind === "list" ? (
          <div className="flex flex-col gap-4">
            <Button
              type="button"
              onClick={() => {
                setMode({ kind: "register" })
                setPath("")
                setConfigPath("")
                setDisplayName("")
                setObservedId("")
                setPreview(undefined)
              }}
            >
              Cadastrar pasta
            </Button>
            {projects.filter((item) => !item.archivedAt).map((item) => (
              <ProjectRow
                key={item.id}
                item={item}
                onEdit={() => {
                  setMode({ kind: "edit", id: item.id })
                  setDisplayName(item.displayName || item.id)
                  setPath(item.repositoryPath || "")
                  setConfigPath(item.configPath || "")
                  setPreview(undefined)
                }}
              />
            ))}
            {projects.some((item) => item.archivedAt) ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Arquivados</h3>
                {projects.filter((item) => item.archivedAt).map((item) => (
                  <ProjectRow
                    key={item.id}
                    item={item}
                    onEdit={() => setMode({ kind: "edit", id: item.id })}
                  />
                ))}
              </div>
            ) : null}
            {observed.length ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Com registros, sem cadastro</h3>
                <ItemGroup>
                  {observed.map((id) => (
                    <Item key={id} variant="outline" size="sm" asChild>
                      <button
                        type="button"
                        onClick={() => {
                          setMode({ kind: "register" })
                          setObservedId(id)
                          setPath("")
                          setConfigPath("")
                          setDisplayName(id)
                          setPreview(undefined)
                        }}
                      >
                        <ItemContent>
                          <ItemTitle>{id}</ItemTitle>
                        </ItemContent>
                      </button>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            ) : null}
          </div>
        ) : (
          <FieldSet>
            <FieldGroup>
              <HostPathField
                id="project-path"
                label="Pasta Git"
                value={path}
                onChange={setPath}
                placeholder="/caminho/absoluto/do/repo"
                kind="directory"
                canPick={canPick}
                disabled={busy}
                token={token}
              />
              <HostPathField
                id="project-config"
                label="Configuração (opcional)"
                value={configPath}
                onChange={setConfigPath}
                placeholder="/caminho/ci-queue.json"
                kind="file"
                canPick={canPick}
                disabled={busy}
                token={token}
              />
              <Field>
                <FieldLabel htmlFor="project-name">Nome no painel</FieldLabel>
                <Input
                  id="project-name"
                  value={displayName}
                  maxLength={160}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </Field>
              {mode.kind === "register" && observed.length ? (
                <Field>
                  <FieldLabel>Com registros, sem cadastro</FieldLabel>
                  <ItemGroup>
                    {observed.map((id) => (
                      <Item
                        key={id}
                        variant={observedId === id ? "muted" : "outline"}
                        size="sm"
                        asChild
                      >
                        <button type="button" onClick={() => setObservedId(id)}>
                          <ItemContent>
                            <ItemTitle>{id}</ItemTitle>
                          </ItemContent>
                        </button>
                      </Item>
                    ))}
                  </ItemGroup>
                </Field>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void conferir()} disabled={busy}>
                Conferir pasta
              </Button>
              {preview ? (
                <FactsTable
                  caption="Inspeção da pasta"
                  rows={[
                    { id: "id", label: "ID", value: preview.projectId || "novo", technical: true },
                    { id: "catalog", label: "Catálogo", value: preview.bindingState },
                    { id: "presets", label: "Presets", value: preview.presets.join(", ") || "nenhum" },
                    {
                      id: "conflicts",
                      label: "Conflitos",
                      value: preview.conflicts.map((item) => item.message).join(", ") || "nenhum",
                    },
                  ]}
                />
              ) : null}
            </FieldGroup>
          </FieldSet>
        )}
      </DetailDrawerBody>
      <DetailDrawerFooter>
        {mode.kind === "list" ? (
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => setMode({ kind: "list" })}>
              Voltar
            </Button>
            {mode.kind === "edit" && selected?.archivedAt ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void run({ action: "restore", projectId: selected.id })}
              >
                Restaurar
              </Button>
            ) : null}
            {mode.kind === "edit" && selected && !selected.archivedAt ? (
              <Button type="button" variant="outline" onClick={() => setArchiveId(selected.id)}>
                Arquivar
              </Button>
            ) : null}
            {mode.kind === "edit" && selected && displayName && displayName !== selected.displayName ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run({ action: "rename", projectId: selected.id, displayName })
                }
              >
                Renomear
              </Button>
            ) : null}
            {mode.kind === "edit" && selected && selected.configPath && !preview ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void run({ action: "unlink-config", projectId: selected.id })}
              >
                Desvincular receitas
              </Button>
            ) : null}
            {mode.kind === "edit" && selected && preview ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run({
                    action: path && path !== selected.repositoryPath ? "relocate" : "link-config",
                    projectId: selected.id,
                    repositoryPath: path || undefined,
                    configPath: configPath || null,
                    signature: preview.signature,
                  })
                }
              >
                Salvar vínculo
              </Button>
            ) : null}
            {mode.kind === "register" ? (
              <Button
                type="button"
                disabled={busy || (!preview && !observedId)}
                onClick={() =>
                  void run({
                    action: "register",
                    identitySource: observedId
                      ? "observed"
                      : preview?.catalogValid
                        ? "config"
                        : "new",
                    existingProjectId: observedId || undefined,
                    repositoryPath: path || undefined,
                    configPath: configPath || null,
                    displayName: displayName || undefined,
                    signature: preview?.signature,
                  })
                }
              >
                Salvar cadastro
              </Button>
            ) : null}
          </>
        )}
      </DetailDrawerFooter>
      <AlertDialog open={Boolean(archiveId)} onOpenChange={(open) => !open && setArchiveId(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar este projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro sai da lista ativa. Tickets, logs e a CLI continuam
              intactos. Arquivar não cancela jobs em execução.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveId) {
                  void run({ action: "archive", projectId: archiveId }).then(() => {
                    if (scope?.kind === "project" && scope.projectId === archiveId) {
                      requestScopeChange({ kind: "project", projectId: archiveId })
                    }
                  })
                }
                setArchiveId(undefined)
              }}
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DetailDrawer>
  )
}

function ProjectRow({
  item,
  onEdit,
}: {
  item: ProjectSummary
  onEdit: () => void
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left"
      onClick={onEdit}
    >
      <span className="truncate font-medium">{item.displayName || item.id}</span>
      <span className="truncate text-xs text-muted-foreground">
        {item.repositoryPath || item.id} · {item.bindingState}
      </span>
    </button>
  )
}
