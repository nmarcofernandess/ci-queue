export const appRoutes = ["status", "worktrees", "analysis"] as const

export type AppRoute = (typeof appRoutes)[number]
