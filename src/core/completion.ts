import { createHash } from "node:crypto"
import { finalizationDigest, isTerminalStatus, normalizeFinalization, type FinalizationRecord, type JobStatus, type QueueTicket } from "../contracts/schema.js"
import { attributeLegacy, historyPath, listHistoryJobs, readBoundedFile, readFinalization } from "./state.js"

export type ExecutionCompletion = {
  state: "running" | "complete" | "failed" | "legacy"
  eligible: boolean
  testStatus: JobStatus
  finalization?: FinalizationRecord
  reason?: string
}

export type ExecutionSource = { ticket: QueueTicket; record?: FinalizationRecord; terminalDigest?: string }

/** Only the reader's source digest can bind a hook result to a terminal ticket. */
export function executionCompletion(ticket: QueueTicket, record?: FinalizationRecord, terminalDigest?: string): ExecutionCompletion {
  const base = { eligible: false, testStatus: ticket.status }
  if (!isTerminalStatus(ticket.status)) return { ...base, state: "running" }
  const testPassed = ticket.status === "passed" && ticket.exitCode === 0
  if (!ticket.finalization && !ticket.finalizationDigest) {
    return { ...base, state: ticket.schemaVersion === 4 ? "complete" : "legacy", eligible: testPassed }
  }
  try {
    const spec = normalizeFinalization(ticket.finalization)
    if (ticket.schemaVersion !== 4 || !spec || finalizationDigest(spec) !== ticket.finalizationDigest) throw new Error()
  } catch { return { ...base, state: "failed", reason: "finalization-contract-invalid" } }
  if (!terminalDigest || !/^[a-f0-9]{64}$/.test(terminalDigest) || !record
    || record.schemaVersion !== 1 || record.ticketId !== ticket.id
    || record.ticketDigest !== terminalDigest || record.finalizationDigest !== ticket.finalizationDigest
    || !Number.isSafeInteger(record.attempt) || record.attempt < 0) {
    return { ...base, state: "running", reason: "finalization-unverified" }
  }
  const bound = { ...base, finalization: record }
  if (record.phase === "pending" || record.phase === "running") return { ...bound, state: "running" }
  if (record.phase !== "passed" || record.exitCode !== 0 || record.failureReason
    || record.result?.schemaVersion !== 1 || !Array.isArray(record.result.outputs) || record.result.error
    || !["confirmed", "not-required"].includes(record.result.cleanup)) {
    return { ...bound, state: "failed", reason: record.result?.cleanup === "uncertain" ? "cleanup-uncertain" : "finalization-failed" }
  }
  return { ...bound, state: "complete", eligible: testPassed }
}

/** Parse and hash the same immutable bytes; never hash a hydrated ticket. */
export function readExecutionSource(root: string, id: string): ExecutionSource | undefined {
  try {
    const bytes = readBoundedFile(historyPath(root, id), 16 * 1024 * 1024)
    const ticket = JSON.parse(bytes.toString("utf8")) as QueueTicket
    if (!ticket || ticket.id !== id) return undefined
    let record: FinalizationRecord | undefined
    try { record = readFinalization(root, id) } catch { /* An unreadable join remains unverified. */ }
    return { ticket: attributeLegacy(root, ticket), record, terminalDigest: createHash("sha256").update(bytes).digest("hex") }
  } catch { return undefined }
}

export function listExecutionSources(root: string, projectId?: string): ExecutionSource[] {
  return listHistoryJobs(root, projectId).flatMap(ticket => {
    const source = readExecutionSource(root, ticket.id)
    return source ? [source] : []
  })
}

export function projectExecution(source: ExecutionSource) {
  return { ...source.ticket, completion: executionCompletion(source.ticket, source.record, source.terminalDigest) }
}

export function completionExitCode(ticket: QueueTicket, completion: ExecutionCompletion): number {
  if (ticket.status === "passed") return completion.state === "failed" ? 1 : 0
  return ticket.exitCode ?? (ticket.status === "cancelled" ? 130 : 1)
}
