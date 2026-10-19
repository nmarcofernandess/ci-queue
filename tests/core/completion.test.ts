import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { runCli, main } from "../../src/cli.js"
import type { QueueTicket, FinalizationRecord } from "../../src/contracts/schema.js"
import { executionCompletion, readExecutionSource, completionExitCode } from "../../src/core/completion.js"
import { listQueuedJobs, atomicWriteJson, historyPath, jobPath } from "../../src/core/state.js"

const cases = JSON.parse(readFileSync(new URL("../fixtures/finalization-completion.json", import.meta.url), "utf8"))
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); process.exitCode = 0 })

describe("composed completion", () => {
  it.each(cases)("$name", (sample) => {
    expect(executionCompletion(JSON.parse(sample.terminalBytes), sample.record ?? undefined, sample.terminalDigest ?? undefined)).toMatchObject(sample.expected)
    if (sample.terminalDigest === createHash("sha256").update(sample.terminalBytes).digest("hex")) {
      const root = mkdtempSync(join(tmpdir(), "completion-contract-")); roots.push(root)
      mkdirSync(join(root,"history")); mkdirSync(join(root,"state/finalization"),{recursive:true})
      writeFileSync(join(root,"history/job-1.json"),sample.terminalBytes)
      if (sample.record) writeFileSync(join(root,"state/finalization/job-1.json"),JSON.stringify(sample.record))
      const source = readExecutionSource(root,"job-1")!
      expect(executionCompletion(source.ticket,source.record,source.terminalDigest)).toMatchObject(sample.expected)
    }
  })
  it("binds history and hook to the exact source bytes, including formatting", () => {
    const root = mkdtempSync(join(tmpdir(), "completion-")); roots.push(root)
    mkdirSync(join(root,"history")); mkdirSync(join(root,"state/finalization"), {recursive:true})
    const sample = cases[0]
    writeFileSync(join(root,"history/job-1.json"), sample.terminalBytes)
    writeFileSync(join(root,"state/finalization/job-1.json"), JSON.stringify(sample.record))
    const source = readExecutionSource(root, "job-1")!
    expect(executionCompletion(source.ticket, source.record, source.terminalDigest).eligible).toBe(true)
    writeFileSync(join(root,"history/job-1.json"), sample.terminalBytes + " ")
    const changed = readExecutionSource(root, "job-1")!
    expect(executionCompletion(changed.ticket, changed.record, changed.terminalDigest).eligible).toBe(false)
  })
  it("preserves test failures and composes finalization failures into exit 1", () => {
    const ticket = JSON.parse(cases[0].terminalBytes)
    expect(completionExitCode(ticket, {state:"failed",eligible:false,testStatus:"passed"})).toBe(1)
    expect(completionExitCode({...ticket,status:"failed",exitCode:7}, {state:"failed",eligible:false,testStatus:"failed"})).toBe(7)
  })
  it.each([{phase:"passed",exit:0},{phase:"failed",exit:1}])("CLI wait exits $exit for hook $phase while test remains passed", async ({phase,exit}) => {
    const root = mkdtempSync(join(tmpdir(), "completion-exit-")); roots.push(root)
    const spec = JSON.parse(cases[0].terminalBytes).finalization
    const stdout = vi.spyOn(process.stdout,"write").mockImplementation(() => true)
    try {
      const pending = main(["enqueue","--recipe","check","--argv-json",'["check"]',"--project-id","fixture","--project-name","Fixture","--cwd",root,"--state",root,"--finalization-json",JSON.stringify(spec),"--wait","--timeout-ms","2000","--json"])
      const queued = listQueuedJobs(root)[0]
      atomicWriteJson(historyPath(root,queued.id), {...queued,status:"passed",exitCode:0})
      rmSync(jobPath(root,queued.id))
      mkdirSync(join(root,"state/finalization"),{recursive:true})
      const record = {...cases[0].record,phase,ticketId:queued.id,ticketDigest:createHash("sha256").update(readFileSync(historyPath(root,queued.id))).digest("hex"),finalizationDigest:queued.finalizationDigest}
      writeFileSync(join(root,"state/finalization",queued.id+".json"),JSON.stringify(record))
      await pending
      expect(process.exitCode).toBe(exit)
      expect(JSON.parse(readFileSync(historyPath(root,queued.id),"utf8")).status).toBe("passed")
    } finally { stdout.mockRestore() }
  })
  it("CLI wait stays pending until a real matching hook record arrives", async () => {
    const root = mkdtempSync(join(tmpdir(), "completion-cli-")); roots.push(root)
    const sample = cases[0]
    const original = JSON.parse(sample.terminalBytes) as QueueTicket
    const args = ["enqueue","--recipe","check","--argv-json",'["check"]',"--project-id","fixture","--project-name","Fixture","--cwd",root,"--state",root,"--finalization-json",JSON.stringify(original.finalization),"--wait","--timeout-ms","2000","--json"]
    let settled = false
    const pending = runCli(args).then(result => { settled = true; return result })
    const queued = listQueuedJobs(root)[0]
    const terminal = {...queued,status:"passed" as const,exitCode:0,finishedAt:new Date().toISOString()}
    atomicWriteJson(historyPath(root,queued.id), terminal)
    rmSync(jobPath(root,queued.id))
    await new Promise(resolve => setTimeout(resolve,150))
    expect(settled).toBe(false)
    mkdirSync(join(root,"state/finalization"),{recursive:true})
    const bytes = readFileSync(historyPath(root,queued.id))
    const record: FinalizationRecord = {...sample.record,ticketId:queued.id,ticketDigest:createHash("sha256").update(bytes).digest("hex"),finalizationDigest:queued.finalizationDigest}
    writeFileSync(join(root,"state/finalization",queued.id+".json"),JSON.stringify(record))
    const result = await pending
    expect(result).toMatchObject({ok:true,result:{terminal:{status:"passed",completion:{state:"complete"}}}})
    const status = await runCli(["status","--state",root])
    const unified = await runCli(["history","--include-observed","--state",root])
    expect(unified).toMatchObject({ok:true,result:{executions:[{completion:{state:"complete"}}]}})
    expect(status).toMatchObject({ok:true,result:{latest:{completion:{state:"complete"}}}})
  })
})
