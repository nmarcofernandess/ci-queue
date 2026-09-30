# CI Queue plug-and-play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a product CLI kit (`init` + eligibility + explicit `ship` + spend-abort + progress helper) that a third repo can use without copying DietFlow’s harness, without treating a preset **name** as proof, and without promising an atomic H+B merge GitHub does not offer.

**Architecture:** Recipes stay in the consumer. The product persists execution facts, observes remote base without moving tracking, and orchestrates merge behind injected async IO. Dashboard and worker never gain merge authority.

**Tech Stack:** Existing Node/TypeScript CLI (`src/cli.ts`, vitest in `tests/core`). Python API / Vite UI untouched except contract docs. Real Git in temp fixtures. GitHub only behind `ShipOps` fakes in tests.

**Spec:** `docs/superpowers/specs/2026-09-17-ci-queue-plug-and-play-design.md`

## Global Constraints

- Branch from current `origin/dev` after reconciling occupancy/timing edits on shared files. PR to `dev`, draft until review. No install, no `main`, no live LaunchAgent.
- Do not import DietFlow. Do not edit `~/dietflow-app`. Do not add DietFlow `keepGoing` or npm/npx-only argv rules.
- Do not change `/api/status` occupancy, project filter, or add a dashboard ship CTA.
- Do not infer progress from npm logs. No `CHECK_WITH_PROGRESS_CMD` or production env that swaps the recipe.
- Worker and runner must not import `src/ship` and must not call `gh` / merge APIs.
- Axis B unknown → continue. Axis C unknown → do not merge.
- `failureReason` for axis B is exactly `stale-base`; status `failed`; exit `1`.
- Proof = project + cwd + H + remote-tip B0 + executed argv + git snapshots + catalog at H.
- Merge adapter: `gh api` PUT merge with `sha=H`, `merge_method=merge`. Guarantee is head-pinned, base observed before and inspected after. Report `MERGED_BASE_CHANGED` instead of lying.
- `--dry-run` never writes refs, tickets, statuses, ready, dispatch, or merge. Reads are allowed.
- Announce `spend-abort-v1` only in the commit that the worker actually observes.
- Preserve ticket v1/v2/v3 readability. New flag optional on old tickets.
- Tests must not touch `~/.local/state/local-ci/queue`. Fix `HOME` / state / cwd to temp dirs.
- Do not overwrite `.github/workflows/ci.yml` from `init --workflow`.
- This plan does not authorize live GitHub writes or mutating the operator state root.

## File map

| File | Responsibility |
| --- | --- |
| `src/contracts/schema.ts` | `abortOnStaleBase` on `TicketFlags`; `ShipConfig` on `QueueProjectConfig` |
| `src/contracts/config.ts` | Parse flag + `ship` block; reject invalid ship-bound catalogs |
| `src/core/enqueue.ts` | Copy flag on `buildTicket` and `enqueueExplicitTicket` |
| `src/core/spend-abort.ts` | Pure `decideSpendAbort` + `observeRemoteBase` (private fetch) |
| `src/core/runner.ts` | Async observer; verified terminate; etapa-2 close preserved |
| `src/ship/eligibility.ts` | Pure proof vs accepted recipes |
| `src/ship/ops.ts` | `ShipOps`, `ShipTarget`, `ShipReport`, `ShipError` |
| `src/ship/ship.ts` | `runShip` orchestration |
| `src/ship/system-ops.ts` | Real git/gh/queue adapters (argv arrays, timeouts) |
| `src/ship/init.ts` | Catalog writer; registry **read-only** |
| `src/cli.ts` | `init`, `ship`; capabilities |
| `templates/github/ci-queue-verdict.yml` | Portable attestation verifier |
| `scripts/progress-emit.sh` | One protocol line |
| `scripts/ci/check-with-progress.sh` | Only sequence of self-host `check` |
| `scripts/release.mjs` | Allowlist new assets |
| `.github/workflows/ci.yml` | Correlation only; keep complete-check fallback |
| `docs/CONSUMER-QUICKSTART.md` | Zero-to-ship + residual base race |
| `docs/CONTRACTS.md` | Axes A/B/C, eligibility, never-merge, guarantee limit |
| `tests/core/spend-abort.test.ts` | Flag persist + observe + abort |
| `tests/core/ship-config.test.ts` | Catalog `ship` block |
| `tests/core/eligibility.test.ts` | Proof matrix including argv/custom/later red |
| `tests/core/ship.test.ts` | Fake GitHub + frozen target |
| `tests/core/init.test.ts` | Identity / argv / base |
| `tests/core/never-merge.test.ts` | Import graph + call-site guard |
| `tests/examples/init-ship.test.mjs` | Real runner ticket + dry-run reuse |
| `tests/release/*` | Bundle without source checkout |

