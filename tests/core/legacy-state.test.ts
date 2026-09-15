import { mkdtempSync, rmSync, writeFileSync, readFileSync, utimesSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { ensureQueueDirs, listHistoryJobs, readHistoryJob } from "../../src/core/state.js"
import { recoverProgressTemporaries } from "../../src/core/worker.js"
const roots: string[] = []
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
function fixture() { const root = mkdtempSync(join(tmpdir(), "ci-legacy-")); roots.push(root); ensureQueueDirs(root); return root }
describe("legacy ownership and recovery", () => {
  it("attributes only explicit IDs and leaves raw tickets unchanged", () => {
    const root = fixture(), path = join(root, "history", "old.json")
    const raw = JSON.stringify({ id: "old", status: "passed", createdAt: "2026-01-01", headSha: "abcd" })
    writeFileSync(path, raw)
    expect(listHistoryJobs(root, "example")).toHaveLength(0)
    writeFileSync(join(root, "state", "legacy-projects.json"), JSON.stringify({ schemaVersion: 1, assignments: { old: { projectId: "example", headSha: "abcd", evidence: "verified commit" } } }))
    expect(listHistoryJobs(root, "example")).toHaveLength(1)
    expect(readHistoryJob(root, "old")?.projectId).toBe("example")
    expect(readFileSync(path, "utf8")).toBe(raw)
  })
  it("preserves valid progress and live-producer temporaries while quarantining a dead writer", () => {
    const root = fixture(), prefix = join(root, "progress")
    const dead = "old.json.2147483647.abcdef123456.tmp", live = `live.json.${process.pid}.abcdef123456.tmp`
    for (const name of [dead, live, "unknown.tmp", "old.json"]) {
      writeFileSync(join(prefix, name), "{}")
      utimesSync(join(prefix, name), new Date(0), new Date(0))
    }
    expect(recoverProgressTemporaries(root)).toEqual([dead])
    expect(existsSync(join(root, "jobs-rejected", `progress-${dead}`))).toBe(true)
    for (const name of [live, "unknown.tmp", "old.json"]) expect(existsSync(join(prefix, name))).toBe(true)
  })
})
