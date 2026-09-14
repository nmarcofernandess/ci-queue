import type { QueueProjectConfig, QueueTicket } from "../contracts/schema.js"

function isCustom(ticket: QueueTicket): boolean {
  return (ticket as QueueTicket & { custom?: boolean }).custom === true || Boolean(ticket.extraArgs?.length)
}

function runRef(ticket: QueueTicket) {
  return {
    ticketId: ticket.id,
    finishedAt: ticket.finishedAt ?? null,
    status: ticket.status,
    headSha: ticket.headSha,
    branch: ticket.branch,
    custom: isCustom(ticket),
    durationMs: ticket.durationMs ?? null,
  }
}

export function buildPresetHistory(tickets: QueueTicket[], config: QueueProjectConfig) {
  const presets = Object.entries(config.presets).map(([preset, recipe]) => {
    const runs = tickets
      .filter((ticket) => ticket.projectId === config.project.id && ticket.preset === preset)
      .sort((left, right) => (right.finishedAt ?? right.createdAt).localeCompare(left.finishedAt ?? left.createdAt))
    const canonical = runs.filter((ticket) => (
      ticket.status === "passed"
      && ticket.exitCode === 0
      && !isCustom(ticket)
      && JSON.stringify(ticket.argv) === JSON.stringify(recipe.argv)
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