Do not add Python/UI files unless a fixture needs a static string.

```text
T0 baseline
  → T1 schema/config/flags
    → T2 observe remote base
      → T3 runner observer
        → T4 eligibility
          → T5 async ship
            → T6 init
              → T7 template + bundle
                → T8 progress self-host
                  → T9 journey + docs
```

---

### Task 0: Baseline and isolation

**Files:** none in the product. Record facts in the implementation notes.

- [ ] **Step 1: Inventory shared files**

Run:

```bash
git status --short
git rev-parse HEAD
git merge-base --is-ancestor origin/dev HEAD; echo $?
git worktree list --porcelain
```

Do not reset another worktree. If occupancy still has uncommitted edits to
`src/core/runner.ts`, rebase/reconcile **before** Task 3. Do not implement
on top of an ignored delta.

- [ ] **Step 2: Confirm the holes still exist**

```bash
rg "abortOnStaleBase" src/contracts/schema.ts src/contracts/config.ts src/core/enqueue.ts
rg "releasePaths" -A 20 scripts/release.mjs
rg "enqueueExplicitTicket" src/core/enqueue.ts src/cli.ts
```

Expected: flag declared in `ci-queue.json` but dropped by parser; `templates/`
absent from `releasePaths`; explicit enqueue still takes separate `recipe`+`argv`.

- [ ] **Step 3: Isolate later CLI tests**

Any test that spawns the CLI/worker must set `HOME`, state root, and cwd to
directories created in that test. Never the operator queue.

No commit required if nothing in the repo changed.

---

### Task 1: Persist `abortOnStaleBase` and parse `ship`

**Files:**
- Modify: `src/contracts/schema.ts`
- Modify: `src/contracts/config.ts`
- Modify: `src/core/enqueue.ts`
- Test: `tests/core/spend-abort.test.ts`
- Test: `tests/core/ship-config.test.ts`

**Interfaces:**

```ts
export type ShipConfig = {
  acceptedPresets: string[]
  attestationContext: string
  remoteVerdict?: { workflow: string; job: string }
}

// QueueProjectConfig.ship?: ShipConfig
// TicketFlags.abortOnStaleBase?: boolean
```

- [ ] **Step 1: Write the failing tests**

In `tests/core/spend-abort.test.ts`:

```ts
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function catalog(project: string, extra: object) {
  writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
    schemaVersion: 1,
    project: { id: "fixture-project", name: "Fixture" },
    presets: {
      check: {
        argv: [process.execPath, "-e", "process.exit(0)"],
        fetchBase: "dest/dev",
        ...extra,
      },
    },
  }))
}

it("persists abortOnStaleBase from ci-queue.json onto the ticket", () => {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  catalog(project, { abortOnStaleBase: true })
  const ticket = enqueueTicket({ preset: "check", cwd: project, stateRoot: state })
  expect(ticket.flags?.abortOnStaleBase).toBe(true)
  expect(ticket.argv).toEqual([process.execPath, "-e", "process.exit(0)"])
})

it("persists abortOnStaleBase on enqueueExplicitTicket", () => {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  const ticket = enqueueExplicitTicket({
    recipe: "check",
    argv: [process.execPath, "-e", "process.exit(0)"],
    projectId: "fixture-project",
    projectName: "Fixture",
    cwd: project,
    stateRoot: state,
    flags: { abortOnStaleBase: true, fetchBase: "dest/dev" },
  })
  expect(ticket.flags?.abortOnStaleBase).toBe(true)
})
```

In `tests/core/ship-config.test.ts`: a catalog with `ship.acceptedPresets: ["check"]`
and `attestationContext: "local/check"` parses; empty presets, unknown preset,
`abortOnStaleBase: true` without `fetchBase`, non-boolean flag, workflow with
`..`, and empty context all throw.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/spend-abort.test.ts tests/core/ship-config.test.ts`

Expected: FAIL (`abortOnStaleBase` undefined; `ship` dropped)

- [ ] **Step 3: Minimal implementation**

Add `abortOnStaleBase?: boolean` to `TicketFlags`. In `normalizeTicketFlags`,
`optionalBoolean(raw, "abortOnStaleBase")`. In `readPresets`, copy it like
`requireGitStability`; if true and no `fetchBase`, throw.

Parse optional `ship`: unique non-empty `acceptedPresets` that exist in
`presets`, attestation context 1–100 chars with no newline, optional
`remoteVerdict.workflow` under `.github/workflows/` ending in `.yml`/`.yaml`
without `..`, non-empty `job`. Missing `ship` stays valid for enqueue-only
catalogs.

`buildTicket` copies `preset.abortOnStaleBase`. Explicit enqueue already
goes through `normalizeTicketFlags` — do not drop the new field there.

Do **not** add the capability string yet.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/spend-abort.test.ts tests/core/ship-config.test.ts tests/core/queue-engine.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/contracts/schema.ts src/contracts/config.ts src/core/enqueue.ts \
  tests/core/spend-abort.test.ts tests/core/ship-config.test.ts
git commit -m "$(cat <<'EOF'
feat: persist abortOnStaleBase and parse the ship catalog block

EOF
)"
```

