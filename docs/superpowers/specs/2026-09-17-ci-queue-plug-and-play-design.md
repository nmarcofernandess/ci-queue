# CI Queue plug-and-play — design

Date: 2026-09-17
Status: revised contract, not an implementation authorization
Supersedes: the 2026-09-17 draft in this path (same filename) and the Desktop
investigation dump. Occupancy / project-as-filter remains a **different lane**.

This revision absorbs an external review of that draft. It keeps the three
layers and Git axes A/B/C. It changes the proof contract, the merge guarantee,
spend-abort observation, init, the generic workflow, and the tests that count.

## Review disposition

Verified against this repo (enqueue, flags, runner, `ci.yml`, `release.mjs`,
`preset-history.ts`) and against DietFlow `scripts/ci/spend-abort.ts` plus
`isQueueMaterialProofEligible`. GitHub merge `sha` / `--match-head-commit`
only pin **HEAD**. `git fetch --no-write-fetch-head --refmap=` is the
documented way to take objects without updating tracking.

| Finding | Verdict |
| --- | --- |
| P01 preset name is not the recipe | **Accept.** `enqueueExplicitTicket` takes `recipe` and `argv` separately. Catalog enqueue can append `extraArgs`. `preset-history.ts` already treats canonical as argv equality + not custom. The draft eligibility list did not. |
| P02 ls-remote SHA with no local object | **Accept.** DietFlow *comments* a private fetch and then `evaluateSpendAbort` never does it. `readRemoteBaseSha` also hardcodes `origin`. Do not copy that function. |
| P03 `--match-head-commit` is not CAS of H+B | **Accept. Material change of promise.** REST/GraphQL both pin HEAD only. Prefer REST merge so `gh pr merge` cannot arm merge-queue/auto-merge. Inspect after. Report `MERGED_BASE_CHANGED` if the first parent is not B0. No local lock pretending to be a server transaction. |
| P04 freeze the whole target; B0 is the remote tip | **Accept.** Do not treat `merge-base(HEAD, base)` as B0. Runner today records `rev-parse <fetchBase>` **after** the job-start fetch. Ship compares that SHA to the current GitHub PR `base.sha`. |
| P05 remote wait without correlation / re-run | **Accept.** Job name `ci-verdict` is not an identity. Publishing a commit status does not restart this repo’s workflow. |
| P06 copying `ci.yml` as a generic template | **Accept.** That workflow is CI Queue’s own check (npm, `ui/`, Playwright, `classify-docs-only.sh`). Generic kit ships a **verifier**, not a universal remote recipe. This repo keeps its existing workflow. |
| P07 init invents id/base/argv | **Accept.** |
| P08 `CHECK_WITH_PROGRESS_CMD` | **Accept. Remove it.** Tests inject PATH or IO. Production argv is the proof. |
| P09 templates missing from `releasePaths` | **Accept.** Allowlist in `scripts/release.mjs` is explicit. |
| P10 mocked `passed` JSON as the journey | **Accept.** Dry-run reuse must see a ticket the runner actually wrote. |

Pushbacks (do not take from the review):

- Do **not** import DietFlow, and do **not** add DietFlow `keepGoing` to the product predicate.
- Do **not** copy DietFlow `isValidPresetArgv` (npm/npx-only). Product argv stays any non-empty string list.
- Do **not** replace this repo’s `.github/workflows/ci.yml` with the generic verifier.
- Observer interval 15s / budget 10s / backoff 30-60-120s are **this kit’s** values, not Git defaults.
- String-grep for the word `merge` in runner comments is the wrong never-merge guard. Guard **imports** of `src/ship` plus no `gh` / `pr merge` call sites in worker and runner.
- Job-start `fetchConfiguredBase` may update tracking **before** preflight. The mid-flight observer must **not** use that fetch; it would move `origin/<branch>` / `FETCH_HEAD` and fail axis A.
- `npm run check` on a dirty occupancy worktree is not a gate of this kit. Tests use temp `HOME` / state / cwd.

