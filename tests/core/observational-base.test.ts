import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { buildTicket, enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"
import { listHistoryJobs } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(command: string) {
  const root = mkdtempSync(join(tmpdir(), "cq-observed-base-"))
  roots.push(root)
  const state = join(root, "state")
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
  git("init", "-q")
  git("config", "user.name", "Fixture")
  git("config", "user.email", "fixture@example.invalid")
  writeFileSync(join(root, ".gitignore"), "state/\n")
  writeFileSync(join(root, "ci-queue.json"), JSON.stringify({
    schemaVersion: 1, project: { id: "fixture", name: "Fixture" },
    repository: { path: ".", baseRef: "refs/remotes/origin/dev" },
    presets: { isolated: { argv: [process.execPath, "-e", command], requireCleanTree: true, requireGitStability: true, pinHeadSha: true } },
  }))
  git("add", ".")
  git("commit", "-qm", "fixture")
  const head = git("rev-parse", "HEAD")
  const ahead = git("commit-tree", "HEAD^{tree}", "-p", head, "-m", "base ahead")
  git("update-ref", "refs/remotes/origin/dev", ahead)
  return { root, state, git, head, ahead }
}

it("freezes a base ahead of HEAD and preserves success when its tracking ref changes", async () => {
  const f = fixture("require('node:child_process').execFileSync('git',['update-ref','refs/remotes/origin/dev','HEAD'])")
  const ticket = enqueueTicket({ preset: "isolated", cwd: f.root, stateRoot: f.state })
  expect(ticket.baseRef).toBe(f.ahead)
  await runWorker(f.state)
  expect(listHistoryJobs(f.state)[0]).toMatchObject({ status: "passed", exitCode: 0, preflight: { baseSha: f.ahead }, postflight: { baseSha: f.ahead } })
  expect(f.git("rev-parse", "HEAD")).toBe(f.head)
})

it.each([
  ["tree", "require('node:fs').writeFileSync('changed.txt','changed')"],
  ["HEAD", "require('node:child_process').execFileSync('git',['commit','--allow-empty','-qm','changed'])"],
])("still rejects changes to %s", async (_label, command) => {
  const f = fixture(command)
  enqueueTicket({ preset: "isolated", cwd: f.root, stateRoot: f.state })
  await runWorker(f.state)
  expect(listHistoryJobs(f.state)[0].status).toBe("failed")
})

it("preserves a failing child exit", async () => {
  const f = fixture("process.exit(23)")
  enqueueTicket({ preset: "isolated", cwd: f.root, stateRoot: f.state })
  await runWorker(f.state)
  expect(listHistoryJobs(f.state)[0]).toMatchObject({ status: "failed", exitCode: 23 })
})

it("keeps strict fetch refs and absent observations without inventing a SHA", () => {
  const f = fixture("process.exit(0)")
  const path = join(f.root, "ci-queue.json")
  const config = { schemaVersion: 1, project: { id: "fixture", name: "Fixture" }, repository: { baseRef: "missing" }, presets: { strict: { argv: ["true"], fetchBase: "origin/dev" }, absent: { argv: ["true"] } } }
  writeFileSync(path, JSON.stringify(config))
  expect(buildTicket({ preset: "strict", cwd: f.root, stateRoot: f.state }).baseRef).toBe("origin/dev")
  expect(buildTicket({ preset: "absent", cwd: f.root, stateRoot: f.state }).baseRef).toBeUndefined()
})

it("leaves explicit enqueue's observational policy to its caller", () => {
  const f = fixture("process.exit(0)")
  const ticket = enqueueExplicitTicket({ recipe: "explicit", argv: ["true"], projectId: "fixture", projectName: "Fixture", cwd: f.root, stateRoot: f.state })
  expect(ticket.baseRef).toBeUndefined()
})
