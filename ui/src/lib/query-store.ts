export type QuerySnapshot<T> = {
  data: T | undefined
  error: Error | undefined
  refreshing: boolean
  version: number
}

export type SubscriberConfig<T> = {
  request: (signal?: AbortSignal) => Promise<T>
  pollMs?: number
  pollWhile?: (data: T) => boolean
}

type Entry<T> = {
  snapshot: QuerySnapshot<T>
  subscribers: Map<() => void, SubscriberConfig<T>>
  configuredRequest?: (signal?: AbortSignal) => Promise<T>
  configuredPollMs?: number
  configuredPollWhile?: (data: T) => boolean
  requestGeneration: number
  promise?: Promise<void>
  controller?: AbortController
  timer?: ReturnType<typeof setTimeout>
  dirty: boolean
  lastUsed: number
}

const MAX_INACTIVE = 128
const entries = new Map<string, Entry<unknown>>()

function entryFor<T>(key: string): Entry<T> {
  let entry = entries.get(key) as Entry<T> | undefined
  if (!entry) {
    entry = {
      snapshot: { data: undefined, error: undefined, refreshing: false, version: 0 },
      subscribers: new Map(),
      requestGeneration: 0,
      dirty: false,
      lastUsed: Date.now(),
    }
    entries.set(key, entry as Entry<unknown>)
  }
  entry.lastUsed = Date.now()
  return entry
}

function activeConfig<T>(entry: Entry<T>): SubscriberConfig<T> | undefined {
  if (entry.subscribers.size > 0) {
    const configs = [...entry.subscribers.values()]
    const lastConfig = configs[configs.length - 1]
    const pollIntervals = configs
      .map((c) => c.pollMs)
      .filter((ms): ms is number => typeof ms === "number" && ms > 0)
    const minPollMs = pollIntervals.length > 0 ? Math.min(...pollIntervals) : undefined
    const pollWhileFns = configs
      .map((c) => c.pollWhile)
      .filter((fn): fn is (data: T) => boolean => typeof fn === "function")
    const combinedPollWhile =
      pollWhileFns.length > 0
        ? (data: T) => pollWhileFns.every((fn) => fn(data))
        : undefined
    return {
      request: lastConfig.request,
      pollMs: minPollMs,
      pollWhile: combinedPollWhile,
    }
  }
  if (entry.configuredRequest) {
    return {
      request: entry.configuredRequest,
      pollMs: entry.configuredPollMs,
      pollWhile: entry.configuredPollWhile,
    }
  }
  return undefined
}

function publish<T>(entry: Entry<T>, next: Omit<QuerySnapshot<T>, "version">) {
  entry.snapshot = { ...next, version: entry.snapshot.version + 1 }
  for (const listener of entry.subscribers.keys()) {
    listener()
  }
}

function prune() {
  const inactive = [...entries.entries()]
    .filter(([, entry]) => entry.subscribers.size === 0 && !entry.promise)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed)
  for (const [key, entry] of inactive.slice(0, Math.max(0, inactive.length - MAX_INACTIVE))) {
    if (entry.timer) clearTimeout(entry.timer)
    entries.delete(key)
  }
}

function schedule<T>(key: string, entry: Entry<T>) {
  if (entry.timer) clearTimeout(entry.timer)
  const config = activeConfig(entry)
  if (!config || !config.pollMs || entry.subscribers.size === 0 || !config.request) return
  if (entry.snapshot.data !== undefined && config.pollWhile && !config.pollWhile(entry.snapshot.data)) return
  entry.timer = setTimeout(() => {
    entry.timer = undefined
    if (typeof document !== "undefined" && document.hidden) return
    void load(key, entry)
  }, config.pollMs)
}

