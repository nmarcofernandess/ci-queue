import type { RemoteSlotsResponse } from "@/lib/types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export class RemoteSlotsContractError extends Error {
  constructor() {
    super(
      "A API conectada não fornece o contrato de últimos verdes do CI Queue."
    )
    this.name = "RemoteSlotsContractError"
  }
}

/** Rejects legacy bridge envelopes instead of teaching the product UI to read them. */
export function parseRemoteSlotsResponse(value: unknown): RemoteSlotsResponse {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !isRecord(value.source) ||
    typeof value.source.available !== "boolean" ||
    !Array.isArray(value.greens) ||
    value.greens.some((green) => !isRecord(green))
  ) {
    throw new RemoteSlotsContractError()
  }

  return value as RemoteSlotsResponse
}
