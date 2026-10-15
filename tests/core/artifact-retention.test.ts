import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanupExpiredArtifacts, ARTIFACT_RETENTION_MS } from "../../src/core/artifact-retention.js"
import { atomicWriteJson, ensureQueueDirs, historyPath, readHistoryJob } from "../../src/core/state.js"
import { runCli } from "../../src/cli.js"
import { runWorker } from "../../src/core/worker.js"
import type { QueueTicket } from "../../src/contracts/schema.js"

const cleanup: string[] = []
const now = Date.parse("2026-10-15T12:00:00Z")
afterEach(() => { for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture(status: QueueTicket["status"] = "failed", expires = now - 1) {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-retention-")); cleanup.push(root)
  const paths = ensureQueueDirs(root)
  const ticket: QueueTicket = {
    id: "20261012-test", status, preset: "test", cwd: root, branch: "test", headSha: "abc",
    requestedBy: "test", createdAt: new Date(now - 3 * ARTIFACT_RETENTION_MS).toISOString(),
    command: "node", extraArgs: [], logPath: join(paths.logs, "20261012-test.log"),
    finishedAt: new Date(now - ARTIFACT_RETENTION_MS - 1).toISOString(),
    exitCode: status === "passed" ? 0 : 1,
    artifactsPath: join(paths.artifacts, "20261012-test"),
    artifactRetention: { expiresAt: new Date(expires).toISOString() },
  }
  mkdirSync(ticket.artifactsPath!, { recursive: true }); writeFileSync(join(ticket.artifactsPath!, "trace.zip"), "raw trace")
  writeFileSync(ticket.logPath, "failure context")
  atomicWriteJson(historyPath(root, ticket.id), ticket)
  return { root, paths, ticket }
}
describe("artifact retention", () => {
  it.each(["passed", "failed", "cancelled", "interrupted"] as const)("expires %s staging, preserving ticket verdict and log", async status => {
    const { root, ticket } = fixture(status)
    expect(await cleanupExpiredArtifacts(root, now)).toEqual({ expired: [ticket.id], errors: [] })
    expect(existsSync(ticket.artifactsPath!)).toBe(false)
    expect(readHistoryJob(root, ticket.id)).toMatchObject({ status, exitCode: ticket.exitCode, artifactRetention: { expiredAt: new Date(now).toISOString() } })
    expect(readFileSync(ticket.logPath, "utf8")).toBe("failure context")
    expect((await cleanupExpiredArtifacts(root, now)).expired).toEqual([])
  })
  it("keeps fresh snapshots, unclassified legacy evidence and running jobs", async () => {
    for (const mode of ["fresh", "legacy", "running", "invalid-expiry"] as const) {
      const { root, ticket, paths } = fixture("failed", mode === "fresh" ? now + 1 : now - 1)
      if (mode === "legacy") delete ticket.artifactRetention
      if (mode === "invalid-expiry") ticket.artifactRetention = { expiresAt: "invalid" }
      atomicWriteJson(historyPath(root, ticket.id), ticket)
      if (mode === "running") atomicWriteJson(paths.running, { ...ticket, status: "running" })
      expect((await cleanupExpiredArtifacts(root, now)).expired).toEqual([])
      expect(existsSync(ticket.artifactsPath!)).toBe(true)
    }
  })
  it("previews without deleting or rewriting the ticket", async () => {
    const { root, ticket } = fixture()
    const before = readFileSync(historyPath(root, ticket.id), "utf8")
    expect((await cleanupExpiredArtifacts(root, now, true)).expired).toEqual([ticket.id])
    expect(existsSync(ticket.artifactsPath!)).toBe(true)
    expect(readFileSync(historyPath(root, ticket.id), "utf8")).toBe(before)
  })
  it("does not trust an external artifactsPath", async () => {
    const { root, ticket } = fixture()
    ticket.artifactsPath = join(root, "outside"); atomicWriteJson(historyPath(root, ticket.id), ticket)
    expect((await cleanupExpiredArtifacts(root, now)).errors[0]?.message).toMatch(/canônico/)
    expect(existsSync(join(root, "artifacts", ticket.id))).toBe(true)
  })
  it("refuses a symlink snapshot, and unlinks nested symlinks without following them", async () => {
    const { root, ticket } = fixture()
    const outside = join(root, "source-proof"); mkdirSync(outside); writeFileSync(join(outside, "proof.txt"), "published")
    rmSync(ticket.artifactsPath!, { recursive: true }); symlinkSync(outside, ticket.artifactsPath!)
    expect((await cleanupExpiredArtifacts(root, now)).errors[0]?.message).toMatch(/symlink/)
    rmSync(ticket.artifactsPath!); mkdirSync(ticket.artifactsPath!); symlinkSync(outside, join(ticket.artifactsPath!, "link"))
    expect((await cleanupExpiredArtifacts(root, now)).errors).toEqual([])
    expect(readFileSync(join(outside, "proof.txt"), "utf8")).toBe("published")
  })
  it("advertises retention and exposes the same dry-run through the CLI", async () => {
    const { root, ticket } = fixture()
    const version = await runCli(["version", "--json"])
    expect(version).toMatchObject({ ok: true, result: { capabilities: expect.arrayContaining(["artifact-retention-v1"]) } })
    expect(await runCli(["artifacts", "cleanup", "--dry-run", "--state", root, "--json"])).toMatchObject({ ok: true, result: { expired: [ticket.id] } })
    expect(existsSync(ticket.artifactsPath!)).toBe(true)
  })
  it("cleans expired staging when an idle worker wakes", async () => {
    const { root, ticket } = fixture()
    const report = await runWorker(root)
    expect(report.processed).toEqual([])
    expect(report.artifactCleanup?.expired).toEqual([ticket.id])
    expect(existsSync(ticket.artifactsPath!)).toBe(false)
  })
})
