import * as React from "react"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDotIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState } from "@/features/shared/async-state"
import { formatDateTime, shortSha } from "@/features/shared/format"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import { useIsMobile } from "@/hooks/use-mobile"
import { writeDashboardState } from "@/lib/api"
import type {
  DashboardMeta,
  DashboardPending,
  DashboardState,
  DashboardStateMutation,
  JobStatus,
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
  state,
  saving,
  unavailable,
  onSave,
  onCancel,
}: {
  state: DashboardState
  saving: boolean
  unavailable: boolean
  onSave: (mutation: DashboardStateMutation) => Promise<boolean>
  onCancel: () => void
}) {
  const [form, setForm] = React.useState<MetaForm>(() => metaToForm(state.meta))
  const [futurePreset, setFuturePreset] = React.useState("")
  const availablePresets = [...new Set([...state.presets, ...form.presets])]

  const togglePreset = (preset: string, selected: boolean) => {
    setForm((current) => ({
      ...current,
      presets: selected
        ? [...new Set([...current.presets, preset])]
        : current.presets.filter((item) => item !== preset),
    }))
  }

  const addFuturePreset = () => {
    const preset = futurePreset.trim()
    if (!PRESET_NAME.test(preset)) return
    togglePreset(preset, true)
    setFuturePreset("")
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave({
          revision: state.revision,
          action: "save-meta",
          meta: form,
        }).then((saved) => saved && onCancel())
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
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
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
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <legend className="text-sm font-medium">Requisitos</legend>
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
                    <PlusIcon data-icon />
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

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={
            unavailable ||
            saving ||
            !form.name.trim() ||
            form.presets.length === 0
          }
        >
          {saving ? (
            <LoaderCircleIcon data-icon className="animate-spin" />
          ) : null}
          Salvar meta
        </Button>
      </div>
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
          <Trash2Icon data-icon />
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
  onEdit,
  onOpenJob,
  saving,
  onMutate,
}: {
  state: DashboardState
  onEdit: () => void
  onOpenJob: (jobId: string) => void
  saving: boolean
  onMutate: (mutation: DashboardStateMutation) => Promise<boolean>
}) {
  const meta = state.meta
  if (!meta) {
    return (
      <EmptyState
        title="Nenhuma meta declarada"
        description="Declare um único objetivo e as receitas necessárias para chegar a main."
      >
        <Button type="button" onClick={onEdit}>
          <PlusIcon data-icon />
          Declarar meta
        </Button>
      </EmptyState>
    )
  }

  const passed = meta.checks.filter((check) => check.status === "passed").length
  const total = meta.checks.length
  const allPassedOnDifferentRevisions =
    total > 0 && passed === total && !meta.candidateSha

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{meta.name}</h3>
          {meta.description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {meta.description}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <PencilIcon data-icon />
          Editar
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {passed} de {total} requisitos atendidos
          </span>
          {meta.candidateSha ? (
            <span className="text-muted-foreground">
              Candidato{" "}
              <span className="font-mono">{shortSha(meta.candidateSha)}</span>
            </span>
          ) : null}
        </div>
        <Progress value={total ? (passed / total) * 100 : 0} />
        {allPassedOnDifferentRevisions ? (
          <p className="text-sm text-muted-foreground">
            Os verdes atuais ainda não provam uma única revisão comum.
          </p>
        ) : null}
      </div>
      <Separator />
      {meta.checks.length ? (
        <ItemGroup>
          {meta.checks.map((check) => (
            <Item key={check.preset} variant="outline" size="sm">
              <ItemMedia variant="icon">
                {check.status === "passed" ? (
                  <CheckCircle2Icon />
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
      <div className="flex justify-end">
        <RemoveMetaButton state={state} saving={saving} onMutate={onMutate} />
      </div>
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

function PendingItem({
  item,
  onOpenJob,
}: {
  item: DashboardPending
  onOpenJob: (jobId: string) => void
}) {
  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <CircleAlertIcon />
      </ItemMedia>
      <ItemContent>
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
      </ItemContent>
      <ItemActions>
        <Badge variant="outline">{statusLabel(item.latestStatus)}</Badge>
      </ItemActions>
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

export function StatusStateDrawer({
  state,
  surface,
  onClose,
  onSaved,
  onOpenJob,
}: {
  state: DashboardState
  surface: "meta" | "pending"
  onClose: () => void
  onSaved: () => void
  onOpenJob: (jobId: string) => void
}) {
  const isMobile = useIsMobile()
  const session = useDashboardSession()
  const [saving, setSaving] = React.useState(false)
  const [editingMeta, setEditingMeta] = React.useState(false)
  const unavailable = Boolean(session.error || !session.data)

  const mutate = async (mutation: DashboardStateMutation) => {
    if (!session.data?.csrfToken) {
      toast.error("A sessão da bridge não está disponível para salvar.")
      return false
    }
    setSaving(true)
    try {
      await writeDashboardState(session.data.csrfToken, mutation)
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
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent className="min-h-0 sm:max-w-xl">
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle>
                {surface === "meta" ? "Meta para main" : "Pendências"}
              </DrawerTitle>
              <DrawerDescription>
                {surface === "meta"
                  ? "Objetivo e verdes canônicos necessários."
                  : `${state.pending.length} ${state.pending.length === 1 ? "recomendação" : "recomendações"} ainda sem verde posterior.`}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Fechar"
              >
                <XIcon data-icon />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1 p-4">
          {surface === "meta" ? (
            editingMeta ? (
              <MetaEditor
                key={`meta-${state.revision}`}
                state={state}
                saving={saving}
                unavailable={unavailable}
                onSave={mutate}
                onCancel={() => setEditingMeta(false)}
              />
            ) : (
              <MetaRead
                state={state}
                onEdit={() => setEditingMeta(true)}
                onOpenJob={onOpenJob}
                saving={saving}
                onMutate={mutate}
              />
            )
          ) : (
            <PendingSurface state={state} onOpenJob={onOpenJob} />
          )}
        </ScrollArea>
        {surface === "meta" && session.error ? (
          <DrawerFooter className="shrink-0 border-t">
            <p className="text-sm text-destructive">{session.error.message}</p>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
