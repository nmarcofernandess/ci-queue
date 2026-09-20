import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  observationId,
  parseExecutionObservation,
  toObservedHistoryRecord,
  type StoredExecutionObservation,
} from "../../src/contracts/execution-observation.js"

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/execution-observation-v1.json", import.meta.url), "utf8"),
)

describe("execution observation v1", () => {
  it("preserva identidade original e produz chave determinística", () => {
    const value = parseExecutionObservation(fixture)
    expect(value.executionId).toBe(fixture.executionId)
    expect(observationId(value.projectId, value.executionId)).toMatch(/^obs-[a-f0-9]{64}$/)
    expect(observationId(value.projectId, value.executionId)).toBe(
      observationId(value.projectId, value.executionId),
    )
    expect(observationId("other-project", value.executionId)).not.toBe(
      observationId(value.projectId, value.executionId),
    )
  })

  it.each([
    { status: "running" },
    { executor: "queue" },
    { exitCode: 1 },
    { durationMs: 999 },
    { executionId: "../escape" },
    { headSha: "invalid" },
    { logPath: "/private/secret" },
    { argv: ["npm", "run", "full"] },
    { progress: { nodes: [] } },
  ])("recusa payload fora do contrato: %j", (patch) => {
    expect(() => parseExecutionObservation({ ...fixture, ...patch })).toThrow()
  })

  it("normaliza ordem de chaves e timestamps com timezone para UTC", () => {
    const shuffled = {
      evidenceSha256: fixture.evidenceSha256,
      runtime: { node: "v24.20.0", arch: "x64", platform: "linux" },
      headSha: fixture.headSha,
      branch: fixture.branch,
      cwd: fixture.cwd,
      exitCode: 0,
      durationMs: 1000,
      finishedAt: "2026-09-20T06:00:01.000-03:00",
      startedAt: "2026-09-20T06:00:00.000-03:00",
      status: "passed",
      executor: "direct",
      recipe: fixture.recipe,
      projectName: fixture.projectName,
      projectId: fixture.projectId,
      executionId: fixture.executionId,
      kind: "ci-execution-observation",
      schemaVersion: 1,
    }
    const a = parseExecutionObservation(fixture)
    const b = parseExecutionObservation(shuffled)
    expect(b).toEqual(a)
    expect(b.startedAt).toBe("2026-09-20T09:00:00.000Z")
    expect(b.finishedAt).toBe("2026-09-20T09:00:01.000Z")
  })

  it("aceita failed com exit não zero e interrupted com exit null", () => {
    const failed = parseExecutionObservation({
      ...fixture,
      status: "failed",
      exitCode: 7,
      failureReason: "fixture-failed",
    })
    expect(failed.status).toBe("failed")
    expect(failed.exitCode).toBe(7)
    expect(failed.failureReason).toBe("fixture-failed")

    const interrupted = parseExecutionObservation({
      ...fixture,
      status: "interrupted",
      exitCode: null,
    })
    expect(interrupted.exitCode).toBeNull()
  })

  it("recusa duração negativa, booleans e controles", () => {
    expect(() =>
      parseExecutionObservation({
        ...fixture,
        finishedAt: "2026-09-20T08:59:59.000Z",
        durationMs: 0,
      }),
    ).toThrow()
    expect(() => parseExecutionObservation({ ...fixture, durationMs: true })).toThrow()
    expect(() => parseExecutionObservation({ ...fixture, projectName: "bad\nname" })).toThrow()
    expect(() =>
      parseExecutionObservation({
        ...fixture,
        runtime: { platform: "linux", arch: "x64", extra: "nope" },
      }),
    ).toThrow()
  })

  it("projeta registro de histórico observado", () => {
    const input = parseExecutionObservation(fixture)
    const stored: StoredExecutionObservation = {
      ...input,
      id: observationId(input.projectId, input.executionId),
      importedAt: "2026-09-20T10:00:00.000Z",
      payloadSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    }
    const record = toObservedHistoryRecord(stored)
    expect(record.recordKind).toBe("observed-execution")
    expect(record.executor).toBe("direct")
    expect(record.preset).toBe("smoketest")
    expect(record.executionId).toBe(fixture.executionId)
    expect(record.createdAt).toBe(fixture.startedAt)
    expect(record.progressEnabled).toBe(false)
    expect(record.logAvailability).toBe("not-collected")
    expect(record.id).toBe(stored.id)
  })
})
