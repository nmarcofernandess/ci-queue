# 04 — Ship / proof / merge commands that exist today

Date: 2026-09-18  
Scope: DietFlow worktree `/Users/marcoantonio/dietflow-ci-queue-node-pin` and CI Queue `/Users/marcoantonio/ci-queue`.  
Method: code + tests + docs + `gh` read-only. No repo mutations. No GitHub mutations.

**Verdict:** both packs already exist. An agent could have used them without new code. #10 and #1292 were merged with `gh pr merge --merge` from the pin agent, not through those packs.

---

## TL;DR

| Lane | Intended pack | Proof ticket | Merge mechanism | Actions |
| --- | --- | --- | --- | --- |
| DietFlow | `npm run ship` (reads `scripts/ship/remote-verdict.json`) | `smoketest` or eligible `full` on HEAD+base, cwd = lane | `gh pr merge --merge --match-head-commit <HEAD>` | `verdict: skipped` today → no wait |
| CI Queue | `ci-queue ship --no-remote` (no npm `ship` script) | preset `check`, argv `["npm","run","check"]`, HEAD+B0, cwd match | `gh api` PUT `/pulls/{n}/merge` with `sha=H`, `merge_method=merge`. **Not** `gh pr merge` | catalog has **no** `remoteVerdict`; file absent = `wait` → **refuses** unless `--no-remote` |

`runtime-probe` is not ship proof (`ci-queue.json` `acceptedPresets` does not contain it; DietFlow test asserts that).

---

## 1. Exact scripts

### DietFlow (`package.json`)

| Script | Line | Command |
| --- | --- | --- |
| `ship` | 16 | `tsx scripts/ship/ship.ts` |
| `lane:cleanup` | 17 | `tsx scripts/ship/lane-cleanup.ts` |
| `ci:smoketest` | 32 | `bash scripts/ci/smoketest-local.sh` |
| `ci:queue` | 47 | `tsx scripts/ci/queue-entry.ts` |
| `ci:queue:status` | 48 | `tsx scripts/ci/queue-operator.ts status` |
| `ci:queue:logs` | 49 | `tsx scripts/ci/queue-operator.ts logs` |
| `ci:queue:cancel` | 50 | `tsx scripts/ci/queue-operator.ts cancel` |
| `ci:queue:history` | 51 | `tsx scripts/ci/queue-operator.ts history` |
| `ci:queue:presets` | 52 | `tsx scripts/ci/queue-operator.ts preset-history` |
| `ci:queue:publish-green` | 53 | `tsx scripts/ci/publish-green.ts` |
| `ci:queue:read-green` | 54 | `tsx scripts/ci/read-green.ts` |
| `ci:queue:sync-green-mirror` | 55 | `tsx scripts/ci/remote-green-mirror.ts` |
| `ci:queue:doctor` | 56 | `tsx scripts/ci/queue-operator.ts doctor` |

`ci:queue` always forces `executor: 'queue'` (`scripts/ci/queue-entry.ts:11-13`). `--wait` is stripped from argv there (`queue-entry.ts:5-7`) and re-added by the adapter (`scripts/ci/queue-client.ts:416`).

Operator forms already documented:

```bash
npm run ci:queue -- smoketest --wait
npm run ci:queue:status
npm run ship
npm run ship -- --dry-run
npm run ship -- --no-remote
npm run ship -- --remote
```

`docs/ci/CI-QUEUE-CONSUMIDOR.md:19-25` lists the queue wrappers. `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:70-80` lists `npm run ship`.

There is **no** DietFlow npm script named `ci-queue ship`. Cutover of DietFlow onto the product controller is explicitly not done (`docs/CONSUMER-QUICKSTART.md:5-6` in CI Queue: “DietFlow continua com o próprio `npm run ship` até um cutover separado”).