## Problem

The product already runs a local queue, worker, API, dashboard and install.
What another project still cannot copy is the **delivery kit**: a ticket that
counts as proof of a **declared recipe**, attestation on Git, optional
Actions skip, and an explicit `ship` that asks GitHub to integrate a frozen
target.

That kit lives in DietFlow (`scripts/ship/ship.ts`,
`queue-ticket-contract.ts`). Installing the CLI does not give it to you.
GitHub Actions budget on this account makes the remote reconciler fail in
seconds. Local proof plus `--no-remote` has to be a first-class **explicit**
policy, not a silent fallback and not a DietFlow-only escape hatch.

## What already exists (do not rebuild)

Facts as of product `dev` @ `45a4d7b` (PR #8). Re-read `origin/dev` and the
occupancy lane before editing shared files. Mac install / billing were not
re-inspected for this revision.

| Piece | State |
| --- | --- |
| CLI enqueue/worker/status/history/logs/cancel | Product |
| Ticket v3, `requireGitStability`, `fetchBase`, `requireCleanTree`, `pinHeadSha`, `progress` | Product. Axis A works at job boundaries. |
| Self-host `ci-queue.json` preset `check` → `npm run check` | Already in the repo. `progress: true` and `abortOnStaleBase: true` are **declared**. `pinHeadSha` is not. |
| `abortOnStaleBase` | Dead config. `normalizeTicketFlags` / `readPresets` / `buildTicket` drop it. Worker has no observer. `version --json` does not announce `spend-abort-v1`. |
| `enqueueExplicitTicket` / CLI `--recipe --argv-json` | Product. Nominal preset name is not the executed argv. |
| Canonical last-green in `preset-history.ts` | Already requires argv equality and not-custom. Ship eligibility must not be weaker. |
| Progress collector | Product. Stages appear only if the recipe prints `@@ci-queue-progress`. `npm run check` does not. |
| Product `.github/workflows/ci.yml` | Self-host verifier **plus** complete check fallback. Not a portable template. |
| `scripts/ci/publish-local-check-status.sh` | Transports a status. It is not eligibility. |
| `scripts/release.mjs` `releasePaths` | Allowlist. Templates and a new helper will not ship unless listed. |
| Registry | `state/projects.json`, Python writer only. |
| Dashboard | Observer. No ship/merge button. Do not add one. |
| Occupancy / project-as-filter | **Other lane.** This kit does not change `/api/status` or the switcher. |

`examples/local-project` proves enqueue without DietFlow. It is not a ship kit.

## Promise

```text
CONSUMER
  Decides what must be tested and how to run it.
        ↓
CI QUEUE
  Executes, preserves facts, evaluates proof.
        ↓
SHIP, CALLED EXPLICITLY
  Checks frozen target + proof + policy, then requests integration.

DASHBOARD
  Observes. No merge authority.

WORKER
  Executes. A green ticket never starts ship.
```

Journey for a third repo:

```text
product already installed
  → ci-queue init (catalog, stable id, recipe, base)
  → human reviews and commits generated files (clean tree is required for proof)
  → push and open a draft PR
  → enqueue <preset> --wait
  → ship --dry-run (reads only)
  → ship (proof → attest → ready → optional remote verdict → merge request)
```

`init` does not register the dashboard project and does not commit. Dashboard
binding stays `Gerenciar projetos → vincular pasta/configuração` when needed.
Enqueue with a valid catalog identity does not depend on that registry row.

The kit does not commit, push, open a PR, rebase, switch branches, or install
hooks. It does not claim a hermetic sandbox: a recipe can run anything the
operator configured, including `gh`. The guarantee is that **the engine does
not start ship/merge because a ticket turned green**.

Versioned artifacts for a new project:

1. `ci-queue.json`
2. Optional `remote-verdict.json`
3. Optional `.github/workflows/ci-queue-verdict.yml` (generic verifier)
4. Optional progress wrapper around the real recipe
5. Nothing else if they call `enqueue` / `ship` directly

No copy of the engine, reaper, DietFlow test policy, or DietFlow ship.

## Three layers (never mix)

| Layer | Owns |
| --- | --- |
| Consumer | argv, prep, env, what each preset covers, advisories, last-green publish |
| Product | execution, ticket facts, generic eligibility, spend-abort, init, explicit ship |
| Dashboard | observation |

`ship` does not read `refs/ci/last-green/*`, `remote-slots.json`, or commit
status as a substitute for the local ticket. Those objects have other jobs.

## Three Git axes (never mix)

| Axis | Question | Policy |
| --- | --- | --- |
| A. `requireGitStability` | Did branch/HEAD/baseSha/statusShort change between preflight and postflight? | Existing runner. Fail the job if yes. Boundary comparison, not a continuous watch, not a proof about ignored files. |
| B. `abortOnStaleBase` | Is it **proven** that the remote base tip is no longer an ancestor of this ticket HEAD? | May request verified process-group termination. **Unknown → continue.** |
| C. Ship proof | Is there a reusable execution of the **accepted recipe** for this frozen H and this remote-tip B0? | Missing, mismatch, or **unknown → do not integrate.** |

Solo enqueue uses A and optionally B. It never does C.
Ship always does C. Ship does not abort a running job; the worker does B.

`fetchBase` / `repository.baseRef` for this kit are `<remote>/<branch>`. The
remote must exist on the clone. The rest is the full branch name, including
slashes (`dest/release/2026-09` → remote `dest`, branch `release/2026-09`).
No hardcoded `origin`, `dev`, or `main` in product logic. Existing catalogs
that already say `origin/dev` remain valid instance config.

## Spend-abort (axis B)

`abortOnStaleBase?: boolean` persists from catalog and from explicit enqueue
onto `ticket.flags`. `true` requires a valid `fetchBase`; wrong type or flag
without base is an admission error. Old tickets remain readable without the
field.

Capability `spend-abort-v1` is announced only in the same change that the
**installed worker** actually observes and can abort. A desktop CLI version
string does not prove the LaunchAgent worker.

### Observation

Async, cancellable, single-flight. Values for this cut:

- healthy interval: 15s, scheduled **after** the previous observation finishes
- per-observation budget: 10s
- one in-flight Git observation per job; no overlapping `setInterval` Git
- consecutive errors back off 30s, 60s, then cap 120s; success returns to 15s
- stop the observer and helper Git when the child closes; a late result must
  not signal a process that already exited

Command: `git ls-remote --exit-code <remote> refs/heads/<branch>` yields a
SHA, not an object.

If that SHA is missing from the object database, fetch **once** into a
job-private ref, without moving tracking or `FETCH_HEAD`:

```text
git fetch --no-tags --no-write-fetch-head --refmap= <remote> \
  +refs/heads/<branch>:refs/ci-queue/observed/<ticketId>
```

Then confirm the object exists and run
`git merge-base --is-ancestor <remoteSha> <ticket.headSha>`:

- exit 0 → contained → continue
- exit 1 → not contained → abort (`stale-base`)
- other / shallow / incomplete graph / timeout / fetch did not land the
  listed SHA → **unknown → continue**, try again next interval

Do not prune/gc. Delete only this job’s private ref when the observer stops.
Do not disable axis A because B started reading.

### Interrupt

`decideSpendAbort` stays a **pure** function (no Git, no process). Only
`action: "abort"` may request `terminateVerifiedProcessGroup`. Asking is not
proof of death. No identity → do not kill an arbitrary PID and do not release
the queue occupancy while the child may still be alive.

Terminal: `status=failed`, `exitCode=1`, `failureReason="stale-base"`.
Operator cancel, worker interrupt, and an already-expired deadline keep their
classification. First terminal reason wins; a late observer callback cannot
replace it.

Progress sidecar is drained/finalized on the same etapa-2 boundaries. No
second worker, no node-level timer, no automatic requeue, no mutation of the
integration base during the job.

## Eligibility (axis C input)

Query: `{ projectId, executionCwd, headSha, baseSha, acceptedRecipes }`.

Each accepted recipe is `{ name, argv, flags }` taken from the catalog
**versioned at H**, not from a dirty working copy or another checkout.

`acceptedPresets` is an **ordered OR**. Any one recipe satisfies the declared
policy. It is not “run all”. It is not “full supersedes smoketest” unless the
consumer lists that order. On a miss, enqueue the **first** entry.

### Simultaneous requirements

A reusable proof needs all of:

- intact terminal ticket: valid id and timestamps, `status="passed"`,
  integer `exitCode === 0`
- `source` absent (compat) or `"queue"`; never `direct-cloud` / `direct-runtime`
- not cancelled; no cleanup-blocked terminal; deadline not expired/incoherent
- `projectId` exact
- `preset` equals the recipe name **and** `argv` equals the recipe argv
  element-by-element
- `extraArgs` absent or `[]`; `custom` not true; a shell string is not an argv
- `cwd` absolute-normalized equals `executionCwd` (reuse constraint, not
  project identity)
- complete preflight and postflight; branch, HEAD, baseSha, `statusShort`
  equal; `statusShort === ""`
- `preflight.headSha === ticket.headSha === H`
- `preflight.baseSha === B0` where **B0 is the remote tip of the PR base
  branch**, not an older merge-base
- ship-relevant flags compatible with the declared recipe: `fetchBase`,
  `requireCleanTree`, `requireGitStability`, `pinHeadSha`, configured deadline
- progress metadata and `abortOnStaleBase` do **not** change coverage meaning
- catalog bytes used for the decision still match the tree at H

For presets the kit will use as ship proof, `requireCleanTree`,
`requireGitStability`, and `pinHeadSha` are required true, and `fetchBase`
matches the integration base. Do not invent snapshots to shoehorn old tickets
that never recorded them.

Argv equality is not a hermetic proof of OS/deps. A state-root operator can
still forge JSON. This product is local-trust plus versioned recipe/code.
Commit status is **not** a cryptographic signature of the ticket.

### Choice and later reds

Inside one recipe and the same tuple `(H, B0, cwd, argv)`, take the latest
**started** terminal execution, tie-break by id.

A later **canonical** failed/interrupted run of that same tuple must not be
ignored so an older green can be resurrected. This is a **new** product rule
(DietFlow’s `findEligibleTicket` filters to passed only, then newest
`finishedAt`). A custom/extraArgs red is a different tuple. A cancel before
start with no preflight does not, by itself, invalidate a finished proof.

If there is no reusable proof but a queued/running ticket already matches H,
cwd, argv, and admission flags, **wait for that ticket** instead of enqueueing
another by default. Only a terminal with proven B0 is proof. This reduces
duplicate enqueue on normal resume; it does not promise exactly-once across
concurrent `ship` processes.

Return ineligibility reasons to the CLI. Do not infer approval from a
last-green-shaped object.

## `ci-queue ship`

```text
ci-queue ship [--pr NUMBER] [--repo [HOST/]OWNER/REPO] \
  [--dry-run] [--no-remote] [--timeout-ms N] [--json]
```

Existing `--cwd`, `--state`, `--config` remain. `--timeout-ms` bounds the
whole orchestration including queue wait and remote wait. Default 60 minutes.
It does not change `executionTimeoutMs`, does not cancel the ticket on
timeout, and does not loop-enqueue. JSON mode: progress on stderr; stdout is
one structured result.

### Frozen target

Resolve once a `ShipTarget`: GitHub.com host, repo + numeric id, PR number,
head repo/branch/H, base repo/branch/B0, `executionCwd`, catalog path and
digest (and policy file digest when present). For ship, catalog and policy
must match the tree at H. External config may still enqueue; it must not
silently approve another checkout.

B0 is the current remote tip of the PR base (GitHub `base.sha` / ls-remote of
that branch). It must be contained in H. Zero or several open PRs for the
branch without `--pr` is an error. Local H, PR H, and ticket H must match.
Dirty tree or detached HEAD without an unambiguous target is refused. The
`gh` repo and the Git remote for the base must be the same destination.

First cut: same-repo PR on GitHub.com, merge commit only. Forks, unvalidated
enterprise hosts, squash/rebase, and merge queue are **unsupported** (hard
error, no partial execution). No hardcoded GitHub owners.

### Flow

1. Validate catalog, policy, target, clean tree, B0 ⊂ H. In `wait`, also
   validate that the configured verdict workflow and a causal path exist.
   Failure or unreadable remote stops **before** local spend.
2. Look up proof. `--dry-run`: return selection/reasons and exit. GitHub/Git
   **reads** are allowed. No fetch that writes refs, no status, no ticket, no
   PR mutation. Missing objects → report the gap, do not pretend eligibility.
3. Outside dry-run: reuse, wait for a compatible in-flight ticket, or enqueue
   the first accepted recipe **once**. Validate the full terminal. A green
   name is not enough.
4. Revalidate H/B0/target/tree/catalog **before** attestation. Changed → exit
   without attesting or merging. No rebase, no new commits.
5. Publish configured commit status on H, description `base:B0`, after proof.
   Same context+state+description already present is a no-op. A previous
   status for another base is not reused. No paths, logs, or secrets in the
   description.
6. Mark **this** PR ready if it is draft. Touch no other PR.
7. Policy `wait`: observe only the correlated verdict (next section).
   Policy `skipped` / `--no-remote`: record the policy and continue on local
   proof. Never auto-downgrade `wait` to skipped because of budget, 403, or
   timeout.
8. Immediately before merge, re-read PR/HEAD, base tip, tree, catalog.
   Exact equality with the frozen target. Any B0 change is `BASE_MOVED`,
   even if the new base is still an ancestor of H.
9. Request an **immediate** merge with expected HEAD `sha=H` and
   `merge_method=merge` via `gh api` PUT
   `/repos/{owner}/{repo}/pulls/{pull}/merge`. Do not `--admin`, do not
   auto-merge, do not delete the branch. Do not use `gh pr merge` in this
   cut: that CLI can enqueue or enable auto-merge when a merge queue exists.
   A policy 403 is not a bypass.
10. Confirm the response and read the merge commit. Compare parents to B0/H
    and the tree to H. Report as below.

If the PR is already ready, policy is `wait`, and there is no local proof yet:
do not start a second executor while a causal remote fallback is in progress.
Return `REMOTE_IN_PROGRESS` with the run. Later, an explicit
`ship --no-remote` or an already-produced local proof may proceed. Do not
cancel other people’s workflow runs to clear the conflict.

### Real merge guarantee

The merge API pins H. **It has no `expectedBaseSha`.** Re-reading B0 right
before the PUT shrinks the window; it does not close it.

This cut promises: **HEAD pinned by the server, base checked before and
inspected after** — not an atomic H+B transaction.

| Outcome | Report |
| --- | --- |
| Merge confirmed, first parent B0, second parent H, tree matches H | `merged=true`, `mergeVerified=true` |
| Merge happened on another first parent | `merged=true`, `mergeVerified=false`, `MERGED_BASE_CHANGED` |
| Timeout / ambiguous HTTP | inspect PR before any retry; if still unclear: `merged="unknown"`, `MERGE_OUTCOME_UNKNOWN` |
| Server refused | `merged=false`, preserve the reason |

Never return `merged=false` when the effect already happened. Never blindly
repeat POST. Never rollback or force-push. Strict prevention of “merge on an
untested base” needs a **server** mechanism. This package will not fake that
with a local lock other agents ignore.

### Idempotency

The report includes target, ticket, reuse, attestation, ready, run/attempt,
policy, merge, verification. Errors after attest/ready keep those facts.
A new invocation re-reads reality; there is no parallel persisted workflow
engine.

An already-merged PR is recognized and inspected; no new proof, no second
merge POST. A local red is not retried until green inside one invocation.
Wait timeout keeps the ticket and returns its id.

## Attestation and remote verdict

`ship.attestationContext` is configured. It is not inferred from whichever
preset was reused. The accepted-preset list is OR; the context represents the
whole declared policy. This repo uses `local/check`. DietFlow may keep
`local/smoketest` until **its** cutover.

```json
{
  "ship": {
    "acceptedPresets": ["check"],
    "attestationContext": "local/check",
    "remoteVerdict": {
      "workflow": ".github/workflows/ci-queue-verdict.yml",
      "job": "ci-verdict"
    }
  }
}
```

`remoteVerdict` may point at the consumer’s existing workflow. `wait` requires
that target; do not hunt any job with the same name on the account.

`remote-verdict.json` sits next to the effective catalog:
`{ "verdict": "wait" }` or `{ "verdict": "skipped" }`. Missing file = wait.
Invalid JSON / unknown value / unreadable path = error. `--no-remote` wins
over a valid `wait`; it does not launder a corrupt file into authorization.

Attestation may fail and still merge **only** when `--no-remote` or `skipped`
is explicit, and that limitation is in the report. Wait-mode budget,
permission, or timeout failures stay hard errors (`ATTESTATION_FAILED` /
`REMOTE_RED` / `REMOTE_RUN_MISSING`).

### Correlation

Job name is not enough. Bind host/repo, PR, workflow, H, B0, and attempt.
Success of another PR, another base, a superseded attempt, or
skipped/neutral/cancelled does not satisfy wait.

Generic template: deterministic `run-name` including PR/H/B0; dispatch adds a
request id. The workflow re-validates the live PR and the latest commit
status (`state=success`, `description=base:B0`). On `pull_request`, H/B0 come
from the event, not a synthetic `GITHUB_SHA`. On `workflow_dispatch`, inputs
are checked against the current PR.

Publishing a commit status **does not restart** this product’s current
`ci.yml` (push / pull_request only). After ready, wait for the causal run.
For an already-ready PR without a reusable run: one `workflow_dispatch` of the
**template** (when that workflow is what `remoteVerdict` points at), with
PR/H/B0/requestId, defined on the default branch, with adequate permissions.
Poll every 5s. At most one dispatch per `ship` invocation. If dispatch or
correlation cannot be proven: `REMOTE_RUN_MISSING`. Never toggle draft/ready
as a fake restart. Never treat a rerun of the original draft event as ready.

A pre-existing consumer workflow without dispatch can still use draft→ready
as its happy path. The kit must **report** a missing re-evaluation mechanism
instead of inventing one.

### Generic template (optional)

The portable workflow **verifies an already-published local attestation**.
It does not check out PR code, does not install Node/Playwright, and does not
assume `ui/` or npm scripts. No valid latest status → fail closed. The
consumer’s own remote CI stays independent.

This is a deliberate scope cut versus “copy `ci.yml`”. The kit distributes a
verifier. CI Queue’s complete-check fallback stays in **this** repo’s
workflow. Self-host may set `remoteVerdict` at `.github/workflows/ci.yml`
with corrected correlation; `init --workflow` must not overwrite it.

Copy destination: `.github/workflows/ci-queue-verdict.yml`. Never overwrite
an existing workflow as a side effect of `--force`. Context and branches are
rendered parameters, not comments saying “edit the hardcodes later”.

Actions pins are verified at implementation. Interpolate PR data into
env/API fields, not into a shell string. Verifier permissions: read-only.
It does not publish green and does not merge.

## `ci-queue init`

```text
ci-queue init [--name NAME] [--base-ref REMOTE/BRANCH] \
  [--argv-json JSON] [--workflow] [--force] [--json]
```

1. Resolve the **current worktree** root. Do not silently retarget the primary
   clone. Do not `git init`.
2. Valid existing catalog: keep `project.id`. No requested field change →
   `already-initialized`. Changes without `--force` → `CONFIG_EXISTS`.
3. No local catalog: read-only lookup of identities in other worktrees of the
   same common-dir and in `state/projects.json`. One identity may be reused.
   Multiple or incompatible → conflict. Do not mint a UUID to dodge a known
   id.
4. Mint a UUID only when the repository has no known identity. Init never
   writes the registry. Unreadable JSON is not “absent”.
5. Recipe: require `--argv-json` unless this is an unambiguous npm project
   whose `package.json` actually declares a `check` script. Other managers,
   multiple candidates, or missing script → demand the flag. Never run the
   recipe during init.
6. Base: reuse existing config or `--base-ref`. Otherwise only an
   unambiguous local `HEAD` remote/branch already configured. No network as a
   hidden init effect. No default `dev`/`main`.
7. `repository.path` relative to the catalog root. Keep `executionCwd` on the
   chosen worktree. Ship must not relocate proof via the registry primary path.
8. Write coherent ship-bound flags and an explicit `ship` block.
   `progress: true` permits the protocol; it does not instrument a recipe that
   never emits. Spend-abort is opt-in (off in init default; preserve this
   repo’s existing `true`). `--workflow` points `remoteVerdict` at the
   generic template and copies it. Without `--workflow`, do not invent a
   workflow: keep existing `remoteVerdict` or leave it absent. Absent
   `remoteVerdict` + wait = early refuse until a verifier is configured;
   the explicit path is `ship --no-remote`.
9. `--force` replaces **requested** fields and fills missing defaults. It
   does not change id, delete other presets, drop unknown keys, or overwrite
   an existing workflow file. Invalid config needs an explicit fix, not a
   destructive force.
10. Validate all bytes before creating files; write each destination
    atomically. Record partial effects if a later write fails. No pretend
    multi-file transaction.

Stdout: files written, id, recipe/base, runtime limits, and the dashboard
binding next step when needed. No GET, no second TypeScript project registry.

## Progress helper and self-host

Reuse the existing protocol (`parseProgressLine`). Helper
`scripts/progress-emit.sh` prints one TSV line. It does not scrape human logs.

Self-host: **one** canonical check sequence. `package.json` `check` runs the
wrapper; `ci-queue.json` keeps `argv: ["npm", "run", "check"]`. The wrapper
runs `build`, `test`, `check:ui`, `test:browser` and **never** calls `check`
again.

No `CHECK_WITH_PROGRESS_CMD` or any production env that swaps the recipe for
`exit 0` while leaving argv unchanged. Tests use a fake executable on a
temporary PATH or injected IO.

Keep the original exit code. Emit `failed` on the stage that failed; do not
run later stages. Isolate nested test subprocess env so fixture markers do
not leak into the parent job’s progress. No success-by-log-regex. No new
per-node timers.

## Distribution and trust

New templates, helper, and compiled runtime enter `releasePaths` and the
manifest. `init --workflow` must work from a bundle copied to a temp dir
**without** the source checkout. Locate shipped assets from the distribution
root (`import.meta.url`), never from the consumer cwd.

This campaign does not modify the live Mac install, LaunchAgent, or symlink.

GitHub scopes are per operation: read PR/refs, write commit statuses, ready +
merge, and dispatch when used. Do not document classic `repo` as the default.
A 403 is not, by itself, proof of GitHub Free limits.

Trust boundary: local state/code the operator controls, plus a credential
that can write statuses and merge. Remote CI trusts the status author and
workflow config. No product PKI, no hostile-code sandbox, no hermetic env
in this cut.

`--no-remote` skips the **remote verdict**. It does not skip local proof, does
not weaken target checks, and does not bypass GitHub rules.

## Sequencing and DietFlow

Four slices, one CLI, no extra npm package:

1. Flags, remote observation, spend-abort in the worker.
2. Eligibility + async `ship` with frozen target, fake GitHub, honest merge report.
3. Init, generic verifier, bundle, quickstart.
4. Progress helper, self-host wrap, end-to-end fixture, docs.

Implement on a branch from current `origin/dev` after reconciling occupancy /
timing edits that touch the same files (`runner.ts` especially). Do not edit
that lane’s worktree. Keep the PR draft until review. No install between slices.

DietFlow keeps `npm run ship` until a **separate** cutover. Its script also
classifies scope, advises Full, sometimes runs direct, and publishes slots.
None of that disappears because this CLI gained the same verb.

Migration order, when later authorized: third-repo fixture → CI Queue
self-host → compare proof tuples with sanitized DietFlow tickets → thin
DietFlow adapter. The adapter keeps coverage/advisories/slots and delegates
only the generic equivalent. No two merge controllers on the same PR.

Editing DietFlow is out of this campaign.

## File map (product)

| Path | Role |
| --- | --- |
| `src/contracts/schema.ts` | `abortOnStaleBase`; typed `ship` block |
| `src/contracts/config.ts` | Parse/validate those fields |
| `src/core/enqueue.ts` | Persist flag + argv on both producers |
| `src/core/spend-abort.ts` | Pure decision + bounded remote observe |
| `src/core/runner.ts` | Observer; stale-base terminal; preserve etapa-2 close |
| `src/ship/eligibility.ts` | Pure proof predicate |
| `src/ship/ops.ts` / `ship.ts` / `system-ops.ts` | Async orchestration + real adapters |
| `src/ship/init.ts` | Catalog writer; registry read-only |
| `src/cli.ts` | `init`, `ship`; capabilities after worker behavior exists |
| `templates/github/ci-queue-verdict.yml` | Portable attestation verifier |
| `scripts/ci/verify-local-attestation.sh` | Read-only PR/status tuple check used by the template |
| `scripts/progress-emit.sh` | One protocol line |
| `scripts/ci/check-with-progress.sh` | Self-host wrapper; only sequence of `check` |
| `scripts/release.mjs` | Allowlist the new assets |
| `.github/workflows/ci.yml` | Correlation fixes only; keep complete-check fallback |
| `docs/CONSUMER-QUICKSTART.md` | Zero-to-ship, including residual base race |
| `docs/CONTRACTS.md` | Axes, eligibility, never-merge, guarantee limit |

## Acceptance

- A ticket named `check` with a different argv, `extraArgs`, or `custom` is
  not ship-eligible.
- H, B0, repo, PR, recipe, and catalog stay frozen; a change stops later effects.
- Spend-abort against remote `dest`, branch `dev`, new remote object absent
  locally: abort after private fetch; unknown/shallow does not kill.
- Cancel, deadline, recovery, and etapa-2 progress close still hold.
- Dry-run may read facts; it creates no ticket/ref/file/status/ready/merge.
- Wait timeout does not cancel work or multiply jobs; JSON reports partials.
- `--no-remote` keeps the same eligibility and Git/PR checks.
- Init on an existing repo/worktree preserves id; missing recipe/base does
  not become a fake `npm run check` / `origin/dev`.
- Generic template works without `ui/`, npm, or this repo’s scripts; no
  green from missing proof.
- Bundle outside the source tree serves init/template/helper.
- A minimal third consumer with a local bare remote produces a real runner
  ticket; dry-run reuses **that** id. Fake GitHub only at the remote edge.
- Merge call sends expected H; race/ambiguous outcomes are not reported as
  verified merges.
- Candidate `npm run check`, bundle tests, and a matrix of the scenarios
  above. A raw test count is not the journey.

This spec does not authorize live GitHub writes, merge, release, installation,
production worker changes, or mutation of the operator’s real state root.
