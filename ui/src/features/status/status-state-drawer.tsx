import * as React from "react"
import {
  ChevronDownIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDotIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DetailDrawer,
  DetailDrawerHeader,
  DetailDrawerBody,
  DetailDrawerFooter,
} from "@/features/shared/detail-drawer"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState } from "@/features/shared/async-state"
import { formatDateTime, shortSha } from "@/features/shared/format"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import { restoreScopedDraft } from "@/features/projects/drafts"
import { useProjectContext } from "@/features/projects/project-context"
import { ProjectSelectionPanel } from "@/features/projects/project-selection-panel"
import { ProjectChip } from "@/features/shared/project-chip"
import { pendingPreviewRows } from "@/features/status/status-state-model"
import { writeDashboardState } from "@/lib/api"
import type {
  DashboardAllState,
  DashboardMeta,
  DashboardPending,
  DashboardState,
  DashboardStateMutation,
  JobStatus,
  ProjectTarget,
} from "@/lib/types"

type MetaForm = {
  name: string
  description: string
  presets: string[]
}

const PRESET_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

function metaToForm(meta: DashboardMeta | null): MetaForm {
  return meta
    ? {
        name: meta.name,
        description: meta.description,
        presets: meta.presets,
      }
    : { name: "", description: "", presets: [] }
}

