import { EntityIdentity } from "@/features/shared/entity-identity"
import { InspectButton } from "@/features/shared/inspect-button"
import { DataTableFrame } from "@/features/shared/data-table-frame"
import * as React from "react"
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  type RowSelectionState,
  useTable,
} from "@tanstack/react-table"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FolderOpenIcon,
  InboxIcon,
  SearchIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DetailDrawer,
  DetailDrawerHeader,
  DetailDrawerBody,
  DetailDrawerFooter,
} from "@/features/shared/detail-drawer"
import { FactsTable } from "@/features/shared/facts-table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useProjectContext } from "@/features/projects/project-context"
import { scopeKey } from "@/features/projects/scope"
import {
  getWorktrees,
  revealWorktree,
  type ApiQuery,
  useApiQuery,
} from "@/lib/api"
import type {
  DashboardSession,
  WorktreeRecord,
  WorktreesResponse,
} from "@/lib/types"
import { ErrorState } from "@/features/shared/async-state"
import { formatBytes } from "@/features/shared/format"
import { ProjectChip } from "@/features/shared/project-chip"
import { projectChipFacts } from "@/features/shared/project-chip-model"
import { useDashboardSession } from "@/features/status/use-dashboard-session"

const worktreeTableFeatures = tableFeatures({ rowSelectionFeature })
const worktreeColumnHelper = createColumnHelper<
  typeof worktreeTableFeatures,
  WorktreeRecord
>()
const EMPTY_WORKTREES: WorktreeRecord[] = []

function worktreeName(path: string) {
  return path.split("/").filter(Boolean).at(-1) || path
}

function worktreeRowId(worktree: WorktreeRecord) {
  return worktree.projectId ? `${worktree.projectId}:${worktree.id}` : worktree.id
}

function selectionFromStorage(key: string | undefined): RowSelectionState {
  if (!key) return {}
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) || "{}")
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as RowSelectionState)
      : {}
  } catch {
    return {}
  }
}

