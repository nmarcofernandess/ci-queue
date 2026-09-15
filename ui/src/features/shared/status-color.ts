import type { JobStatus } from "@/lib/types"

export function statusColor(
  status: JobStatus | "pending" | "skipped" | undefined
) {
  if (status === "passed") return "text-success"
  if (status === "failed") return "text-destructive"
  if (status === "running" || status === "interrupted") return "text-warning"
  return "text-muted-foreground"
}
