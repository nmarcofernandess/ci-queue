import { describe, expect, it } from "vitest"

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