function textFromStorage(key: string | undefined) {
  if (!key) return ""
  try {
    return window.sessionStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

function usePersistentSelection(projectId: string | undefined) {
  const key = projectId ? `ci-queue:worktrees:${projectId}` : undefined
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(
    () => selectionFromStorage(key)
  )

  React.useEffect(() => {
    if (key) window.localStorage.setItem(key, JSON.stringify(rowSelection))
  }, [key, rowSelection])

  return { rowSelection, setRowSelection }
}

function cleanlinessLabel(worktree: WorktreeRecord) {
  if (worktree.dirty === true) return "Suja"
  if (worktree.dirty === false) return "Limpa"
  return "Indisponível"
}

function baseLabel(worktree: WorktreeRecord) {
  return `${worktree.ahead ?? "?"} à frente · ${worktree.behind ?? "?"} atrás`
}

function sizeLabel(worktree: WorktreeRecord) {
  if (typeof worktree.size.bytes === "number")
    return formatBytes(worktree.size.bytes)
  if (worktree.size.state === "measuring") return "Medindo…"
  return worktree.size.error || "Atualização automática pendente."
}

function worktreeContext(worktree: WorktreeRecord) {
  return [
    `Worktree: ${worktreeName(worktree.path)}`,
    `Caminho: ${worktree.path}`,
    `Branch: ${worktree.branch}`,
    `SHA: ${worktree.headSha || "indisponível"}`,
    `Estado: ${cleanlinessLabel(worktree)}`,
    `Alterações: ${worktree.changedEntries ?? "indisponível"}`,
    `Em relação à base: ${baseLabel(worktree)}`,
    `Tamanho: ${sizeLabel(worktree)}`,
  ].join("\n")
}

async function copyText(value: string, byteLimit?: number) {
  if (byteLimit && new TextEncoder().encode(value).byteLength > byteLimit) {
    throw new Error("A seleção excede o limite de cópia da bridge.")
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error("A área de transferência não está disponível.")
  }
  await navigator.clipboard.writeText(value)
}

function CopyMenu({
  disabled,
  onCopyPaths,
  onCopyContext,
  label = "Copiar",
  plural = false,
}: {
  disabled?: boolean
  onCopyPaths: () => void
  onCopyContext: () => void
  label?: string
  plural?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <CopyIcon data-icon="inline-start" />
          {label}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onCopyPaths}>
            <CopyIcon data-icon="inline-start" />
            Copiar {plural ? "caminhos" : "caminho"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopyContext}>
            <CopyIcon data-icon="inline-start" />
            Copiar {plural ? "contextos" : "contexto"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WorktreeDrawer({
  id,
  worktrees,
  session,
  onClose,
}: {
  id: string
  worktrees: ApiQuery<WorktreesResponse>
  session: ApiQuery<DashboardSession>
  onClose: () => void
}) {
  const { scope } = useProjectContext()
  const detail = {
    data: worktrees.data?.worktrees.find(
      (item) => worktreeRowId(item) === id
    ),
    loading: worktrees.loading,
    error: worktrees.error,
    reload: worktrees.reload,
  }
  const [opening, setOpening] = React.useState(false)

  const copy = async (value: string, message: string) => {
    try {
      await copyText(value, session.data?.clipboardLimitBytes)
      toast.success(message)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Falha ao copiar.")
    }
  }

  const reveal = async () => {
    if (!session.data?.canReveal) {
      toast.error("A abertura nativa não está disponível nesta máquina.")
      return
    }
    setOpening(true)
    try {
      const ownerId = detail.data?.projectId
      const owner =
        ownerId
          ? { kind: "project" as const, projectId: ownerId }
          : scope?.kind === "project"
            ? scope
            : null
      if (!owner) {
        toast.error("Selecione um projeto para abrir a pasta.")
        return
      }
      await revealWorktree(
        owner,
        session.data.csrfToken,
        detail.data?.id ?? id
      )
      toast.success("Pasta aberta no sistema.")
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : "Não foi possível abrir a pasta."
      )
    } finally {
      setOpening(false)
    }
  }

  return (
    <DetailDrawer onClose={onClose}>
      <DetailDrawerHeader
        title={detail.data ? worktreeName(detail.data.path) : "Worktree"}
        description={detail.data?.branch || "Carregando…"}
        media={{ kind: "worktree" }}
        badge={
          detail.data ? (
            <>
              {detail.data.projectName ? (
                <ProjectChip
                  name={detail.data.projectName}
                  facts={projectChipFacts({
                    branch: detail.data.branch,
                    headSha: detail.data.headSha,
                  })}
                />
              ) : null}
              <Badge variant="outline">
                {detail.data.dirty === false ? (
                  <CheckIcon data-icon="inline-start" />
                ) : null}
                {cleanlinessLabel(detail.data)}
              </Badge>
            </>
          ) : undefined
        }
        closeLabel="Fechar worktree"
      />
      <DetailDrawerBody>
        {detail.loading ? <Skeleton className="h-64 w-full" /> : null}
        {detail.error ? (
          <ErrorState
            title="Não foi possível carregar a worktree"
            error={detail.error}
            onRetry={detail.reload}
          />
        ) : null}
        {detail.data ? (
          <FactsTable
            caption="Detalhes da worktree"
            rows={[
              {
                id: "path",
                label: "Caminho",
                value: detail.data.path,
                technical: true,
              },
              {
                id: "sha",
                label: "SHA",
                value: detail.data.headSha || "Indisponível",
                technical: true,
              },
              {
                id: "changes",
                label: "Alterações",
                value: detail.data.changedEntries ?? "Indisponível",
              },
              {
                id: "base",
                label: "Em relação à base",
                value: baseLabel(detail.data),
              },
              { id: "size", label: "Tamanho", value: sizeLabel(detail.data) },
            ]}
          />
        ) : null}
      </DetailDrawerBody>

      <DetailDrawerFooter>
        <Button
          type="button"
          variant="outline"
          onClick={reveal}
          disabled={opening || !session.data?.canReveal}
        >
          <FolderOpenIcon data-icon="inline-start" />
          Abrir pasta
        </Button>
        <CopyMenu
          disabled={!detail.data}
          onCopyPaths={() =>
            detail.data && void copy(detail.data.path, "Caminho copiado.")
          }
          onCopyContext={() =>
            detail.data &&
            void copy(worktreeContext(detail.data), "Contexto copiado.")
          }
        />
      </DetailDrawerFooter>
    </DetailDrawer>
  )
}

function WorktreeDataTable({
  worktrees,
  rowSelection,
  setRowSelection,
  onOpen,
  emptyDescription,
  showProjectChip = false,
}: {
  worktrees: WorktreeRecord[]
  rowSelection: RowSelectionState
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  onOpen: (id: string) => void
  emptyDescription: string
  showProjectChip?: boolean
}) {
  const columns = React.useMemo(
    () =>
      worktreeColumnHelper.columns([
        worktreeColumnHelper.display({
          id: "selection",
          header: ({ table }) => (
            <Checkbox
              aria-label="Selecionar worktrees visíveis"
              checked={
                table.getIsAllRowsSelected()
                  ? true
                  : table.getIsSomeRowsSelected()
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) =>
                table.toggleAllRowsSelected(checked === true, {
                  deselectAll: checked !== true,
                })
              }
              disabled={!table.getRowModel().rows.length}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Selecionar ${worktreeName(row.original.path)}`}
              checked={row.getIsSelected()}
              onCheckedChange={(checked) =>
                row.toggleSelected(checked === true)
              }
            />
          ),
        }),
        worktreeColumnHelper.accessor("path", {
          header: "Worktree",
          cell: ({ row }) => (
            <EntityIdentity
              presentation="table"
              title={worktreeName(row.original.path)}
              onOpen={() => onOpen(worktreeRowId(row.original))}
              badge={
                showProjectChip && row.original.projectName ? (
                  <ProjectChip
                    name={row.original.projectName}
                    facts={projectChipFacts({
                      branch: row.original.branch,
                      headSha: row.original.headSha,
                    })}
                  />
                ) : undefined
              }
            />
          ),
        }),
        worktreeColumnHelper.accessor("branch", {
          header: "Branch",
          cell: ({ getValue }) => (
            <span
              className="block truncate font-mono text-xs"
              title={getValue()}
            >
              {getValue()}
            </span>
          ),
        }),
        worktreeColumnHelper.display({
          id: "size",
          header: "Tamanho",
          cell: ({ row }) => (
            <span className="text-muted-foreground">
              {sizeLabel(row.original)}
            </span>
          ),
        }),
        worktreeColumnHelper.display({
          id: "state",
          header: "Estado",
          cell: ({ row }) => (
            <Badge variant="outline">
              {row.original.dirty === false ? <CheckIcon /> : null}
              {cleanlinessLabel(row.original)}
            </Badge>
          ),
        }),
        worktreeColumnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Ações</span>,
          cell: ({ row }) => (
            <InspectButton
              presentation="table"
              onClick={() => onOpen(worktreeRowId(row.original))}
            />
          ),
        }),
      ]),
    [onOpen, showProjectChip]
  )

  const table = useTable({
    columns,
    data: worktrees,
    features: worktreeTableFeatures,
    getRowId: (row) => worktreeRowId(row),
    enableMultiRowSelection: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  })

  return (
    <DataTableFrame placement="body" label="Worktrees">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className={
                  header.column.id === "selection"
                    ? "w-11"
                    : header.column.id === "actions"
                      ? "w-10"
                      : header.column.id === "path"
                        ? "w-44"
                        : header.column.id === "size" ||
                            header.column.id === "state"
                          ? "w-28"
                          : undefined
                }
              >
                {header.isPlaceholder ? null : (
                  <table.FlexRender header={header} />
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className="overflow-hidden">
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={table.getAllLeafColumns().length}
              className="p-0"
            >
              <Empty className="min-h-56 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon />
                  </EmptyMedia>
                  <EmptyTitle>Nenhuma worktree</EmptyTitle>
                  <EmptyDescription>{emptyDescription}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </DataTableFrame>
  )
}

function WorktreeTable({
  persistenceId,
  showProjectChip,
  worktrees,
  session,
}: {
  persistenceId: string
  showProjectChip: boolean
  worktrees: ApiQuery<WorktreesResponse>
  session: ApiQuery<DashboardSession>
}) {
  const { rowSelection, setRowSelection } = usePersistentSelection(persistenceId)
  const searchKey = `ci-queue:worktrees-search:${persistenceId}`
  const [search, setSearch] = React.useState(() => textFromStorage(searchKey))
  const [openWorktreeId, setOpenWorktreeId] = React.useState<string>()
  const allWorktrees = worktrees.data?.worktrees ?? EMPTY_WORKTREES

  React.useEffect(() => {
    if (searchKey) window.sessionStorage.setItem(searchKey, search)
  }, [search, searchKey])

  const visible = React.useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR")
    if (!needle) return allWorktrees
    return allWorktrees.filter((worktree) =>
      [
        worktreeName(worktree.path),
        worktree.path,
        worktree.branch,
        worktree.headSha || "",
        worktree.projectName || "",
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(needle))
    )
  }, [allWorktrees, search])

  const selected = React.useMemo(
    () => allWorktrees.filter((worktree) => rowSelection[worktreeRowId(worktree)]),
    [allWorktrees, rowSelection]
  )

  const copySelected = async (kind: "path" | "context") => {
    try {
      const value = selected
        .map((worktree) =>
          kind === "path" ? worktree.path : worktreeContext(worktree)
        )
        .join(kind === "path" ? "\n" : "\n\n")
      await copyText(value, session.data?.clipboardLimitBytes)
      toast.success(
        `${selected.length} worktree${selected.length === 1 ? "" : "s"} copiada${selected.length === 1 ? "" : "s"}.`
      )
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Falha ao copiar.")
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Worktrees</h1>
        {worktrees.data ? (
          <span className="text-sm text-muted-foreground">
            {allWorktrees.length}{" "}
            {allWorktrees.length === 1 ? "pasta" : "pastas"}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <InputGroup className="w-full sm:w-80">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar worktree, branch ou SHA"
          />
        </InputGroup>

        {selected.length ? (
          <ButtonGroup>
            <ButtonGroupText>
              {selected.length} selecionada{selected.length === 1 ? "" : "s"}
            </ButtonGroupText>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRowSelection({})}
            >
              Limpar
            </Button>
            <CopyMenu
              label="Copiar"
              plural
              onCopyPaths={() => void copySelected("path")}
              onCopyContext={() => void copySelected("context")}
            />
          </ButtonGroup>
        ) : null}
      </div>

      {worktrees.loading ? (
        <div className="overflow-hidden rounded-lg border">
          <Skeleton className="h-72 w-full rounded-none" />
        </div>
      ) : null}
      {worktrees.error ? (
        <ErrorState
          title="Não foi possível carregar as worktrees"
          error={worktrees.error}
          onRetry={worktrees.reload}
        />
      ) : null}
      {worktrees.data?.error ? (
        <ErrorState
          title="Inventário indisponível"
          error={new Error(worktrees.data.error)}
          onRetry={worktrees.reload}
        />
      ) : null}
      {worktrees.data?.projectErrors?.length ? (
        <div className="flex flex-col gap-1">
          {worktrees.data.projectErrors.map((item) => (
            <p key={item.projectId} className="text-sm text-destructive">
              {item.projectName || item.projectId}: {item.error}
            </p>
          ))}
        </div>
      ) : null}
      {worktrees.data && !worktrees.data.error ? (
        <WorktreeDataTable
          worktrees={visible}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          onOpen={setOpenWorktreeId}
          showProjectChip={showProjectChip}
          emptyDescription={
            allWorktrees.length
              ? "Nenhum item corresponde à busca."
              : "O projeto não possui worktrees observáveis."
          }
        />
      ) : null}

      {openWorktreeId ? (
        <WorktreeDrawer
          id={openWorktreeId}
          worktrees={worktrees}
          session={session}
          onClose={() => setOpenWorktreeId(undefined)}
        />
      ) : null}
    </main>
  )
}

export function WorktreesPage() {
  const { scope } = useProjectContext()
  const allowed =
    scope?.kind === "project" || scope?.kind === "all" ? scope : null
  const worktreeRequest = React.useCallback(
    (signal?: AbortSignal) =>
      allowed
        ? getWorktrees(allowed, signal)
        : Promise.reject(new Error("Selecione um projeto para ver worktrees.")),
    [allowed]
  )
  const worktrees = useApiQuery(
    `worktrees:${allowed ? scopeKey(allowed) : "none"}`,
    worktreeRequest,
    { pollMs: 60_000, enabled: Boolean(allowed) }
  )
  const session = useDashboardSession()

  if (!allowed) {
    return (
      <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
        <ErrorState
          title="Worktrees exigem um projeto"
          error={new Error("Cadastre ou selecione um projeto com pasta Git.")}
        />
      </main>
    )
  }

  return (
    <WorktreeTable
      key={scopeKey(allowed)}
      persistenceId={allowed.kind === "all" ? "all" : allowed.projectId}
      showProjectChip={allowed.kind === "all"}
      worktrees={worktrees}
      session={session}
    />
  )
}
