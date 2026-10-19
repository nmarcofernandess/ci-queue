import { executionCompletion, type ExecutionSource } from "./completion.js"
import { finalizationDigest } from "../contracts/schema.js"
import type { QueueProjectConfig, QueueTicket } from "../contracts/schema.js"

export function isCustomTicket(ticket: QueueTicket): boolean {
  return (ticket as QueueTicket & { custom?: boolean }).custom === true || Boolean(ticket.extraArgs?.length)
}

export function argvEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function runRef(ticket: QueueTicket) {
  return {
    ticketId: ticket.id,
    finishedAt: ticket.finishedAt ?? null,
    status: ticket.status,
    headSha: ticket.headSha,
    branch: ticket.branch,
    custom: isCustomTicket(ticket),
    durationMs: ticket.durationMs ?? null,
    ...(ticket.finalizationDigest ? { finalizationDigest: ticket.finalizationDigest } : {}),
  }
}

export function buildPresetHistory(tickets: QueueTicket[], config: QueueProjectConfig, sources: readonly ExecutionSource[] = []) {
  const presets = Object.entries(config.presets).map(([preset, recipe]) => {
    const runs = tickets
      .filter((ticket) => ticket.projectId === config.project.id && ticket.preset === preset)
      .sort((left, right) => (right.finishedAt ?? right.createdAt).localeCompare(left.finishedAt ?? left.createdAt))
    const evidence = new Map(sources.map(source => [source.ticket.id, source]))
    const canonical = runs.filter((ticket) => (
      executionCompletion(ticket, evidence.get(ticket.id)?.record, evidence.get(ticket.id)?.terminalDigest).eligible
      && ticket.finalizationDigest === (recipe.finalization ? finalizationDigest(recipe.finalization) : undefined)
      && ticket.status === "passed"
      && ticket.exitCode === 0
      && !isCustomTicket(ticket)
      && argvEquals(ticket.argv, recipe.argv)
    ))
    return {
      projectId: config.project.id,
      preset,
      lastGreenCanonical: canonical[0] ? runRef(canonical[0]) : null,
    }
  })
  return {
    aggregatorSchema: 1,
    projects: [{ projectId: config.project.id }],
    presets,
  }
}
