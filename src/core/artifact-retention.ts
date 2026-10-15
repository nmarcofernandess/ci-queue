import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"

import type { QueueTicket } from "../contracts/schema.js"
import { isTerminalStatus } from "../contracts/schema.js"
import { atomicWriteJson, historyPath, listHistoryJobs, queuePaths, readHistoryJob, readRunningJob, withTicketLock } from "./state.js"

export const ARTIFACT_RETENTION_CAPABILITY = "artifact-retention-v1" as const
export const ARTIFACT_RETENTION_MS = 48 * 60 * 60_000

export type ArtifactCleanupReport = {
  expired: string[]
  errors: Array<{ id: string; message: string }>
}

/** Only queue snapshots with an explicit expiry are disposable; legacy evidence stays untouched. */
function expired(ticket: QueueTicket, now: number): boolean {
  const retention = ticket.artifactRetention
  const finished = Date.parse(ticket.finishedAt ?? "")
  const expiry = Date.parse(retention?.expiresAt ?? "")
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(ticket.id)
    && isTerminalStatus(ticket.status)
    && Number.isFinite(finished) && finished <= now
    && Number.isFinite(expiry) && expiry >= finished && expiry <= now
    && !retention?.expiredAt
}

/** rm may unlink symlinks, but must never traverse a mounted foreign filesystem. */
function assertOwnedTree(path: string, device: number): void {
  const info = lstatSync(path)
  if (info.isSymbolicLink()) return
  if (info.dev !== device) throw new Error(`snapshot cruza filesystem: ${path}`)
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) assertOwnedTree(join(path, name), device)
  } else if (!info.isFile()) throw new Error(`tipo de arquivo não suportado: ${path}`)
}

export async function cleanupExpiredArtifacts(root: string, now = Date.now(), dryRun = false): Promise<ArtifactCleanupReport> {
  const report: ArtifactCleanupReport = { expired: [], errors: [] }
  const paths = queuePaths(root)
  if (!existsSync(paths.artifacts)) return report
  const artifactsInfo = lstatSync(paths.artifacts)
  if (artifactsInfo.isSymbolicLink() || !artifactsInfo.isDirectory()) {
    report.errors.push({ id: "artifacts", message: "raiz de snapshots não é diretório próprio" })
    return report
  }
  for (const ticket of listHistoryJobs(root)) {
    if (!expired(ticket, now)) continue
    try {
      const changed = await withTicketLock(root, ticket.id, () => {
        const current = readHistoryJob(root, ticket.id)
        if (!current || !expired(current, now) || readRunningJob(root)?.id === ticket.id) return false
        const path = join(paths.artifacts, ticket.id)
        if (current.artifactsPath && resolve(current.artifactsPath) !== resolve(path)) {
          throw new Error("artifactsPath fora do snapshot canônico; preservado")
        }
        if (existsSync(path)) {
          if (lstatSync(path).isSymbolicLink()) throw new Error("snapshot é symlink; preservado")
          assertOwnedTree(path, artifactsInfo.dev)
          if (!dryRun) rmSync(path, { recursive: true, force: true })
        }
        if (!dryRun) atomicWriteJson(historyPath(root, current.id), {
          ...current,
          artifactRetention: { ...current.artifactRetention!, expiredAt: new Date(now).toISOString() },
        })
        return true
      })
      if (changed) report.expired.push(ticket.id)
      else if (changed === undefined) report.errors.push({ id: ticket.id, message: "ticket ocupado; limpeza adiada" })
    } catch (error) {
      report.errors.push({ id: ticket.id, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return report
}