A second, unused controller exists on the DietFlow catalog: `ci-queue.json:342-345` declares `ship.acceptedPresets: ["smoketest"]`. Invoking `ci-queue ship` from the DietFlow worktree would use **CI Queue’s** ship, not `scripts/ship/ship.ts`. That is not the DietFlow pack.

### CI Queue (`package.json`)

| Script | Line | Command |
| --- | --- | --- |
| `check` | 12 | `bash scripts/ci/check-with-progress.sh` |
| `ci-queue` | 13 | `tsx src/cli.ts` |

**No** `ship` npm script. The command is the CLI:

```bash
ci-queue ship [--pr N] [--repo [HOST/]OWNER/REPO] [--dry-run] [--no-remote] [--timeout-ms N]
# from checkout:
npm run ci-queue -- ship --no-remote --json
```

Declared in `src/cli.ts:115` and wired at `src/cli.ts:164-186`. Installed binary: `bin/ci-queue.mjs` → compiled `dist/cli.js`. Capability `"ship"` is advertised (`cli.ts:150`).

Proof enqueue (visible in Vite when `progress: true`):

```bash
ci-queue enqueue check --wait --json
# or
npm run ci-queue -- enqueue check --wait --json
```

`check` argv is `["npm","run","check"]` (`ci-queue.json:14-21`) and `progress: true`. `npm run check` emits `@@ci-queue-progress` stages (`scripts/ci/check-with-progress.sh:16-36`).

---

## 2. DietFlow `npm run ship` when `remote-verdict.json` is `skipped`

**File in use by DietFlow ship:** `scripts/ship/remote-verdict.json` → `{ "verdict": "skipped" }` (line 2).  
Path constant: `scripts/ship/ship.ts:1059`. Parser: `ship.ts:1061-1083`.

**Also present:** `/Users/marcoantonio/dietflow-ci-queue-node-pin/remote-verdict.json` (same `skipped`). That file is **next to** `ci-queue.json`. CI Queue’s ship reads `dirname(ci-queue.json)/remote-verdict.json` (`src/ship/system-ops.ts:45,610-613`). DietFlow’s `npm run ship` does **not** read the root copy; it reads `scripts/ship/remote-verdict.json`.

Default argv with file `skipped`: `{ dryRun: false, noRemote: true }` (`ship.ts:1075`). `--remote` forces Actions back on (`ship.ts:1079`). `--no-remote` wins over `actions` (`ship.ts:1078`). Corrupt/missing file fail-closes to `actions` (`ship.ts:1065-1068`). Flags do not detect quota (`ship.ts:1052`).

### Still requires local smoketest?

**Yes, for material PRs.** `skipRemote` still calls `ensureLocalProof` (`ship.ts:805-812`). Docs-only skips smoke (`ship.ts:809-810`, `760-762`).

`ensureLocalProof` (`ship.ts:363-389`):

1. Reuse eligible ticket for HEAD+base, cwd = `process.cwd()`, preset `full` then `smoketest` (`findLocalProofTicket`, `ship.ts:335-337`).
2. Else if persistent queue (darwin + `ci-queue version` works): `npm run ci:queue -- smoketest --wait`.
3. Else: `npm run ci:smoketest` direct (no ticket).
4. After queue wait, ticket must exist or `LOCAL_RED`.

Eligibility: `isQueueMaterialProofEligible` (`scripts/ci/queue-ticket-contract.ts:262-283`) — `passed`, `exitCode === 0`, source `queue` or unset, clean pre/post flight, HEAD+base match, cwd match. `runtime-probe`, `static`, `review` do not qualify. Tests: `scripts/ship/__tests__/ship.test.ts:1137-1148` (ready without ticket enqueues smoke; red → `LOCAL_RED`, no merge).

Full is advisory only (`ship.ts:756`, `1151-1157`). Impact (`e2e-impact`) is report-only (`ship.ts:150-154`).

### Does it merge?

**Yes.** After proof + optional ready: `mergePinned` (`ship.ts:577-582`, called from `847`). Command:

