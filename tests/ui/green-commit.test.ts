import { describe, expect, it } from "vitest"

import { asMachineGreen, asGitGreen, greenIdentity, mergeGreenRows, filterGreens, staleMirrorNote } from "../../ui/src/features/status/green-rows"
import type { PresetHistoryEntry, RemoteGreen, RemoteSlotsSource } from "../../ui/src/lib/types"
import { groupGreenCommits } from "../../ui/src/features/status/green-commit"

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
  expect(staleMirrorNote(source)).toBe("espelho lido em 13/09 10:01; os verdes refletem essa leitura.")
  expect(staleMirrorNote({ ...source, refreshedAt: new Date(2026, 8, 12, 8, 30).toISOString() }))
    .toBe("espelho lido em 12/09 08:30; os verdes refletem essa leitura.")
  expect(staleMirrorNote({ ...source, readAt: null }))
    .toBe("espelho sem horário de leitura; os verdes refletem a última leitura local.")
})
