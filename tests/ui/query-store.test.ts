import { afterEach, describe, expect, it, vi } from "vitest"

import { queryStore } from "../../ui/src/lib/query-store"

afterEach(() => queryStore.clearForTests())

describe("canonical query store", () => {
  it("shares one in-flight request between subscribers", async () => {
    let resolve!: (value: string) => void
    const request = vi.fn(() => new Promise<string>((done) => { resolve = done }))
    queryStore.configure("same", request)
    const first = queryStore.subscribe("same", () => undefined)
    const second = queryStore.subscribe("same", () => undefined)
    expect(request).toHaveBeenCalledTimes(1)
    resolve("ready")
    await vi.waitFor(() => expect(queryStore.snapshot<string>("same").data).toBe("ready"))
    first(); second()
  })

  it("coalesces invalidation during fetch into one follow-up", async () => {
    const resolvers: Array<(value: number) => void> = []
    const request = vi.fn(() => new Promise<number>((done) => resolvers.push(done)))
    queryStore.configure("dirty", request)
    const stop = queryStore.subscribe("dirty", () => undefined)
    queryStore.reload("dirty")
    queryStore.reload("dirty")
    resolvers[0](1)
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    resolvers[1](2)
    await vi.waitFor(() => expect(queryStore.snapshot<number>("dirty").data).toBe(2))
    stop()
  })

  it("preserves known data beside a refresh error", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce("known")
      .mockRejectedValueOnce(new Error("offline"))
    queryStore.configure("error", request)
    const stop = queryStore.subscribe("error", () => undefined)
    await vi.waitFor(() => expect(queryStore.snapshot<string>("error").data).toBe("known"))
    queryStore.reload("error")
    await vi.waitFor(() => expect(queryStore.snapshot<string>("error").error?.message).toBe("offline"))
    expect(queryStore.snapshot<string>("error").data).toBe("known")
    stop()
  })

  it("aborts only after the last subscriber leaves", async () => {
    let signal: AbortSignal | undefined
    const request = vi.fn((nextSignal?: AbortSignal) => {
      signal = nextSignal
      return new Promise<string>((_resolve, reject) => nextSignal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"))
      }))
    })
    queryStore.configure("abort", request)
    const first = queryStore.subscribe("abort", () => undefined)
    const second = queryStore.subscribe("abort", () => undefined)
    first()
    expect(signal?.aborted).toBe(false)
    second()
    expect(signal?.aborted).toBe(true)
  })

  it("A11a: resumes unpolled query started while hidden when visibility changes", async () => {
    class MockDocument extends EventTarget {
      hidden = true
    }
    const mockDoc = new MockDocument()
    const originalDoc = (globalThis as any).document
    ;(globalThis as any).document = mockDoc

    try {
      const request = vi.fn().mockResolvedValue("resumed-data")
      queryStore.configure("unpolled-hidden", request)
      const stop = queryStore.subscribe("unpolled-hidden", () => undefined)
      // Started while hidden: should not have called request yet
      expect(request).toHaveBeenCalledTimes(0)

      // Tab becomes visible
      mockDoc.hidden = false
      mockDoc.dispatchEvent(new Event("visibilitychange"))

      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(queryStore.snapshot<string>("unpolled-hidden").data).toBe("resumed-data"))
      stop()
    } finally {
      ;(globalThis as any).document = originalDoc
    }
  })

  it("A11b: visibility change respects pollWhile predicate on terminal data", async () => {
    class MockDocument extends EventTarget {
      hidden = false
    }
    const mockDoc = new MockDocument()
    const originalDoc = (globalThis as any).document
    ;(globalThis as any).document = mockDoc

    try {
      const request = vi.fn().mockResolvedValue({ status: "passed" })
      queryStore.configure(
        "terminal-job",
        request,
        5000,
        (job: { status: string }) => job.status === "running"
      )
      const stop = queryStore.subscribe("terminal-job", () => undefined)
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      expect(queryStore.snapshot<{ status: string }>("terminal-job").data?.status).toBe("passed")

      // Visibility event fires
      mockDoc.dispatchEvent(new Event("visibilitychange"))
      // Because pollWhile returned false for passed status, request must NOT have been called again
      expect(request).toHaveBeenCalledTimes(1)
      stop()
    } finally {
      ;(globalThis as any).document = originalDoc
    }
  })

  it("A11c: late resolution after cancel/unsubscribe does not publish obsolete data", async () => {
    let resolveSlow!: (value: string) => void
    const slowRequest = vi.fn(
      () => new Promise<string>((resolve) => { resolveSlow = resolve })
    )
    const fastRequest = vi.fn().mockResolvedValue("fresh")

    // First subscriber starts slow request
    const unsub1 = queryStore.subscribe("stale-race", () => undefined, { request: slowRequest })
    expect(slowRequest).toHaveBeenCalledTimes(1)

    // Unsubscribe first subscriber
    unsub1()

    // Second subscriber starts fresh request
    const unsub2 = queryStore.subscribe("stale-race", () => undefined, { request: fastRequest })

    // Slow request resolves late with "stale"
    resolveSlow("stale")

    // Fresh request should be published, stale must never overwrite fresh
    await vi.waitFor(() => expect(queryStore.snapshot<string>("stale-race").data).toBe("fresh"))
    expect(queryStore.snapshot<string>("stale-race").data).toBe("fresh")
    unsub2()
  })

  it("A11d: configure without subscription does not mutate an active resource's schedule", async () => {
    const activeRequest = vi.fn().mockResolvedValue("active")
    const speculativeRequest = vi.fn().mockResolvedValue("speculative")

    const unsub = queryStore.subscribe("active-key", () => undefined, {
      request: activeRequest,
      pollMs: 1000,
    })
    await vi.waitFor(() => expect(activeRequest).toHaveBeenCalledTimes(1))

    // Speculative configure call (e.g. from disabled hook)
    queryStore.configure("active-key", speculativeRequest, 99999)

    // Reload active resource
    queryStore.reload("active-key")
    await vi.waitFor(() => expect(activeRequest).toHaveBeenCalledTimes(2))
    expect(speculativeRequest).toHaveBeenCalledTimes(0)
    unsub()
  })
})
