import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { readFileSync as readFixture } from "node:fs"
import { observationId } from "../../src/contracts/execution-observation.js"
import {
  ObservationError,
  listExecutionHistory,
  storeExecutionObservation,
} from "../../src/core/execution-observations.js"

const fixture = JSON.parse(
  readFixture(new URL("../fixtures/execution-observation-v1.json", import.meta.url), "utf8"),
)

const roots: string[] = []
afterEach(() => {
  while (roots.length) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ci-observe-"))
  roots.push(root)
  return root
}

describe("execution observations store", () => {
  it("publica um JSON e repete como already-present sem alterar bytes", () => {
    const root = tempRoot()
    const first = storeExecutionObservation(root, fixture, new Date("2026-09-20T10:00:00Z"))
    const path = join(root, "observations", first.id + ".json")
    const before = readFileSync(path)
    const again = storeExecutionObservation(root, fixture, new Date("2026-09-21T10:00:00Z"))
    expect(again.outcome).toBe("already-present")
    expect(again.id).toBe(first.id)
    expect(readFileSync(path)).toEqual(before)
    for (const name of ["jobs", "running.json", "history", "logs", "progress"]) {
      expect(existsSync(join(root, name))).toBe(false)
    }
  })

  it("conflita quando o mesmo id chega com conteúdo diferente", () => {
    const root = tempRoot()
    storeExecutionObservation(root, fixture, new Date("2026-09-20T10:00:00Z"))
    expect(() =>
      storeExecutionObservation(root, { ...fixture, status: "failed", exitCode: 1 }),
    ).toThrow(ObservationError)
    try {
      storeExecutionObservation(root, { ...fixture, status: "failed", exitCode: 1 })
    } catch (error) {
      expect(error).toBeInstanceOf(ObservationError)
      expect((error as ObservationError).code).toBe("OBSERVATION_CONFLICT")
    }
    const path = join(
      root,
      "observations",
      observationId(fixture.projectId, fixture.executionId) + ".json",
    )
    expect(JSON.parse(readFileSync(path, "utf8")).status).toBe("passed")
  })

  it("recusa final corrompido ou symlink sem substituir", () => {
    const root = tempRoot()
    const id = observationId(fixture.projectId, fixture.executionId)
    const dir = join(root, "observations")
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(join(dir, `${id}.json`), "{not-json", { mode: 0o600 })
    expect(() => storeExecutionObservation(root, fixture)).toThrow(ObservationError)
    try {
      storeExecutionObservation(root, fixture)
    } catch (error) {
      expect((error as ObservationError).code).toBe("OBSERVATION_UNREADABLE")
    }

    const root2 = tempRoot()
    const dir2 = join(root2, "observations")
    mkdirSync(dir2, { recursive: true, mode: 0o700 })
    const target = join(root2, "elsewhere.json")
    writeFileSync(target, "{}")
    symlinkSync(target, join(dir2, `${id}.json`))
    expect(() => storeExecutionObservation(root2, fixture)).toThrow(ObservationError)
  })

  it("history --include-observed une ticket e observação", () => {
    const root = tempRoot()
    mkdirSync(join(root, "history"), { recursive: true })
    writeFileSync(
      join(root, "history", "ticket-1.json"),
      JSON.stringify({
        id: "ticket-1",
        createdAt: "2026-09-20T08:00:00.000Z",
        finishedAt: "2026-09-20T08:00:02.000Z",
        status: "passed",
        preset: "check",
        cwd: "/tmp",
        branch: "dev",
        headSha: "cccccccccccccccccccccccccccccccccccccccc",
        requestedBy: "test",
        command: "npm test",
        logPath: "/tmp/log",
        projectId: "fixture-project",
        projectName: "Projeto de teste",
        source: "queue",
      }),
    )
    storeExecutionObservation(root, fixture)
    const executions = listExecutionHistory(root, "fixture-project")
    expect(executions.map((item) => item.recordKind).sort()).toEqual([
      "observed-execution",
      "queue-ticket",
    ])
    expect(listExecutionHistory(root, "other-project")).toHaveLength(0)
  })
})