---

### Task 2: Remote observation and pure spend-abort

**Files:**
- Create: `src/core/spend-abort.ts`
- Test: `tests/core/spend-abort.test.ts` (extend)

**Interfaces:**

```ts
export const SPEND_ABORT_CAPABILITY = "spend-abort-v1" as const
export const STALE_BASE_FAILURE_REASON = "stale-base" as const

export type BaseRef = { remote: string; branch: string; headsRef: string }

export type RemoteObservation =
  | { kind: "known"; sha: string; isAncestor: boolean }
  | { kind: "unknown"; reason: "network" | "missing-object" | "incomplete-history" | "invalid-ref" | "timeout" }

export type SpendAbortDecision =
  | { action: "continue"; reason: "flag-off" | "remote-unreadable" | "remote-is-ancestor" }
  | { action: "abort"; reason: "stale-base"; remoteSha: string }

export function decideSpendAbort(input: {
  abortOnStaleBase: boolean
  remoteBaseSha: string | null
  isRemoteAncestorOfHead: boolean | null
}): SpendAbortDecision

export function resolveRemoteBase(fetchBase: string, remotes: readonly string[]): BaseRef

export function observeRemoteBase(input: {
  cwd: string
  base: BaseRef
  headSha: string
  ticketId: string
  signal: AbortSignal
  timeoutMs: number
}): Promise<RemoteObservation>
```

`resolveRemoteBase("dest/release/2026-09", ["dest"])` →
`{ remote: "dest", branch: "release/2026-09", headsRef: "refs/heads/release/2026-09" }`.
Unknown remote or missing slash → throw (caller treats as config error, not
unknown observation). Empty string must **not** become `refs/heads/dev`.

`observeRemoteBase` is async (`execFile`, not `execFileSync` on the poll
path). `ls-remote` first. If the SHA object is missing:
`git fetch --no-tags --no-write-fetch-head --refmap= <remote>
+refs/heads/<branch>:refs/ci-queue/observed/<ticketId>`.
Then `cat-file -e` / `merge-base --is-ancestor`. Do not update
`refs/remotes/*` or `FETCH_HEAD`. Delete only this job’s private ref on
finally when the caller asks.

- [ ] **Step 1: Failing unit tests**

```ts
it("continues when the flag is off", () => {
  expect(decideSpendAbort({
    abortOnStaleBase: false,
    remoteBaseSha: "aa".repeat(20),
    isRemoteAncestorOfHead: false,
  })).toEqual({ action: "continue", reason: "flag-off" })
})

it("continues when remote is unreadable", () => {
  expect(decideSpendAbort({
    abortOnStaleBase: true,
    remoteBaseSha: null,
    isRemoteAncestorOfHead: null,
  })).toEqual({ action: "continue", reason: "remote-unreadable" })
})

it("aborts when remote moved off the ticket HEAD ancestry", () => {
  expect(decideSpendAbort({
    abortOnStaleBase: true,
    remoteBaseSha: "bb".repeat(20),
    isRemoteAncestorOfHead: false,
  })).toEqual({
    action: "abort",
    reason: "stale-base",
    remoteSha: "bb".repeat(20),
  })
})

it("splits dest/release/x without defaulting to origin/dev", () => {
  expect(resolveRemoteBase("dest/release/x", ["dest"])).toEqual({
    remote: "dest",
    branch: "release/x",
    headsRef: "refs/heads/release/x",
  })
})
```

- [ ] **Step 2: Failing Git integration (missing object)**

Build a **bare** remote and two clones (author + worker). Remote name `dest`,
branch `dev`. Commit on worker HEAD based on B0. Advance `dev` on the author
and push so worker `ls-remote dest refs/heads/dev` sees B1 while
`git cat-file -e B1` fails.

Assert:

1. Before private fetch: `merge-base --is-ancestor B1 HEAD` exit 128;
   observation `unknown` or, after implement, fetch then `known` +
   `isAncestor: false`.
2. After `observeRemoteBase`: object B1 exists; ancestry false; decision abort.
3. Worker `HEAD`, `refs/remotes/dest/dev`, index, and `FETCH_HEAD` bytes/mtime
   identity match the before snapshot (or FETCH_HEAD still absent).

Also: timeout / shallow → `unknown`, `decideSpendAbort` continues.

- [ ] **Step 3: Run to fail**

`npx vitest run tests/core/spend-abort.test.ts`

- [ ] **Step 4: Implement `src/core/spend-abort.ts`**

