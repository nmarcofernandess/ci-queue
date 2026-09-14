import { createElement, type ComponentType } from "react"

import { AnalysisPage } from "@/features/analysis/analysis-page"
import { StatusPage } from "@/features/status/status-page"
import { WorktreesPage } from "@/features/worktrees/worktrees-page"

export const appRoutes = ["status", "worktrees", "analysis"] as const

export type AppRoute = (typeof appRoutes)[number]

const routeComponents = {
  status: StatusPage,
  worktrees: WorktreesPage,
  analysis: AnalysisPage,
} satisfies Record<AppRoute, ComponentType>

export function RouteContent({ route }: { route: AppRoute }) {
  const RouteComponent = routeComponents[route]
  return createElement(RouteComponent)
}
