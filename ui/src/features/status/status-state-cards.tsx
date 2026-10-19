import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ProjectChip } from "@/features/shared/project-chip"
import { shortSha } from "@/features/shared/format"
import {
  metaPreviewRows,
  pendingPreviewRows,
} from "@/features/status/status-state-model"
import type { ApiQuery } from "@/lib/api"
import type {
  DashboardAllState,
  DashboardProjectState,
  DashboardState,
} from "@/lib/types"
import { CheckCircle2Icon, CircleDotIcon } from "lucide-react"

export function StatusStateCards({
  dashboard,
  readable,
  onOpen,
  onOpenJob,
}: {
  dashboard: ApiQuery<DashboardState | DashboardAllState>
  readable: boolean
  onOpen: (surface: "meta" | "pending") => void
  onOpenJob: (jobId: string) => void
}) {
  if (readable && (dashboard.loading || dashboard.error || !dashboard.data)) {
    return (
      <>
        {["Metas", "Pendências"].map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.loading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <p className="text-sm text-destructive">
                  {dashboard.error?.message || "Dados indisponíveis."}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </>
    )
  }

  const all =
    dashboard.data && "projects" in dashboard.data ? dashboard.data : null
  const project =
    dashboard.data && "meta" in dashboard.data ? dashboard.data : null
  const meta = project?.meta
  const pending = project?.pending ?? []
  const pendingError = project?.pendingError
  const observed =
    meta?.checks?.filter((check) => check.status === "passed").length ?? null
  const total = meta?.checks?.length ?? null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Metas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!readable ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Selecione um projeto</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : all ? (
            <AllMetaPreview state={all} />
          ) : meta ? (
            <>
              <p className="font-medium">{meta.name}</p>
              {meta.description ? (
                <p className="text-sm text-muted-foreground">
                  {meta.description}
                </p>
              ) : null}
              {meta.checks === null ? (
                <p className="text-sm text-muted-foreground">
                  Checks indisponíveis: não há catálogo utilizável para calcular
                  o progresso.
                </p>
              ) : total ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {observed ?? 0} de {total} requisitos atendidos
                  </p>
                  <Progress value={((observed ?? 0) / total) * 100} />
                  {meta.candidateSha ? (
                    <p className="text-sm text-muted-foreground">
                      Candidato{" "}
                      <span className="font-mono">
                        {shortSha(meta.candidateSha)}
                      </span>
                    </p>
                  ) : null}
                  <ItemGroup>
                    {meta.checks.map((check) => {
                      const Icon =
                        check.status === "passed"
                          ? CheckCircle2Icon
                          : CircleDotIcon
                      return (
                        <Item
                          key={check.preset}
                          variant="default"
                          size="xs"
                        >
                          <ItemMedia variant="icon">
                            <Icon />
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>
                              {check.status === "passed" && check.ticketId ? (
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  onClick={() => onOpenJob(check.ticketId!)}
                                >
                                  {check.preset}
                                </Button>
                              ) : (
                                check.preset
                              )}
                            </ItemTitle>
                            <ItemDescription>
                              {check.status === "passed"
                                ? "Verde elegível"
                                : check.status === "recipe-missing"
                                  ? "Receita não declarada"
                                  : "Sem verde elegível"}
                            </ItemDescription>
                          </ItemContent>
                        </Item>
                      )
                    })}
                  </ItemGroup>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem requisitos definidos.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma meta declarada.
            </p>
          )}
        </CardContent>
        <CardFooter className="border-0 bg-transparent pt-0">
          <StatusCardAction
            label={all ? "Abrir metas" : "Abrir meta"}
            disabled={!readable}
            onClick={() => onOpen("meta")}
          />
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pendências</CardTitle>
        </CardHeader>
        <CardContent>
          {!readable ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Selecione um projeto</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : all ? (
            <AllPendingPreview state={all} onOpenJob={onOpenJob} />
          ) : pendingError ? (
            <p className="text-sm text-destructive">{pendingError}</p>
          ) : pending.length ? (
            <ItemGroup>
              {pending.slice(0, 3).map((item) => (
                <Item
                  key={item.id}
                  variant="default"
                  size="xs"
                >
                  <ItemContent>
                    <ItemTitle>
                      {item.latestTicketId ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() => onOpenJob(item.latestTicketId!)}
                        >
                          {item.preset}
                        </Button>
                      ) : (
                        item.preset
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      {item.pr ? `PR #${item.pr} · ` : ""}
                      {shortSha(item.headSha)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
          )}
        </CardContent>
        <CardFooter className="border-0 bg-transparent pt-0">
          <StatusCardAction
            label="Ver pendências"
            disabled={!readable}
            onClick={() => onOpen("pending")}
          />
        </CardFooter>
      </Card>
    </>
  )
}

function StatusCardAction({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  const button = (
    <Button type="button" variant="ghost" disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
  if (!disabled) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>escolha um projeto</TooltipContent>
    </Tooltip>
  )
}

function CoverageErrors({
  state,
  pending = false,
}: {
  state: DashboardAllState
  pending?: boolean
}) {
  return (
    <>
      {state.projectErrors.map((error) => (
        <p key={error.projectId} className="text-sm text-destructive">
          {error.projectName}: {error.error}
        </p>
      ))}
      {pending
        ? state.projects
            .filter((project) => project.pendingError)
            .map((project) => (
              <p key={project.projectId} className="text-sm text-destructive">
                {project.projectName}: {project.pendingError}
              </p>
            ))
        : null}
    </>
  )
}

function AllMetaPreview({ state }: { state: DashboardAllState }) {
  const rows = metaPreviewRows(state, 3)
  return (
    <>
      <CoverageErrors state={state} />
      {rows.length ? (
        <ItemGroup>
          {rows.map((project) => (
            <Item
              key={project.projectId}
              size="xs"
              className="min-w-0"
            >
              <ItemContent className="min-w-0">
                <div className="min-w-0">
                  <ProjectChip
                    mode="compact-context"
                    name={project.projectName}
                  />
                </div>
                <ItemTitle className="break-words">
                  {project.meta?.name}
                </ItemTitle>
                <MetaPreviewProgress project={project} />
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : !state.projectErrors.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma meta declarada.</p>
      ) : null}
    </>
  )
}

function MetaPreviewProgress({ project }: { project: DashboardProjectState }) {
  const meta = project.meta
  if (!meta) return null
  const passed = meta.checks?.filter(
    (check) => check.status === "passed"
  ).length
  return (
    <>
      <ItemDescription className="line-clamp-none">
        {meta.checks === null
          ? "Checks indisponíveis: não há catálogo utilizável para calcular o progresso."
          : `${passed} de ${meta.checks.length} requisitos atendidos`}
      </ItemDescription>
      {meta.checks?.length ? (
        <Progress value={(passed! / meta.checks.length) * 100} />
      ) : null}
      {meta.candidateSha ? (
        <ItemDescription>
          Candidato{" "}
          <span className="font-mono">{shortSha(meta.candidateSha)}</span>
        </ItemDescription>
      ) : null}
    </>
  )
}

function AllPendingPreview({
  state,
  onOpenJob,
}: {
  state: DashboardAllState
  onOpenJob: (id: string) => void
}) {
  const rows = pendingPreviewRows(state, 3)
  const hasErrors =
    state.projectErrors.length ||
    state.projects.some((project) => project.pendingError)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CoverageErrors state={state} pending />
      {rows.length ? (
        <ItemGroup>
          {rows.map(({ projectId, projectName, item }) => (
            <Item
              key={`${projectId}:${item.id}`}
              size="xs"
              className="min-w-0"
            >
              <ItemContent className="min-w-0">
                <div className="min-w-0">
                  <ProjectChip mode="compact-context" name={projectName} />
                </div>
                <ItemTitle>
                  {item.latestTicketId ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => onOpenJob(item.latestTicketId!)}
                    >
                      {item.preset}
                    </Button>
                  ) : (
                    item.preset
                  )}
                </ItemTitle>
                <ItemDescription>
                  {item.pr ? `PR #${item.pr} · ` : ""}
                  {shortSha(item.headSha)}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : !hasErrors ? (
        <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
      ) : null}
    </div>
  )
}