Do not import ship. Do not hardcode `origin`. Do not copy DietFlow
`evaluateSpendAbort` (it never fetches the object).

- [ ] **Step 5: Tests pass + commit**

```bash
git add src/core/spend-abort.ts tests/core/spend-abort.test.ts
git commit -m "$(cat <<'EOF'
feat: observe remote base without updating tracking refs

EOF
)"
```

---

### Task 3: Runner observer + capability

**Files:**
- Modify: `src/core/runner.ts`
- Modify: `src/cli.ts` (`version` capabilities)
- Test: `tests/core/spend-abort.test.ts`, `tests/core/queue-engine.test.ts`,
  `tests/core/progress-timing.test.ts`

**Interfaces:**

```ts
export type SpendAbortObserver = { stop(): Promise<void> }

export function startSpendAbortObserver(input: {
  ticket: QueueTicket
  observe: typeof observeRemoteBase
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  onStale: (remoteSha: string) => Promise<void>
  nowMs: () => number
}): SpendAbortObserver
```

Production wires real `observeRemoteBase`. Tests inject observe/sleep/clock.
Interval 15s **after** the previous observation finishes. Errors: 30/60/120s
backoff. Fake clock — do not sleep real minutes.

On abort: `terminateVerifiedProcessGroup` only with a verified identity.
Terminal `failed` / `1` / `stale-base`. Clear observer on child `close`.
Late callback must not kill another pid and must not override cancel /
deadline / worker interrupt already chosen.

Do **not** call `fetchConfiguredBase` from the observer (that updates tracking
and would fail axis A).

- [ ] **Step 1: Failing tests**

1. Fake clock: overlapping observations never happen; next wait is 15s after
   finish; three errors back off 30 then 60.
2. Live child (`process.execPath -e "setInterval(()=>{}, 1000)"` or handshake
   fifo): author moves `dest/dev` so B1 is not ancestor; job ends
   `{ status: "failed", failureReason: "stale-base", exitCode: 1 }`; tracking
   ref unchanged.
3. No `processGroupIdentity`: do not signal a raw pid; occupancy stays until
   existing recovery rules.
4. Cancel requested first, then stale callback: remains `cancelled`.
5. Progress sidecar still published on abort (etapa 2 close).

`runCli(["version", "--json"]).result.capabilities` includes
`"spend-abort-v1"` **in this same commit**.

- [ ] **Step 2: Run to fail**
- [ ] **Step 3: Implement observer next to the deadline timer in `runJob`**
- [ ] **Step 4: Run**

```bash
npx vitest run tests/core/spend-abort.test.ts tests/core/queue-engine.test.ts tests/core/progress-timing.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/runner.ts src/cli.ts tests/core/spend-abort.test.ts tests/core/queue-engine.test.ts
git commit -m "$(cat <<'EOF'
feat: abort in-flight jobs when the remote base tip leaves HEAD

EOF
)"
```

---

### Task 4: Eligibility that includes the executed recipe

**Files:**
- Create: `src/ship/eligibility.ts`
- Test: `tests/core/eligibility.test.ts`

**Interfaces:**

```ts
export type AcceptedRecipe = {
  name: string
  argv: readonly string[]
  flags: TicketFlags
}

export type ShipProofQuery = {
  projectId: string
  executionCwd: string
  headSha: string
  baseSha: string
  acceptedRecipes: readonly AcceptedRecipe[]
}

export type ProofEvaluation =
  | { eligible: true; ticket: QueueTicket }
  | { eligible: false; reason: string }

export function evaluateShipTicket(raw: unknown, query: ShipProofQuery): ProofEvaluation
export function isShipEligibleTicket(raw: unknown, query: ShipProofQuery): boolean
export function findEligibleTicket(jobs: readonly unknown[], query: ShipProofQuery): QueueTicket | undefined
```

Validate `unknown` at runtime. Do not mutate tickets. Do not complete missing
snapshots.

Reuse the same notion of custom as `preset-history.ts`
(`custom === true` or non-empty `extraArgs`) plus **argv array equality**
with the recipe at H. Export a shared helper if that avoids two definitions.

Selection: ordered OR across `acceptedRecipes`. Inside a tuple
`(H, B0, cwd, argv)`, latest **startedAt** (fallback `createdAt`), tie-break
id. If that latest terminal is failed/interrupted, return undefined (do not
resurrect an older pass). Custom runs are another tuple.

- [ ] **Step 1: Fixture + tests**