```text
gh pr merge <N> --merge --match-head-commit <HEAD>
```

Never `--admin` (`ship.ts:580-581`, test `ship.test.ts:526-529`). Then `postMerge` (`592-618`): on Mac with queue, ff-only pull of the **main** worktree if it is clean `dev`; otherwise throw, no automatic checkout of `dev`.

### Skip waiting for GitHub Actions?

**Yes when `noRemote`.** Branch `ship.ts:805-819`:

- no `run list` / `run watch`
- `runId: null`, `remote: 'skipped'`, `proof: 'local'`
- test `ship.test.ts:1111-1123`: “zero watch de run”

Without skip, draft waits for the causal Actions run (`820-830`); already-ready uses the remote run as verdict owner and does **not** enqueue smoke (`831-838`). Skip changes that: **already-ready also requires local proof** (`817`, `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:639-642`).

### `BASE_MOVED`?

**Still enforced.** `assertBaseFresh` at authorship (`ship.ts:274-276`, `289-297`) and again immediately before merge (`578-579`). Test `ship.test.ts:532-535`: base moved between verdict and merge → `BASE_MOVED`, no `pr merge`.

### Draft vs ready?

| State | `skipped` / `--no-remote` |
| --- | --- |
| Draft | local proof → `gh pr ready` → merge; log “sem espera de Actions” (`813-815`) |
| Ready | local proof required; no run watch (`816-818`, `1125-1135`) |
| Already merged | post-merge only (`710-745`) |
| Dry-run | no ready, no merge (`1242-1251`) |

Happy path still wants the PR opened **draft** (`FLUXO-CI-GITHUB-ACTIONS.md:110-116`). Ship accepts a PR that is already ready (`ship.ts:17`).

### Identity / tree (fail-closed, not optional)

On Mac with persistent queue (`ship.ts:199-208`):

- `git config user.name` === `Dietflowoficial` (`ship.ts:54,201-205`)
- `gh` viewer === `dietflowoficial` (case-insensitive)
- `gh repo view` === `dietflowoficial/dietflow-app` (`55,188-194`)

Also: dirty tree (`222-225`), never from branch `dev` (`227-232`), HEAD published and equal to PR head (`260-272`). Tests: `ship.test.ts:256-267` (`nmarcofernandess` git/gh → `WRONG_IDENTITY`).

Without persistent queue (cloud): git name is not checked; gh must be `dietflowoficial` or `cursor[bot]` (`209-217`). Attestation failure is swallowed (`392-401`, `1213-1224`).

---

## 3. CI Queue `ci-queue ship` and `src/ship/*`

### Can it ship its own PR with `acceptedPresets: ["check"]`?

**Yes, with `--no-remote` (or a `remote-verdict.json` of `skipped`). Not with default `wait`.**

Catalog today (`ci-queue.json:24-27`):

```json
"ship": {
  "acceptedPresets": ["check"],
  "attestationContext": "local/check"
}
```

No `remoteVerdict`. No `remote-verdict.json` in this repo. `readPolicy`: missing file = `"wait"` (`system-ops.ts:610-612`). Orchestrator: `wait` without `remoteVerdict.workflow` → `SHIP_CONFIG` before enqueue (`src/ship/ship.ts:202-206`, test `tests/core/ship.test.ts:409-417`).

`--no-remote` sets policy `"skipped"` (`ship.ts:203`) and skips the verdict loop (`304-320`). Attestation failure in skipped mode is a limitation, merge still happens (`291-297`, `tests/core/ship.test.ts:431-447`). Draft is marked ready after attest (`299-302`).

So: **an agent could ship CI Queue today without new code** by passing `--no-remote`. Leaving the flag off is a hard fail, not a hang on Actions.

### What proof ticket?

`findEligibleTicket` (`src/ship/eligibility.ts:202-215`) over `acceptedRecipes` derived from `check`:

