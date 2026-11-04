import type { JobStatus } from "@/lib/types"

export function statusColor(
  status: JobStatus | "pending" | "skipped" | "retrying" | "paused" | undefined
) {
  if (status === "passed") return "text-success"
  if (status === "failed") return "text-destructive"
  if (status === "interrupted" || status === "retrying" || status === "paused") return "text-warning"
  return "text-muted-foreground"
}
