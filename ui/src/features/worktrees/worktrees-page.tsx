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
  FolderGit2Icon,
  FolderOpenIcon,
  InboxIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useIsMobile } from "@/hooks/use-mobile"
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
  if (worktree.size.state === "ready") return formatBytes(worktree.size.bytes)
  if (worktree.size.state === "measuring") return "Medindo…"
  return "Ao abrir"
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
          <CopyIcon data-icon />
          {label}
          <ChevronDownIcon data-icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onCopyPaths}>
            <CopyIcon data-icon />
            Copiar {plural ? "caminhos" : "caminho"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopyContext}>
            <CopyIcon data-icon />
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
  const isMobile = useIsMobile()
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
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent className="min-h-0 sm:w-[36rem] sm:max-w-[36rem]!">
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FolderGit2Icon className="size-4 shrink-0" />
                <DrawerTitle className="truncate">
                  {detail.data ? worktreeName(detail.data.path) : "Worktree"}
                </DrawerTitle>
                {detail.data ? (
                  <Badge variant="outline">
                    {detail.data.dirty === false ? (
                      <CheckIcon data-icon />
                    ) : null}
                    {cleanlinessLabel(detail.data)}
                  </Badge>
                ) : null}
              </div>
              <DrawerDescription className="truncate">
                {detail.data?.branch || "Carregando…"}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Fechar worktree"
              >
                <XIcon data-icon />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <ScrollArea className="min-h-0 flex-1 p-4">
          {detail.loading ? <Skeleton className="h-64 w-full" /> : null}
          {detail.error ? (
            <ErrorState
              title="Não foi possível carregar a worktree"
              error={detail.error}
              onRetry={detail.reload}
            />
          ) : null}
          {detail.data ? (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-36 text-muted-foreground">
                      Caminho
                    </TableCell>
                    <TableCell className="font-medium break-all whitespace-normal">
                      {detail.data.path}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">SHA</TableCell>
                    <TableCell className="font-mono text-xs break-all whitespace-normal">
                      {detail.data.headSha || "Indisponível"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Alterações
                    </TableCell>
                    <TableCell>
                      {detail.data.changedEntries ?? "Indisponível"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Em relação à base
                    </TableCell>
                    <TableCell>{baseLabel(detail.data)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">
                      Tamanho
                    </TableCell>
                    <TableCell>
                      {detail.data.size.state === "ready"
                        ? formatBytes(detail.data.size.bytes)
                        : detail.data.size.state === "measuring"
                          ? "Medindo…"
                          : detail.data.size.error ||
                            "Atualização automática pendente."}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : null}
        </ScrollArea>

        <DrawerFooter className="shrink-0 border-t">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              onClick={reveal}
              disabled={opening || !session.data?.canReveal}
            >
              <FolderOpenIcon data-icon />
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
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
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
            <Button
              type="button"
              variant="link"
              className="h-auto max-w-72 justify-start truncate p-0 font-medium"
              onClick={() => onOpen(row.original.id)}
            >
              {worktreeName(row.original.path)}
            </Button>
          ),
        }),
        worktreeColumnHelper.accessor("branch", {
          header: "Branch",
          cell: ({ getValue }) => (
            <span className="font-mono text-xs">{getValue()}</span>
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
              {row.original.dirty === false ? <CheckIcon data-icon /> : null}
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
                  <EyeIcon data-icon />
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
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={
                    header.column.id === "selection" ? "w-11" : undefined
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
                  <TableCell key={cell.id} className="h-12 align-middle">
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
      </Table>
    </div>
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
