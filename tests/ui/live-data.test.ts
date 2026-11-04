import { describe, expect, it } from "vitest"
import { appendLog, LOG_BUFFER_LIMIT } from "../../ui/src/features/shared/log-buffer"
import { jobDuration, formatRelativeTime } from "../../ui/src/features/shared/format"

const chunk = (content: string, offset: number, complete = false) => ({ schemaVersion: 1, jobId: "job", content, offset, nextOffset: offset + content.length, sourceBytes: offset + content.length, complete, error: null })
describe("live facts", () => {
  it("advances running duration locally, keeps terminal duration and never invents a start", () => {
    const job = { status: "running" as const, startedAt: "2026-09-15T00:00:00Z" }
    const now = Date.parse(job.startedAt)
    expect(jobDuration(job, now + 61000)).toBe("1m 1s")
    expect(jobDuration({ ...job, status: "passed", durationMs: 2000 }, now + 61000)).toBe("2s")
    expect(jobDuration({ status: "cancelled", durationMs: 0 }, now)).toBe("Não iniciada")
    expect(jobDuration({ status: "running" }, now)).toBe("Sem duração")
    expect(jobDuration({ status: "running" }, now, true)).toBe("—")
    expect(jobDuration({ status: "cancelled", durationMs: 0 }, now, true)).toBe("—")
    expect(jobDuration({ status: "passed", durationMs: 0 }, now, true)).toBe("0 ms")
  })
  it("updates relative units without a network request", () => {
    const value = "2026-09-15T00:00:00Z", start = Date.parse(value)
    for (const [seconds, label] of [[10, "agora"], [120, "há 2 min"], [7200, "há 2 h"], [86400, "há 1 dia"], [1900800, "há 22 dias"], [2592000, "há 1 mês"], [31536000, "há 1 ano"]] as const) {
      expect(formatRelativeTime(value, start + seconds * 1000)).toBe(label)
    }
  })
  it("appends by byte cursor and keeps reading beyond the original 8 MiB ceiling with a bounded visible tail", () => {
    let value = appendLog(undefined, chunk("a".repeat(LOG_BUFFER_LIMIT), 0))
    value = appendLog(value, chunk("b".repeat(LOG_BUFFER_LIMIT), value.nextOffset))
    value = appendLog(value, chunk("last line", value.nextOffset, true))
    expect(value.content.endsWith("last line")).toBe(true)
    expect(value.content.startsWith("[Trecho anterior fora do buffer")).toBe(true)
    expect(value.content.length).toBeLessThan(LOG_BUFFER_LIMIT + 100)
    expect(value.nextOffset).toBe(2 * LOG_BUFFER_LIMIT + 9)
    expect(value.complete).toBe(true)
  })
  it("distinguishes absent logs from successful empty logs and rejects a regressed cursor", () => {
    expect(appendLog(undefined, { ...chunk("", 0), error: "log não encontrado" }).error).toBe("log não encontrado")
    expect(appendLog(undefined, chunk("", 0, true)).error).toBeNull()
    expect(() => appendLog(chunk("abc", 0), chunk("x", 0))).toThrow("cursor")
  })
})

describe("paused clock", () => {
  it("stops at the pause and discounts closed windows", () => {
    const startedAt = "2026-10-26T10:00:00Z", start = Date.parse(startedAt)
    const pause = { state: "paused" as const, pausedAt: "2026-10-26T10:01:30Z", pausedMsTotal: 20_000 }
    expect(jobDuration({ status: "running", startedAt, pause }, start + 600_000)).toBe("1m 10s")
    expect(jobDuration({ status: "running", startedAt, pause: { ...pause, state: "running" as const } }, start + 120_000)).toBe("1m 40s")
  })
})
