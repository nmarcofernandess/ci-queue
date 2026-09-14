import * as React from "react"
import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  type RowSelectionState,
  useTable,
} from "@tanstack/react-table"

import {
  getDashboardState,
  getWorktreeView,
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
import { useIsMobile } from "@/hooks/use-mobile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { ErrorState } from "@/features/shared/async-state"
import { formatBytes, shortSha } from "@/features/shared/format"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import {
  ChevronDownIcon,
  CopyIcon,
  FolderOpenIcon,
  InboxIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

type CleanlinessFilter = "all" | "clean" | "dirty"

const worktreeTableFeatures = tableFeatures({ rowSelectionFeature })
const worktreeColumnHelper = createColumnHelper<
  typeof worktreeTableFeatures,
  WorktreeRecord
>()
const EMPTY_WORKTREES: WorktreeRecord[] = []

function selectionFromStorage(key: string | undefined): RowSelectionState {
  if (!key) {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(key)
    const values: unknown = raw ? JSON.parse(raw) : {}
    if (Array.isArray(values)) {
      return Object.fromEntries(
        values
          .filter((value): value is string => typeof value === "string")
          .map((id) => [id, true])
      )
    }
    if (!values || typeof values !== "object") {
      return {}
    }
    return Object.fromEntries(
      Object.entries(values).filter(([, selected]) => selected === true)
    ) as RowSelectionState
  } catch {
    return {}
  }
}

function usePersistentSelection(projectId: string | undefined) {
  const key = projectId ? `ci-queue:worktrees:${projectId}` : undefined
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(
    () => selectionFromStorage(key)
  )

  React.useEffect(() => {
    if (!key) {
      return
    }
    window.localStorage.setItem(key, JSON.stringify(rowSelection))
  }, [key, rowSelection])

  return { rowSelection, setRowSelection }
}

function clipboardError(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "Não foi possível copiar para a área de transferência."
}

async function copyText(value: string, limit: number | undefined) {
  if (
    limit !== undefined &&
    new TextEncoder().encode(value).byteLength > limit
  ) {
    throw new Error(
      "O conteúdo selecionado excede o limite de cópia da bridge."
    )
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error(
      "A área de transferência não está disponível neste navegador."
    )
  }
  await navigator.clipboard.writeText(value)
}

function cleanlinessLabel(worktree: WorktreeRecord) {
  if (worktree.dirty === true) {
    return "Suja"
  }
  if (worktree.dirty === false) {
    return "Limpa"
  }
  return "Indisponível"
}

function worktreeContext(worktree: WorktreeRecord) {
  return [
    `Branch: ${worktree.branch}`,
    `Caminho: ${worktree.path}`,
    `HEAD: ${worktree.headSha || "indisponível"}`,
    `Estado: ${cleanlinessLabel(worktree)}`,
    `Base: ${worktree.ahead ?? "?"} à frente · ${worktree.behind ?? "?"} atrás`,
  ].join("\n")
}

function WorktreeDrawer({
  id,
  session,
  onClose,
}: {
  id: string
  session: ApiQuery<DashboardSession>
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const request = React.useCallback(() => getWorktreeView(id), [id])
  const detail = useApiQuery(`worktree:${id}`, request)
  const [opening, setOpening] = React.useState(false)
  const [notice, setNotice] = React.useState<string>()
  const [actionError, setActionError] = React.useState<string>()

  React.useEffect(() => {
    if (detail.data?.size.state !== "measuring") {
      return
    }
    const timer = window.setTimeout(detail.reload, 1_500)
    return () => window.clearTimeout(timer)
  }, [detail.data?.size.state, detail.reload])

  const copy = async (value: string, success: string) => {
    setActionError(undefined)
    try {
      await copyText(value, session.data?.clipboardLimitBytes)
      setNotice(success)
    } catch (reason) {
      setActionError(clipboardError(reason))
    }
  }

  const reveal = async () => {
    if (!session.data?.canReveal) {
      setActionError(
        session.error?.message ||
          "A abertura nativa não está disponível nesta máquina."
      )
      return
    }
    setOpening(true)
    setActionError(undefined)
    try {
      await revealWorktree(session.data.csrfToken, id)
      setNotice("Worktree aberta no sistema.")
    } catch (reason) {
      setActionError(clipboardError(reason))
    } finally {
      setOpening(false)
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
      <DrawerContent className="min-h-0">
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <DrawerTitle>{detail.data?.branch || "Worktree"}</DrawerTitle>
                {detail.data ? (
                  <Badge variant="outline">
                    {cleanlinessLabel(detail.data)}
                  </Badge>
                ) : null}
              </div>
              <DrawerDescription>
                {detail.data?.path || "Carregando detalhes da worktree…"}
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
        <ScrollArea className="min-h-0 flex-1 px-4 py-5">
          {detail.loading ? <Skeleton className="h-56 w-full" /> : null}
          {detail.error ? (
            <ErrorState
              title="Não foi possível carregar a worktree"
              error={detail.error}
              onRetry={detail.reload}
            />
          ) : null}
          {detail.data ? (
            <ItemGroup>
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>Estado</ItemTitle>
                  <ItemDescription>
                    {detail.data.dirty === true
                      ? `Suja · ${detail.data.changedEntries ?? "Algumas"} alteração(ões)`
                      : detail.data.dirty === false
                        ? "Limpa"
                        : "Estado do Git indisponível"}
                  </ItemDescription>
                </ItemContent>
              </Item>
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>Base</ItemTitle>
                  <ItemDescription>
                    {shortSha(detail.data.headSha)} · {detail.data.ahead ?? "?"}{" "}
                    à frente · {detail.data.behind ?? "?"} atrás
                  </ItemDescription>
                </ItemContent>
              </Item>
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>Tamanho</ItemTitle>
                  <ItemDescription>
                    {detail.data.size.state === "ready"
                      ? formatBytes(detail.data.size.bytes)
                      : detail.data.size.state === "measuring"
                        ? "Medindo a worktree…"
                        : detail.data.size.error ||
                          "A medição começa ao abrir este painel."}
                  </ItemDescription>
                </ItemContent>
              </Item>
            </ItemGroup>
          ) : null}
        </ScrollArea>
        <DrawerFooter className="shrink-0 border-t">
          {notice ? (
            <p className="text-sm text-muted-foreground" role="status">
              {notice}
            </p>
          ) : null}
          {actionError ? (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={opening || !session.data?.canReveal}
              onClick={reveal}
            >
              <FolderOpenIcon data-icon />
              Abrir
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" disabled={!detail.data}>
                  Mais
                  <ChevronDownIcon data-icon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (detail.data)
                        void copy(detail.data.path, "Caminho copiado.")
                    }}
                  >
                    <CopyIcon data-icon />
                    Copiar caminho
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (detail.data)
                        void copy(
                          worktreeContext(detail.data),
                          "Contexto copiado."
                        )
                    }}
                  >
                    <CopyIcon data-icon />
                    Copiar contexto
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                Fechar
              </Button>
            </DrawerClose>
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
  emptyMessage,
}: {
  worktrees: WorktreeRecord[]
  rowSelection: RowSelectionState
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  onOpen: (id: string) => void
  emptyMessage?: string
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
              aria-label={`Selecionar ${row.original.branch}`}
              checked={row.getIsSelected()}
              onCheckedChange={(checked) =>
                row.toggleSelected(checked === true)
              }
            />
          ),
        }),
        worktreeColumnHelper.accessor("branch", {
          header: "Worktree",
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="link"
                className="h-auto justify-start px-0 py-0"
                onClick={() => onOpen(row.original.id)}
              >
                {row.original.branch}
              </Button>
              <span className="max-w-100 truncate text-xs text-muted-foreground">
                {row.original.path}
              </span>
            </div>
          ),
        }),
        worktreeColumnHelper.display({
          id: "state",
          header: "Estado",
          cell: ({ row }) => (
            <span className="text-muted-foreground">
              {cleanlinessLabel(row.original)}
              {row.original.locked ? " · bloqueada" : ""}
            </span>
          ),
        }),
        worktreeColumnHelper.display({
          id: "base",
          header: "Base",
          cell: ({ row }) => (
            <div className="grid gap-1 text-muted-foreground">
              <span className="font-mono text-xs">
                {shortSha(row.original.headSha)}
              </span>
              <span>
                {row.original.ahead ?? "?"} à frente ·{" "}
                {row.original.behind ?? "?"} atrás
              </span>
            </div>
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
    <Table>
      <TableHeader>
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
                <TableCell key={cell.id} className="align-top">
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
              <Empty className="min-h-44 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon />
                  </EmptyMedia>
                  <EmptyTitle>Nenhuma worktree encontrada</EmptyTitle>
                  <EmptyDescription>
                    {emptyMessage || "Nenhuma worktree observável."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
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
  const [search, setSearch] = React.useState("")
  const [cleanliness, setCleanliness] = React.useState<CleanlinessFilter>("all")
  const [openWorktreeId, setOpenWorktreeId] = React.useState<string>()
  const [copyError, setCopyError] = React.useState<string>()
  const [copyNotice, setCopyNotice] = React.useState<string>()

  const visible = React.useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR")
    return (worktrees.data?.worktrees ?? EMPTY_WORKTREES).filter((worktree) => {
      const matchesSearch =
        !needle ||
        [worktree.branch, worktree.path, worktree.headSha ?? ""].some((value) =>
          value.toLocaleLowerCase("pt-BR").includes(needle)
        )
      const matchesCleanliness =
        cleanliness === "all" ||
        (cleanliness === "clean" && worktree.dirty === false) ||
        (cleanliness === "dirty" && worktree.dirty === true)
      return matchesSearch && matchesCleanliness
    })
  }, [cleanliness, search, worktrees.data?.worktrees])
  const selectedWorktrees = React.useMemo(
    () =>
      (worktrees.data?.worktrees ?? EMPTY_WORKTREES).filter(
        (worktree) => rowSelection[worktree.id]
      ),
    [rowSelection, worktrees.data?.worktrees]
  )

  const copySelected = async (value: "paths" | "context") => {
    setCopyError(undefined)
    try {
      await copyText(
        selectedWorktrees
          .map((worktree) =>
            value === "paths" ? worktree.path : worktreeContext(worktree)
          )
          .join("\n\n"),
        session.data?.clipboardLimitBytes
      )
      setCopyNotice(
        value === "paths"
          ? `${selectedWorktrees.length} caminho(s) copiado(s).`
          : `${selectedWorktrees.length} contexto(s) copiado(s).`
      )
    } catch (reason) {
      setCopyError(clipboardError(reason))
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-medium">Worktrees</h1>
        <p className="text-sm text-muted-foreground">
          Inventário somente leitura da configuração do projeto.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-80">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar branch, caminho ou SHA"
          />
        </InputGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={cleanliness}
          onValueChange={(value) => {
            if (value) setCleanliness(value as CleanlinessFilter)
          }}
        >
          <ToggleGroupItem value="all" aria-label="Mostrar todas as worktrees">
            Todas
          </ToggleGroupItem>
          <ToggleGroupItem
            value="clean"
            aria-label="Mostrar worktrees limpas"
          >
            Limpas
          </ToggleGroupItem>
          <ToggleGroupItem
            value="dirty"
            aria-label="Mostrar worktrees sujas"
          >
            Sujas
          </ToggleGroupItem>
        </ToggleGroup>
        {selectedWorktrees.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                <CopyIcon data-icon />
                Copiar selecionadas
                <ChevronDownIcon data-icon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => void copySelected("paths")}>
                  <CopyIcon data-icon />
                  Copiar caminhos
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void copySelected("context")}
                >
                  <CopyIcon data-icon />
                  Copiar contexto
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {copyNotice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {copyNotice}
        </p>
      ) : null}
      {copyError ? (
        <p className="text-sm text-destructive" role="alert">
          {copyError}
        </p>
      ) : null}

      {worktrees.loading ? <Skeleton className="h-72 w-full" /> : null}
      {worktrees.error ? (
        <ErrorState
          title="Não foi possível carregar as worktrees"
          error={worktrees.error}
          onRetry={worktrees.reload}
        />
      ) : null}
      {worktrees.data ? (
        worktrees.data.error ? (
          <ErrorState
            title="Inventário indisponível"
            error={new Error(worktrees.data.error)}
            onRetry={worktrees.reload}
          />
        ) : (
          <WorktreeDataTable
            worktrees={visible}
            rowSelection={rowSelection}
            setRowSelection={setRowSelection}
            onOpen={setOpenWorktreeId}
            emptyMessage={
              worktrees.data.worktrees.length
                ? "Nenhuma worktree corresponde aos filtros."
                : "Nenhuma worktree observável."
            }
          />
        )
      ) : null}
      {openWorktreeId ? (
        <WorktreeDrawer
          id={openWorktreeId}
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
  const worktrees = useApiQuery("worktrees", worktreeRequest)
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
