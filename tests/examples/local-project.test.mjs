import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const cli = join(root, "bin", "ci-queue.mjs")
const example = join(root, "examples", "local-project")

function invoke(args) {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args, "--json"], { cwd: root, encoding: "utf8" }))
}

test("the standalone example records success, failure and an awaited recipe", () => {
  const state = mkdtempSync(join(tmpdir(), "ci-queue-example-state-"))
  try {
    for (const preset of ["success", "failure", "wait"]) {
      const result = invoke(["enqueue", preset, "--cwd", example, "--state", state])
      assert.equal(result.ok, true)
    }
    const worker = invoke(["worker", "--state", state])
    assert.equal(worker.ok, true)
    const history = invoke(["history", "--project", "ci-queue-example", "--state", state])
    assert.equal(history.ok, true)
    assert.deepEqual(history.result.jobs.map((job) => job.status).sort(), ["failed", "passed", "passed"])
  } finally {
    rmSync(state, { recursive: true, force: true })
  }
})
