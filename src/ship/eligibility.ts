import { isAbsolute, resolve } from "node:path"

import {
  isTerminalStatus,
  normalizeTicketFlags,
  type GitInfo,
  type QueueTicket,
  type TicketFlags,
} from "../contracts/schema.js"
import { argvEquals, isCustomTicket } from "../core/preset-history.js"

export type AcceptedRecipe = {
  name: string
  argv: readonly string[]
  flags: TicketFlags
}

export type ShipProofQuery = {
  projectId: string
  executionCwd: string
  headSha: string
  baseSha: string
  acceptedRecipes: readonly AcceptedRecipe[]
}

export type ProofEvaluation =
  | { eligible: true; ticket: QueueTicket }
  | { eligible: false; reason: string }

const TICKET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function asTicket(raw: unknown): QueueTicket | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const ticket = raw as QueueTicket
  if (typeof ticket.id !== "string" || !TICKET_ID.test(ticket.id)) return undefined
  if (typeof ticket.createdAt !== "string" || !ticket.createdAt) return undefined
  if (typeof ticket.status !== "string") return undefined
  if (typeof ticket.preset !== "string" || !ticket.preset) return undefined
  if (typeof ticket.cwd !== "string" || !ticket.cwd) return undefined
  if (typeof ticket.branch !== "string" || !ticket.branch) return undefined
  if (typeof ticket.headSha !== "string" || !ticket.headSha) return undefined
  if (typeof ticket.requestedBy !== "string" || !ticket.requestedBy) return undefined
  if (typeof ticket.command !== "string") return undefined
  if (typeof ticket.logPath !== "string" || !ticket.logPath) return undefined
  return ticket
}

function readGitInfo(value: unknown): GitInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.branch !== "string" || !raw.branch) return undefined
  if (typeof raw.headSha !== "string" || !raw.headSha) return undefined
  if (typeof raw.baseSha !== "string") return undefined
  if (typeof raw.statusShort !== "string") return undefined
  return {
    branch: raw.branch,
    headSha: raw.headSha,
    baseSha: raw.baseSha,
    statusShort: raw.statusShort,
  }
}

function sameCwd(left: string, right: string): boolean {
  if (!isAbsolute(left) || !isAbsolute(right)) return false
  return resolve(left) === resolve(right)
}

function gitEqual(left: GitInfo, right: GitInfo): boolean {
  return left.branch === right.branch
    && left.headSha === right.headSha
    && left.baseSha === right.baseSha
    && left.statusShort === right.statusShort
}

function readFlags(value: unknown): TicketFlags | undefined {
  if (value === undefined) return {}
  try {
    return normalizeTicketFlags(value)
  } catch {
    return undefined
  }
}

function flagsCompatible(ticketFlags: TicketFlags, recipeFlags: TicketFlags): boolean {
  return ticketFlags.fetchBase === recipeFlags.fetchBase
    && ticketFlags.requireCleanTree === recipeFlags.requireCleanTree
    && ticketFlags.requireGitStability === recipeFlags.requireGitStability
    && ticketFlags.pinHeadSha === recipeFlags.pinHeadSha
    && ticketFlags.executionTimeoutMs === recipeFlags.executionTimeoutMs
}

function hasCustomMarker(ticket: QueueTicket): boolean {
  if (ticket.extraArgs !== undefined && !Array.isArray(ticket.extraArgs)) return true
  return isCustomTicket(ticket)
}

function deadlineReason(ticket: QueueTicket, recipe: AcceptedRecipe): string | undefined {
  const deadline = ticket.executionDeadline
  if (deadline?.state === "expired") return "deadline-expired"
  const ticketFlags = readFlags(ticket.flags)
  if (!ticketFlags) return "flags-mismatch"
  if (ticketFlags.executionTimeoutMs !== recipe.flags.executionTimeoutMs) return "flags-mismatch"
  if (!deadline) {
    return recipe.flags.executionTimeoutMs === undefined ? undefined : "deadline-incoherent"
  }
  if (deadline.state === "disabled") {
    return recipe.flags.executionTimeoutMs === undefined ? undefined : "deadline-incoherent"
  }
  if ("timeoutMs" in deadline && recipe.flags.executionTimeoutMs !== undefined
    && deadline.timeoutMs !== recipe.flags.executionTimeoutMs) {
    return "deadline-incoherent"
  }
  return undefined
}