```ts
const H = "a".repeat(40)
const B = "b".repeat(40)
const flags = {
  fetchBase: "dest/dev",
  requireCleanTree: true,
  requireGitStability: true,
  pinHeadSha: true,
}
const git = { branch: "feature/one", headSha: H, baseSha: B, statusShort: "" }
const query: ShipProofQuery = {
  projectId: "fixture",
  executionCwd: "/tmp/fixture",
  headSha: H,
  baseSha: B,
  acceptedRecipes: [{ name: "check", argv: ["npm", "run", "check"], flags }],
}
const valid: QueueTicket = {
  id: "job-proof",
  preset: "check",
  projectId: "fixture",
  projectName: "Fixture",
  source: "queue",
  status: "passed",
  exitCode: 0,
  cwd: "/tmp/fixture",
  headSha: H,
  branch: "feature/one",
  requestedBy: "test",
  createdAt: "2026-09-17T00:00:00Z",
  startedAt: "2026-09-17T00:00:01Z",
  finishedAt: "2026-09-17T00:00:02Z",
  logPath: "/tmp/fixture/job-proof.log",
  command: "npm run check",
  argv: ["npm", "run", "check"],
  extraArgs: [],
  flags,
  executionDeadline: { state: "disabled" },
  preflight: git,
  postflight: { ...git },
}

expect(isShipEligibleTicket(valid, query)).toBe(true)
expect(isShipEligibleTicket({ ...valid, argv: [process.execPath, "-e", "process.exit(0)"] }, query)).toBe(false)
expect(isShipEligibleTicket({ ...valid, extraArgs: ["--testNamePattern=one"] }, query)).toBe(false)
```

Also assert false for: wrong H/B, dirty statusShort, missing postflight,
`direct-cloud`, expired deadline, other project, other cwd, last-green-shaped
object, bool `exitCode`, later canonical failed with newer `startedAt` than
the green. Assert true OR: first recipe empty, second hits. Progress-only
field differences do not disqualify. `abortOnStaleBase` mismatch alone does
not disqualify.

- [ ] **Step 2: Fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npx vitest run tests/core/eligibility.test.ts` PASS**
- [ ] **Step 5: Commit**

```bash
git add src/ship/eligibility.ts tests/core/eligibility.test.ts src/core/preset-history.ts
git commit -m "$(cat <<'EOF'
feat: require executed argv in ship eligibility

EOF
)"
```

---

### Task 5: Async `runShip` with frozen target and honest merge report

**Files:**
- Create: `src/ship/ops.ts`
- Create: `src/ship/ship.ts`
- Test: `tests/core/ship.test.ts`

**Interfaces:**

```ts
export type ShipTarget = {
  host: "github.com"
  repo: string
  repositoryId: number
  pr: number
  headBranch: string
  headSha: string
  baseBranch: string
  baseSha: string
  executionCwd: string
  configPath: string
  configDigest: string
  isDraft: boolean
}

export type MergeState = false | true | "unknown"

export type ShipEffects = {
  ticketId?: string
  reused: boolean
  attested: boolean
  markedReady: boolean
  run?: { id: number; attempt: number }
  merged: MergeState
  mergeVerified: boolean
}

export type ShipRequest = {
  dryRun: boolean
  noRemote: boolean
  timeoutMs: number
  pr?: number
  repo?: string
}

export type ShipReport = {
  target: ShipTarget
  policy: "wait" | "skipped"
  effects: ShipEffects
  dryRun: boolean
  mergeSha?: string
  guarantee: "head-pinned-base-observed"
}

export type VerdictRequest = {
  target: ShipTarget
  workflow: string
  job: string
  requestId?: string
}

export type VerdictRun = {
  id: number
  attempt: number
  pr: number
  headSha: string
  baseSha: string
  workflow: string
  job: string
  status: string
  conclusion: string | null
}