function MetaEditor({
  formId,
  state,
  saving,
  unavailable,
  onSave,
  onValidityChange,
}: {
  formId: string
  state: DashboardState
  saving: boolean
  unavailable: boolean
  onSave: (mutation: DashboardStateMutation) => Promise<boolean>
  onValidityChange: (valid: boolean) => void
}) {
  const { saveDraft, takeDraft } = useProjectContext()
  const [form, setForm] = React.useState<MetaForm>(
    () =>
      restoreScopedDraft<MetaForm>(
        takeDraft(state.projectId),
        state.revision
      ) ?? metaToForm(state.meta)
  )
  const [futurePreset, setFuturePreset] = React.useState("")
  const availablePresets = [...new Set([...state.presets, ...form.presets])]
  const commitForm = (next: MetaForm) => {
    setForm(next)
    saveDraft(state.projectId, { revision: state.revision, value: next })
  }

  const togglePreset = (preset: string, selected: boolean) => {
    commitForm({
      ...form,
      presets: selected
        ? [...new Set([...form.presets, preset])]
        : form.presets.filter((item) => item !== preset),
    })
  }

  const addFuturePreset = () => {
    const preset = futurePreset.trim()
    if (!PRESET_NAME.test(preset)) return
    togglePreset(preset, true)
    setFuturePreset("")
  }

  const valid = Boolean(form.name.trim() && form.presets.length)

  React.useEffect(() => {
    onValidityChange(valid)
  }, [onValidityChange, valid])

  return (
    <form
      id={formId}
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave({
          revision: state.revision,
          action: "save-meta",
          meta: form,
        })
      }}
    >
      <FieldSet>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="meta-name">Nome</FieldLabel>
            <FieldContent>
              <Input
                id="meta-name"
                value={form.name}
                maxLength={160}
                disabled={unavailable || saving}
                onChange={(event) =>
                  commitForm({
                    ...form,
                    name: event.target.value,
                  })
                }
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="meta-description">Descrição</FieldLabel>
            <FieldContent>
              <Textarea
                id="meta-description"
                value={form.description}
                maxLength={10_000}
                disabled={unavailable || saving}
                onChange={(event) =>
                  commitForm({
                    ...form,
                    description: event.target.value,
                  })
                }
              />
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Requisitos</FieldLegend>
        <FieldGroup>
          {availablePresets.map((preset) => (
            <Field key={preset} orientation="horizontal">
              <Checkbox
                id={`meta-preset-${preset}`}
                checked={form.presets.includes(preset)}
                disabled={unavailable || saving}
                onCheckedChange={(checked) =>
                  togglePreset(preset, checked === true)
                }
              />
              <FieldLabel htmlFor={`meta-preset-${preset}`}>
                {preset}
              </FieldLabel>
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="future-preset">Receita futura</FieldLabel>
            <FieldContent>
              <InputGroup>
                <InputGroupInput
                  id="future-preset"
                  value={futurePreset}
                  placeholder="Nome do preset ainda não declarado"
                  pattern="[a-z0-9][a-z0-9-]{0,63}"
                  maxLength={64}
                  disabled={unavailable || saving}
                  onChange={(event) => setFuturePreset(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addFuturePreset()
                    }
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={addFuturePreset}
                    disabled={
                      !PRESET_NAME.test(futurePreset.trim()) ||
                      unavailable ||
                      saving
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    Adicionar
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Use letras minúsculas, números e hífens.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}

function RemoveMetaButton({
  state,
  saving,
  onMutate,
}: {
  state: DashboardState
  saving: boolean
  onMutate: (mutation: DashboardStateMutation) => Promise<boolean>
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={saving}>
          <Trash2Icon data-icon="inline-start" />
          Remover
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover a meta?</AlertDialogTitle>
          <AlertDialogDescription>
            As execuções e seus verdes permanecem no histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              void onMutate({ revision: state.revision, action: "remove-meta" })
            }
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function MetaRead({
  state,
  onOpenJob,
}: {
  state: DashboardState
  onOpenJob: (jobId: string) => void
}) {
  const meta = state.meta
  if (!meta) {
    return (
      <EmptyState
        title="Nenhuma meta declarada"
        description="Declare um único objetivo e as receitas necessárias para chegar a main."
      />
    )
  }

  const total = meta.checks?.length ?? null
  const passed =
    meta.checks?.filter((check) => check.status === "passed").length ?? null
  const allPassedOnDifferentRevisions =
    total !== null &&
    passed !== null &&
    total > 0 &&
    passed === total &&
    !meta.candidateSha

  return (
    <div className="flex flex-col gap-5">
      {meta.description ? (
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      ) : null}
      {meta.candidateSha ? (
        <p className="text-sm text-muted-foreground">
          Candidato{" "}
          <span className="font-mono">{shortSha(meta.candidateSha)}</span>
        </p>
      ) : null}
      {allPassedOnDifferentRevisions ? (
        <p className="text-sm text-muted-foreground">
          Os verdes atuais ainda não provam uma única revisão comum.
        </p>
      ) : null}
      {meta.checks === null ? (
        <p className="text-sm text-muted-foreground">
          Checks indisponíveis: não há catálogo utilizável para calcular o
          progresso.
        </p>
      ) : null}
      {meta.description ||
      meta.candidateSha ||
      allPassedOnDifferentRevisions ||
      meta.checks === null ? (
        <Separator />
      ) : null}
      {meta.checks === null ? null : meta.checks.length ? (
        <ItemGroup>
          {meta.checks.map((check) => (
            <Item key={check.preset} variant="outline" size="sm">
              <ItemMedia variant="icon">
                {check.status === "passed" ? (
                  <CheckCircle2Icon className="text-success" />
                ) : (
                  <CircleDotIcon />
                )}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {check.status === "passed" && check.ticketId ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => onOpenJob(check.ticketId!)}
                    >
                      {check.preset}
                    </Button>
                  ) : (
                    check.preset
                  )}
                </ItemTitle>
                {check.status === "passed" ? (
                  <ItemDescription>
                    {check.finishedAt
                      ? formatDateTime(check.finishedAt)
                      : "Data indisponível"}
                    {check.headSha ? ` · ${shortSha(check.headSha)}` : ""}
                  </ItemDescription>
                ) : null}
              </ItemContent>
              <ItemActions>
                <Badge variant="outline">
                  {check.status === "passed"
                    ? "Verde elegível"
                    : check.status === "recipe-missing"
                      ? "Receita não declarada"
                      : "Sem verde elegível"}
                </Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum requisito definido.
        </p>
      )}
    </div>
  )
}

function statusLabel(status: JobStatus | null) {
  if (status === "passed") return "Última tentativa passou"
  if (status === "failed") return "Última tentativa falhou"
  if (status === "cancelled") return "Última tentativa cancelada"
  if (status === "interrupted") return "Última tentativa interrompida"
  if (status === "running") return "Em execução"
  if (status === "queued") return "Na fila"
  return "Sem tentativa posterior"
}

function DrawerProjectIdentity({ name }: { name: string }) {
  return (
    <ScrollArea className="w-full max-w-full min-w-0">
      <div className="w-max pb-3" tabIndex={0}>
        <ProjectChip mode="inline" name={name} />
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function PendingItem({
  item,
  projectName,
  onOpenJob,
}: {
  item: DashboardPending
  projectName?: string
  onOpenJob: (jobId: string) => void
}) {
  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <CircleAlertIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        {projectName ? <DrawerProjectIdentity name={projectName} /> : null}
        <ItemTitle>
          {item.latestTicketId ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={() => onOpenJob(item.latestTicketId!)}
            >
              {item.preset}
            </Button>
          ) : (
            item.preset
          )}
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {item.reason}
          <br />
          {item.pr ? `PR #${item.pr} · ` : ""}
          <span className="font-mono">{shortSha(item.headSha)}</span>
          {` · ${formatDateTime(item.createdAt)}`}
        </ItemDescription>
        <ItemActions>
          <Badge variant="outline">{statusLabel(item.latestStatus)}</Badge>
        </ItemActions>
      </ItemContent>
    </Item>
  )
}

function PendingSurface({
  state,
  onOpenJob,
}: {
  state: DashboardState
  onOpenJob: (jobId: string) => void
}) {
  if (state.pendingError) {
    return (
      <ErrorState
        title="Não foi possível ler as pendências"
        error={new Error(state.pendingError)}
      />
    )
  }
  if (!state.pending.length) {
    return (
      <EmptyState
        title="Nenhuma pendência"
        description="Não há recomendação de validação ainda sem um verde posterior."
      />
    )
  }
  return (
    <ItemGroup>
      {state.pending.map((item) => (
        <PendingItem key={item.id} item={item} onOpenJob={onOpenJob} />
      ))}
    </ItemGroup>
  )
}

function ProjectStateDrawer({
  state,
  surface,
  onClose,
  onSaved,
  onOpenJob,
  selection,
}: {
  selection?: React.ReactNode
  state: DashboardState
  surface: "meta" | "pending"
  onClose: () => void
  onSaved: () => void
  onOpenJob: (jobId: string) => void
}) {
  const session = useDashboardSession()
  const project = { kind: "project" as const, projectId: state.projectId }
  const [saving, setSaving] = React.useState(false)
  const [editingMeta, setEditingMeta] = React.useState(false)
  const [metaFormValid, setMetaFormValid] = React.useState(false)
  const unavailable = Boolean(session.error || !session.data || !state.projectId)
  const metaPassed =
    state.meta?.checks?.filter((check) => check.status === "passed").length ??
    null
  const metaTotal = state.meta?.checks?.length ?? null
  const metaFormId = "dashboard-meta-form"

  const startMetaEdit = () => {
    setMetaFormValid(false)
    setEditingMeta(true)
  }

  const mutate = async (mutation: DashboardStateMutation) => {
    if (!session.data?.csrfToken || !state.projectId) {
      toast.error("A sessão da bridge não está disponível para salvar.")
      return false
    }
    const target = project
    const token = session.data.csrfToken
    setSaving(true)
    try {
      await writeDashboardState(target, token, mutation)
      setEditingMeta(false)
      onSaved()
      toast.success("Painel atualizado.")
      return true
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar no painel."
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailDrawer onClose={onClose}>
      <DetailDrawerHeader
        title={surface === "meta" ? state.meta?.name || "Metas" : "Pendências"}
        description={
          surface === "meta"
            ? state.meta
              ? metaTotal === null || metaPassed === null
                ? "Checks indisponíveis: não há catálogo utilizável para calcular o progresso."
                : `${metaPassed} de ${metaTotal} requisitos atendidos`
              : "Objetivo e verdes canônicos necessários."
            : `${state.pending.length} ${state.pending.length === 1 ? "recomendação" : "recomendações"} ainda sem verde posterior.`
        }
        closeLabel="Fechar"
      >
        {selection}
        {surface === "meta" &&
        state.meta &&
        metaTotal !== null &&
        metaPassed !== null ? (
          <Progress
            value={metaTotal > 0 ? (metaPassed / metaTotal) * 100 : 0}
            aria-label={`${metaPassed} de ${metaTotal} requisitos atendidos`}
          />
        ) : null}
      </DetailDrawerHeader>
      <DetailDrawerBody>
        {surface === "meta" ? (
          editingMeta ? (
            <MetaEditor
              key={`meta-${state.projectId}-${state.revision}`}
              formId={metaFormId}
              state={state}
              saving={saving}
              unavailable={unavailable}
              onSave={mutate}
              onValidityChange={setMetaFormValid}
            />
          ) : (
            <MetaRead state={state} onOpenJob={onOpenJob} />
          )
        ) : (
          <PendingSurface state={state} onOpenJob={onOpenJob} />
        )}
      </DetailDrawerBody>
      {surface === "meta" ? (
        <DetailDrawerFooter>
          {session.error ? (
            <p className="mr-auto text-sm text-destructive">
              {session.error.message}
            </p>
          ) : null}
          {editingMeta ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingMeta(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                key="save-meta"
                type="submit"
                form={metaFormId}
                disabled={unavailable || saving || !metaFormValid}
              >
                {saving ? (
                  <LoaderCircleIcon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : null}
                Salvar meta
              </Button>
            </>
          ) : state.meta ? (
            <>
              <RemoveMetaButton
                state={state}
                saving={saving || unavailable}
                onMutate={mutate}
              />
              <Button
                key="edit-meta"
                type="button"
                variant="outline"
                onClick={startMetaEdit}
                disabled={unavailable}
              >
                <PencilIcon data-icon="inline-start" />
                Editar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={startMetaEdit}
              disabled={unavailable}
            >
              <PlusIcon data-icon="inline-start" />
              Declarar meta
            </Button>
          )}
        </DetailDrawerFooter>
      ) : null}
    </DetailDrawer>
  )
}

export function StatusStateDrawer({
  state,
  surface,
  onClose,
  onSaved,
  onOpenJob,
}: {
  state: DashboardState | DashboardAllState
  surface: "meta" | "pending"
  onClose: () => void
  onSaved: () => void
  onOpenJob: (jobId: string) => void
}) {
  const { projects } = useProjectContext()
  const [target, setTarget] = React.useState<ProjectTarget>({ kind: "all" })
  const [selectionOpen, setSelectionOpen] = React.useState(false)
  if (!("projects" in state)) {
    return (
      <ProjectStateDrawer
        state={state}
        surface={surface}
        onClose={onClose}
        onSaved={onSaved}
        onOpenJob={onOpenJob}
      />
    )
  }
  const selected =
    target.kind === "project"
      ? state.projects.find((project) => project.projectId === target.projectId)
      : undefined
  const label =
    target.kind === "all"
      ? "Todos os projetos"
      : selected?.projectName || "Projeto indisponível"
  const selection = (
    <ProjectSelectionPanel
      open={selectionOpen}
      onOpenChange={setSelectionOpen}
      projects={projects.filter((project) =>
        state.projects.some((item) => item.projectId === project.id)
      )}
      target={target}
      onSelect={(next) => {
        setTarget(next)
        setSelectionOpen(false)
      }}
      label="Alvo do drawer"
      trigger={
        <Button
          type="button"
          variant="outline"
          className="max-w-full min-w-0"
          title={label}
        >
          <span className="truncate">{label}</span>
          <ChevronDownIcon />
        </Button>
      }
    />
  )
  if (selected) {
    const projectState: DashboardState = {
      ...selected,
      context: { kind: "project", projectId: selected.projectId },
    }
    return (
      <ProjectStateDrawer
        key={selected.projectId}
        state={projectState}
        surface={surface}
        onClose={onClose}
        onSaved={onSaved}
        onOpenJob={onOpenJob}
        selection={selection}
      />
    )
  }
  const pending = pendingPreviewRows(state, Infinity)
  return (
    <DetailDrawer onClose={onClose}>
      <DetailDrawerHeader
        title={surface === "meta" ? "Metas" : "Pendências"}
        description="Todos os projetos ativos."
        closeLabel="Fechar"
      >
        {selection}
      </DetailDrawerHeader>
      <DetailDrawerBody>
        {target.kind === "project" ? (
          <ErrorState
            title="Projeto indisponível"
            error={
              new Error(
                "O projeto não está mais disponível nesta leitura. Escolha outro alvo."
              )
            }
          />
        ) : (
          <>
            {state.projectErrors.map((error) => (
              <ErrorState
                key={error.projectId}
                title={error.projectName}
                error={new Error(error.error)}
              />
            ))}
            {surface === "meta" ? (
              <ItemGroup>
                {[...state.projects]
                  .sort(
                    (a, b) =>
                      a.projectName.localeCompare(b.projectName, "pt-BR") ||
                      a.projectId.localeCompare(b.projectId)
                  )
                  .map((project) => (
                    <Item key={project.projectId} variant="outline">
                      <ItemContent className="min-w-0">
                        <DrawerProjectIdentity name={project.projectName} />
                        {project.meta ? (
                          <ItemTitle>{project.meta.name}</ItemTitle>
                        ) : null}
                        <MetaRead
                          state={{
                            ...project,
                            context: {
                              kind: "project",
                              projectId: project.projectId,
                            },
                          }}
                          onOpenJob={onOpenJob}
                        />
                      </ItemContent>
                    </Item>
                  ))}
              </ItemGroup>
            ) : (
              <>
                {state.projects
                  .filter((project) => project.pendingError)
                  .map((project) => (
                    <ErrorState
                      key={project.projectId}
                      title={project.projectName}
                      error={new Error(project.pendingError!)}
                    />
                  ))}
                {pending.length ? (
                  <ItemGroup>
                    {pending.map((row) => (
                      <PendingItem
                        key={`${row.projectId}:${row.item.id}`}
                        item={row.item}
                        projectName={row.projectName}
                        onOpenJob={onOpenJob}
                      />
                    ))}
                  </ItemGroup>
                ) : !state.projectErrors.length &&
                  !state.projects.some((project) => project.pendingError) ? (
                  <EmptyState
                    title="Nenhuma pendência"
                    description="Não há recomendação de validação ainda sem um verde posterior."
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </DetailDrawerBody>
    </DetailDrawer>
  )
}
