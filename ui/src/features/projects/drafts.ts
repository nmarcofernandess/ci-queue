export type ScopedDraft<T> = {
  revision: number
  value: T
}

export function restoreScopedDraft<T>(
  stored: unknown,
  revision: number
): T | undefined {
  if (
    !stored ||
    typeof stored !== "object" ||
    !("revision" in stored) ||
    !("value" in stored)
  ) {
    return undefined
  }
  const draft = stored as ScopedDraft<T>
  return draft.revision === revision ? draft.value : undefined
}