- `preset === "check"`
- `argv` equals `["npm","run","check"]` (extraArgs / custom → ineligible)
- `projectId` = `070e4c47-709b-4fe1-9f98-d80d313a87f4`
- `cwd` realpath-equal to execution cwd
- `source` queue or unset
- `status === "passed"`, `exitCode === 0`
- flags match recipe: `fetchBase: origin/dev`, `requireCleanTree`, `requireGitStability`, `pinHeadSha` (`ci-queue.json:17-20`, `eligibility.ts:84-90,137-139`)
- preflight ≡ postflight, both `statusShort === ""`, `headSha` = H, `baseSha` = B0 (PR base SHA, not an old merge-base)

If none: reuse a pending queued/running match, else `enqueueTicket({ preset: "check", ... })` and wait (`ship.ts:252-274`, `system-ops.ts:591-597`). Dry-run refuses to enqueue (`ship.ts:245-249`).

`npm run check` run **outside** the queue does not produce this ticket.

### Merge via `gh`? Remote verdict?

Merge is **REST**, not `gh pr merge` (`docs/CONSUMER-QUICKSTART.md:73-74`, `system-ops.ts:736-749`):

```text
PUT /repos/{owner}/{repo}/pulls/{pull}/merge
{ "sha": "<HEAD>", "merge_method": "merge" }
```

Then inspect parents: 1st = B0, 2nd = H, tree = H (`ship.ts:452-470`). Race on B0 is declared (`CONSUMER-QUICKSTART.md:76-89`). No `--admin`. Forks / merge queue / non-merge-commit method refused (`system-ops.ts:382-384,511-513`).

Worker never imports `src/ship` (grep of `src/core` is empty). Dashboard has no ship button (`CONSUMER-QUICKSTART.md:4-5`).

Timeout default 60 minutes (`cli.ts:166`); does not cancel the ticket (`CONSUMER-QUICKSTART.md:70-71`).

---

## 4. Did `gh pr merge` on #10 and #1292 bypass the pack?

**Yes. Proven as operator action. GitHub cannot show the CLI flags.**

### Pin-agent commands (this conversation, not GitHub)

Transcript [`7adee5ba-5ea8-4f0b-8112-334c488d1310`](7adee5ba-5ea8-4f0b-8112-334c488d1310):

```text
gh pr merge 10 --repo nmarcofernandess/ci-queue --merge
gh pr merge 1292 --repo dietflowoficial/Dietflow-app --merge
```

No `npm run ship`. No `ci-queue ship`. No `--match-head-commit`. No `--no-remote`.

Same transcript: `npm run check` ran **in the CI Queue checkout**, not `ci-queue enqueue check`. DietFlow DoD in the pin plan said “Não Full. Não smoketest.”

### GitHub (read-only, 2026-09-18)

`gh` authenticated: active `dietflowoficial`; `nmarcofernandess` present but inactive. `nmarcofernandess/ci-queue` is invisible to the DietFlow account (`GraphQL: Could not resolve`). PR #10 was read with `GH_TOKEN=$(gh auth token --user nmarcofernandess)` (local token read, no mutation).

