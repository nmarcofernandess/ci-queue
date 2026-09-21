import type { RunVariant } from "@/lib/types"

export function runVariantLabel(
  variant: RunVariant | undefined
): string | null {
  if (variant === "custom") return "Personalizado"
  if (variant === "focal") return "Focal"
  return null
}
