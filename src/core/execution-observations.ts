import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import {
  assertObservationId,
  observationId,
  observationPayloadSha256,
  parseExecutionObservation,
  toObservedHistoryRecord,
  type ExecutionHistoryRecord,
  type ExecutionObservationInput,
  type StoredExecutionObservation,
} from "../contracts/execution-observation.js"
import type { QueueTicket } from "../contracts/schema.js"
import { listHistoryJobs } from "./state.js"

export class ObservationError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "ObservationError"
    this.code = code
  }
}

const STORED_EXTRA = new Set(["id", "importedAt", "payloadSha256"])

export function observationsDir(root: string): string {
  return join(root, "observations")
}

function ensureObservationsDir(root: string): string {
  const dir = observationsDir(root)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

function observationPath(root: string, id: string): string {
  assertObservationId(id)
  return join(observationsDir(root), `${id}.json`)
}

function parseStoredObservation(value: unknown): StoredExecutionObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ObservationError("OBSERVATION_UNREADABLE", "documento de observação inválido")
  }
  const raw = value as Record<string, unknown>
  const id = raw.id
  const importedAt = raw.importedAt
  const payloadSha256 = raw.payloadSha256
  if (typeof id !== "string") throw new ObservationError("OBSERVATION_UNREADABLE", "id ausente")
  try {
    assertObservationId(id)
  } catch {
    throw new ObservationError("OBSERVATION_UNREADABLE", "id de observação inválido")
  }
  if (typeof importedAt !== "string" || !Number.isFinite(Date.parse(importedAt))) {
    throw new ObservationError("OBSERVATION_UNREADABLE", "importedAt inválido")
  }
  if (typeof payloadSha256 !== "string" || !/^[a-f0-9]{64}$/.test(payloadSha256)) {
    throw new ObservationError("OBSERVATION_UNREADABLE", "payloadSha256 inválido")
  }

  const inputRaw: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(raw)) {
    if (STORED_EXTRA.has(key)) continue
    inputRaw[key] = entry
  }
  let input: ExecutionObservationInput
  try {
    input = parseExecutionObservation(inputRaw)
  } catch (error) {
    throw new ObservationError(
      "OBSERVATION_UNREADABLE",
      error instanceof Error ? error.message : String(error),
    )
  }

  const expectedId = observationId(input.projectId, input.executionId)
  if (id !== expectedId) {
    throw new ObservationError("OBSERVATION_UNREADABLE", "id não corresponde ao payload")
  }
  const expectedHash = observationPayloadSha256(input)
  if (payloadSha256 !== expectedHash) {
    throw new ObservationError("OBSERVATION_UNREADABLE", "payloadSha256 não corresponde ao payload")
  }

  return { ...input, id, importedAt, payloadSha256 }
}

