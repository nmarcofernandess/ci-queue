import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function catalog(project: string, extra: object) {
  writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
    schemaVersion: 1,
    project: { id: "fixture-project", name: "Fixture" },
    presets: {
      check: {
        argv: [process.execPath, "-e", "process.exit(0)"],
        fetchBase: "dest/dev",
        ...extra,
      },
    },
  }))
}

it("persists abortOnStaleBase from ci-queue.json onto the ticket", () => {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  catalog(project, { abortOnStaleBase: true })
  const ticket = enqueueTicket({ preset: "check", cwd: project, stateRoot: state })
  expect(ticket.flags?.abortOnStaleBase).toBe(true)
  expect(ticket.argv).toEqual([process.execPath, "-e", "process.exit(0)"])
})

it("persists abortOnStaleBase on enqueueExplicitTicket", () => {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  const ticket = enqueueExplicitTicket({
    recipe: "check",
    argv: [process.execPath, "-e", "process.exit(0)"],
    projectId: "fixture-project",
    projectName: "Fixture",
    cwd: project,
    stateRoot: state,
    flags: { abortOnStaleBase: true, fetchBase: "dest/dev" },
  })
  expect(ticket.flags?.abortOnStaleBase).toBe(true)
})
