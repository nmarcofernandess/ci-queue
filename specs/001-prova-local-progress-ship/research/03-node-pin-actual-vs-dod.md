# Node pin: intent / DoD vs what was actually proven

Date of this note: 2026-09-18.
Verdict: **the pin shipped. The pin did not prove itself as a job of this product, on this machine, in the installed queue.** What exists in `~/.local/state/local-ci/queue` is one DietFlow identity probe (`node -p`). Everything else is checkout tmp, CLI side effects, or later lanes that are not this DoD.

Repos read:

- CI Queue `/Users/marcoantonio/ci-queue` at `spec/prova-local-progress-ship` = `origin/dev` = `f4f502ed30fa` (merge of [PR #10](https://github.com/nmarcofernandess/ci-queue/pull/10)).
- DietFlow worktree `/Users/marcoantonio/dietflow-ci-queue-node-pin` at `codex/ci-queue-node-pin` = `07df9a6aa` ([PR #1292](https://github.com/dietflowoficial/Dietflow-app/pull/1292)).
- Canonical DietFlow `/Users/marcoantonio/dietflow-app`: **not edited**. Still `dev` @ `60bf35977` (#1291), **behind `origin/dev` by 2** (`07df9a6aa` + merge `1a6e0fe45`).
- Installed product: `~/.local/share/ci-queue/installation.json` revision `f4f502ed30fa`, state root `~/.local/state/local-ci/queue`.

No code was changed for this note.

---

## 1. Intent and DoD of the pin

### Contract (what the code claims)

`node-runtime-guard-v1` is opt-in, per `projectId`, in `<state-root>/runtimes.json`. It is **not** a field of `ci-queue.json`. Without a registry entry the job stays `unconfigured` and inherits the legacy environment. `verified` covers **observed** processes, not the descendant tree.

```30:36:docs/CONTRACTS.md
A capability `node-runtime-guard-v1` anuncia o pin opt-in de Node por
`projectId` em `<state-root>/runtimes.json`. Sem entrada, o job permanece
`unconfigured`. Com entrada, o receipt em `history/<id>.json` registra o
executável, a versão e as observações. `verified` cobre processos observados,
não a árvore inteira. Detalhe: [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md).
`ci-queue runtime show|register` grava o registry; não coloque o pin em
`ci-queue.json`.
```

```1:21:docs/RUNTIME-ISOLATION.md
# Runtime por job: pin opt-in

Estado: **camada 1 — hardening de espaço de usuário, não isolamento de SO**.
`verified` significa que os processos observados concordaram com o Node registrado.
Não significa que toda a árvore de descendentes foi mediada.
...
Sem entrada para aquele projeto, o job permanece `unconfigured`: herda o
ambiente legado e executa o argv como hoje.
```

Fail-closed without registry is an explicit non-goal. Implementation:

```205:222:src/core/runtime.ts
/**
 * Local, operator-owned registry: no global PATH/nvm lookup, no recipe re-entry.
 * Binding is opt-in: without a project entry the job keeps the inherited environment.
 */
export function prepareJobRuntime(...) {
  ...
  if (!binding) return unconfigured(argv, inherited)
```

Tests that encode the same rule:

- `without a registry entry a Node recipe stays unconfigured and still runs` (`tests/runtime/isolation.test.mjs`)
- `login shell is not rejected until a project runtime is registered`
- `runtime register pins a project by absolute Node without failing closed by default`

The `env -i` + absolute foreign Node hole is a **documented non-goal**, with a test that **requires** `passed` + `verified` + the foreign Node still wrote `forbidden`:

```46:55:docs/RUNTIME-ISOLATION.md
## Limite reproduzido
bash -c '/usr/bin/env -i /absolute/other-node -e "/* trabalho */"'
...
O ticket pode terminar `passed` com `runtime.state=verified`,
porque o launcher observado concordou e o filho não carregou o preload.
```

### Plan DoD (what the pin agent accepted before coding)

Plan name: “Node pin camada 1”. Cut vs GPT draft #9:

1. Opt-in. No binding → `unconfigured`. Do **not** refuse because `engines.node` / `.nvmrc` exist or `argv[0]` is `node`/`npm`.
2. Mac `realpath` (`/var` vs `/private/var`).
3. Honest receipt. `verified` ≠ sandbox. Keep the `env -i` test as a visible regression, not an isolation badge.
4. Announce `node-runtime-guard-v1`.
5. CLI `runtime show|register` writes `runtimes.json` mode `0600`.
6. No new Dashboard card, no JSX, no schema bump, no pin field in consumer `ci-queue.json`, **no fail-closed global**.
7. CI Queue proof named in the plan: **`npm run check` on this Mac** (local process). DietFlow proof named in the plan: **enqueue `runtime-probe`**, then CLI `register --version 99.0.0`, restore 24.20. **Not Full. Not smoketest. Not last-green.**

The plan mermaid still drew `Ticket DietFlow argv npm`. The catalog recipe they actually shipped is `node -p`, not `npm`. That substitution is in the DoD of the consumer lane, and it is weaker than “a bound DietFlow npm recipe”.

Explicitly out of that plan: Endpoint Security / exec mediation / Full / smoketest / `env -i` closure.

### What merged

| Repo | PR | Merge | Commits |
| --- | --- | --- | --- |
| CI Queue | [#10](https://github.com/nmarcofernandess/ci-queue/pull/10) `fix/per-job-node-runtime` → `dev` | `f4f502ed30fa` | `e37a7d2` (guard + coverage limits) then `59c7c95` (opt-in only when registered). Draft #9 closed as superseded, not merged. |
| DietFlow | [#1292](https://github.com/dietflowoficial/Dietflow-app/pull/1292) `codex/ci-queue-node-pin` → `dev` | `1a6e0fe45` @ 2026-09-18T03:04:33Z | `07df9a6aa` only. Canonical checkout was not the editor. |

Install of that revision: `installation.json` `installedAt` `2026-09-18T03:01:12.360Z`, `stateRoot` `~/.local/state/local-ci/queue`.

---

## 2. CI Queue tests vs the INSTALLED state root

### What exists in git

| Suite | Path | What it hits | State root |
| --- | --- | --- | --- |
| Isolation | `tests/runtime/isolation.test.mjs` | `runJob` / `prepareJobRuntime` / `registerProjectRuntime` against a **fixture** | `mkdtempSync(join(tmpdir(), 'ci-queue runtime '))` — **never** `~/.local/state/local-ci/queue` |
| CLI register | `tests/core/queue-engine.test.ts` `"registers an absolute Node into the operator runtime registry"` | `ci-queue runtime register` + `show` | `mkdtempSync(join(tmpdir(), "ci-queue-runtime-registry-"))` |
| Capability | same file, `"announces the execution flags..."` | `version --json` contains `node-runtime-guard-v1` | none |
| Product check | `package.json` `"check": "bash scripts/ci/check-with-progress.sh"` → build + `npm test` (includes `test:runtime`) + `check:ui` + Playwright | local npm in the **git checkout** | none |

`test:runtime` is `npm run build && node --test tests/runtime/*.test.mjs`. It is inside `npm test`, therefore inside `npm run check`. That is a local process. It is not `ci-queue enqueue check`.

On this Mac, `os.tmpdir()` is `/var/folders/zf/.../T`; `realpath` of that is `/private/var/folders/zf/.../T`. The isolation fixtures live there. That is the “git checkout tmp” the pin agent ran: **product tests writing ephemeral state under `/var/folders`, not tickets under the installed queue.**

Isolation cases (32 named `test(...)` plus 8 login-argv loops plus 3 npm/npx loops). One of them is skipped unless `CI_QUEUE_TEST_SECOND_NODE` is set (`real different-major runtime matrix`). None of them call enqueue against the installed root.

### Did any of those create tickets in the installed state on 2026-09-18?

**No.**

Nine `history/20260918*.json` files exist. Zero have `cwd=/Users/marcoantonio/ci-queue`. Zero have `preset=check`. Zero have `projectName=CI Queue`. Zero have `requestedBy` from the isolation fixture (`requestedBy: "test"` never appears).

| Ticket | Time (UTC) | Preset | cwd | `runtime` key | Status | Whose lane |
| --- | --- | --- | --- | --- | --- | --- |
| `20260918003901-d2acf248` | 00:39 | `smoketest` | `.codex/worktrees/348d/dietflow-app` | **absent** | passed | other, **before** install 03:01 |
| `20260918014232-d7c47e89` | 01:42 | `p7-selection-search-lab` | `dietflow-ci-queue-progress` | **absent** | failed | progress PR, before install |
| `20260918014439-d4617f6f` | 01:44 | `smoketest` | `dietflow-ci-queue-progress` | **absent** | passed | progress PR, before install |
| **`20260918030255-9d3a6e7e`** | **03:02** | **`runtime-probe`** | **`dietflow-ci-queue-node-pin`** | **present** | **passed** | **the pin** |
| `20260918175235-14c833bf` | 17:52 | `clinical-readonly` | `dietflow-ap17-full-fixes` | present | failed | other lane, ~15h later |
| `20260918175401-81b4ac76` | 17:54 | `clinical-readonly` | same | present | failed | other |
| `20260918175855-5148da91` | 17:58 | `clinical-readonly` | same | present | passed | other |
| `20260918181258-9b573bac` | 18:12 | `clinical-readonly` | same | present | failed | other |
| `20260918181737-7582958f` | 18:17 | `clinical-readonly` | same | present | failed | other |

Six tickets in the **entire** history (3025 files) have a `runtime` object. All six are 2026-09-18 after install. The pin agent owns **one** of them.

CI Queue `check` tickets **do** exist, but they are 2026-09-17, **before** PR #10, **without** `runtime`:

| Ticket | Created | Status | runtime | cwd |
| --- | --- | --- | --- | --- |
| `20260917171206-404ee273` | 17:12 | failed | absent | `/Users/marcoantonio/ci-queue` |
| `20260917171827-6b7c31d7` | 17:18 | failed | absent | same |
| `20260917172810-6dfde790` | 17:28 | cancelled | absent | same |
| `20260917173225-aef7afa4` | 17:32 | failed | absent | same |
| `20260917173548-c8bb717e` | 17:35 | failed | absent | same |
| `20260917174431-924a99a4` | 17:44 | cancelled | absent | same |
| `20260917174544-af5939e5` | 17:45 | **passed** | **absent** | same (`codex/demo-local-check-merge`, `d9dafd1`) |

Last enqueued `check` of this product: the day **before** the pin, on a different branch, with no receipt. The pin agent’s `npm run check` is **not** in this table because it never became a ticket.

`runtimes.json` in the installed root contains **only** DietFlow `da61d8ae-19f9-4dce-bafb-02271a6f1601`. CI Queue `070e4c47-709b-4fe1-9f98-d80d313a87f4` was never registered. Even if they had enqueued `check` after the pin, the job would have been `unconfigured` unless they also registered that `projectId`.

A leftover `runtime-probe` from 2026-09-17 (`20260917210010-107a2327`, cwd Codex worktree, argv `bash -c "..."`) **failed** and has **no** `runtime` field. That is not PR #1292 and not this pin.

---

## 3. The one installed-queue proof

Ticket **`20260918030255-9d3a6e7e`**.

Quoted from `~/.local/state/local-ci/queue/history/20260918030255-9d3a6e7e.json`:

```json
"preset": "runtime-probe",
"cwd": "/Users/marcoantonio/dietflow-ci-queue-node-pin",
"branch": "codex/ci-queue-node-pin",
"headSha": "60bf35977324a4f1e2824fe1aa8ae63a7740b50d",
"command": "node -p \"JSON.stringify({version:process.versions.node,execPath:process.execPath})\"",
"argv": ["node", "-p", "JSON.stringify({version:process.versions.node,execPath:process.execPath})"],
"projectId": "da61d8ae-19f9-4dce-bafb-02271a6f1601",
"projectName": "DietFlow",
"status": "passed",
"runtime": {
  "capability": "node-runtime-guard-v1",
  "coverage": "guarded-node-processes",
  "state": "verified",
  "node": {
    "executable": "/Users/marcoantonio/.local/share/dietflow-runtime/node/v24.20.0-darwin-arm64/bin/node",
    "version": "24.20.0"
  },
  "bindingSource": "project-registry",
  "environmentPolicy": "reconstructed"
}
```

Log line:

```text
[runtime] /Users/marcoantonio/.local/share/dietflow-runtime/node/v24.20.0-darwin-arm64/bin/node v24.20.0; coverage=guarded-node-processes
{"version":"24.20.0","execPath":"/Users/marcoantonio/.local/share/dietflow-runtime/node/v24.20.0-darwin-arm64/bin/node"}
```

Literal constraints on this “proof”:

| Fact | Literal |
| --- | --- |
| Identity probe | `node -p` prints version + execPath. One observation, `entry: "[eval]"`. |
| Not a product check | CI Queue `preset=check` / `npm run check` did not run. |
| Not a smoketest | DietFlow `smoketest` on 2026-09-18 has **no** `runtime` key and ran **before** install. |
| Not an npm recipe | argv[0] is `node`, not `npm`. No `node_modules/.bin`, no `npm test`, no Playwright. |
| No recipe progress | Catalog preset has **no** `progress: true`. Ticket `progress.nodes` length **1**: collector node `artifacts`. |
| Dirty tree | `preflight.statusShort` shows `M ci-queue.json`, `M docs/ci/CI-QUEUE-CONSUMIDOR.md`, `M scripts/ci/queue-ticket-contract.ts`, `?? scripts/ci/__tests__/runtime-probe-catalog.test.ts`. `headSha` is still `#1291` (`60bf35977`). Commit `07df9a6aa` is **after** the ticket (`AuthorDate` 2026-09-18T03:04:09Z vs ticket `createdAt` 03:02:55Z). They proved uncommitted files. |
| Sidecar gone | `runtime.evidencePath` pointed at `runtime/job-gqlOSr/processes.jsonl`. That directory is absent now (contract: drop sidecars after history is authoritative). |

This proves: **with DietFlow registered, a one-shot `node -p` on the dirty worktree used dietflow-runtime 24.20.0 and the receipt said `verified` / `guarded-node-processes`.** It does not prove CI Queue `check`, DietFlow npm, progress in the Vite UI, ship, or Mac `/var` vs `/private/var` (the registered binary is already under `~/.local/share`, not tmpdir).

Later `clinical-readonly` tickets (17:52–18:17) **are** bound npm recipes with `runtime.state=verified`. They are **not** this pin’s proof: different worktree, different agent, hours later, four failures, one pass, `progress.nodes=1` (artifacts only). Do not steal them.

---

## 4. DietFlow changes (worktree only)

Commit `07df9a6aa` — 4 files, +56/−6:

| File | Change |
| --- | --- |
| `ci-queue.json` | preset `runtime-probe`: note “Identidade do Node efetivo. Nao e proof de ship.”; argv `node -p JSON.stringify({version,execPath})`; **no** `progress`, **no** `fetchBase`, **no** `abortOnStaleBase`. `ship.acceptedPresets` remains `["smoketest"]`. |
| `scripts/ci/queue-ticket-contract.ts` | `isValidPresetArgv` closed union grew from `npm\|npx` to `npm\|npx\|node`. |
| `scripts/ci/__tests__/runtime-probe-catalog.test.ts` | catalog unit test: preset exists, `argv[0]==="node"`, validator true, not in `acceptedPresets`. |
| `docs/ci/CI-QUEUE-CONSUMIDOR.md` | pin lives in `runtimes.json`; install with absolute dietflow-runtime Node; `npm run ci:queue -- runtime-probe --wait`; “Não é proof de ship”. |

Canonical `/Users/marcoantonio/dietflow-app`: **zero edits, zero commits, zero `switch`**. `git status` `dev...origin/dev [behind 2]`. HEAD `#1291`. The two missing commits **are** #1292. The operator’s canonical checkout simply was not updated. That is the rule, followed.

The catalog Jest file was not run as a DietFlow `npm test` job. The pin agent executed a one-off `tsx -e` against the worktree (no `node_modules` there) using the canonical checkout’s `tsx`. That is also not a queue ticket.

---

## 5. What the pin agent should have done to close **its own** implementation

This section is **not** the later progress/ship demand of this spec. It is the minimum to say “the pin works as a product on this Mac.” Plan DoD was weaker (local `npm run check` + identity probe). Closing the implementation still required the rows below.

| Action | Why it belongs to the pin | Status |
| --- | --- | --- |
| Enqueue CI Queue `check` on the **installed** worker, `progress: true` visible in history / Vite | `ci-queue.json` already declares `presets.check.progress=true`, `argv=["npm","run","check"]`, `ship.acceptedPresets=["check"]`. `check-with-progress.sh` emits `@@ci-queue-progress` stages. The isolation suite never becomes a dashboard job. | **MISSING.** Last `check` ticket is 2026-09-17, no `runtime`, pre-pin. 2026-09-18 history has zero `check`. CI Queue `projectId` is not in `runtimes.json`. |
| Maybe a bound DietFlow **npm** recipe | Plan mermaid said `argv npm`. Real DietFlow recipes are `npm run …`. `node -p` does not exercise shims for `npm`/`npx`, `npm_execpath`, or `node_modules/.bin/node`. Isolation covers those only in tmp. | **MISSING** as pin-agent proof. Incidental `clinical-readonly` npm jobs later are not this close-out. |
| Mac `realpath` (`/var` vs `/private/var`) | Plan item 2. Guard uses `fs.realpathSync` (`src/core/runtime-guard.ts:19`, compare at `:40` and `:53–55`; register path `src/core/runtime.ts:85`). Isolation fixtures **are** under `/var/folders` → `/private/var/folders`. | **DONE in checkout tests (tmp).** **NOT** done as an installed-queue ticket. The probe’s Node path does not sit on that symlink. |
| `register --version 99.0.0` then restore 24.20 | Plan DietFlow DoD. CLI: `src/cli.ts` passes `--version` into `registerProjectRuntime`; mismatch throws `RUNTIME_VERSION_MISMATCH` (`src/core/runtime.ts:187`). Isolation also uses `version: '99.0.0'` in tmp (`fails before work when the registered exact version diverges`). | **PARTIAL.** Isolation: done in tmp. Installed CLI: **claimed** in PR #1292 body (“Register `--version 99.0.0` recusou; binding 24.20 restaurado”). **No ticket, no log line, no history JSON.** Grep of the installed state root for `99.0.0` / `RUNTIME_VERSION_MISMATCH`: **zero hits.** Current `runtimes.json` is 24.20.0. Unreproducible from the queue. |

Pin-agent `npm run check`: **claimed done** in PR #10 test plan and the agent wrap-up. Confirmed as a **git-checkout process**, including `test:runtime` writing `os.tmpdir()`. **Confirmed not a queue ticket.** Treat that as unit/product suite, not installed proof.

---

## 6. Code debt vs test / procedure debt

Keep these lists separate. Mixing them is how `verified` got sold as isolation.

### Remaining CODE holes (including documented non-goals)

| Hole | Status in code | Notes |
| --- | --- | --- |
| `env -i` + absolute other Node | **Documented non-goal.** Test asserts `passed` + `state=verified` + `forbidden` exists. | User-space preload cannot see a descendant that wiped the environment. Not a missed fix of this PR. |
| Nested absolute shells, replaced `NODE_OPTIONS`, rewritten evidence, binary swapped mid-job | Named in `docs/RUNTIME-ISOLATION.md` “Outros riscos no mesmo UID”. | Same UID, not a sandbox. |
| OS exec policy / Endpoint Security | Explicit non-goal of camada 1. | |
| Login / interactive rejection only **with** binding | Intentional opt-in. Unconfigured `bash -lc` still runs. | Test: `login shell is not rejected until a project runtime is registered`. |
| Shell **program strings** are not parsed | `validateRuntimeArgv`: “shell program strings are not statically parsed.” Nested `bash -c '/usr/bin/env -i …'` is how the bypass is spawned. | |
| Unknown `isolation: 'strict'` | Rejected (`RUNTIME_CONFIG_INVALID`). | Prevents a fake strict badge. Not a sandbox. |
| `verified` + `passed` can coexist with unmediated descendants | Contract, not a bug. Dashboard has no runtime card (`passed` alone does not prove pin). | |
| Worker `--node` vs job pin | Two different files. LaunchAgent pins the worker interpreter; `runtimes.json` pins jobs. | Documented in INSTALL / RUNTIME-ISOLATION. |

The `env -i` bypass is **not** test debt. The test exists so nobody can relabel `verified` as isolation.

### Remaining TEST / procedure holes (this pin’s close-out)

| Hole | Literal |
| --- | --- |
| Did not enqueue CI Queue `check` after the pin | No 2026-09-18 `check` ticket. Progress stages of `npm run check` never hit the installed dashboard for this revision. |
| Did not register CI Queue `projectId` | `runtimes.json` keys = `[da61d8ae-…]` only. Product check would still be `unconfigured`. |
| Did not ship | No `ci-queue ship` / attestation ticket for `f4f502e`. Out of pin plan; still unproven for the product that just gained the pin. |
| Did not smoke (and was told not to) | Plan forbade Full/smoketest. 2026-09-18 smoketests are **other lanes**, **pre-install**, **no `runtime`**. They do not prove the pin. |
| Did not enqueue a bound DietFlow npm recipe as pin proof | Probe is `node -p`. |
| `99.0.0` on the installed registry left no durable evidence | CLI stdout, then restore. State root has no trace. |
| Multi-major matrix skipped | `CI_QUEUE_TEST_SECOND_NODE` unset → test skipped. One Node major in the isolation run. |
| Probe ran dirty, before the DietFlow commit | `headSha` `#1291`; catalog files uncommitted. |
| Isolation / CLI register never touched the installed root | `tmpdir()` / `mkdtempSync`. After `after()`, those dirs are `rmSync`’d. |

---

## Evidence table (claim vs fact)

| # | Claim | Fact | Where |
| --- | --- | --- | --- |
| 1 | Pin is opt-in `runtimes.json`, fail-open without registry | True in docs + `prepareJobRuntime` + isolation tests | `docs/CONTRACTS.md:30-36`, `docs/RUNTIME-ISOLATION.md:18-20`, `src/core/runtime.ts:205-222` |
| 2 | `node-runtime-guard-v1` announced | True in CLI test | `tests/core/queue-engine.test.ts:403` |
| 3 | `npm run check` proved the pin on this Mac | Proved the **suite** in the git checkout (tmp fixtures). Did **not** create an installed ticket | `package.json:12,16,26`; history 2026-09-18 has no `check` |
| 4 | Isolation tests exercise the installed queue | False. `mkdtempSync(join(tmpdir(), 'ci-queue runtime '))` | `tests/runtime/isolation.test.mjs:15-21`. This Mac: `/var/folders` → `/private/var/folders` |
| 5 | CLI `runtime register` tested | True against **tmp** state, not `~/.local/state/local-ci/queue` | `tests/core/queue-engine.test.ts:409-410` |
| 6 | Installed queue proved the pin | **One** ticket: `20260918030255-9d3a6e7e`, identity `node -p`, `state=verified`, `coverage=guarded-node-processes`, `version=24.20.0` | `history/20260918030255-9d3a6e7e.json` `runtime` block; log `[runtime]` line |
| 7 | That ticket is a product check | False | argv is `node -p`, not `npm run check` |
| 8 | That ticket is a smoketest | False | preset `runtime-probe`; smoketests that day have no `runtime` |
| 9 | DietFlow catalog + `isValidPresetArgv` allows `node` | True in worktree commit `07df9a6aa` | `ci-queue.json:38-45`, `queue-ticket-contract.ts:294-300` |
| 10 | Canonical `dietflow-app` edited | False. Behind origin/dev by #1292 | `git -C ~/dietflow-app status -sb` |
| 11 | `register 99.0.0` proved on the installed root | **Claimed** in PR #1292. **Not** in history/logs | grep state root: 0 hits |
| 12 | Mac realpath fixed | Code + tmp tests. Not an installed-queue observation | `src/core/runtime-guard.ts:19,40,53-55` |
| 13 | `env -i` closed | False, on purpose | `isolation.test.mjs:271-278`; RUNTIME-ISOLATION “Limite reproduzido” |
| 14 | CI Queue itself is pinned | False | `runtimes.json` has only DietFlow |
| 15 | Later `clinical-readonly` proves the pin DoD | False. Other lane, not the probe, not `check` | history 17:52–18:17 |

---

## Bottom line

The pin **is** in `origin/dev` (`f4f502e`), **is** installed (`0.1.0-f4f502ed30fa`), **is** bound for DietFlow 24.20.0, and **did** print the right `execPath` once.

What was **not** proven, and was the pin’s own job to prove: this product’s `check` as a ticket with progress; a bound `npm` recipe; durable `99.0.0` refusal on the installed registry; CI Queue listed in `runtimes.json`. Calling local `npm run check` in `/var/folders` a queue proof is a category error. The identity probe is exactly as large as `node -p`.