export type ShipOps = {
  nowMs(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
  log(message: string): void
  resolveTarget(request: ShipRequest, signal: AbortSignal): Promise<ShipTarget>
  readShipConfig(target: ShipTarget): Promise<ShipConfig>
  readProofQuery(target: ShipTarget): Promise<ShipProofQuery>
  readHistory(query: ShipProofQuery): Promise<unknown[]>
  findPending(query: ShipProofQuery): Promise<{ id: string } | undefined>
  enqueue(recipe: AcceptedRecipe, target: ShipTarget, signal: AbortSignal): Promise<{ id: string }>
  waitTicket(id: string, signal: AbortSignal): Promise<unknown>
  readPolicy(target: ShipTarget): Promise<"wait" | "skipped">
  revalidate(target: ShipTarget, signal: AbortSignal): Promise<void>
  attest(target: ShipTarget, context: string, signal: AbortSignal): Promise<void>
  markReady(target: ShipTarget, signal: AbortSignal): Promise<void>
  observeVerdict(input: VerdictRequest, signal: AbortSignal): Promise<VerdictRun | undefined>
  dispatchVerdict(input: VerdictRequest, signal: AbortSignal): Promise<void>
  mergePinned(target: ShipTarget, signal: AbortSignal): Promise<{ merged: boolean; sha?: string }>
  inspectMerge(target: ShipTarget, signal: AbortSignal): Promise<{
    merged: MergeState
    sha?: string
    parents?: string[]
    treeMatchesHead?: boolean
  }>
}

export function runShip(ops: ShipOps, request: ShipRequest): Promise<ShipReport>
```

`ShipError` has `code` and `effects`. Never sync `enqueueAndWait` that blocks
the event loop. `mergePinned` must send `sha: target.headSha`. `inspectMerge`
compares first parent to `target.baseSha`.

Normative flow (implement exactly):

```text
resolve+freeze → query/policy → find/reuse/wait/enqueue once → validate terminal
→ revalidate → attest → ready if needed → causal verdict or explicit skipped
→ revalidate exact tuple → REST merge sha=H method=merge
→ inspect parents/tree → structured report
```

- [ ] **Step 1: Failing tests** (fake `ShipOps` that records calls)

1. Dry-run, no proof → `LOCAL_RED`, `enqueue` 0, mutate 0. `resolveTarget` **is**
   called (reads allowed).
2. Dry-run + eligible ticket → `reused: true`, mutate 0.
3. Divergent repo/PR/H/base before attest → no `attest`.
4. Config digest changes between lookup and `readShipConfig` → refuse.
5. Wait timeout → report `ticketId`, no cancel, no second enqueue.
6. Compatible pending ticket → `waitTicket` that id, no extra enqueue.
7. Missing `ship` block or wait without workflow → config error before enqueue.
8. Attest throw + wait → `ATTESTATION_FAILED`. Attest throw + skipped →
   limitation recorded, Git/PR guards still run, merge may proceed.
9. Draft → attest then `markReady`. Already ready + wait + remote in progress
   + no local proof → `REMOTE_IN_PROGRESS`, no second executor.
10. Verdict success for other PR/base/attempt or skipped/neutral → not ok.
11. B0 changes on revalidate (even if still ancestor) → `BASE_MOVED`, no POST.
12. `mergePinned` uses H; no `--admin`. Merge timeout → `inspectMerge` before
    retry; ambiguous → `merged: "unknown"`.
13. Inspect parents `[other, H]` after merged true →
    `merged: true`, `mergeVerified: false`, `MERGED_BASE_CHANGED`.

- [ ] **Step 2: Fail**
- [ ] **Step 3: Implement `runShip` only against `ShipOps`**
- [ ] **Step 4: `npx vitest run tests/core/eligibility.test.ts tests/core/ship.test.ts` PASS**
- [ ] **Step 5: Commit**

```bash
git add src/ship/ops.ts src/ship/ship.ts tests/core/ship.test.ts
git commit -m "$(cat <<'EOF'
feat: orchestrate ship with a frozen target and post-merge inspection

EOF
)"
```

---

### Task 6: `init` without inventing identity, recipe, or base

**Files:**
- Create: `src/ship/init.ts`
- Modify: `src/cli.ts`
- Test: `tests/core/init.test.ts`
- Test: `tests/core/ship.test.ts` (CLI dry-run can land here or Task 9)

**Interfaces:**

```ts
export type InitOptions = {
  force?: boolean
  name?: string
  workflow?: boolean
  baseRef?: string
  argv?: readonly string[]
  stateRoot: string
}

export type InitResult = {
  projectId: string
  configPath: string
  files: string[]
  state: "created" | "updated" | "already-initialized"
  dashboardRegistration: "existing" | "manual-binding-required"
}

export function initProject(cwd: string, options: InitOptions): Promise<InitResult>
```

`--workflow` without the Task 7 template in the distribution is a named
error (`WORKFLOW_TEMPLATE_MISSING`), not a stub `ci.yml`. Task 7 makes the
option succeed. Never copy `.github/workflows/ci.yml`.

Registry reader: `state/projects.json` schemaVersion 1, **read only**.

- [ ] **Step 1: Failing tests**

1. Git repo, remote `dest`, `--argv-json` + `--base-ref dest/dev` → writes
   catalog with that argv/base, UUID id, ship-bound flags
   (`requireCleanTree`, `requireGitStability`, `pinHeadSha` true),
   `abortOnStaleBase` **false** by default, `ship.acceptedPresets: ["check"]`.
2. Python/Go tree without npm `check` and without `--argv-json` → error, no file.
3. npm `package.json` with unambiguous `scripts.check` may default argv to
   `["npm","run","check"]`.
4. Existing valid catalog without `--force` → `already-initialized` / error on
   requested change.
5. `--force` preserves `project.id` and extra presets; does not drop unknown
   keys.
6. Two worktrees, one id → reuse; two ids → conflict, no write.
7. Invalid JSON on disk is not treated as absent.
8. `init` uses the current worktree, not a recorded primary clone.

- [ ] **Step 2: Fail / implement**
- [ ] **Step 3: Wire `ci-queue init` in `src/cli.ts`.** `ci-queue ship` stays
  the Task 5 `runShip` plus Task 9 `system-ops`; do not block init on that.
- [ ] **Step 4: `npx vitest run tests/core/init.test.ts tests/core/ship-config.test.ts`**
- [ ] **Step 5: Commit**

```bash
git add src/ship/init.ts src/cli.ts tests/core/init.test.ts
git commit -m "$(cat <<'EOF'
feat: add ci-queue init that preserves identity and refuses fake recipes

