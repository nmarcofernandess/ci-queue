import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"

import { runCli } from "../../src/cli.ts"
import { enqueueExplicitTicket } from "../../src/core/enqueue.ts"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function tempPair() {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-rv-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-rv-state-"))
  cleanup.push(project, state)
  return { project, state }
}

describe("enqueue runVariant", () => {
  it("persists custom and focal on explicit enqueue", () => {
    const { project, state } = tempPair()
    for (const runVariant of ["custom", "focal"] as const) {
      const ticket = enqueueExplicitTicket({
        recipe: "check",
        argv: [process.execPath, "-e", "process.exit(0)"],
        projectId: "fixture-project",
        projectName: "Fixture",
        cwd: project,
        stateRoot: state,
        runVariant,
      })
      assert.equal(ticket.runVariant, runVariant)
    }
  })

  it("omits runVariant when unset", () => {
    const { project, state } = tempPair()
    const ticket = enqueueExplicitTicket({
      recipe: "check",
      argv: [process.execPath, "-e", "process.exit(0)"],
      projectId: "fixture-project",
      projectName: "Fixture",
      cwd: project,
      stateRoot: state,
    })
    assert.equal(ticket.runVariant, undefined)
  })

  it("rejects unknown --run-variant with USAGE", async () => {
    const { project, state } = tempPair()
    const result = await runCli([
      "enqueue",
      "--recipe",
      "check",
      "--argv-json",
      JSON.stringify([process.execPath, "-e", "process.exit(0)"]),
      "--project-id",
      "fixture-project",
      "--project-name",
      "Fixture",
      "--cwd",
      project,
      "--state",
      state,
      "--run-variant",
      "batata",
      "--json",
    ])
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.error.code, "USAGE")
    assert.equal(result.error.message, "--run-variant precisa ser custom ou focal")
  })

  it("accepts --run-variant focal via CLI", async () => {
    const { project, state } = tempPair()
    const result = await runCli([
      "enqueue",
      "--recipe",
      "check",
      "--argv-json",
      JSON.stringify([process.execPath, "-e", "process.exit(0)"]),
      "--project-id",
      "fixture-project",
      "--project-name",
      "Fixture",
      "--cwd",
      project,
      "--state",
      state,
      "--run-variant",
      "focal",
      "--json",
    ])
    assert.equal(result.ok, true)
    if (!result.ok) return
    const ticket = (result.result as { ticket: { runVariant?: string } }).ticket
    assert.equal(ticket.runVariant, "focal")
  })
})
