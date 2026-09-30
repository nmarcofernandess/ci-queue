import type { RemoteSlotsAllResponse, RemoteSlotsResponse } from "@/lib/types"

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
export function parseRemoteSlotsResponse(value: unknown, context: "project"): RemoteSlotsResponse
export function parseRemoteSlotsResponse(value: unknown, context: "all"): RemoteSlotsAllResponse
export function parseRemoteSlotsResponse(value: unknown): RemoteSlotsResponse | RemoteSlotsAllResponse
export function parseRemoteSlotsResponse(value: unknown, context?: "project" | "all"): RemoteSlotsResponse | RemoteSlotsAllResponse {
  if (isRecord(value) && isRecord(value.context) && value.context.kind === "all") {
    if (context === "project" || value.schemaVersion !== 2 ||
        !Array.isArray(value.projects) || !Array.isArray(value.projectErrors) ||
        !Array.isArray(value.greens) || value.projects.some((project) =>
          !isRecord(project) || typeof project.projectId !== "string" ||
          typeof project.projectName !== "string" ||
          (!(project.source === null && project.coverage === null) &&
            (!isRecord(project.source) || typeof project.source.available !== "boolean" ||
              !isRecord(project.coverage)))) ||
        value.greens.some((green) => !isRecord(green) ||
          typeof green.projectName !== "string" ||
          !(value.projects as unknown[]).some((project) => isRecord(project) &&
            project.projectId === green.projectId))) {
      throw new RemoteSlotsContractError()
    }
    return value as RemoteSlotsAllResponse
  }
  if (context === "all") throw new RemoteSlotsContractError()
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
