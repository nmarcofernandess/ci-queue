# Research index — 001-prova-local-progress-ship

Grok recon for the next Superflow phases. Read these before Analyst, Build, or DietFlow patches. Do not treat summaries in chat as source of truth.

| File | Question it answers |
| --- | --- |
| `01-ci-queue-progress-ship.md` | Capability on `origin/dev` immediately before Node pin PR #10 (`61069f4`). Preset `check`, progress wrapper, collector, Vite, `ci-queue ship --no-remote`. What deserved to be an installed-queue job vs what ran in tmp. |
| `02-dietflow-progress-ship.md` | DietFlow #1291 + direct-push `19c491a3f`. Progress chain, 12/34 presets with `progress: true`, ratchet that forbids a 13th, ship pack with `scripts/ship/remote-verdict.json` skipped, `.context`/`AGENTS.md` gaps, files to patch later. |
| `03-node-pin-actual-vs-dod.md` | Pin PR #10 / DietFlow #1292 vs installed-queue proof. Only ticket `20260918030255-9d3a6e7e` (`runtime-probe`, `node -p`). Isolation tests wrote `os.tmpdir()`. Canonical `dietflow-app` not edited. |
| `04-ship-merge-commands.md` | Exact commands that exist today. DietFlow `npm run ship` vs CI Queue `ci-queue ship --no-remote`. #10 and #1292 used `gh pr merge`. Code vs process obstacles. Minimum operator sequence. |
| `05-gpt-sol-critique.md` | Critique of PRD+analysis vs Marco's ask. Ship does not enforce progress. Recode incorporated. |

Ground SHA: CI Queue `origin/dev` = `f4f502ed30fa` (includes pin). DietFlow worktree `/Users/marcoantonio/dietflow-ci-queue-node-pin`. Installed state `~/.local/state/local-ci/queue`.
