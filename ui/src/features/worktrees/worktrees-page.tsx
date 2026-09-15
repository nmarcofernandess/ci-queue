import { EntityIdentity } from "@/features/shared/entity-identity"
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
  EyeIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getDashboardState,
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
  const detail = {
    data: worktrees.data?.worktrees.find((item) => item.id === id),
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
      await revealWorktree(session.data.csrfToken, id)
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
            <Badge variant="outline">
              {detail.data.dirty === false ? (
                <CheckIcon data-icon="inline-start" />
              ) : null}
              {cleanlinessLabel(detail.data)}
            </Badge>
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
}: {
  worktrees: WorktreeRecord[]
  rowSelection: RowSelectionState
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  onOpen: (id: string) => void
  emptyDescription: string
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
              onOpen={() => onOpen(row.original.id)}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ver ${worktreeName(row.original.path)}`}
                  onClick={() => onOpen(row.original.id)}
                >
                  <EyeIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver worktree</TooltipContent>
            </Tooltip>
          ),
        }),
      ]),
    [onOpen]
  )

  const table = useTable({
    columns,
    data: worktrees,
    features: worktreeTableFeatures,
    getRowId: (row) => row.id,
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
  projectId,
  worktrees,
  session,
}: {
  projectId: string | undefined
  worktrees: ApiQuery<WorktreesResponse>
  session: ApiQuery<DashboardSession>
}) {
  const { rowSelection, setRowSelection } = usePersistentSelection(projectId)
  const searchKey = projectId
    ? `ci-queue:worktrees-search:${projectId}`
    : undefined
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
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(needle))
    )
  }, [allWorktrees, search])

  const selected = React.useMemo(
    () => allWorktrees.filter((worktree) => rowSelection[worktree.id]),
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
      {worktrees.data && !worktrees.data.error ? (
        <WorktreeDataTable
          worktrees={visible}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          onOpen={setOpenWorktreeId}
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
  const worktreeRequest = React.useCallback(() => getWorktrees(), [])
  const projectRequest = React.useCallback(() => getDashboardState(), [])
  const worktrees = useApiQuery("worktrees", worktreeRequest, {
    pollMs: 60_000,
  })
  const project = useApiQuery("worktree-project", projectRequest)
  const session = useDashboardSession()

  return (
    <WorktreeTable
      key={project.data?.projectId || "unresolved-project"}
      projectId={project.data?.projectId}
      worktrees={worktrees}
      session={session}
    />
  )
}