| PR | State | Merged at | Actor | Merge commit |
| --- | --- | --- | --- | --- |
| [nmarcofernandess/ci-queue#10](https://github.com/nmarcofernandess/ci-queue/pull/10) | MERGED | 2026-09-18T02:59:25Z | `nmarcofernandess` | `f4f502ed30fa129a8c6f69c56d0c05d583618100` |
| [dietflowoficial/Dietflow-app#1292](https://github.com/dietflowoficial/Dietflow-app/pull/1292) | MERGED | 2026-09-18T03:04:33Z | `dietflowoficial` | `1a6e0fe459a39ee60092fa15ec21c5542120b3a2` |

Both commits are GitHub-style `Merge pull request #…` with two parents (true merge). Timeline events are `merged` + `closed` only. **UNPROVEN from GitHub:** whether `--match-head-commit` or REST `sha` was used — the API does not store the CLI. **PROVEN:** the pin agent did not invoke either ship controller.

That bypasses:

- DietFlow: local smoketest ticket, `--match-head-commit`, `BASE_MOVED` re-check, identity gate, attestation, draft→ready path.
- CI Queue: `check` ticket, frozen target, REST `sha=H`, parent inspection, `--no-remote` policy.

---

## 5. Code debt vs process failure

### Process failure (agent did not run the pack)

- DietFlow: `npm run ship` already defaults to `noRemote` because `scripts/ship/remote-verdict.json` is `skipped`. No new file, flag, or code was required.
- CI Queue: `ci-queue ship --no-remote` already skips Actions. No new code. The agent ran `gh pr merge` after a checkout-local `npm run check`.
- Visible Vite progress required `enqueue` of a `progress: true` recipe **into the installed queue**, not a foreground `npm run check` / `ci:smoketest`.

### Debt that **prevents** using the commands today (fail-closed)

| Obstacle | Who it blocks | Evidence |
| --- | --- | --- |
| DietFlow identity | `npm run ship` on Mac | `git user.name` and `gh` must be `Dietflowoficial` / `dietflowoficial`. Personal `nmarcofernandess` → `WRONG_IDENTITY` (`ship.ts:199-208`, `ship.test.ts:256-258`). Pin agent **did** `gh auth switch --user nmarcofernandess` for CI Queue; that identity cannot DietFlow-ship until switched back. |
| DietFlow canonical checkout | `npm run ship` from `dietflow-app` on `dev` | Ship refuses branch `dev` (`ship.ts:227-232`). Process rule: canonical stays on `dev`; ship from the **lane** worktree. |
| Dirty tree | both | DietFlow `DIRTY_TREE` (`ship.ts:222-225`). CI Queue `TARGET_INVALID` (`system-ops.ts:483-484`). Untracked files count. This CI Queue worktree currently has `?? specs/` — **would fail ship until that is committed or ignored**. |
| CI Queue default `wait` | `ci-queue ship` without flags | Missing `remote-verdict.json` + missing `ship.remoteVerdict` → `SHIP_CONFIG` (`ship.ts:202-206`). Not a missing feature: `--no-remote` is the documented path (`CONSUMER-QUICKSTART.md:19-22,66-67`). |
| CI Queue GitHub account | `ci-queue ship` for `nmarcofernandess/ci-queue` | Active `gh` as `dietflowoficial` cannot resolve that repo. Must run ship under `nmarcofernandess`. Product does not switch accounts. |
| Catalog must be **in H** | CI Queue ship | Worktree `ci-queue.json` must equal `HEAD:ci-queue.json` (`system-ops.ts:327-328`). Uncommitted catalog → `CONFIG_CHANGED`. |
| Ticket cwd | both | DietFlow: `job.cwd === ops.cwd()` (`queue-ticket-contract.ts:274`). CI Queue: absolute cwd realpath (`eligibility.ts:121-122`). Smoke/`check` from another worktree does not count. |
| `runtime-probe` is not proof | DietFlow merge | Catalog test: `acceptedPresets` must not contain `runtime-probe`. Ship still demands smoketest for material PRs. |
| Two workers | enqueue wait, not merge API | Second `ci-queue worker` returns `busy: true` (`src/core/worker.ts:88-89`). Launchd worker + a second drain is fail-closed. Installer refuses `running.json` / `runner.lock` (`docs/INSTALL.md:33-34`). Does **not** implement merge. If the LaunchAgent is down, `ship` / `ci:queue --wait` hang until `--timeout-ms`. |
| `abortOnStaleBase: true` on `check` and DietFlow smoke | long tickets | If `origin/dev` moves mid-job, spend-abort can fail the ticket (`CI-QUEUE-CONSUMIDOR.md:72-82`). Ship then sees `LOCAL_RED`. Capability exists; it is not a missing merge command. |
| Dashboard binding | Vite visibility only | `ci-queue init` does not write the project registry (`src/ship/init.ts:251-253`, `CONSUMER-QUICKSTART.md:31-32`). Ship does not need the UI. Progress on Vite does. |
| DietFlow post-merge main worktree | `npm run ship` tail | Main checkout must be clean `dev` or post-merge throws (`ship.ts:606-611`). Does not block the GitHub merge once `gh pr merge` succeeded. |
| Stale CLI contract doc | none | `src/contracts/CLI-CONTRACT.md:18-20` omits `ship` / `init`. Code has them. |

### Not missing

- Local proof + skip Actions + pinned merge: implemented on both sides.
- DietFlow `match-head-commit`: implemented.
- CI Queue REST `sha=H`: implemented.
- Progress emitters for DietFlow smoketest and CI Queue `check`: already `progress: true`.
- Worker/ship separation: worker does not merge.

---

## 6. Minimum operator sequence (Vite progress + local proof + ship, no Actions)

Assume: one LaunchAgent worker on `~/.local/state/local-ci/queue` (or `CI_QUEUE_STATE_DIR`); dashboard bound to both project ids; trees clean; PRs open **draft** against `dev`; HEAD published.

### DietFlow (worktree `dietflow-ci-queue-node-pin`, not `dietflow-app`)

```bash
# identity (Mac + fila)
git config user.name    # Dietflowoficial
gh auth status          # dietflowoficial

npm run ci:queue:status
npm run ci:queue -- smoketest --wait
# Vite: ticket smoketest, flags.progressEnabled true, stages from local-stack.

npm run ship -- --dry-run
npm run ship
# remote-verdict.json already skipped → equivalent to --no-remote:
# reuse ticket or enqueue smoke, attest best-effort, gh pr ready if draft,
# gh pr merge --merge --match-head-commit HEAD, no Actions watch.
```

If the smoketest ticket already exists for this HEAD+base+cwd, skip the explicit enqueue; `npm run ship` reuses it.

Do **not** substitute `runtime-probe` or a checkout-local `npm run ci:smoketest` if a queue ticket is required (persistent queue path).

### CI Queue (this repo, account `nmarcofernandess`)

```bash
gh auth switch --user nmarcofernandess   # product does not do this

npm run ci-queue -- enqueue check --wait --json
# Vite: preset check, @@ci-queue-progress stages from check-with-progress.sh.

npm run ci-queue -- ship --dry-run --no-remote --json
npm run ci-queue -- ship --no-remote --json
# enqueues check if missing, attest local/check, mark ready if draft,
# PUT merge sha=H. Without --no-remote → SHIP_CONFIG today.
```

`--pr` if more than one open PR (`cli.ts:174-175`, `PR_AMBIGUOUS`).

### What this sequence does **not** do

- GitHub Actions `ci-verdict` / `ci-queue-verdict.yml` (neither catalog points at a wait workflow).
- DietFlow Full (advisory).
- Installing a new CI Queue release (separate from ship).
- Binding the dashboard (must already be done for Vite; ship still works without it).

---

## Could an agent have used these without new code?

**Yes.**

| Merge | Command that already existed | Why the pin agent didn’t |
| --- | --- | --- |
| DietFlow #1292 | `npm run ship` in the pin worktree | Process: plan said no smoketest; used `gh pr merge`. Identity would have worked as `dietflowoficial` (`git user.name` in that worktree is `Dietflowoficial`). |
| CI Queue #10 | `ci-queue ship --no-remote` after `enqueue check` | Process: ran `npm run check` in-checkout, then `gh pr merge`. Default `ci-queue ship` would have **failed closed** (`SHIP_CONFIG`) — the flag `--no-remote` was the missing **invocation**, not missing code. |

New code is not required to satisfy: Vite-visible queued progress + local proof + merge without Actions. Required operator facts: correct `gh` account, clean tree, one worker, DietFlow identity, CI Queue `--no-remote`, smoketest/`check` through the queue.
