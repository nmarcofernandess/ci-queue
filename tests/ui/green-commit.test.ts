import { describe, expect, it } from "vitest"

import { asMachineGreen, asGitGreen, greenIdentity, mergeGreenRows, filterGreens, staleMirrorNote } from "../../ui/src/features/status/green-rows"
import type { PresetHistoryEntry, RemoteGreen, RemoteSlotsSource } from "../../ui/src/lib/types"
import { groupGreenCommits } from "../../ui/src/features/status/green-commit"
import { describeIntegration } from "../../ui/src/features/shared/format"

describe("latest greens grouped by commit", () => {
  it("counts each visible canonical green once and preserves its provenance", () => {
    const groups = groupGreenCommits([
      {
        rowKey: "machine:smoke",
        preset: "smoke",
        status: "passed",
        headSha: "a".repeat(40),
        branch: "main",
        finishedAt: "2026-09-14T10:00:00Z",
        origin: "machine",
      },
      {
        rowKey: "git:full",
        preset: "full",
        status: "passed",
        headSha: "a".repeat(40),
        branch: "release",
        finishedAt: "2026-09-14T11:00:00Z",
        origin: "git",
        detailsAvailable: false,
      },
      {
        rowKey: "machine:static",
        preset: "static",
        status: "passed",
        headSha: "b".repeat(40),
        branch: "main",
        finishedAt: "2026-09-13T11:00:00Z",
        origin: "machine",
      },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      sha: "a".repeat(40),
      finishedAt: "2026-09-14T11:00:00Z",
      branches: ["main", "release"],
      origins: ["machine", "git"],
    })
    expect(groups[0].rows.map((row) => row.preset)).toEqual(["smoke", "full"])
    expect(groups[1].rows).toHaveLength(1)
  })
})


describe("project identity", () => {
  it("keeps the same SHA in separate project groups", () => {
    const groups = groupGreenCommits(["alpha", "beta"].map(projectId => ({
      projectId, projectName: projectId, preset: "full", status: "passed", headSha: "same-sha",
    })))
    expect(groups).toHaveLength(2)
    expect(groups.map(group => group.projectId)).toEqual(["alpha", "beta"])
  })
})


it("namespaces ticket identity and merges sources only within a project", () => {
  const alpha = { projectId: "alpha", projectName: "Alpha", preset: "full", id: "ticket1", headSha: "shaX", status: "passed", origins: ["machine" as const] }
  const beta = { ...alpha, projectId: "beta", projectName: "Beta" }
  expect(greenIdentity(alpha)).not.toBe(greenIdentity(beta))
  const rows = mergeGreenRows([alpha, beta, { ...alpha, id: undefined, ticketId: "ticket1", origins: ["git"], detailsAvailable: false }])
  expect(rows).toHaveLength(2)
  expect(rows[0].origins).toEqual(["machine", "git"])
  expect(rows[0].detailsJobId).toBe("ticket1")
  expect(filterGreens({ jobs: rows, search: "Beta", grouping: "preset", period: "all" })).toEqual([beta])
})

it("converts canonical machine and Git references with project identity", () => {
  const entry = { projectId: "alpha", projectName: "Alpha", preset: "full", lastGreenCanonical: { ticketId: "ticket1", status: "passed", headSha: "shaX" } } as PresetHistoryEntry
  const remote = { projectId: "alpha", projectName: "Alpha", preset: "full", ticketId: "ticket1", jobAvailable: false } as RemoteGreen & { projectName: string }
  expect(asMachineGreen(entry)).toMatchObject({ projectId: "alpha", projectName: "Alpha" })
  expect(asGitGreen(remote)).toMatchObject({ projectId: "alpha", projectName: "Alpha", detailsAvailable: false })
})

it("names when a stale Git mirror was read, preferring the refresh time", () => {
  const source = {
    kind: "git", available: true, stale: true, remote: "origin", namespace: "refs/ci/last-green",
    readAt: new Date(2026, 8, 13, 10, 1).toISOString(), refreshedAt: null, reason: null,
  } as RemoteSlotsSource
  expect(staleMirrorNote({ ...source, stale: false })).toBeNull()
  expect(staleMirrorNote(null)).toBeNull()
  expect(staleMirrorNote(source)).toBe("espelho desatualizado, lido em 13/09 10:01; os verdes refletem essa leitura.")
  expect(staleMirrorNote({ ...source, refreshedAt: new Date(2026, 8, 12, 8, 30).toISOString() }))
    .toBe("espelho desatualizado, lido em 12/09 08:30; os verdes refletem essa leitura.")
  expect(staleMirrorNote({ ...source, readAt: null }))
    .toBe("espelho desatualizado, sem horário de leitura; os verdes refletem a última leitura local.")
})

it("describes whether a green is in the base without claiming more than the local ref shows", () => {
  const base = {
    baseRef: "origin/dev", baseName: "dev",
    readAt: new Date(2026, 9, 26, 11, 33).toISOString(),
    via: "fetch --prune origin dev: fast-forward", reason: null,
  }
  expect(describeIntegration({ ...base, state: "integrated" })).toEqual({
    label: "Em dev", muted: false,
    detail: "Contido em origin/dev pela ref local de 26/10 11:33. Origem: fetch --prune origin dev: fast-forward.",
  })
  expect(describeIntegration({ ...base, state: "not-integrated", via: null })).toEqual({
    label: "Fora de dev", muted: false,
    detail: "Ainda fora de origin/dev pela ref local de 26/10 11:33.",
  })
  expect(describeIntegration({ ...base, state: "stale", via: null,
    reason: "A ref local de origin/dev não tem leitura das últimas 24 horas." })).toEqual({
    label: "Desatualizado", muted: true,
    detail: "A ref local de origin/dev não tem leitura das últimas 24 horas. Última leitura: 26/10 11:33.",
  })
  expect(describeIntegration({ ...base, state: "unknown", readAt: null,
    reason: "Sem o .git local do projeto." })).toEqual({
    label: "Desconhecido", muted: true, detail: "Sem o .git local do projeto.",
  })
})

it("keeps the integration when machine and Git rows of one green merge", () => {
  const integration = { state: "integrated", baseRef: "origin/dev", baseName: "dev",
    readAt: null, via: null, reason: null } as const
  const machine = asMachineGreen({ projectId: "alpha", projectName: "Alpha", preset: "full",
    lastGreenCanonical: { ticketId: "t1", status: "passed", headSha: "a".repeat(40), integration },
  } as PresetHistoryEntry)!
  const git = asGitGreen({ projectId: "alpha", preset: "full", ticketId: "t1", jobAvailable: false,
    headSha: "a".repeat(40), integration } as RemoteGreen)
  expect(mergeGreenRows([machine, git])[0].integration).toEqual(integration)
})
