import { realpathSync } from "node:fs"
import { resolve } from "node:path"

import type { QueueProjectConfig } from "../contracts/schema.js"
import { readRunningJob } from "./state.js"
import { identityIsCurrent } from "./process.js"

export const EXECUTION_ENTRY_GUARD_CAPABILITY = "execution-entry-guard-v1"

export type ExecutionPolicy = {
  executor: "queue"
  queue?: { command?: string }
}

export type GuardInput = {
  config: QueueProjectConfig
  stateRoot: string
  cwd: string
  env: NodeJS.ProcessEnv
  nowMs?: () => number
  sleepMs?: (ms: number) => Promise<void>
}

export type GuardResult =
  | { allowed: true; reason: "not-required" | "queue-job" | "github-actions" }
  | { allowed: false; code: "QUEUE_REQUIRED"; message: string }

function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function sameCwd(left: string, right: string): boolean {
  return real(left) === real(right)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function remoteActionsContext(env: NodeJS.ProcessEnv, cwd: string): boolean {
  if (env.GITHUB_ACTIONS !== "true") return false
  if (!env.GITHUB_RUN_ID?.trim()) return false
  if (!env.GITHUB_WORKSPACE?.trim()) return false
  try {
    return sameCwd(env.GITHUB_WORKSPACE, cwd)
  } catch {
    return false
  }
}

function matchesRunningTicket(
  stateRoot: string,
  config: QueueProjectConfig,
  cwd: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const jobId = env.CI_QUEUE_JOB_ID?.trim() || env.DIETFLOW_CI_QUEUE_JOB_ID?.trim()
  if (!jobId) return false
  const running = readRunningJob(stateRoot)
  if (!running || running.id !== jobId) return false
  if (running.projectId && running.projectId !== config.project.id) return false
  if (!sameCwd(running.cwd, cwd)) return false
  if (running.processGroupIdentity && !identityIsCurrent(running.processGroupIdentity)) {
    return false
  }
  return true
}

export async function evaluateExecutionEntry(input: GuardInput): Promise<GuardResult> {
  const policy = input.config.execution
  if (!policy || policy.executor !== "queue") {
    return { allowed: true, reason: "not-required" }
  }

  const cwd = real(input.cwd)
  if (remoteActionsContext(input.env, cwd)) {
    return { allowed: true, reason: "github-actions" }
  }

  const now = input.nowMs ?? Date.now
  const wait = input.sleepMs ?? sleep
  const deadline = now() + 1_000
  while (now() <= deadline) {
    if (matchesRunningTicket(input.stateRoot, input.config, cwd, input.env)) {
      return { allowed: true, reason: "queue-job" }
    }
    if (now() >= deadline) break
    await wait(50)
  }

  const command = policy.queue?.command?.trim() || "ci-queue"
  return {
    allowed: false,
    code: "QUEUE_REQUIRED",
    message: [
      "QUEUE_REQUIRED: este check local precisa ser executado pelo CI Queue.",
      `Projeto: ${input.config.project.name}`,
      `Cwd: ${cwd}`,
      `Comando: ${command} enqueue <preset> --cwd '${cwd}' --config '<config>' --state '<state>' --wait`,
      "Para trabalho não commitado: usar a receita review, que não é prova de ship.",
    ].join("\n"),
  }
}
