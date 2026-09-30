import { execFile } from "node:child_process"

export const SPEND_ABORT_CAPABILITY = "spend-abort-v1" as const
export const STALE_BASE_FAILURE_REASON = "stale-base" as const

export type BaseRef = { remote: string; branch: string; headsRef: string }

export type RemoteObservation =
  | { kind: "known"; sha: string; isAncestor: boolean }
  | { kind: "unknown"; reason: "network" | "missing-object" | "incomplete-history" | "invalid-ref" | "timeout" }

export type SpendAbortDecision =
  | { action: "continue"; reason: "flag-off" | "remote-unreadable" | "remote-is-ancestor" }
  | { action: "abort"; reason: "stale-base"; remoteSha: string }

const GIT_ENV = { ...process.env, LC_ALL: "C", LANG: "C" }
const SHA_RE = /^[0-9a-f]{40,64}$/i

type GitResult = { status: number; stdout: string; stderr: string }

export function decideSpendAbort(input: {
  abortOnStaleBase: boolean
  remoteBaseSha: string | null
  isRemoteAncestorOfHead: boolean | null
}): SpendAbortDecision {
  if (!input.abortOnStaleBase) return { action: "continue", reason: "flag-off" }
  if (input.remoteBaseSha === null || input.isRemoteAncestorOfHead === null) {
    return { action: "continue", reason: "remote-unreadable" }
  }
  if (input.isRemoteAncestorOfHead) return { action: "continue", reason: "remote-is-ancestor" }
  return { action: "abort", reason: STALE_BASE_FAILURE_REASON, remoteSha: input.remoteBaseSha }
}

export function resolveRemoteBase(fetchBase: string, remotes: readonly string[]): BaseRef {
  if (fetchBase === "") {
    throw new Error("fetchBase vazio não resolve para refs/heads/dev")
  }
  if (!fetchBase.includes("/")) {
    throw new Error(`fetchBase sem barra: ${fetchBase}`)
  }
  const matches = remotes
    .filter((remote) => remote.length > 0 && (fetchBase === remote || fetchBase.startsWith(`${remote}/`)))
    .sort((left, right) => right.length - left.length)
  const remote = matches[0]
  if (!remote) {
    throw new Error(`remote desconhecido em fetchBase: ${fetchBase}`)
  }
  const branch = fetchBase.slice(remote.length + 1)
  if (!branch) {
    throw new Error(`fetchBase sem branch: ${fetchBase}`)
  }
  return { remote, branch, headsRef: `refs/heads/${branch}` }
}

export async function observeRemoteBase(input: {
  cwd: string
  base: BaseRef
  headSha: string
  ticketId: string
  signal: AbortSignal
  timeoutMs: number
}): Promise<RemoteObservation> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), input.timeoutMs)
  timer.unref()
  const signal = AbortSignal.any([input.signal, timeout.signal])
  const git = (args: readonly string[]) => runGit(input.cwd, args, signal)
  try {
    if (signal.aborted) return { kind: "unknown", reason: "timeout" }

    const listed = await git(["ls-remote", "--exit-code", input.base.remote, input.base.headsRef])
    if (listed.status === 2) return { kind: "unknown", reason: "invalid-ref" }
    if (listed.status !== 0) {
      return { kind: "unknown", reason: looksLikeNetwork(listed.stderr) ? "network" : "invalid-ref" }
    }
    const sha = listed.stdout.trim().split(/\s+/, 1)[0] ?? ""
    if (!SHA_RE.test(sha)) return { kind: "unknown", reason: "invalid-ref" }

    let exists = await git(["cat-file", "-e", sha])
    if (exists.status !== 0) {
      const fetched = await git([
        "fetch",
        "--no-tags",
        "--no-write-fetch-head",
        "--refmap=",
        input.base.remote,
        `+${input.base.headsRef}:refs/ci-queue/observed/${input.ticketId}`,
      ])
      if (fetched.status !== 0) {
        return { kind: "unknown", reason: looksLikeNetwork(fetched.stderr) ? "network" : "missing-object" }
      }
      exists = await git(["cat-file", "-e", sha])
      if (exists.status !== 0) return { kind: "unknown", reason: "missing-object" }
    }

    const ancestry = await git(["merge-base", "--is-ancestor", sha, input.headSha])
    if (ancestry.status === 0) return { kind: "known", sha, isAncestor: true }
    if (ancestry.status === 1) {
      const shallow = await git(["rev-parse", "--is-shallow-repository"])
      if (shallow.stdout.trim() === "true") {
        return { kind: "unknown", reason: "incomplete-history" }
      }
      return { kind: "known", sha, isAncestor: false }
    }
    if (looksLikeMissingObject(ancestry.stderr)) return { kind: "unknown", reason: "missing-object" }
    return { kind: "unknown", reason: "incomplete-history" }
  } catch (error) {
    if (isAbortError(error) || signal.aborted) return { kind: "unknown", reason: "timeout" }
    return { kind: "unknown", reason: "network" }
  } finally {
    clearTimeout(timer)
  }
}

function runGit(cwd: string, args: readonly string[], signal: AbortSignal): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, encoding: "utf8", signal, env: GIT_ENV }, (error, stdout, stderr) => {
      const result = { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }
      if (isAbortError(error) || signal.aborted) {
        reject(error ?? new DOMException("The operation was aborted.", "AbortError"))
        return
      }
      if (!error) {
        resolve({ status: 0, ...result })
        return
      }
      const status = numericCode(error)
      if (status !== undefined) {
        resolve({ status, ...result })
        return
      }
      reject(error)
    })
  })
}

function numericCode(error: object): number | undefined {
  if (!("code" in error)) return undefined
  return typeof error.code === "number" ? error.code : undefined
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if ("name" in error && error.name === "AbortError") return true
  return "code" in error && error.code === "ABORT_ERR"
}

function looksLikeNetwork(stderr: string): boolean {
  return /unable to access|could not resolve|couldn't connect|connection refused|failed to connect|could not read from remote|network is unreachable|the remote end hung up|timed out|ssl|tls/i.test(stderr)
}

function looksLikeMissingObject(stderr: string): boolean {
  return /not a valid commit name|bad object|missing/i.test(stderr)
}
