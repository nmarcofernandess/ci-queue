import { ClipboardIcon, EyeIcon, GitCommitIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  formatDuration,
  formatRelativeTime,
  formatTimelineDate,
  shortSha,
} from "@/features/shared/format"
import { JobStatusIcon } from "@/features/shared/run-table"
import type { GreenCommitGroup } from "@/features/status/green-commit"
import { useIsMobile } from "@/hooks/use-mobile"

function originLabel(origins: GreenCommitGroup["origins"]) {
  return origins
    .map((value) => (value === "machine" ? "Máquina" : "Git"))
    .join(" + ")
}

export function GreenCommitTable({
  groups,
  onOpen,
  emptyDescription,
}: {
  groups: GreenCommitGroup[]
  onOpen: (group: GreenCommitGroup) => void
  emptyDescription: string
}) {
  if (!groups.length)
    return (
      <div className="rounded-lg border">
        <Empty className="border-0 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitCommitIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum commit encontrado</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Estado</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead>Último verde</TableHead>
            <TableHead>Execuções</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.sha}>
              <TableCell>
                <JobStatusIcon status="passed" />
              </TableCell>
              <TableCell>
                <Button
                  variant="link"
                  className="h-auto p-0 font-mono"
                  onClick={() => onOpen(group)}
                >
                  {shortSha(group.sha)}
                </Button>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatTimelineDate(group.finishedAt)} ·{" "}
                {formatRelativeTime(group.finishedAt)}
              </TableCell>
              <TableCell>{group.rows.length}</TableCell>
              <TableCell>{originLabel(group.origins)}</TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Ver commit ${shortSha(group.sha)}`}
                      onClick={() => onOpen(group)}
                    >
                      <EyeIcon data-icon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ver commit</TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function GreenCommitDrawer({
  group,
  onClose,
  onOpenJob,
}: {
  group: GreenCommitGroup
  onClose: () => void
  onOpenJob: (id: string) => void
}) {
  const isMobile = useIsMobile()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(group.sha)
      toast.success("SHA copiado.")
    } catch {
      toast.error("Não foi possível copiar o SHA.")
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
            <div>
              <DrawerTitle className="font-mono">
                {shortSha(group.sha)}
              </DrawerTitle>
              <DrawerDescription>
                {group.rows.length} execuções verdes ·{" "}
                {formatTimelineDate(group.finishedAt)} ·{" "}
                {formatRelativeTime(group.finishedAt)}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar commit">
                <XIcon data-icon />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <ScrollArea className="min-h-0 flex-1 p-4">
          <div className="mb-4 grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">SHA </span>
              <span className="font-mono break-all">{group.sha}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Branches </span>
              {group.branches.join(", ") || "Não informadas"}
            </p>
            <p>
              <span className="text-muted-foreground">Origem </span>
              {originLabel(group.origins)}
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Preset</TableHead>
                  <TableHead>Término</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((row) => {
                  const id =
                    row.detailsJobId ??
                    (row.detailsAvailable !== false ? row.id : undefined)
                  return (
                    <TableRow
                      key={
                        row.rowKey ??
                        row.ticketId ??
                        `${row.preset}-${row.finishedAt}`
                      }
                    >
                      <TableCell>
                        <JobStatusIcon status="passed" />
                      </TableCell>
                      <TableCell>
                        {id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0"
                            onClick={() => onOpenJob(id)}
                          >
                            {row.preset}
                          </Button>
                        ) : (
                          row.preset
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatTimelineDate(row.finishedAt)}
                      </TableCell>
                      <TableCell>{formatDuration(row.durationMs)}</TableCell>
                      <TableCell>
                        {id ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ver ${row.preset}`}
                            onClick={() => onOpenJob(id)}
                          >
                            <EyeIcon data-icon />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
        <DrawerFooter className="shrink-0 border-t">
          <Button variant="outline" onClick={() => void copy()}>
            <ClipboardIcon data-icon />
            Copiar SHA
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
