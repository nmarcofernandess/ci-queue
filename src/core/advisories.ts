import { join } from "node:path"
import { readFileSync } from "node:fs"

import type { QueueProjectConfig } from "../contracts/schema.js"
import {
  acquireDirectoryLock,
  atomicWriteJson,
  ensureQueueDirs,
  queuePaths,
} from "./state.js"

export type AdvisoryRequirement = {
  sha: string
  reason: string
  createdAt: string
  pr?: number
}

export type PendingAdvisory = {
  projectId: string
  preset: string
  argv: string[]
  requirements: AdvisoryRequirement[]
}

export type ValidationPlan = {
  schemaVersion: 1
  pending: PendingAdvisory[]
  candidates: unknown[]
}

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

function statePath(root: string): string {
  return join(queuePaths(root).state, "validation-plan.json")
}

function emptyPlan(): ValidationPlan {
  return { schemaVersion: 1, pending: [], candidates: [] }
}

function readPlan(root: string): ValidationPlan {
  const path = statePath(root)
  let raw: ValidationPlan
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as ValidationPlan
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyPlan()
    throw new Error(`validation-plan.json ilegível em ${path}; arquivo preservado`)
  }
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.pending) || !Array.isArray(raw.candidates)) {
    throw new Error(`validation-plan.json inválido em ${path}; arquivo preservado`)
  }
  return raw
}

async function withPlanLock<T>(root: string, action: () => T | Promise<T>): Promise<T> {
  ensureQueueDirs(root)
  const lockPath = join(queuePaths(root).locks, "validation-plan.state")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const lock = acquireDirectoryLock(lockPath)
    if (lock) {
      try {
        return await action()
      } finally {
        lock.release()
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("validation-plan.json está ocupado; tente novamente")
}

export async function upsertAdvisory(input: {
  root: string
  config: QueueProjectConfig
  preset: string
  headSha: string
  reason: string
  pr?: number
  now?: Date
}): Promise<{
  recorded: true
  projectId: string
  preset: string
  requirement: AdvisoryRequirement
  statePath: string
}> {
  const recipe = input.config.presets[input.preset]
  if (!recipe) throw new Error(`preset não declarado: ${input.preset}`)
  const headSha = input.headSha.trim().toLowerCase()
  if (!SHA.test(headSha)) throw new Error("--head-sha precisa ser um SHA completo")
  const reason = input.reason.trim()
  if (!reason || reason.length > 500) throw new Error("--reason precisa ter entre 1 e 500 caracteres")
  if (input.pr !== undefined && (!Number.isSafeInteger(input.pr) || input.pr <= 0)) {
    throw new Error("--pr precisa ser um inteiro positivo")
  }

  return withPlanLock(input.root, () => {
    const plan = readPlan(input.root)
    let pending = plan.pending.find(
      (entry) => entry.projectId === input.config.project.id && entry.preset === input.preset,
    )
    if (!pending) {
      pending = {
        projectId: input.config.project.id,
        preset: input.preset,
        argv: [...recipe.argv],
        requirements: [],
      }
      plan.pending.push(pending)
    }

    // A pendência representa a receita atual. Se a receita evoluiu, o próximo
    // verde canônico deve executar a versão nova para quitar a recomendação.
    pending.argv = [...recipe.argv]
    const requirement: AdvisoryRequirement = {
      sha: headSha,
      reason,
      createdAt: (input.now ?? new Date()).toISOString(),
      ...(input.pr !== undefined ? { pr: input.pr } : {}),
    }
    pending.requirements = pending.requirements.filter((current) =>
      input.pr !== undefined
        ? current.pr !== input.pr
        : !(current.sha === headSha && current.reason === reason),
    )
    pending.requirements.push(requirement)
    atomicWriteJson(statePath(input.root), plan)
    return {
      recorded: true as const,
      projectId: input.config.project.id,
      preset: input.preset,
      requirement,
      statePath: statePath(input.root),
    }
  })
}

export function listAdvisories(root: string, projectId?: string): PendingAdvisory[] {
  return readPlan(root).pending.filter((entry) => !projectId || entry.projectId === projectId)
}
