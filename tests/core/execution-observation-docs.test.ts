import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(import.meta.dirname, "../..")

function readDoc(relative: string): string {
  return readFileSync(join(root, relative), "utf8")
}

describe("execution observation live docs", () => {
  it("CONTRACTS names observe capability and opt-in history", () => {
    const contracts = readDoc("docs/CONTRACTS.md")
    expect(contracts).toContain("execution-observe-v1")
    expect(contracts).toContain("observe --stdin")
    expect(contracts).toContain("history --include-observed")
    expect(contracts).toContain("observations/")
    expect(contracts).toMatch(/não.*prova de ship/i)
  })

  it("CONSUMER-QUICKSTART shows generic observe publication", () => {
    const quickstart = readDoc("docs/CONSUMER-QUICKSTART.md")
    expect(quickstart).toContain("ci-queue observe --stdin")
    expect(quickstart).toContain("execution-observe-v1")
    expect(quickstart).toContain("history --include-observed")
    expect(quickstart).not.toContain("publish-execution-history")
  })

  it("INSTALL keeps launcher state and preserves observations", () => {
    const install = readDoc("docs/INSTALL.md")
    expect(install).toContain("CI_QUEUE_STATE_DIR")
    expect(install).toContain("observations/")
    expect(install).toMatch(/Preservar bundle anterior/)
  })
})
