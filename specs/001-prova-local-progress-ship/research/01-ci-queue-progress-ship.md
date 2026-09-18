# Research: CI Queue progress, `check`, ship, spend-abort (pré pin)

Snapshot: `origin/dev` imediatamente **antes** do merge do pin de Node (PR #10 = `f4f502e`). Primeiro pai do merge = `61069f418eb246a016e0b440388a0744c6f65186` (`fix: correlate wait verdicts by run-name, not workflow_run head_sha`).

Este arquivo descreve a capacidade que **já estava no produto** nesse SHA. O pin (`e37a7d2` / `59c7c95` / `f4f502e`) não muda catálogo `check`, wrapper de progress, collector, ship ou spend-abort; só acrescenta `test:runtime` e a capability `node-runtime-guard-v1`.

Linhas citadas em `src/core/runner.ts` e `src/cli.ts` são as de **61069f4**, não as de HEAD (HEAD já tem o pin).

---

## 1. Catálogo `ci-queue.json` — preset `check` e `ship`

Em `61069f4:ci-queue.json`:

```json
"presets": {
  "check": {
    "progress": true,
    "argv": ["npm", "run", "check"],
    "requireCleanTree": true,
    "fetchBase": "origin/dev",
    "requireGitStability": true,
    "pinHeadSha": true,
    "abortOnStaleBase": true
  }
},
"ship": {
  "acceptedPresets": ["check"],
  "attestationContext": "local/check"
}
```

- **Não há** `ship.remoteVerdict`.
- **Não há** `repository.path`: `readQueueConfig` usa o diretório do arquivo como `executionCwd`.
- A chave `execution.executor/queue` existe no JSON e **não é lida** por `parseQueueConfig` (campo extra ignorado).

`progress: true` no preset vira `flags.progressEnabled` no ticket (`src/core/enqueue.ts:79`).

Ship-bound exige `requireCleanTree`, `requireGitStability`, `pinHeadSha` e `fetchBase` (`src/contracts/config.ts:100-107`). O preset `check` do produto satisfaz isso.

---

## 2. `npm run check` vs `scripts/ci/check-with-progress.sh`

Em `61069f4:package.json`:

- `"check": "bash scripts/ci/check-with-progress.sh"` (linha 12)
- `"ci-queue": "tsx src/cli.ts"` (linha 13)
- `"test"` = `test:core` + `test:ui` + `test:backend` + `test:examples` + `test:release` + `test:install` (**sem** `test:runtime`)

O wrapper (`scripts/ci/check-with-progress.sh`) **emite** `@@ci-queue-progress` em stdout, sempre, sem consultar `LOCAL_CI_PROGRESS_ENABLED`:

1. `run_stage build Build build`
2. `run_stage test Test test`
3. `run_stage check-ui "Check UI" check:ui`
4. `run_stage browser Browser test:browser`

Cada estágio: `running` → `passed` ou `failed` + `exit`. Filtra linhas aninhadas `@@ci-queue-progress` / `@@local-ci-progress` dos filhos (`filter_nested_progress`). IDs estáveis: `build`, `test`, `check-ui`, `browser`. Helper: `scripts/progress-emit.sh:14-15`.

**Sim: `npm run check` emite stages `@@ci-queue-progress`.** O spec de design (`docs/superpowers/specs/2026-09-17-ci-queue-plug-and-play-design.md:71`) ainda diz o contrário (“`npm run check` does not”). Isso foi invertido por `d6b5562` (`feat: emit check stages from the canonical npm run check sequence`). O spec ficou stale; o código e `tests/core/progress-emit.test.ts` são a verdade.

`progress-emit.test.ts` prova o wrapper com **npm fake** e cwd tmp; **não** enfileira o `check` real na fila instalada.

---

## 3. Collector: `progress: true` → sidecar e `ticket.progress`

Cadeia:

1. Catalog `progress: true` → `ticket.flags.progressEnabled` (`enqueue.ts:79`).
2. Worker `runJob` cria um `ProgressCollector(root, ticket.id)` para o job inteiro (`runner.ts@61069f4:587`).
3. Spawn: `cwd: ticket.cwd`, `env: buildJobEnv(...)` (`runner.ts@61069f4:606`).
4. stdout/stderr passam pelo decoder TSV (`613-624`). Linha válida → `ingest` → `writeProgressSnapshot` atômico em `<state>/progress/<id>.json` (`progress.ts:174-179`, `state.ts:125-126`, `queuePaths.progress` = `join(root, "progress")`).
5. Terminal: `withFinalProgress` copia o snapshot para `ticket.progress` (`runner.ts@61069f4:292-305`). Depois de `history/<id>.json` autoritativo, o sidecar é apagado.

Env do filho (`buildJobEnv`, `runner.ts@61069f4:435-462`):

| Variável | Valor quando `progressEnabled` |
| --- | --- |
| `LOCAL_CI_JOB_ID` | `ticket.id` (sempre) |
| `LOCAL_CI_PROGRESS_ENABLED` | `"1"` se flag; senão `""` (não herda o caller) |
| Aliases | `CI_QUEUE_JOB_ID`, `DIETFLOW_CI_QUEUE_JOB_ID`, `LOCAL_CI_QUEUE_DIR`, … |

O collector **ingere TSV independentemente da flag**. A flag só habilita emissores que consultam `LOCAL_CI_PROGRESS_ENABLED` (contrato DietFlow). O wrapper do próprio CI Queue **não consulta** essa env: stages saem mesmo se a flag fosse falsa. O catálogo do produto declara `progress: true` de qualquer forma.

API Vite: running lê sidecar (`backend/ci_queue_api/records.py:158-159`, `259-260`, `273`); terminal usa `job.progress` embutido. UI: `progressSummary.roots` na Status (`ui/src/features/status/status-page.tsx:115-116`) e tab Progresso no drawer (`ui/src/features/shared/job-drawer.tsx:144-157`, `436-515`).

---

## 4. Comandos para enfileirar o `check` do produto na fila instalada

### Resolução de state root

Sem `--state` e sem `CI_QUEUE_STATE_DIR`:

- se existe `~/.local/state/local-ci/queue` → **esse** path (compat)
- senão `~/.local/state/ci-queue` (produto)

(`src/core/state.ts:20-45`; `scripts/install.mjs:19-34`; teste `tests/core/queue-engine.test.ts:361-371` com HOME fake.)

`docs/INSTALL.md` documenta `--state "$HOME/.local/state/ci-queue"` (linhas 29, 43). Isso **não** é o default nesta máquina: o diretório de compatibilidade existe.

### Máquina (observação 2026-09-18, não é o SHA)

- State instalado: `/Users/marcoantonio/.local/state/local-ci/queue` (`installation.json` `stateRoot`). `~/.local/state/ci-queue` **não existe**.
- CLI: `~/.local/bin/ci-queue` → release `0.1.0-f4f502ed30fa` (já o pin). Release pré-pin ainda no disco: `releases/0.1.0-61069f418eb2`.
- Worker LaunchAgent: só `worker --state …/local-ci/queue`. **Sem** `--config`.
- Dashboard LaunchAgent: `--config /Users/marcoantonio/dietflow-app/ci-queue.json` **e** o mesmo `--state`. Bootstrap = DietFlow. Occupancy global; o cwd do job **não** vem desse `--config`.

### Comandos exatos (produto + docs + CLI)

Documentados:

```bash
ci-queue enqueue <preset> --config /projeto/ci-queue.json --state /estado
```

(`docs/CONTRACTS.md` @61069f4:21)

```bash
ci-queue enqueue check --json
ci-queue worker --json
```

(`docs/CONSUMER-QUICKSTART.md:37-38` — assume cwd do consumidor e state default; **armadilha** se o cwd for DietFlow.)

```bash
export CI_QUEUE_STATE_DIR="$(mktemp -d)"
$QUEUE enqueue success --cwd . --state "$CI_QUEUE_STATE_DIR" --json
```

(`examples/local-project/README.md` — **tmp**, não a fila instalada.)

Instalação / comando:

```bash
--command "$HOME/.local/bin/ci-queue"
```

(`docs/INSTALL.md` @61069f4:47)

Checkout:

```bash
npm run ci-queue -- …
# equivalente
npx tsx src/cli.ts …
```

(`package.json` @61069f4:13; `src/cli.ts` @61069f4:110-116, 184-219)

**Comando que liga o `check` do CI Queue à fila que o Vite instalado lê** (worker LaunchAgent já drena; não iniciar segundo worker):

```bash
ci-queue enqueue check \
  --config /Users/marcoantonio/ci-queue/ci-queue.json \
  --cwd /Users/marcoantonio/ci-queue \
  --state "$HOME/.local/state/local-ci/queue" \
  --json
```

Mesmo ticket via checkout (código 61069f4 / HEAD; **não** compete com o worker se só enqueue):

```bash
npx tsx src/cli.ts enqueue check \
  --config /Users/marcoantonio/ci-queue/ci-queue.json \
  --cwd /Users/marcoantonio/ci-queue \
  --state "$HOME/.local/state/local-ci/queue" \
  --json
```

```bash
npm run ci-queue -- enqueue check \
  --config /Users/marcoantonio/ci-queue/ci-queue.json \
  --cwd /Users/marcoantonio/ci-queue \
  --state "$HOME/.local/state/local-ci/queue" \
  --json
```

`--config` absoluto já fixa `executionCwd` = raiz do repo CI Queue (`config.ts:181-192`). `--cwd` é redundante com path absoluto, mas impede `findUp` a partir de um cwd DietFlow se alguém omitir `--config`.

`ci-queue worker --state "$HOME/.local/state/local-ci/queue"` só se o LaunchAgent **não** estiver vivo. Segundo worker → `busy: true` (`worker.ts:86-89`). Contrato: um executor (`CONTRACTS.md` @61069f4:32-36; `INSTALL.md` @61069f4:91).

`--wait` espera terminal; matar o cliente **não** cancela o job (`CONTRACTS.md:22`).

---

## 5. `ci-queue ship` — o que precisa, `BASE_MOVED`, draft vs ready, remote-verdict

CLI (`src/cli.ts` @61069f4:113, 160-182):

```bash
ci-queue ship [--pr N] [--repo [HOST/]OWNER/REPO] [--dry-run] [--no-remote] [--timeout-ms N]
```

Precisa (orquestração `src/ship/ship.ts` + ops reais `src/ship/system-ops.ts`):

- Catálogo com bloco `ship` (`acceptedPresets` não vazio + `attestationContext`). Ausente → `SHIP_CONFIG` antes de enqueue (`ship.ts:197-199`; `tests/core/ship.test.ts:403-406`).
- Alvo congelado: PR, H, B0, cwd, digest do catálogo em H.
- Prova local: ticket terminal `passed`, argv da receita aceita, git estável, HEAD=H, base=B0. Nome `check` com outro argv/`extraArgs`/`custom` **não** conta (`CONSUMER-QUICKSTART.md:41-44`; `CONTRACTS.md:123-124`).
- Árvore limpa e catálogo **em H** (`CONSUMER-QUICKSTART.md:24-27`).
- Política remota: arquivo `remote-verdict.json` **ao lado do catálogo** (`system-ops.ts:45`, `610-613`). Ausente = **`wait`**. `wait` sem `ship.remoteVerdict` → `SHIP_CONFIG` “wait exige remoteVerdict.workflow” (`ship.ts:202-206`; `ship.test.ts:409-416`).
- `--no-remote` força política `skipped` (`ship.ts:203`). Não autoriza JSON corrompido (`CONSUMER-QUICKSTART.md:70`).
- Dry-run: GitHub/Git **lêem**; não cria ticket, status, ready, dispatch, merge (`CONSUMER-QUICKSTART.md:46-54`; `ship.test.ts:314-331`).
- Timeout default 60 min; não cancela ticket e não reenfileira (`CONSUMER-QUICKSTART.md:70-71`).

**CI Queue (este repo) não tem skip estilo DietFlow via `remote-verdict.json`.** Não existe o arquivo no checkout. O catálogo não declara `remoteVerdict`. Logo `ci-queue ship --pr N` **sem** `--no-remote` recusa na config. O caminho documentado sem Actions é:

```bash
ci-queue ship --dry-run --no-remote --json
ci-queue ship --pr 12 --no-remote --json
```

(`CONSUMER-QUICKSTART.md:49, 67`)

O que **este** repo tem no GitHub Actions é outro mecanismo: draft skip no workflow (`fd6fcb4`, `.github/workflows/ci.yml:8, 32` — job `ci-verdict` não roda em PR draft; ready classifica e pode dispensar Complete check com atestação `local/check`). Isso **não** é o arquivo `remote-verdict.json` que o CLI `ship` lê. DietFlow `npm run ship` + `scripts/ship/remote-verdict.json` **não** existe neste produto (`CONSUMER-QUICKSTART.md:5-6`: DietFlow continua com o próprio `npm run ship` até cutover).

Draft vs ready (`ship.ts:299-314`; `61069f4` commit message; `CONSUMER-QUICKSTART.md:59-63`; testes `ship.test.ts:449-515`):

- Draft: atesta → `markReady` (PATCH `draft: false`) → espera o run **`pull_request`**; **não** dispara `workflow_dispatch`.
- Já ready, wait, sem run causal: **um** dispatch no ref da base, correlacionado por run-name / inputs (PR, H, B0), não por `workflow_run.head_sha` (`61069f4`).
- Já ready + wait + remoto já `in_progress` → `REMOTE_IN_PROGRESS`, sem segundo enqueue (`ship.test.ts:462-476`).

`BASE_MOVED`: qualquer mudança de B0 na revalidação, mesmo ancestral, aborta e **não** POST merge (`system-ops.ts:630`; `ship.test.ts:580-591`; `CONSUMER-QUICKSTART.md:76-89`). Garantia declarada: `head-pinned-base-observed`. Não há lock atômico H+B. Merge REST `sha=H`, `merge_method=merge`, sem `--admin`. `MERGED_BASE_CHANGED` se o 1º pai não for B0 (`CONTRACTS.md:123-132`).

Worker/runner **não** importam `src/ship` e **não** chamam merge (`tests/core/never-merge.test.ts`; `CONTRACTS.md:124-125`). Dashboard sem botão de ship (`CONSUMER-QUICKSTART.md:4-5`).

---

## 6. Commits em `origin/dev` imediatamente antes do pin

| SHA | Subject | Intent / DoD (do commit + docs, não memória) |
| --- | --- | --- |
| `61069f4` | correlate wait verdicts by run-name, not `workflow_run.head_sha` | Dispatch roda no ref da base; listar por HEAD da PR escondia o run causal. Draft espera `pull_request`; already-ready despacha uma vez. Falha HTTP de merge inspeciona antes de `MERGE_REFUSED`. |
| `9137b61` | map dispatch verdicts without `pull_requests` onto the frozen PR | Payload de `workflow_dispatch` sem `pull_requests` era `REMOTE_RED` mesmo com sucesso causal. |
| `a209ac6` | prove init-to-dry-run reuse without granting the worker merge | Jornada init → enqueue → worker → dry-run em tmp; worker sem merge. |
| `d6b5562` | emit check stages from the canonical `npm run check` sequence | Wrapper = sequência canônica; stages no protocolo. |
| `d3168d6` | portable attestation verifier in the bundle | Template `ci-queue-verdict.yml`; `init --workflow`. |
| `811da8e` | `ci-queue init` preserves identity, refuses fake recipes | Identidade estável; sem receita inventada. |
| `e34fd56` | orchestrate ship with frozen target and post-merge inspection | `runShip` + inspeção de pais. |
| `0223381` | require executed argv in ship eligibility | Nome da receita não é prova. |
| `9fd6d7a` / `f4bc609` / `ba69780` | spend-abort + observe remote base + persist `abortOnStaleBase` + parse `ship` | Axis B: `failureReason` exatamente `stale-base`; status `failed`; exit 1 (`docs/superpowers/plans/2026-09-17-ci-queue-plug-and-play.md:21`). |
| `0e76208` | progress etapa 2 — durações observadas | “Local check verde; fixture 22/22; **sem state/install real**.” |
| `fd6fcb4` | DietFlow model — draft skip, not a remote kill-switch | Actions: draft 0 min; ready classifica; sem crédito no ready = falha de plataforma; merge via prova local = equivalente a `--no-remote`. |

DoD dos docs (`CONTRACTS.md` progress @61069f4:52-83; `CONSUMER-QUICKSTART.md`; plan T0-T9):

- Receita `progress: true` **pode** emitir TSV; collector deriva duração/retry; UI mostra árvore; exit code do runner soberano.
- Ship reutiliza ticket que o worker gravou; last-green não é prova.
- Testes **não podem** tocar `~/.local/state/local-ci/queue` (`plug-and-play.md:27, 29`).
- Plan: “No install, no `main`, no live LaunchAgent.”

---

## 7. `tests/core` / `test:runtime` na fila **instalada**?

**Não.** `test:runtime` **não existia** em 61069f4 (entra no pin, `package.json` HEAD).

Todos os enqueues de produto apontam `mkdtemp` / `CI_QUEUE_STATE_DIR` tmp. `tests/examples/init-ship.test.mjs:20,317,437` define `OPERATOR_QUEUE = ~/.local/state/local-ci/queue` e **afirma desigualdade** — isolamento, não uso.

Arquivos que enfileiram (sempre tmp):

| Arquivo | O que enfileira |
| --- | --- |
| `tests/core/queue-engine.test.ts` | presets fake (`ok`, `progress`, `declaredProgress`, …) |
| `tests/core/progress-pipeline.test.ts` | `emit` / `withArt` |
| `tests/core/spend-abort.test.ts` | `check` em **projeto tmp** com catálogo fixture, não o repo CI Queue |
| `tests/core/advisories.test.ts` | CLI `--state` tmp |
| `tests/examples/local-project.test.mjs` | example `success/failure/wait` |
| `tests/examples/init-ship.test.mjs` | `enqueue check` com argv `node ./check.mjs` no clone tmp |
| `tests/core/cli-logs.test.ts` | state tmp |
| `tests/browser/*.spec.ts` | API fixture; `INSTALL.md:121-122`: “never enqueues jobs or changes the installed service” |
| `tests/core/progress-emit.test.ts` | wrapper bash + npm fake; **sem** fila |

`tests/ui`, `tests/backend`, `tests/release`, `tests/install`: sem enqueue na fila instalada.

---

## 8. Dívida de **código** vs procedimento do operador

**O código já consegue mostrar stages do `check` no Vite** se alguém enfileirar o preset `check` deste repo (`progress: true` + wrapper TSV) no **mesmo** state root que o LaunchAgent do dashboard lê. Collector, sidecar, API `progressSummary`, Status “Execução atual”, drawer Progresso: fechados. Não falta componente de UI nem parser.

O que **não** é buraco de código da pipeline de progress:

- Não ter rodado o `check` real na fila instalada.
- Quickstart omitir `--config/--state/--cwd`.
- Testes isolarem HOME/state de propósito (`plug-and-play.md:27`).
- Cadastrar o projeto “CI Queue” no seletor (init não escreve registry; `CONSUMER-QUICKSTART.md:29-32`). Occupancy global ainda mostra o running sem cadastro; histórico filtrado precisa do projeto.

Dívida de **código/docs** (não “faltou teste de vitest”):

1. Spec de design stale: “`npm run check` does not” emit (`…-plug-and-play-design.md:71`).
2. `src/contracts/CLI-CONTRACT.md` @61069f4 lista enqueue/worker/… e **omite** `init`/`ship` (o binário já tem).
3. INSTALL documenta `~/.local/state/ci-queue`; default real prefere `local-ci/queue` se existir.
4. Produto sem `remote-verdict.json` e sem `ship.remoteVerdict` → `ship` wait inutilizável; só `--no-remote` (ou criar o arquivo). Não é o kill-switch DietFlow.
5. LaunchAgent dashboard `--config` = DietFlow. Worker ignora isso; **enqueue sem `--config` no cwd errado** grava a receita DietFlow. Isso é o envelope de instalação, não o runner.
6. Wrapper publica **quatro stages**, não a árvore Vitest/Playwright (filtra nested). Case-level no dashboard exigiria outro emissor — escolha de código, não só procedimento.
7. `attachProgressToTicket` importado em `runner.ts` e não usado (o attach real é `withFinalProgress`). Cosmético.
8. `ci-queue.json` `execution` extra, ignorado pelo parser.

Faltando no **procedimento**, não no collector: enqueue com catálogo **deste** repo, `--state` da instalação, worker único, árvore limpa (`requireCleanTree`), projeto visível no filtro, depois `ship --no-remote` se for mergear sem Actions.

---

## 9. Worker cwd / `--config` para ser CI Queue, não DietFlow

O worker **não recebe** `--config`. Executa `ticket.cwd` + `ticket.argv` (`runner.ts@61069f4:606`; LaunchAgent: `worker --state <root>`).

Quem decide o repositório é o **enqueue**:

| Flag | Efeito |
| --- | --- |
| `--config /Users/marcoantonio/ci-queue/ci-queue.json` | Lê este catálogo; `executionCwd` = `/Users/marcoantonio/ci-queue` (sem `repository.path`) |
| `--cwd /Users/marcoantonio/ci-queue` | Base do `findUp` se não houver `--config`; com `--config` absoluto, reforço |
| omitir ambos | `readQueueConfig(process.cwd())` → se o shell estiver em DietFlow, preset `check` **DietFlow** |
| Dashboard `--config` DietFlow | Só bootstrap da API; **não** reescreve tickets já na fila |

Não usar `--config /Users/marcoantonio/dietflow-app/ci-queue.json` para esta prova.

`npx tsx src/cli.ts` vs `~/.local/bin/ci-queue`: mesmo contrato de flags. O binário instalado hoje aponta para a release **pós-pin**; o enqueue do catálogo `check` é idêntico. Segundo `worker` no mesmo state compete o lock.

Árvore suja no CI Queue recusa admissão (`requireCleanTree`). `abortOnStaleBase` + `fetchBase: origin/dev` arma o observer a cada 15s; ponta remota que deixa de ser ancestral de HEAD mata o job com `stale-base` (`spend-abort.ts:3-31`; `runner.ts@61069f4:660-701`).

---

## Evidence table

| Path | Lines | Fact |
| --- | --- | --- |
| git `f4f502e^1` | SHA `61069f4` | Pre-pin `origin/dev` |
| `ci-queue.json` @61069f4 | 13-26 | `check`: argv `npm run check`, `progress: true`, ship-bound flags; `ship.acceptedPresets=["check"]`, `attestationContext="local/check"`; sem `remoteVerdict` |
| `package.json` @61069f4 | 12-16 | `check` → wrapper; `test` sem `test:runtime` |
| `scripts/ci/check-with-progress.sh` | 12-36 | Emite stages; filtra nested; ordem build/test/check-ui/browser |
| `scripts/progress-emit.sh` | 14-15 | `@@ci-queue-progress` TSV node |
| `tests/core/progress-emit.test.ts` | 107-121, 165-171 | Wrapper emite 8 linhas running/passed; catalog argv; **tmp/fake npm** |
| `src/core/enqueue.ts` | 72-79 | `progress` → `flags.progressEnabled` |
| `src/core/runner.ts` @61069f4 | 435-462, 587, 606, 613-624, 292-305, 660-701 | Env LOCAL_CI_*; collector; spawn cwd; TSV; ticket.progress; spend-abort |
| `src/core/progress.ts` | 18-20, 111-118, 158-180 | Prefixos; sidecar `progress/<id>.json` |
| `src/core/state.ts` | 20-45, 55, 71, 125-126 | Compat `local-ci/queue` vs `ci-queue`; `progressPath` |
| `src/contracts/config.ts` | 75, 82-144, 181-192 | Parse `progress`/`ship`; `executionCwd` = projectRoot |
| `backend/ci_queue_api/records.py` | 158-231, 259-273 | Sidecar running; `progressSummary` |
| `ui/src/features/status/status-page.tsx` | 115-116 | Stages na execução atual |
| `ui/src/features/shared/job-drawer.tsx` | 144-157, 511 | Tab Progresso |
| `docs/CONTRACTS.md` @61069f4 | 21-22, 45-83, 123-132 | enqueue `--config/--state`; sidecar; protocolo; ship guarantee |
| `docs/CONSUMER-QUICKSTART.md` | 19-22, 36-71 | wait precisa `remoteVerdict` ou `--no-remote`; draft vs dispatch |
| `src/cli.ts` @61069f4 | 31-34, 110-219 | `--state/--cwd/--config`; `ship`; enqueue; worker só `root` |
| `src/ship/ship.ts` | 202-206, 245-249, 299-314, 630 via ops | policy wait/skipped; dry-run; draft markReady; allowDispatch |
| `src/ship/system-ops.ts` | 45, 279-292, 610-630 | `remote-verdict.json`; ausente=wait; `BASE_MOVED` |
| `tests/core/ship.test.ts` | 403-416, 449-515, 580-591 | SHIP_CONFIG sem remoteVerdict; draft/ready; BASE_MOVED |
| `src/core/spend-abort.ts` | 3-31 | `stale-base` |
| `src/core/worker.ts` | 85-89 | lock único; sem `--config` |
| `scripts/install.mjs` | 19-34, 136, 147 | DEFAULT_STATE compat; worker `--state`; dashboard `--config` |
| `docs/INSTALL.md` @61069f4 | 25-48, 119-122 | comandos install; browser tests não tocam serviço |
| `docs/superpowers/plans/2026-09-17-ci-queue-plug-and-play.md` | 27-29, 21 | testes não tocam fila instalada; `stale-base` |
| `docs/superpowers/specs/2026-09-17-ci-queue-plug-and-play-design.md` | 71 | **STALE**: diz que `npm run check` não emite |
| `src/contracts/CLI-CONTRACT.md` @61069f4 | 18-20 | **STALE**: omite `init`/`ship` |
| `tests/examples/init-ship.test.mjs` | 20, 317, 419-437 | enqueue em tmp; `assert.notEqual(state, OPERATOR_QUEUE)` |
| `tests/core/queue-engine.test.ts` | 145-206, 258-269, 361-371 | job-env flag; progress no ticket tmp; resolveStateRoot |
| `.github/workflows/ci.yml` | 1-32, 120-122 | draft skip Actions; fallback `npm run check` remoto — **não** é `remote-verdict.json` |
| `installation.json` (máquina) | `stateRoot`, `command.path` | fila = `…/local-ci/queue`; CLI `~/.local/bin/ci-queue` |
| LaunchAgent dashboard `0.1.0-61069f418eb2` | ProgramArguments | `--config …/dietflow-app/ci-queue.json` |
| `remote-verdict.json` no repo | — | **UNPROVEN / ausente** — glob 0 arquivos |
| Enqueue do `check` canônico na fila instalada pré-pin | — | **UNPROVEN** nos testes e no plan (“sem state/install real”) |

---

## What deserved to be a queue job vs what actually ran in tmp

**Merecia ser job na fila instalada + Vite**

Um ticket do projeto **CI Queue** (`070e4c47-709b-4fe1-9f98-d80d313a87f4`), preset **`check`**, argv `["npm","run","check"]`, `progressEnabled: true`, cwd = checkout ci-queue, state = `~/.local/state/local-ci/queue`. Na UI: quatro stages Build / Test / Check UI / Browser (e flaky só se o wrapper retrysse o mesmo id — hoje não retria). `ship` **não** é job: reutiliza esse ticket e, neste repo, precisa `--no-remote` (ou um `remote-verdict.json` que o checkout não tem).

Não mereciam jobs separados: `test:core`, `test:ui`, `test:backend`, `test:examples`, `test:release`, `test:install`, `test:browser` — são a sequência **dentro** de `npm run test` / `check:ui` / `test:browser`. `test:runtime` ainda não existia.

**O que de fato rodou em tmp**

Suites vitest/node:test/unittest/Playwright com `mkdtemp` / `CI_QUEUE_STATE_DIR` isolado; wrapper de progress com npm fake; `init-ship` com `node ./check.mjs`; example `success/failure/wait`; spend-abort `check` contra catálogo fixture. Explicitamente **proibido** tocar a fila do operador. Etapa 2 de duração: “sem state/install real.” O Vite instalado nunca recebeu o `check` canônico deste repo como occupancy — não porque o collector não saiba desenhar stages, mas porque o enqueue contra `~/.local/state/local-ci/queue` com `--config` deste `ci-queue.json` não faz parte da suíte.
