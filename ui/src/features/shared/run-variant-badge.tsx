import { Badge } from "@/components/ui/badge"
import type { RunVariant } from "@/lib/types"
import { runVariantLabel } from "./run-variant-label"

export function RunVariantBadge({
  runVariant,
}: {
  runVariant: RunVariant | undefined
}) {
  const label = runVariantLabel(runVariant)
  if (!label) return null
  return <Badge variant="outline">{label}</Badge>
}