function evaluateForRecipe(
  ticket: QueueTicket,
  query: ShipProofQuery,
  recipe: AcceptedRecipe,
): ProofEvaluation {
  if (ticket.projectId !== query.projectId) return { eligible: false, reason: "project-mismatch" }
  if (!sameCwd(ticket.cwd, query.executionCwd)) return { eligible: false, reason: "cwd-mismatch" }
  if (ticket.preset !== recipe.name) return { eligible: false, reason: "recipe-mismatch" }
  if (hasCustomMarker(ticket)) return { eligible: false, reason: "custom" }
  if (!argvEquals(ticket.argv, recipe.argv)) return { eligible: false, reason: "argv-mismatch" }
  if (ticket.source !== undefined && ticket.source !== "queue") return { eligible: false, reason: "source" }
  if (ticket.cancelledAt) return { eligible: false, reason: "cancelled" }
  if (ticket.cleanupBlockedReason) return { eligible: false, reason: "cleanup-blocked" }
  if (ticket.status !== "passed") return { eligible: false, reason: "not-passed" }
  if (typeof ticket.exitCode !== "number" || !Number.isSafeInteger(ticket.exitCode) || ticket.exitCode !== 0) {
    return { eligible: false, reason: "exit-code" }
  }
  if (typeof ticket.startedAt !== "string" || !ticket.startedAt) return { eligible: false, reason: "missing-timestamps" }
  if (typeof ticket.finishedAt !== "string" || !ticket.finishedAt) return { eligible: false, reason: "missing-timestamps" }
  const expired = deadlineReason(ticket, recipe)
  if (expired) return { eligible: false, reason: expired }
  const ticketFlags = readFlags(ticket.flags)
  if (!ticketFlags || !flagsCompatible(ticketFlags, recipe.flags)) {
    return { eligible: false, reason: "flags-mismatch" }
  }
  const preflight = readGitInfo(ticket.preflight)
  if (!preflight) return { eligible: false, reason: "missing-preflight" }
  const postflight = readGitInfo(ticket.postflight)
  if (!postflight) return { eligible: false, reason: "missing-postflight" }
  if (preflight.statusShort !== "" || postflight.statusShort !== "") {
    return { eligible: false, reason: "dirty-tree" }
  }
  if (!gitEqual(preflight, postflight) || ticket.branch !== preflight.branch) {
    return { eligible: false, reason: "git-snapshot-mismatch" }
  }
  if (ticket.headSha !== query.headSha || preflight.headSha !== query.headSha) {
    return { eligible: false, reason: "head-mismatch" }
  }
  if (preflight.baseSha !== query.baseSha) return { eligible: false, reason: "base-mismatch" }
  return { eligible: true, ticket }
}

function startedKey(ticket: QueueTicket): string {
  return ticket.startedAt ?? ticket.createdAt
}

function compareLatestStarted(left: QueueTicket, right: QueueTicket): number {
  const byTime = startedKey(right).localeCompare(startedKey(left))
  if (byTime !== 0) return byTime
  return right.id.localeCompare(left.id)
}

function inCanonicalTuple(
  ticket: QueueTicket,
  query: ShipProofQuery,
  recipe: AcceptedRecipe,
): boolean {
  if (ticket.projectId !== query.projectId) return false
  if (!sameCwd(ticket.cwd, query.executionCwd)) return false
  if (ticket.preset !== recipe.name) return false
  if (hasCustomMarker(ticket)) return false
  if (!argvEquals(ticket.argv, recipe.argv)) return false
  if (ticket.source !== undefined && ticket.source !== "queue") return false
  if (!isTerminalStatus(ticket.status)) return false
  if (ticket.headSha !== query.headSha) return false
  const preflight = readGitInfo(ticket.preflight)
  if (!preflight) return false
  return preflight.headSha === query.headSha && preflight.baseSha === query.baseSha
}

export function evaluateShipTicket(raw: unknown, query: ShipProofQuery): ProofEvaluation {
  const ticket = asTicket(raw)
  if (!ticket) return { eligible: false, reason: "invalid-ticket" }
  let reason = "no-accepted-recipe"
  for (const recipe of query.acceptedRecipes) {
    const result = evaluateForRecipe(ticket, query, recipe)
    if (result.eligible) return result
    reason = result.reason
  }
  return { eligible: false, reason }
}

export function isShipEligibleTicket(raw: unknown, query: ShipProofQuery): boolean {
  return evaluateShipTicket(raw, query).eligible
}

export function findEligibleTicket(jobs: readonly unknown[], query: ShipProofQuery): QueueTicket | undefined {
  for (const recipe of query.acceptedRecipes) {
    const members = jobs
      .map(asTicket)
      .filter((ticket): ticket is QueueTicket => ticket !== undefined && inCanonicalTuple(ticket, query, recipe))
      .sort(compareLatestStarted)
    const latest = members[0]
    if (!latest) continue
    if (latest.status === "failed" || latest.status === "interrupted") continue
    const result = evaluateShipTicket(latest, { ...query, acceptedRecipes: [recipe] })
    if (result.eligible) return result.ticket
  }
  return undefined
}
