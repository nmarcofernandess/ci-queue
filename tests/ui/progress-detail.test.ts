import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ProgressNode } from "../../ui/src/lib/types.ts"
import {
  deepestActiveContext,
  formatProgressDetail,
} from "../../ui/src/features/shared/progress-detail.ts"

describe("progress-detail", () => {
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
