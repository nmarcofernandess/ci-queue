import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("never-merge", () => {
  it("worker and runner do not import ship or call gh merge", () => {
    const worker = readFileSync(new URL("../../src/core/worker.ts", import.meta.url), "utf8")
    const runner = readFileSync(new URL("../../src/core/runner.ts", import.meta.url), "utf8")
    for (const source of [worker, runner]) {
      expect(source).not.toMatch(/from ["'].*ship\//)
      expect(source).not.toMatch(/gh api.*\/merge/)
      expect(source).not.toMatch(/pr merge/)
      expect(source).not.toMatch(/runShip/)
    }
  })
})