async function load<T>(key: string, entry: Entry<T>): Promise<void> {
  const config = activeConfig(entry)
  if (!config || !config.request || entry.subscribers.size === 0) return
  if (typeof document !== "undefined" && document.hidden) return
  if (entry.promise) {
    entry.dirty = true
    return entry.promise
  }
  publish(entry, { ...entry.snapshot, refreshing: true })
  const currentGen = ++entry.requestGeneration
  const controller = typeof AbortController === "undefined" ? undefined : new AbortController()
  entry.controller = controller
  entry.promise = config.request(controller?.signal).then(
    (data) => {
      if (entry.requestGeneration !== currentGen || controller?.signal.aborted) return
      publish(entry, { data, error: undefined, refreshing: false })
    },
    (reason) => {
      if (entry.requestGeneration !== currentGen || controller?.signal.aborted) return
      if (reason instanceof Error && reason.name === "AbortError") return
      publish(entry, {
        data: entry.snapshot.data,
        error: reason instanceof Error ? reason : new Error("Falha ao ler a bridge."),
        refreshing: false,
      })
    }
  ).finally(() => {
    entry.promise = undefined
    entry.controller = undefined
    if (entry.dirty) {
      entry.dirty = false
      void load(key, entry)
    } else {
      schedule(key, entry)
    }
    prune()
  })
  return entry.promise
}

let visibilityInstalled = false
function installVisibilityListener() {
  if (visibilityInstalled || typeof document === "undefined") return
  visibilityInstalled = true
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return
    for (const [key, value] of entries) {
      if (value.subscribers.size === 0) continue
      const config = activeConfig(value)
      if (!config) continue
      const needsInitialLoad = value.snapshot.data === undefined && !value.snapshot.error && !value.promise
      const canPoll =
        Boolean(config.pollMs) &&
        (value.snapshot.data === undefined ||
          !config.pollWhile ||
          (config.pollWhile as (data: unknown) => boolean)(value.snapshot.data))
      if (needsInitialLoad || canPoll) {
        void load(key, value)
      }
    }
  })
}

export const queryStore = {
  configure<T>(key: string, request: (signal?: AbortSignal) => Promise<T>, pollMs?: number, pollWhile?: (data: T) => boolean) {
    const entry = entryFor<T>(key)
    if (entry.subscribers.size === 0) {
      entry.configuredRequest = request
      entry.configuredPollMs = pollMs
      entry.configuredPollWhile = pollWhile
    }
    installVisibilityListener()
  },
  snapshot<T>(key: string) {
    return entryFor<T>(key).snapshot
  },
  subscribe<T>(key: string, listener: () => void, config?: SubscriberConfig<T>) {
    const entry = entryFor<T>(key)
    if (config) {
      entry.subscribers.set(listener, config)
    } else if (entry.configuredRequest) {
      entry.subscribers.set(listener, {
        request: entry.configuredRequest,
        pollMs: entry.configuredPollMs,
        pollWhile: entry.configuredPollWhile,
      })
    } else {
      entry.subscribers.set(listener, {
        request: () => Promise.reject(new Error("No request configured")),
      })
    }
    const isFirst = entry.subscribers.size === 1
    if (isFirst) {
      void load(key, entry)
    } else {
      schedule(key, entry)
    }
    return () => {
      entry.subscribers.delete(listener)
      if (entry.subscribers.size === 0) {
        entry.requestGeneration += 1
        if (entry.timer) {
          clearTimeout(entry.timer)
          entry.timer = undefined
        }
        if (entry.controller) {
          entry.controller.abort()
          entry.controller = undefined
        }
      } else {
        schedule(key, entry)
      }
      prune()
    }
  },
  reload<T>(key: string) {
    const entry = entryFor<T>(key)
    entry.dirty = Boolean(entry.promise)
    if (!entry.promise) void load(key, entry)
  },
  clearForTests() {
    for (const entry of entries.values()) if (entry.timer) clearTimeout(entry.timer)
    entries.clear()
  },
}

const pagePromises = new Map<string, Promise<unknown>>()

export function sharedPageRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const current = pagePromises.get(key) as Promise<T> | undefined
  if (current) return current
  const promise = request().finally(() => pagePromises.delete(key))
  pagePromises.set(key, promise)
  return promise
}