EOF
)"
```

---

### Task 7: Portable verifier, allowlist, bundle test

**Files:**
- Create: `templates/github/ci-queue-verdict.yml`
- Create: `scripts/ci/verify-local-attestation.sh` (env: repo, H, B0, context;
  `gh api` reads; no `ui/`, npm, or Playwright)
- Modify: `scripts/release.mjs` — add `templates/` and
  `scripts/ci/verify-local-attestation.sh` to `releasePaths`
- Modify: `src/ship/init.ts` (`--workflow` copies template to
  `.github/workflows/ci-queue-verdict.yml` and the verifier script next to it
  or into `.github/scripts/` as the template declares)
- Modify: `.github/workflows/ci.yml` **only** to correlate H/B0/attempt for
  **this** product; keep docs-only + complete `npm run check` fallback
- Test: `tests/core/ship-template.test.ts`
- Test: `tests/release/` bundle case for **init --workflow** (helper emitter
  is Task 8’s allowlist addition)

Template requirements:

- `pull_request` types: `ready_for_review`, `synchronize`, `reopened`
  (skip drafts)
- `workflow_dispatch` inputs: `pr`, `head`, `base`, `requestId` — no argv/code
- `run-name` includes PR/H/B0
- job `ci-verdict` read-only: open PR, current H/B, latest commit status for
  the rendered context with `state=success` and `description=base:B0`
- no checkout of PR code, no `npm ci`, no Playwright
- fail closed when attestation missing or stale (later failure/pending wins
  over an older success)
- never overwrite existing destination, including with `--force`

- [ ] **Step 1: RED tests** for renderer (different context than `local/check`,
  different default branch) and for `verify-local-attestation.sh` with recorded
  HTTP: tuple match; base moved; wrong context; later failure; skipped attempt;
  API error. YAML-parse-only is not enough.
- [ ] **Step 2: Implement template + verifier. Add `templates/` and
  `scripts/ci/verify-local-attestation.sh` to `releasePaths`.**
  `scripts/progress-emit.sh` is added in Task 8, not here.
- [ ] **Step 3: Bundle test**

Build a release into a temp dir, copy that tree to a **second** temp dir
without the source checkout, run the bundled `bin/ci-queue.mjs init --workflow
--argv-json ... --base-ref dest/dev`. Assert destination workflow bytes and
that paths do not contain the producer checkout.

- [ ] **Step 4:**

```bash
npm run build
npx vitest run tests/core/init.test.ts tests/core/ship-template.test.ts
npm run test:release
```

- [ ] **Step 5: Commit**

```bash
git add templates/github/ci-queue-verdict.yml scripts/ci/verify-local-attestation.sh \
  scripts/release.mjs src/ship/init.ts tests/core/ship-template.test.ts \
  tests/release .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
feat: ship a portable attestation verifier and include it in the bundle

EOF
)"
```

---

### Task 8: Progress helper and the only `check` sequence

**Files:**
- Create: `scripts/progress-emit.sh`
- Create: `scripts/ci/check-with-progress.sh`
- Modify: `package.json` so `"check"` runs the wrapper
- Modify: `scripts/release.mjs` — add `scripts/progress-emit.sh` and
  `scripts/ci/check-with-progress.sh` to `releasePaths`
- Keep: `ci-queue.json` argv `["npm","run","check"]`
- Test: `tests/core/progress-emit.test.ts`

Helper: `progress-emit.sh <id> <parent-or--> <kind> <status> <duration-or--> <label>`
writes one line that **`parseProgressLine` accepts**. Sanitize tabs/newlines
in the label (replace, do not emit an invalid line and call it success).

Wrapper stages: `build` → `test` → `check-ui` → `browser` around
`npm run build`, `npm run test`, `npm run check:ui`, `npm run test:browser`.
Never `npm run check`. On failure, emit `failed` for that stage and exit
with that code.

- [ ] **Step 1: Helper test**

```ts
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { expect, it } from "vitest"
import { parseProgressLine } from "../../src/core/progress.js"

