import type { JobRecord } from "../../lib/types"

export function projectChipVisible(
  job: Pick<JobRecord, "projectId" | "projectName">,
  options: { always?: boolean; filterProjectId?: string } = {}
) {
  if (!job.projectName) {
    return false
  }
  if (options.always) {
    return true
  }
  return Boolean(
    options.filterProjectId &&
      job.projectId &&
      job.projectId !== options.filterProjectId
  )
}

export function projectChipFacts(job: {
  branch?: string | null
  headSha?: string | null
}) {
  const sha = job.headSha ? job.headSha.slice(0, 8) : null
  return [job.branch, sha].filter(Boolean).join(" · ")
}
