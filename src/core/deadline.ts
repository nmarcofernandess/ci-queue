import type { ExecutionDeadline, QueueTicket } from "../contracts/schema.js"

export function isValidExecutionTimeout(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647
}

export function initialExecutionDeadline(timeoutMs: unknown): ExecutionDeadline {
  if (timeoutMs === undefined) return { state: "disabled" }
  if (!isValidExecutionTimeout(timeoutMs)) throw new Error("executionTimeoutMs deve ser inteiro positivo até 2147483647")
  return { state: "awaiting_capture", timeoutMs }
}

export function validateQueuedDeadline(ticket: QueueTicket): string | undefined {
  const timeout = ticket.flags?.executionTimeoutMs
  if ((ticket.schemaVersion ?? 1) < 3) {
    return timeout !== undefined || ticket.executionDeadline !== undefined
      ? "deadline exige ticket schemaVersion 3"
      : undefined
  }
  let expected: ExecutionDeadline
  try { expected = initialExecutionDeadline(timeout) } catch (error) { return (error as Error).message }
  const actual = ticket.executionDeadline
  if (!actual || actual.state !== expected.state ||
    ("timeoutMs" in expected && (!("timeoutMs" in actual) || actual.timeoutMs !== expected.timeoutMs))) {
    return "ticket v3 exige executionDeadline inicial coerente com executionTimeoutMs"
  }
  return undefined
}

export function captureExecutionDeadline(
  timeoutMs: number | undefined,
  identity: QueueTicket["processGroupIdentity"],
  now = Date.now(),
): ExecutionDeadline {
  const initial = initialExecutionDeadline(timeoutMs)
  if (initial.state === "disabled") return initial
  if (!identity || identity.leaderPid <= 0 || identity.pgid !== identity.leaderPid || !identity.startedAt) {
    return { state: "capture_unavailable", timeoutMs: initial.timeoutMs }
  }
  return {
    state: "armed",
    timeoutMs: initial.timeoutMs,
    armedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + initial.timeoutMs).toISOString(),
  }
}
