export type QuerySnapshot<T> = {
  data: T | undefined
  error: Error | undefined
  refreshing: boolean
  version: number
}

type Entry<T> = {
  snapshot: QuerySnapshot<T>
  listeners: Set<() => void>
  request?: (signal?: AbortSignal) => Promise<T>
  pollMs?: number
  pollWhile?: (data: T) => boolean
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
      listeners: new Set(),
      dirty: false,
      lastUsed: Date.now(),
    }
    entries.set(key, entry as Entry<unknown>)
  }
  entry.lastUsed = Date.now()
  return entry
}

function publish<T>(entry: Entry<T>, next: Omit<QuerySnapshot<T>, "version">) {
  entry.snapshot = { ...next, version: entry.snapshot.version + 1 }
  entry.listeners.forEach((listener) => listener())
}

function prune() {
  const inactive = [...entries.entries()]
    .filter(([, entry]) => entry.listeners.size === 0 && !entry.promise)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed)
  for (const [key, entry] of inactive.slice(0, Math.max(0, inactive.length - MAX_INACTIVE))) {
    if (entry.timer) clearTimeout(entry.timer)
    entries.delete(key)
  }
}

function schedule<T>(key: string, entry: Entry<T>) {
  if (entry.timer) clearTimeout(entry.timer)
  if (!entry.pollMs || entry.listeners.size === 0 || !entry.request) return
  if (entry.snapshot.data !== undefined && entry.pollWhile && !entry.pollWhile(entry.snapshot.data)) return
  entry.timer = setTimeout(() => {
    entry.timer = undefined
    if (typeof document !== "undefined" && document.hidden) return
    void load(key, entry)
  }, entry.pollMs)
}

async function load<T>(key: string, entry: Entry<T>): Promise<void> {
  if (!entry.request || entry.listeners.size === 0) return
  if (typeof document !== "undefined" && document.hidden) return
  if (entry.promise) {
    entry.dirty = true
    return entry.promise
  }
  publish(entry, { ...entry.snapshot, refreshing: true })
  entry.controller = typeof AbortController === "undefined" ? undefined : new AbortController()
  entry.promise = entry.request(entry.controller?.signal).then(
    (data) => publish(entry, { data, error: undefined, refreshing: false }),
    (reason) => {
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
      if (value.listeners.size > 0 && value.pollMs) void load(key, value)
    }
  })
}

export const queryStore = {
  configure<T>(key: string, request: (signal?: AbortSignal) => Promise<T>, pollMs?: number, pollWhile?: (data: T) => boolean) {
    const entry = entryFor<T>(key)
    entry.request = request
    entry.pollMs = pollMs
    entry.pollWhile = pollWhile
    installVisibilityListener()
  },
  snapshot<T>(key: string) {
    return entryFor<T>(key).snapshot
  },
  subscribe<T>(key: string, listener: () => void) {
    const entry = entryFor<T>(key)
    entry.listeners.add(listener)
    if (entry.listeners.size === 1) void load(key, entry)
    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0 && entry.timer) {
        clearTimeout(entry.timer)
        entry.timer = undefined
      }
      if (entry.listeners.size === 0 && entry.controller) entry.controller.abort()
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
