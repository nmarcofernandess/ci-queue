import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { readQueueConfig, type ResolvedQueueConfig } from "../contracts/config.js"
import {
  TICKET_SCHEMA_VERSION,
  type QueueTicket,
  type RequestContext,
} from "../contracts/schema.js"
import { initialExecutionDeadline } from "./deadline.js"
import { readGitInfo, validateTicketAdmission } from "./runner.js"
import { ensureQueueDirs, generateJobId, queuePaths, quoteArg, stageTicketWrite } from "./state.js"

export type EnqueueInput = {
  preset: string
  cwd?: string
  configPath?: string
  stateRoot: string
  extraArgs?: string[]
  requestedBy?: string
  requestContext?: RequestContext
  now?: Date
}

/**
 * Entrada para consumidores que já possuem um catálogo próprio. O argv chega
 * congelado no ticket; o worker nunca reconsulta o consumidor nem reentra em
 * um roteador de receitas.
 */
export type ExplicitEnqueueInput = {
  recipe: string
  argv: string[]
  projectId: string
  projectName: string
  cwd: string
  stateRoot: string
  baseRef?: string
  artifacts?: string[]
  flags?: QueueTicket["flags"]
  requestedBy?: string
  requestContext?: RequestContext
  now?: Date
}

export function buildTicket(input: EnqueueInput, resolved?: ResolvedQueueConfig): QueueTicket {
  const configuration = resolved ?? readQueueConfig(input.cwd, input.configPath)
  const preset = configuration.config.presets[input.preset]
  if (!preset) throw new Error(`preset desconhecido: ${input.preset}`)
  if (!existsSync(configuration.executionCwd)) throw new Error(`repository.path inexistente: ${configuration.executionCwd}`)
  const paths = ensureQueueDirs(input.stateRoot)
  const now = input.now ?? new Date()
  const id = generateJobId(now)
  const git = readGitInfo(configuration.executionCwd, preset.fetchBase ?? configuration.config.repository?.baseRef)
  const extraArgs = input.extraArgs ?? []
  const argv = extraArgs.length ? [...preset.argv, "--", ...extraArgs] : [...preset.argv]
  return {
    id,
    createdAt: now.toISOString(),
    status: "queued",
    preset: input.preset,
    cwd: configuration.executionCwd,
    branch: git?.branch ?? "HEAD-detached",
    headSha: git?.headSha ?? "unknown",
    requestedBy: input.requestedBy ?? process.env.CI_QUEUE_REQUESTED_BY ?? "cli",
    command: argv.map(quoteArg).join(" "),
    extraArgs,
    logPath: join(paths.logs, `${id}.log`),
    schemaVersion: TICKET_SCHEMA_VERSION,
    executionDeadline: initialExecutionDeadline(preset.executionTimeoutMs),
    argv,
    flags: {
      ...(preset.executionTimeoutMs !== undefined ? { executionTimeoutMs: preset.executionTimeoutMs } : {}),
      ...(preset.requireCleanTree !== undefined ? { requireCleanTree: preset.requireCleanTree } : {}),
      ...(preset.fetchBase ? { fetchBase: preset.fetchBase } : {}),
      ...(preset.requireGitStability !== undefined ? { requireGitStability: preset.requireGitStability } : {}),
      ...(preset.pinHeadSha !== undefined ? { pinHeadSha: preset.pinHeadSha } : {}),
    },
    ...(preset.fetchBase || configuration.config.repository?.baseRef ? { baseRef: preset.fetchBase ?? configuration.config.repository?.baseRef } : {}),
    ...(configuration.config.artifacts ? { artifacts: configuration.config.artifacts } : {}),
    projectId: configuration.config.project.id,
    projectName: configuration.config.project.name,
    ...(input.requestContext ? { requestContext: input.requestContext } : {}),
  }
}

export function enqueueTicket(input: EnqueueInput): QueueTicket {
  const ticket = buildTicket(input)
  validateTicketAdmission(ticket)
  stageTicketWrite(input.stateRoot, ticket)
  writeFileSync(ticket.logPath, `[${new Date().toISOString()}] queued ${ticket.id} ${ticket.preset} ${ticket.branch} ${ticket.headSha}\n`, { encoding: "utf8", mode: 0o600 })
  return ticket
}

export function enqueueExplicitTicket(input: ExplicitEnqueueInput): QueueTicket {
  if (!input.recipe || !input.argv.length || input.argv.some((part) => !part || /[\u0000\n]/.test(part))) {
    throw new Error("recipe e argv não vazio são obrigatórios")
  }
  if (!input.projectId || !input.projectName) throw new Error("projectId e projectName são obrigatórios")
  if (!existsSync(input.cwd)) throw new Error(`cwd inexistente: ${input.cwd}`)
  const now = input.now ?? new Date()
  const paths = ensureQueueDirs(input.stateRoot)
  const git = readGitInfo(input.cwd, input.baseRef)
  const id = generateJobId(now)
  const ticket: QueueTicket = {
    id,
    createdAt: now.toISOString(),
    status: "queued",
    preset: input.recipe,
    cwd: input.cwd,
    branch: git?.branch ?? "HEAD-detached",
    headSha: git?.headSha ?? "unknown",
    requestedBy: input.requestedBy ?? process.env.CI_QUEUE_REQUESTED_BY ?? "adapter",
    command: input.argv.map(quoteArg).join(" "),
    logPath: join(paths.logs, `${id}.log`),
    schemaVersion: TICKET_SCHEMA_VERSION,
    executionDeadline: initialExecutionDeadline(input.flags?.executionTimeoutMs),
    argv: [...input.argv],
    flags: { ...(input.flags ?? {}) },
    ...(input.baseRef ? { baseRef: input.baseRef } : {}),
    ...(input.artifacts?.length ? { artifacts: [...input.artifacts] } : {}),
    projectId: input.projectId,
    projectName: input.projectName,
    ...(input.requestContext ? { requestContext: input.requestContext } : {}),
  }
  validateTicketAdmission(ticket)
  stageTicketWrite(input.stateRoot, ticket)
  writeFileSync(ticket.logPath, `[${new Date().toISOString()}] queued ${ticket.id} ${ticket.preset} ${ticket.branch} ${ticket.headSha}\n`, { encoding: "utf8", mode: 0o600 })
  return ticket
}
