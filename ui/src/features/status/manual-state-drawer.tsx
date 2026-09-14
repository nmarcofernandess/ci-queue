import * as React from "react"

import { writeDashboardState } from "@/lib/api"
import type {
  DashboardMeta,
  DashboardNote,
  DashboardState,
  DashboardStateMutation,
} from "@/lib/types"
import { useIsMobile } from "@/hooks/use-mobile"
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/features/shared/format"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import { LoaderCircleIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"

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

function noteToForm(note: DashboardNote | undefined) {
  return { title: note?.title ?? "", text: note?.text ?? "" }
}

function MetaEditor({
  state,
  unavailable,
  saving,
  onMutate,
}: {
  state: DashboardState
  unavailable: boolean
  saving: boolean
  onMutate: (mutation: DashboardStateMutation) => void
}) {
  const [form, setForm] = React.useState<MetaForm>(() => metaToForm(state.meta))

  const togglePreset = (preset: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      presets: checked
        ? [...new Set([...current.presets, preset])]
        : current.presets.filter((item) => item !== preset),
    }))
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        onMutate({
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
                Use o SHA completo do commit que a meta acompanha.
              </FieldDescription>
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
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <legend className="text-sm font-medium">Presets acompanhados</legend>
        <FieldGroup>
          {state.presets.map((preset) => (
            <Field key={preset} orientation="horizontal">
              <Checkbox
                id={`preset-${preset}`}
                checked={form.presets.includes(preset)}
                disabled={unavailable || saving}
                onCheckedChange={(checked) =>
                  togglePreset(preset, checked === true)
                }
              />
              <FieldLabel htmlFor={`preset-${preset}`}>{preset}</FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={unavailable || saving}>
          {saving ? (
            <LoaderCircleIcon data-icon className="animate-spin" />
          ) : null}
          Salvar meta
        </Button>
        {state.meta ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={unavailable || saving}
              >
                Remover meta
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover a meta manual?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os registros de execução permanecem disponíveis.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    onMutate({
                      revision: state.revision,
                      action: "remove-meta",
                    })
                  }
                  variant="destructive"
                >
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </form>
  )
}

function NoteEditor({
  note,
  state,
  unavailable,
  saving,
  onMutate,
}: {
  note: DashboardNote | undefined
  state: DashboardState
  unavailable: boolean
  saving: boolean
  onMutate: (mutation: DashboardStateMutation) => void
}) {
  const [form, setForm] = React.useState(() => noteToForm(note))

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (note) {
          onMutate({
            revision: state.revision,
            action: "update-note",
            id: note.id,
            note: form,
          })
        } else {
          onMutate({
            revision: state.revision,
            action: "save-note",
            note: form,
          })
        }
      }}
    >
      <FieldSet>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="note-title">Título</FieldLabel>
            <FieldContent>
              <Input
                id="note-title"
                value={form.title}
                disabled={unavailable || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="note-text">Texto</FieldLabel>
            <FieldContent>
              <Textarea
                id="note-text"
                value={form.text}
                disabled={unavailable || saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    text: event.target.value,
                  }))
                }
              />
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={unavailable || saving}>
          {saving ? (
            <LoaderCircleIcon data-icon className="animate-spin" />
          ) : null}
          {note ? "Salvar nota" : "Adicionar nota"}
        </Button>
        {note ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={unavailable || saving}
              >
                <Trash2Icon data-icon />
                Remover nota
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover a nota manual?</AlertDialogTitle>
                <AlertDialogDescription>
                  A remoção afeta apenas esta informação do painel.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    onMutate({
                      revision: state.revision,
                      action: "remove-note",
                      id: note.id,
                    })
                  }
                  variant="destructive"
                >
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </form>
  )
}

function NotesEditor({
  state,
  unavailable,
  saving,
  onMutate,
}: {
  state: DashboardState
  unavailable: boolean
  saving: boolean
  onMutate: (mutation: DashboardStateMutation) => void
}) {
  const [selectedNoteId, setSelectedNoteId] = React.useState<string>()
  const [draftVersion, setDraftVersion] = React.useState(0)
  const selectedNote = state.notes.find((note) => note.id === selectedNoteId)

  return (
    <div className="flex flex-col gap-5">
      <Button
        type="button"
        variant="outline"
        disabled={unavailable || saving}
        onClick={() => {
          setSelectedNoteId(undefined)
          setDraftVersion((value) => value + 1)
        }}
      >
        <PlusIcon data-icon />
        Nova nota
      </Button>
      {state.notes.length ? (
        <ItemGroup>
          {state.notes.map((note) => (
            <Item key={note.id} variant="outline">
              <ItemContent>
                <ItemTitle>{note.title}</ItemTitle>
                <ItemDescription>
                  Atualizada em {formatDateTime(note.updatedAt)}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  Editar
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma nota manual registrada.
        </p>
      )}
      <NoteEditor
        key={`${state.revision}-${selectedNote?.id ?? "new"}-${draftVersion}`}
        note={selectedNote}
        state={state}
        unavailable={unavailable}
        saving={saving}
        onMutate={onMutate}
      />
    </div>
  )
}

export function ManualStateDrawer({
  state,
  initialTab = "meta",
  onClose,
  onSaved,
}: {
  state: DashboardState
  initialTab?: "meta" | "notes"
  onClose: () => void
  onSaved: () => void
}) {
  const isMobile = useIsMobile()
  const session = useDashboardSession()
  const [tab, setTab] = React.useState<"meta" | "notes">(initialTab)
  const [saving, setSaving] = React.useState(false)
  const [mutationError, setMutationError] = React.useState<string>()
  const unavailable = Boolean(session.error || !session.data)

  const mutate = async (mutation: DashboardStateMutation) => {
    if (!session.data?.csrfToken) {
      setMutationError("A sessão da bridge não está disponível para salvar.")
      return
    }

    setSaving(true)
    setMutationError(undefined)
    try {
      await writeDashboardState(session.data.csrfToken, mutation)
      onSaved()
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar no painel."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent>
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle>Meta e notas</DrawerTitle>
              <DrawerDescription>
                Informações manuais deste projeto na bridge local.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Fechar meta e notas"
              >
                <XIcon data-icon />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 py-5">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "meta" | "notes")}
          >
            <TabsList>
              <TabsTrigger value="meta">Meta</TabsTrigger>
              <TabsTrigger value="notes">Notas</TabsTrigger>
            </TabsList>
            <TabsContent value="meta" className="pt-5">
              <MetaEditor
                key={`meta-${state.revision}`}
                state={state}
                unavailable={unavailable}
                saving={saving}
                onMutate={(mutation) => void mutate(mutation)}
              />
            </TabsContent>
            <TabsContent value="notes" className="pt-5">
              <NotesEditor
                key={`notes-${state.revision}`}
                state={state}
                unavailable={unavailable}
                saving={saving}
                onMutate={(mutation) => void mutate(mutation)}
              />
            </TabsContent>
          </Tabs>
          {session.error ? (
            <p className="mt-4 text-sm text-destructive">
              {session.error.message}
            </p>
          ) : null}
          {mutationError ? (
            <p className="mt-4 text-sm text-destructive">{mutationError}</p>
          ) : null}
        </ScrollArea>
        <DrawerFooter className="border-t">
          <DrawerClose asChild>
            <Button type="button" variant="outline">
              Fechar
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
