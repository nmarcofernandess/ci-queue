import { createHash } from "node:crypto"

import { isValidProjectId } from "./schema.js"

export const EXECUTION_OBSERVE_CAPABILITY = "execution-observe-v1" as const
export const OBSERVATION_MAX_BYTES = 32 * 1024
export const OBSERVATION_KIND = "ci-execution-observation" as const

const SHA40 = /^[a-f0-9]{40}$/
const SHA64 = /^[a-f0-9]{64}$/
const OBS_ID = /^obs-[a-f0-9]{64}$/
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/

const TERMINAL_STATUSES = ["passed", "failed", "cancelled", "interrupted"] as const
type TerminalStatus = (typeof TERMINAL_STATUSES)[number]

export type ExecutionObservationInput = {
  schemaVersion: 1
  kind: typeof OBSERVATION_KIND
  executionId: string
  projectId: string
  projectName: string
  recipe: string
  executor: "direct"
  status: TerminalStatus
  startedAt: string
  finishedAt: string
  durationMs: number
  exitCode: number | null
  cwd: string
  branch: string
  headSha: string
  baseSha?: string
  runtime: { platform: string; arch: string; node?: string }
  evidenceSha256: string
  failureReason?: string
}

export type StoredExecutionObservation = ExecutionObservationInput & {
  id: string
  importedAt: string
  payloadSha256: string
}

export type ExecutionHistoryRecord = {
  id: string
  recordKind: "queue-ticket" | "observed-execution"
  executor: "queue" | "direct" | "unknown"
  executionId?: string
  projectId?: string
  projectName?: string
  preset?: string
  status?: string
  startedAt?: string
  finishedAt?: string
  createdAt?: string
  durationMs?: number | null
  exitCode?: number | null
  cwd?: string
  branch?: string
  headSha?: string
  failureReason?: string | null
  progressEnabled: boolean
  logAvailability?: "not-collected"
}

const INPUT_KEYS = new Set([
  "schemaVersion",
  "kind",
  "executionId",
  "projectId",
  "projectName",
  "recipe",
  "executor",
  "status",
  "startedAt",
  "finishedAt",
  "durationMs",
  "exitCode",
  "cwd",
  "branch",
  "headSha",
  "baseSha",
  "runtime",
  "evidenceSha256",
  "failureReason",
])

function fail(message: string): never {
  throw new Error(`OBSERVATION_INVALID: ${message}`)
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    fail(`${field} inválido`)
  }
  if (!NO_CONTROL.test(value)) fail(`${field} contém caracteres de controle`)
  return value
}

function requireIsoUtc(value: unknown, field: string): string {
  const raw = requireString(value, field, 64)
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) fail(`${field} não é ISO válido`)
  return new Date(ms).toISOString()
}

function requireSha40(value: unknown, field: string): string {
  const raw = requireString(value, field, 40)
  if (!SHA40.test(raw)) fail(`${field} deve ser SHA-1 de 40 hex`)
  return raw
}

function requireExitCode(value: unknown, status: TerminalStatus): number | null {
  if (value === null) {
    if (status === "passed" || status === "failed") fail("exitCode null incompatível com status")
    return null
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    fail("exitCode inválido")
  }
  if (status === "passed" && value !== 0) fail("passed exige exitCode 0")
  if (status === "failed" && value === 0) fail("failed rejeita exitCode 0")
  return value
}

function parseRuntime(value: unknown): ExecutionObservationInput["runtime"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("runtime inválido")
  const raw = value as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (!["platform", "arch", "node"].includes(key)) fail(`runtime.${key} não permitido`)
  }
  const platform = requireString(raw.platform, "runtime.platform", 128)
  const arch = requireString(raw.arch, "runtime.arch", 128)
  const runtime: ExecutionObservationInput["runtime"] = { platform, arch }
  if (raw.node !== undefined) runtime.node = requireString(raw.node, "runtime.node", 128)
  return runtime
}