it("prints a protocol node line the collector accepts", () => {
  const out = execFileSync("bash", [
    join(repoRoot, "scripts/progress-emit.sh"),
    "build", "-", "stage", "running", "-", "Build",
  ], { encoding: "utf8" })
  expect(parseProgressLine(out.trim())).toMatchObject({
    type: "node",
    id: "build",
    kind: "stage",
    status: "running",
    label: "Build",
  })
})
```

- [ ] **Step 2: Wrapper test with fake `npm` on PATH** (temp dir, not an env
  override in the shipped script). Fake npm records order and can fail at
  each stage. Assert later stages do not run. **No**
  `CHECK_WITH_PROGRESS_CMD`.
- [ ] **Step 3: Point `package.json` check at the wrapper; leave catalog argv
  as `npm run check`.**
- [ ] **Step 4: Nested vitest isolation** so this file’s markers do not leak
  into a parent job that is itself `npm run check`.
- [ ] **Step 5: Commit**

```bash
git add scripts/progress-emit.sh scripts/ci/check-with-progress.sh package.json \
  scripts/release.mjs tests/core/progress-emit.test.ts
git commit -m "$(cat <<'EOF'
feat: emit check stages from the canonical npm run check sequence

EOF
)"
```

Run the real wrapper **once** on the candidate before Task 9’s full check,
not on every unit test.

---

### Task 9: Real journey, never-merge, docs

**Files:**
- Create: `src/ship/system-ops.ts`
- Modify: `src/cli.ts` (`ship` command)
- Create: `tests/core/never-merge.test.ts`
- Create: `tests/examples/init-ship.test.mjs`
- Create: `docs/CONSUMER-QUICKSTART.md`
- Modify: `docs/CONTRACTS.md`, `AGENTS.md` (one line: worker never merges),
  `docs/ui/PRODUCT-CONTRACT.md` (no ship CTA), `ci-queue.json` `ship` block
  with `acceptedPresets: ["check"]`, `attestationContext: "local/check"`,
  `pinHeadSha: true` on `check`

**Never-merge test** (import graph, not comment text):

```ts
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
```

**Journey test** (no DietFlow checkout, no live GitHub):

1. Temp bare remote `dest` + clone. Recipe: small Node file that exits 0,
   committed, `ci-queue.json` committed after `init` (clean tree).
2. Run compiled worker against temp state; read history ticket actually
   written (`status=passed`, snapshots, argv).
3. `ship --dry-run --no-remote --json` with GitHub fake (PATH) presenting
   PR for that H/B0. Assert reused id **equals** the runner ticket. Do not
   seed `history/` with a hand-written passed JSON as the success path.
4. Fake remote path: attest → ready → causal run → merge POST with `sha=H`
   → inspect parents `[B0, H]`. Repeat BASE_MOVED before POST and first
   parent ≠ B0 after POST (`mergeVerified: false`).
5. Bundle init/helper from Task 7 still green.

GitHub fake only. Git is real. `url.*.insteadOf` only in the test HOME.

**Docs:** quickstart distinguishes generate → commit → dashboard bind →
enqueue → dry-run → ship wait vs `--no-remote`. State residual base race.
State DietFlow cutover is later. Remove copy that presents `--match-head-commit`
as a base lock.

- [ ] **Step 1: Write never-merge + journey tests (RED if journey not wired)**
- [ ] **Step 2: Implement remaining CLI system-ops + docs**
- [ ] **Step 3: Full candidate check**

```bash
npm run check
```

Record which cases used real Git, real runner, fake GitHub, and which
production effects were **not** exercised.

- [ ] **Step 4: Commit**

```bash
git add tests/core/never-merge.test.ts tests/examples/init-ship.test.mjs \
  docs/CONSUMER-QUICKSTART.md docs/CONTRACTS.md AGENTS.md \
  docs/ui/PRODUCT-CONTRACT.md ci-queue.json src/cli.ts src/ship
git commit -m "$(cat <<'EOF'
test: prove init-to-dry-run reuse without granting the worker merge

EOF
)"
```

Do not push, merge, or install.

---

## Coverage vs spec

| Spec slice | Tasks |
| --- | --- |
| persist + spend-abort-v1 + missing-object fetch | 1–3 |
| eligibility includes argv; later canonical red | 4 |
| frozen target, async ship, honest merge report | 5, 9 |
| init identity / recipe / base | 6 |
| generic verifier + bundle allowlist | 7, 9 |
| progress helper, one check sequence, no env bypass | 8 |
| worker never merges | 5, 9 |
| no dashboard ship | 9 (docs) |
| no DietFlow import / last-green as proof | 4, 5, 9 |
| `--no-remote` / dry-run | 5, 9 |

## Out of this plan

Occupancy filter, etapa 3 status payload, RunAtLoad, DietFlow cutover,
`ship --when-green`, required checks, last-green publish, squash/rebase/merge
queue, forks, atomic H+B CAS, live GitHub/merge/install.
