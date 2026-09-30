# Q1 disk inventory (no prune)

Date: 2026-09-20
Status: INVENTORY_ONLY — **prune is NOT authorized**
Cycle: Q2+Q3 observe cut · Q1 satellite
Bases: CI Queue `381010175e4e` · DietFlow `a86d66b1af25`
Sources: design satellite (`2026-09-20-q2-q3-observe-cut-design.md` § Satellite — Q1 inventory) + evidence package `~/Downloads/CI-QUEUE-Q1-Q3-2026-09-20/` (`RELATORIO-Q1-Q3.md`)
Operator volume: Data volume ~3–6 Gi free (fluctuating; 98–99% full)

This document is a **metadata map**. No deletions were performed in this cycle. Future prune requires separate operator approval, synthetic-state tests, and preserved hashes for logs/history.

---

## Measurement table (2026-09-20, operator Mac)

| Class | Path | Size (approx) | Notes |
| --- | --- | --- | --- |
| Official DietFlow queue state | `~/.local/state/local-ci/queue` | **57M** | history 7.3M (224 files), logs 3.9M (43), artifacts **45M** (11 tickets), runtime ~104K |
| Default `Application Support/ci-queue` | not present | — | Operator path is `local-ci`, not this default |
| Installed releases | `~/.local/share/ci-queue` | 149M | multiple release dirs ~11–14M each |
| DietFlow worktrees (sum) | `~/dietflow-*` | **~79G** logical | Dominant population |
| Example WT `.next` | ap17 / 123-04 | 3.1–3.9G each | Build cache, not queue copy |
| Example WT `node_modules` | ap17* | 1.7–1.8G each | |
| Active job cwd artifacts | `dietflow-123-05-anamnese` | proofs 3.5M | Live `ci:queue e2e` observed during inventory — do not disturb |
| `/tmp/next-server.log` | present | small | E2E server log; not ticket-preserved |
| TMPDIR | `$TMPDIR` | 241M | |

Exact ENOSPC failing path/ticket was **not** captured in this measurement pass. Optional follow-up if it recurs.

---

## ENOSPC class ranking

Explicit order for free-space pressure on this Mac:

1. **Worktrees / `.next` / `node_modules`** — primary consumers (~79G logical worktrees; multi-GB per WT caches). Not owned by queue terminal cleanup.
2. **Installed releases** (`~/.local/share/ci-queue`, ~149M) — secondary.
3. **Queue state** (`~/.local/state/local-ci/queue`, **~57M**) — tertiary today. Artifacts 45M are inspection copies; amplification risk exists (global copy list may re-copy old proofs) but absolute size is small vs worktrees.

```text
worktrees / .next / node_modules  ≫  releases  ≫  queue (~57M)
```

Do not treat queue artifacts as the ENOSPC primary on current measurements.

---

## Readers of each proof / path class

| Class / path | Who consumes | Retention posture (inventory) |
| --- | --- | --- |
| `history/<id>.json` | CI Queue API, dashboard, CLI status/history | Evidence — preserve |
| `logs/<id>.log` | Operators, failure diagnosis, API log views | Evidence — preserve |
| `progress/<id>.json` (sidecar) | Live strip / progress summary while job runs | Consolidated into ticket; sidecar dropped after authoritative close |
| `runtime/...` | Binding shims / preload for the running job | Discard after authoritative close (existing product rule) |
| `queue/artifacts/<ticketId>/…` | Operators inspecting ticket artifacts; dashboard/API artifact browse | Inspection copies; not auto-pruned today; not primary ENOSPC |
| Consumer cwd `artifacts/proofs`, `artifacts/flowui-ci`, `test-results`, `playwright-report` | DietFlow recipes + CI Queue `copyArtifacts` (global list) | Producer owns durability; copy amplifies if old trees re-copied |
| `artifacts/ci/runs/.../receipt.json` | DietFlow execution-evidence | **Not** on global copy list — producer owns persistence |
| `artifacts/export-v2-atlas/runs` | DietFlow `export-atlas` recipe | **Not** on global copy list — producer owns persistence |
| Worktree `.next` (minus cleaned `standalone`) | Next build cache / E2E diagnostics | Consumer WT policy; E2E may leave cache after run |
| Worktree `node_modules` | Install / recipe execution | Consumer WT; not queue-owned |
| `/tmp/next-server.log` | E2E server log (default `SERVER_LOG`) | Not ticket-preserved; overwritten/removed at next server start |
| `$TMPDIR` | Suite / OS temp | Attribute before classifying orphan |
| Installed releases | `ci-queue` binary / package install | Product install layout |

`passed` does **not** prove every external proof was published: artifact copy failure is non-status-flipping; missing source paths are skipped.

---

## What may be pruned later vs never

All of the below is **policy for a future approved cycle**. Nothing below is authorized now.

### May be pruned later (under separate approval + synthetic-state tests)

- Queue **runtime** residues after authoritative close (already product rule; confirm no live job).
- Redundant **inspection copies** in `queue/artifacts/<id>/` after readers and retention policy are defined.
- Stale **worktree** build caches (`.next`) / unused worktrees — **consumer/operator ownership**, not queue terminal cleanup.
- Old **installed release** dirs when a newer install is verified and rollback policy is clear.
- Attributable **TMPDIR** / scratch with proven ownership and no open processes.

### Never prune without explicit product + operator decision (and usually never as “ENOSPC fix”)

- `history/` and `logs/` (and ledger/manifest hashes required for recovery).
- Authoritative tickets still needed for ship/observability contracts.
- Proofs whose only durable copy has not been validated elsewhere.
- Paths of an **active** job (cwd, runtime, locks, claims, live worktree under observation).
- Unknown paths that merely contain the word `artifacts`.
- Bulk `rm -rf queue/artifacts/*` or “delete everything from green jobs”.

---

## Explicit: prune is NOT authorized

- This cycle delivers **inventory documentation only**.
- **No deletions** of queue artifacts, worktrees, releases, `/tmp`, or TMPDIR contents were performed.
- Silent `rm` remains out of scope (see design Non-goals).
- Any future prune: separate approval, synthetic-state tests, preserved hashes for logs/history.

---

## References

- Design: `2026-09-20-q2-q3-observe-cut-design.md` (§ Satellite — Q1 inventory), preservado apenas no resgate local de 21/09/2026; não é arquivo deste repositório.
- Evidence: `~/Downloads/CI-QUEUE-Q1-Q3-2026-09-20/RELATORIO-Q1-Q3.md` (§1 Q1 populations + § Bloco Q1)
- Declared bases: CQ `3810101` / DF `a86d66b` cycle (`381010175e4e` / `a86d66b1af25`)