/** Reconstrói somente os campos permitidos; rejeita extras e estados não terminais. */
export function parseExecutionObservation(value: unknown): ExecutionObservationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("objeto inválido")
  const raw = value as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (!INPUT_KEYS.has(key)) fail(`campo desconhecido: ${key}`)
  }

  if (raw.schemaVersion !== 1) fail("schemaVersion deve ser 1")
  if (raw.kind !== OBSERVATION_KIND) fail("kind inválido")
  if (raw.executor !== "direct") fail("executor deve ser direct")

  const status = raw.status
  if (typeof status !== "string" || !(TERMINAL_STATUSES as readonly string[]).includes(status)) {
    fail("status terminal inválido")
  }
  const terminal = status as TerminalStatus

  const executionId = requireString(raw.executionId, "executionId", 128)
  if (!isValidProjectId(executionId)) fail("executionId formato inválido")
  const projectId = requireString(raw.projectId, "projectId", 128)
  if (!isValidProjectId(projectId)) fail("projectId formato inválido")

  const projectName = requireString(raw.projectName, "projectName", 256)
  const recipe = requireString(raw.recipe, "recipe", 128)
  const startedAt = requireIsoUtc(raw.startedAt, "startedAt")
  const finishedAt = requireIsoUtc(raw.finishedAt, "finishedAt")
  const startedMs = Date.parse(startedAt)
  const finishedMs = Date.parse(finishedAt)
  if (finishedMs < startedMs) fail("finishedAt anterior a startedAt")

  if (typeof raw.durationMs !== "number" || !Number.isSafeInteger(raw.durationMs) || raw.durationMs < 0) {
    fail("durationMs inválido")
  }
  if (raw.durationMs !== finishedMs - startedMs) fail("durationMs não corresponde aos timestamps")

  const exitCode = requireExitCode(raw.exitCode, terminal)
  const cwd = requireString(raw.cwd, "cwd", 4096)
  const branch = requireString(raw.branch, "branch", 512)
  const headSha = requireSha40(raw.headSha, "headSha")
  const evidenceSha256 = requireString(raw.evidenceSha256, "evidenceSha256", 64)
  if (!SHA64.test(evidenceSha256)) fail("evidenceSha256 deve ter 64 hex")

  const out: ExecutionObservationInput = {
    schemaVersion: 1,
    kind: OBSERVATION_KIND,
    executionId,
    projectId,
    projectName,
    recipe,
    executor: "direct",
    status: terminal,
    startedAt,
    finishedAt,
    durationMs: raw.durationMs,
    exitCode,
    cwd,
    branch,
    headSha,
    runtime: parseRuntime(raw.runtime),
    evidenceSha256,
  }

  if (raw.baseSha !== undefined) out.baseSha = requireSha40(raw.baseSha, "baseSha")
  if (raw.failureReason !== undefined) {
    out.failureReason = requireString(raw.failureReason, "failureReason", 512)
  }

  return out
}

export function observationId(projectId: string, executionId: string): string {
  return (
    "obs-" +
    createHash("sha256").update(projectId).update("\0").update(executionId).digest("hex")
  )
}

/** SHA-256 do payload de input normalizado (ordem fixa; sem id/importedAt). */
export function observationPayloadSha256(input: ExecutionObservationInput): string {
  const ordered: Record<string, unknown> = {
    schemaVersion: input.schemaVersion,
    kind: input.kind,
    executionId: input.executionId,
    projectId: input.projectId,
    projectName: input.projectName,
    recipe: input.recipe,
    executor: input.executor,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    exitCode: input.exitCode,
    cwd: input.cwd,
    branch: input.branch,
    headSha: input.headSha,
  }
  if (input.baseSha !== undefined) ordered.baseSha = input.baseSha
  ordered.runtime = {
    platform: input.runtime.platform,
    arch: input.runtime.arch,
    ...(input.runtime.node !== undefined ? { node: input.runtime.node } : {}),
  }
  ordered.evidenceSha256 = input.evidenceSha256
  if (input.failureReason !== undefined) ordered.failureReason = input.failureReason
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex")
}

export function assertObservationId(id: string): void {
  if (!OBS_ID.test(id)) fail("id de observação inválido")
}

export function toObservedHistoryRecord(stored: StoredExecutionObservation): ExecutionHistoryRecord {
  return {
    id: stored.id,
    recordKind: "observed-execution",
    executor: "direct",
    executionId: stored.executionId,
    projectId: stored.projectId,
    projectName: stored.projectName,
    preset: stored.recipe,
    status: stored.status,
    startedAt: stored.startedAt,
    finishedAt: stored.finishedAt,
    createdAt: stored.startedAt,
    durationMs: stored.durationMs,
    exitCode: stored.exitCode,
    cwd: stored.cwd,
    branch: stored.branch,
    headSha: stored.headSha,
    failureReason: stored.failureReason ?? null,
    progressEnabled: false,
    logAvailability: "not-collected",
  }
}
