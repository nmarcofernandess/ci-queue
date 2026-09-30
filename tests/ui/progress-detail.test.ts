import assert from "node:assert/strict"
import { describe, it } from "vitest"

import type { ProgressNode } from "../../ui/src/lib/types.ts"
import {
  deepestActiveContext,
  formatProgressDetail,
  stageContextDescription,
} from "../../ui/src/features/shared/progress-detail.ts"

describe("progress-detail", () => {
  it("shows known counts on a pending root and a planned descendant while Next runs", () => {
    const detail = { kind: "cases", completed: 0, total: 7, passed: 0, failed: 0, running: 0, pending: 7, skipped: 0 }
    const plannedRoot = { id: "playwright", label: "Playwright", kind: "stage", status: "pending", detail } as ProgressNode
    assert.equal(stageContextDescription(plannedRoot, [], []), "0 de 7")
    const root = { id: "e2e", label: "E2E", kind: "stage", status: "running" } as ProgressNode
    const active = [root, { id: "next", parentId: "e2e", label: "Next", kind: "stage", status: "running" } as ProgressNode]
    const planned = [{ ...plannedRoot, parentId: "e2e", rootId: "e2e" }]
    assert.equal(stageContextDescription(root, active, planned), "Next · Playwright: 0 de 7")
    assert.equal(stageContextDescription({ ...root, status: "passed", detail }, [], []), "0 de 7")
  })
  it("ignores running cases when choosing strip context", () => {
    const active = [
      { id: "e2e", kind: "stage", status: "running", label: "E2E" },
      {
        id: "playwright",
        parentId: "e2e",
        kind: "stage",
        status: "running",
        label: "Playwright",
        detail: { kind: "cases", completed: 3, total: 7 },
      },
      {
        id: "case-a",
        parentId: "playwright",
        kind: "case",
        status: "running",
        label: "deve salvar favorito…",
      },
      {
        id: "case-b",
        parentId: "playwright",
        kind: "case",
        status: "running",
        label: "outro",
      },
    ] as ProgressNode[]
    const ctx = deepestActiveContext("e2e", active)
    assert.equal(ctx?.id, "playwright")
    assert.equal(formatProgressDetail(ctx?.detail), "3 de 7")
  })

  it("formats string and count details", () => {
    assert.equal(formatProgressDetail(undefined), null)
    assert.equal(formatProgressDetail("waiting"), "waiting")
    assert.equal(
      formatProgressDetail({
        kind: "cases",
        completed: 3,
        total: 7,
        passed: 3,
        failed: 0,
        running: 0,
        pending: 4,
        skipped: 0,
      }),
      "3 de 7",
    )
  })
})
