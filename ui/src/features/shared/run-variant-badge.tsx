import { Badge } from "@/components/ui/badge"
import type { RunVariant } from "@/lib/types"

export function runVariantLabel(
  v: RunVariant | undefined
): string | null {
  if (v === "custom") return "Personalizado"
  if (v === "focal") return "Focal"
  return null
}

export function RunVariantBadge({
  runVariant,
}: {
  runVariant: RunVariant | undefined
}) {
  const label = runVariantLabel(runVariant)
  if (!label) return null
  return <Badge variant="outline">{label}</Badge>
}
