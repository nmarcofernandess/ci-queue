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
})
