import type { RunTableJob } from "@/features/shared/run-table"

export type GreenCommitGroup = {
  projectId?: string
  projectName?: string
  sha: string
  rows: RunTableJob[]
  finishedAt?: string
  branches: string[]
  origins: Array<"machine" | "git">
}

export function groupGreenCommits(rows: RunTableJob[]): GreenCommitGroup[] {
  const groups = new Map<string, GreenCommitGroup>()
  for (const row of rows) {
    if (!row.headSha) continue
    const key = `${row.projectId ?? ""}\u0000${row.headSha}`
    const current = groups.get(key) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      sha: row.headSha,
      rows: [],
      finishedAt: row.finishedAt,
      branches: [],
      origins: [],
    }
    current.rows.push(row)
    if ((row.finishedAt ?? "") > (current.finishedAt ?? ""))
      current.finishedAt = row.finishedAt
    if (row.branch && !current.branches.includes(row.branch))
      current.branches.push(row.branch)
    for (const origin of row.origins ?? (row.origin ? [row.origin] : [])) {
      if (!current.origins.includes(origin)) current.origins.push(origin)
    }
    groups.set(key, current)
  }
  return [...groups.values()].sort((a, b) =>
    (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "")
  )
}