function readRegularObservationFile(path: string): StoredExecutionObservation {
  let st
  try {
    st = lstatSync(path)
  } catch {
    throw new ObservationError("OBSERVATION_UNREADABLE", `arquivo ausente: ${path}`)
  }
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new ObservationError("OBSERVATION_UNREADABLE", `não é arquivo regular: ${path}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new ObservationError(
      "OBSERVATION_UNREADABLE",
      error instanceof Error ? error.message : String(error),
    )
  }
  return parseStoredObservation(parsed)
}

/**
 * Grava observação imutável em observations/. Não toca jobs/history/locks.
 * Publicação concorrente: linkSync(temp, final) — EEXIST compara payload.
 */
export function storeExecutionObservation(
  root: string,
  input: unknown,
  now: Date = new Date(),
): { id: string; executionId: string; outcome: "created" | "already-present" } {
  let parsed: ExecutionObservationInput
  try {
    parsed = parseExecutionObservation(input)
  } catch (error) {
    throw new ObservationError(
      "OBSERVATION_INVALID",
      error instanceof Error ? error.message : String(error),
    )
  }

  const id = observationId(parsed.projectId, parsed.executionId)
  const payloadSha256 = observationPayloadSha256(parsed)
  const stored: StoredExecutionObservation = {
    ...parsed,
    id,
    importedAt: now.toISOString(),
    payloadSha256,
  }

  const dir = ensureObservationsDir(root)
  const finalPath = join(dir, `${id}.json`)
  const tempPath = join(
    dir,
    `.${id}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  )

  try {
    writeFileSync(tempPath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
    try {
      linkSync(tempPath, finalPath)
      return { id, executionId: parsed.executionId, outcome: "created" }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : undefined
      if (code !== "EEXIST") {
        throw new ObservationError(
          "OBSERVATION_WRITE_FAILED",
          error instanceof Error ? error.message : String(error),
        )
      }
      const existing = readRegularObservationFile(finalPath)
      if (existing.payloadSha256 === payloadSha256) {
        return { id, executionId: parsed.executionId, outcome: "already-present" }
      }
      throw new ObservationError(
        "OBSERVATION_CONFLICT",
        `observação ${id} já existe com conteúdo diferente`,
      )
    }
  } finally {
    try {
      unlinkSync(tempPath)
    } catch {
      /* temp may already be gone */
    }
  }
}

export function listExecutionObservations(root: string): StoredExecutionObservation[] {
  const dir = observationsDir(root)
  if (!existsSync(dir)) return []
  const out: StoredExecutionObservation[] = []
  for (const name of readdirSync(dir)) {
    if (!name.startsWith("obs-") || !name.endsWith(".json")) continue
    const id = name.slice(0, -".json".length)
    try {
      assertObservationId(id)
      out.push(readRegularObservationFile(join(dir, name)))
    } catch {
      /* omit invalid entry from soft list */
    }
  }
  return out
}

export function readExecutionObservation(root: string, id: string): StoredExecutionObservation | undefined {
  try {
    assertObservationId(id)
  } catch {
    return undefined
  }
  const path = observationPath(root, id)
  if (!existsSync(path)) return undefined
  return readRegularObservationFile(path)
}

function ticketExecutor(ticket: QueueTicket): ExecutionHistoryRecord["executor"] {
  if (ticket.source === "direct-runtime" || ticket.source === "direct-cloud") return "direct"
  if (ticket.source === "queue" || ticket.source === undefined) return "queue"
  return "unknown"
}

export function ticketToHistoryRecord(ticket: QueueTicket): ExecutionHistoryRecord {
  return {
    id: ticket.id,
    recordKind: "queue-ticket",
    executor: ticketExecutor(ticket),
    projectId: ticket.projectId,
    projectName: ticket.projectName,
    preset: ticket.preset,
    status: ticket.status,
    startedAt: ticket.startedAt,
    finishedAt: ticket.finishedAt,
    createdAt: ticket.createdAt,
    durationMs: ticket.durationMs ?? null,
    exitCode: ticket.exitCode ?? null,
    cwd: ticket.cwd,
    branch: ticket.branch,
    headSha: ticket.headSha,
    failureReason: ticket.failureReason ?? null,
    progressEnabled: Boolean(ticket.flags?.progressEnabled || ticket.progress),
  }
}

export function listExecutionHistory(root: string, projectId?: string): ExecutionHistoryRecord[] {
  const tickets = listHistoryJobs(root, projectId).map(ticketToHistoryRecord)
  const observed = listExecutionObservations(root)
    .filter((item) => projectId === undefined || item.projectId === projectId)
    .map(toObservedHistoryRecord)

  const ticketIds = new Set(tickets.map((item) => item.id))
  const merged = [...tickets]
  for (const item of observed) {
    if (ticketIds.has(item.id)) continue
    merged.push(item)
  }

  return merged.sort((a, b) => {
    const af = a.finishedAt ?? a.createdAt ?? ""
    const bf = b.finishedAt ?? b.createdAt ?? ""
    if (af !== bf) return bf.localeCompare(af)
    return b.id.localeCompare(a.id)
  })
}

/** Read stdin with a hard byte cap (UTF-8). */
export function readStdinLimited(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }
    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > maxBytes) {
        finish(() => {
          reject(new ObservationError("OBSERVATION_TOO_LARGE", `stdin excede ${maxBytes} bytes`))
        })
        return
      }
      chunks.push(buf)
    }
    const onEnd = () => {
      finish(() => resolve(Buffer.concat(chunks).toString("utf8")))
    }
    const onError = (error: Error) => {
      finish(() => reject(error))
    }
    const cleanup = () => {
      stream.off("data", onData)
      stream.off("end", onEnd)
      stream.off("error", onError)
    }
    stream.on("data", onData)
    stream.on("end", onEnd)
    stream.on("error", onError)
  })
}
