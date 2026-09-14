import * as React from "react"
import {
  CheckCircle2Icon,
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
import { EmptyState } from "@/features/shared/async-state"
import { formatDateTime, shortSha } from "@/features/shared/format"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import { useIsMobile } from "@/hooks/use-mobile"
import { writeDashboardState } from "@/lib/api"
import type {
  DashboardMeta,
  DashboardNote,
  DashboardState,
  DashboardStateMutation,
} from "@/lib/types"

type MetaForm = {
  name: string
  description: string
  headSha: string
  presets: string[]
}

function metaToForm(meta: DashboardMeta | null): MetaForm {
  return meta
    ? {
        name: meta.name,
        description: meta.description,
        headSha: meta.headSha,
        presets: meta.presets,
      }
    : { name: "", description: "", headSha: "", presets: [] }
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
    if (!preset) return
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
          <Field>
            <FieldLabel htmlFor="meta-sha">SHA alvo</FieldLabel>
            <FieldContent>
              <Input
                id="meta-sha"
                value={form.headSha}
                spellCheck={false}
                disabled={unavailable || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    headSha: event.target.value,
                  }))
                }
              />
              <FieldDescription>
                Commit completo acompanhado pela meta.
              </FieldDescription>
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
                    disabled={!futurePreset.trim() || unavailable || saving}
                  >
                    <PlusIcon data-icon />
                    Adicionar
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
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
        <Button type="submit" disabled={unavailable || saving}>
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
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>
            {passed} de {total} requisitos atendidos
          </span>
          <span className="text-xs text-muted-foreground">
            Commit <span className="font-mono">{shortSha(meta.headSha)}</span>
          </span>
        </div>
        <Progress value={total ? (passed / total) * 100 : 0} />
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

function NoteForm({
  note,
  state,
  saving,
  unavailable,
  onSave,
  onCancel,
}: {
  note?: DashboardNote
  state: DashboardState
  saving: boolean
  unavailable: boolean
  onSave: (mutation: DashboardStateMutation) => Promise<boolean>
  onCancel: () => void
}) {
  const [title, setTitle] = React.useState(note?.title ?? "")
  const [text, setText] = React.useState(note?.text ?? "")
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        const mutation: DashboardStateMutation = note
          ? {
              revision: state.revision,
              action: "update-note",
              id: note.id,
              note: { title, text },
            }
          : {
              revision: state.revision,
              action: "save-note",
              note: { title, text },
            }
        void onSave(mutation).then((saved) => saved && onCancel())
      }}
    >
      <FieldSet>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="note-title">Título</FieldLabel>
            <FieldContent>
              <Input
                id="note-title"
                value={title}
                disabled={saving || unavailable}
                onChange={(event) => setTitle(event.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="note-text">Notas</FieldLabel>
            <FieldContent>
              <Textarea
                id="note-text"
                value={text}
                disabled={saving || unavailable}
                onChange={(event) => setText(event.target.value)}
              />
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || unavailable}>
          {saving ? (
            <LoaderCircleIcon data-icon className="animate-spin" />
          ) : null}
          Salvar
        </Button>
      </div>
    </form>
  )
}

function RemoveNoteButton({
  note,
  state,
  saving,
  onMutate,
  onRemoved,
}: {
  note: DashboardNote
  state: DashboardState
  saving: boolean
  onMutate: (mutation: DashboardStateMutation) => Promise<boolean>
  onRemoved: () => void
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
          <AlertDialogTitle>Remover esta pendência?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta nota manual será removida do painel.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              void onMutate({
                revision: state.revision,
                action: "remove-note",
                id: note.id,
              }).then((removed) => removed && onRemoved())
            }
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function NotesSurface({
  state,
  selectedId,
  onSelect,
  saving,
  unavailable,
  onMutate,
}: {
  state: DashboardState
  selectedId?: string
  onSelect: (noteId: string | undefined) => void
  saving: boolean
  unavailable: boolean
  onMutate: (mutation: DashboardStateMutation) => Promise<boolean>
}) {
  const [editing, setEditing] = React.useState<"new" | "selected" | null>(null)
  const selected = state.notes.find((note) => note.id === selectedId)

  if (editing) {
    return (
      <NoteForm
        key={`${editing}-${selected?.id || "new"}-${state.revision}`}
        note={editing === "selected" ? selected : undefined}
        state={state}
        saving={saving}
        unavailable={unavailable}
        onSave={onMutate}
        onCancel={() => setEditing(null)}
      />
    )
  }

  if (selected) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="font-medium">{selected.title}</h3>
          <p className="text-sm text-muted-foreground">
            Atualizada em {formatDateTime(selected.updatedAt)}
          </p>
        </div>
        <p className="text-sm whitespace-pre-wrap">
          {selected.text || "Sem notas."}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onSelect(undefined)}
          >
            Voltar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing("selected")}
          >
            <PencilIcon data-icon />
            Editar
          </Button>
          <RemoveNoteButton
            note={selected}
            state={state}
            saving={saving}
            onMutate={onMutate}
            onRemoved={() => onSelect(undefined)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing("new")}>
          <PlusIcon data-icon />
          Nova pendência
        </Button>
      </div>
      {state.notes.length ? (
        <ItemGroup>
          {state.notes.map((note) => (
            <Item key={note.id} variant="outline">
              <ItemContent>
                <ItemTitle>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => onSelect(note.id)}
                  >
                    {note.title}
                  </Button>
                </ItemTitle>
                <ItemDescription>{note.text || "Sem notas."}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(note.updatedAt)}
                </span>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <EmptyState
          title="Nenhuma pendência"
          description="Registre uma nota manual quando houver algo para acompanhar."
        >
          <Button type="button" onClick={() => setEditing("new")}>
            <PlusIcon data-icon />
            Nova pendência
          </Button>
        </EmptyState>
      )}
    </div>
  )
}

export function ManualStateDrawer({
  state,
  surface,
  initialNoteId,
  onClose,
  onSaved,
  onOpenJob,
}: {
  state: DashboardState
  surface: "meta" | "notes"
  initialNoteId?: string
  onClose: () => void
  onSaved: () => void
  onOpenJob: (jobId: string) => void
}) {
  const isMobile = useIsMobile()
  const session = useDashboardSession()
  const [saving, setSaving] = React.useState(false)
  const [editingMeta, setEditingMeta] = React.useState(false)
  const [activeNoteId, setActiveNoteId] = React.useState(initialNoteId)
  const unavailable = Boolean(session.error || !session.data)
  const activeNote = state.notes.find((note) => note.id === activeNoteId)

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
                {surface === "meta"
                  ? "Meta para main"
                  : activeNote?.title || "Pendências"}
              </DrawerTitle>
              <DrawerDescription>
                {surface === "meta"
                  ? "Objetivo e requisitos desta revisão."
                  : activeNote
                    ? "Pendência"
                    : `${state.notes.length} nota${state.notes.length === 1 ? "" : "s"} manual${state.notes.length === 1 ? "" : "is"}.`}
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
            <NotesSurface
              state={state}
              selectedId={activeNoteId}
              onSelect={setActiveNoteId}
              saving={saving}
              unavailable={unavailable}
              onMutate={mutate}
            />
          )}
        </ScrollArea>
        {session.error ? (
          <DrawerFooter className="shrink-0 border-t">
            <p className="text-sm text-destructive">{session.error.message}</p>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
