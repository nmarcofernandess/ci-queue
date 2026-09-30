# DietFlow progress + ship — evidência no worktree `dietflow-ci-queue-node-pin`

Fonte: `/Users/marcoantonio/dietflow-ci-queue-node-pin` (worktree). Nenhum arquivo DietFlow foi editado. Checkout canônico `~/dietflow-app` não foi tocado. Produto CI Queue lido só como executor/collector/UI (`~/ci-queue`).

**HEAD desta worktree contém ambos os commits** (`git merge-base --is-ancestor`).

---

## A) O que mergeou: DietFlow #1291 e os commits `023a1810d` / `19c491a3f`

### Relação entre os dois commits e o PR

| SHA | Título | Como chegou em `origin/dev` |
|-----|--------|------------------------------|
| `19c491a3f02b7f5eb24b5dcf155d205c6c71865a` | `chore(ci): bind smoketest as ci-queue ship proof with skipped remote verdict` | **Push direto em `origin/dev`**. First-parent de `dev` imediatamente após o merge de #1290 (`bf3afe88b`). `gh api .../commits/19c491a3f/pulls` devolve lista vazia. **Não passou por PR, nem por `npm run ship`.** |
| `023a1810d60418871399abb292d538ed95018939` | `chore(ci): enable factual progress on six local-stack presets` | Único commit do PR **[#1291](https://github.com/dietflowoficial/Dietflow-app/pull/1291)**. Parent = `19c491a3f` (já estava em `dev`). Merge commit `60bf35977324a4f1e2824fe1aa8ae63a7740b50d` (pais: `19c491a3f` + `023a1810d`). |

O GitHub lista só `023a1810d` em #1291 porque `19c491a3f` já era a base. Co-author dos dois: `Cursor <cursoragent@cursor.com>`. Autor/committer: `Dietflowoficial`.

### `19c491a3f` — intent, DoD implícito, arquivos

**Intent (mensagem):** a fila nova exige `pinHeadSha` nas receitas de ship e um `remote-verdict.json` **adjacente ao catálogo**. DietFlow **mantém** `npm run ship`; a espera do Actions **permanece skipped**.

**Arquivos (2):**

- `ci-queue.json` — `pinHeadSha: true` em `smoketest` e `full`; bloco novo `ship: { acceptedPresets: ["smoketest"], attestationContext: "local/smoketest" }`.
- `remote-verdict.json` **na raiz do repo** (`{ "verdict": "skipped" }`).

**DoD implícito:** smoketest vira a receita aceita de prova de ship no catálogo que o **produto** CI Queue lê; o wait remoto fica desligado pelo JSON catálogo-adjacente.

**Armadilha:** o controlador DietFlow `scripts/ship/ship.ts` **não lê** `ci-queue.json#ship` nem o `remote-verdict.json` da raiz. Ele lê `scripts/ship/remote-verdict.json` (já existia desde #1224 / `b90222fbf`). O bloco `ship` do catálogo é contrato do **produto** (`ci-queue ship`, parser em `src/contracts/config.ts`). DietFlow `npm run ship` continua hardcoded em smoketest/full via `findLocalProofTicket`.

### `023a1810d` / PR #1291 — intent, DoD, arquivos

**Intent (mensagem + body do PR):** ligar `progress: true` em seis presets que **já emitiam** Bootstrap/Supabase/Next/Playwright via `e2e-local-stack.sh`; o catálogo é que estava mudo. Sem allowlist de nomes no worker. Docs do consumidor: `spend-abort-v1` a partir da revisão `61069f418eb246a016e0b440388a0744c6f65186`.

**Seis presets:** `receitas-medidas`, `regression`, `c1-conformance`, `c2-conformance`, `ledger-concurrency`, `p7-selection-search-lab`.

**Arquivos (5):**

- `ci-queue.json` — `progress: true` nos seis.
- `docs/ci/CI-QUEUE-CONSUMIDOR.md` — capability `spend-abort-v1` opcional; revisão validada `61069f4…`.
- `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md` — progresso = flag do catálogo + worker; sem allowlist.
- `scripts/ci/__tests__/progress-instrumentation.test.ts` — cobre p7 no runner; **ratchet que proíbe `progress: true` fora da allowlist**.
- `scripts/ci/e2e-local-stack.sh` — comentário: emite só com `LOCAL_CI_JOB_ID` + `LOCAL_CI_PROGRESS_ENABLED=1`.

**DoD do PR (test plan):**

- [x] Jest focado: `progress-instrumentation` + `playwright-progress-reporter`
- [x] Fila: `p7-selection-search-lab` com `flags.progressEnabled` e nós Bootstrap + Artefatos no Vite
- [ ] `npm run ship` (smoketest local; remote-verdict skipped) — **deixado desmarcado**

Título do PR: `chore(ci): progresso factual nos seis presets local-stack`. Criado `2026-09-18T01:44:08Z` (nasceu draft: existe `ReadyForReviewEvent`). `ready_for_review` `02:04:02Z`. Merge `02:04:06Z` por `dietflowoficial`. **Zero GitHub Actions runs** na branch `codex/ci-queue-progress`.

### Docs canônicos lidos

`docs/ci/CI-QUEUE-CONSUMIDOR.md`: DietFlow é dono das receitas; o produto é dono do worker/API/dashboard. Wrappers: `npm run ci:queue -- smoketest --wait` etc. Progresso: emissores + IDs estáveis + `progress: true`; collector externo deriva `retryCount`.

`scripts/ship/ship.ts`: cola linear draft→prova local→attestation→ready→(wait Actions **ou skip**)→merge pinado. Interruptor: `scripts/ship/remote-verdict.json`.

`scripts/ship/remote-verdict.json` e `remote-verdict.json` (raiz): ambos `{ "verdict": "skipped" }` neste worktree.

---

## B) Maquinário de progresso — quando os estágios aparecem no Vite

Cadeia **obrigatória** (as três pernas; faltar uma = UI muda ou fica muda):

```
ci-queue.json presets.<nome>.progress: true
        ↓ enqueue (produto ou adapter DietFlow)
ticket.flags.progressEnabled === true
        ↓ worker instalado, buildJobEnv
LOCAL_CI_JOB_ID=<ticketId>
LOCAL_CI_PROGRESS_ENABLED=1     # senão, string vazia — emissores no-op
        ↓ receita escreve TSV em stdout/stderr
@@local-ci-progress\t1\tnode|counts\t...
        ↓ ProgressCollector no runJob do worker instalado
progress/<id>.json  →  ticket.progress  →  API  →  Vite (Status / drawer Progresso)
```

Sem `progress: true`, o worker **não** liga o env (`runner.ts` só seta `"1"` se `flags.progressEnabled === true`). Job na fila **sem** o flag: emissores silenciosos mesmo com `LOCAL_CI_JOB_ID`. Receita direta (`npm run ci:smoketest` fora da fila): sem job id, silêncio. Jest/spawn de teste que força o env prova o **emissor**, não o Vite.

O worker **sempre** instancia `ProgressCollector` e, no finalize, ingere o nó `artifacts` / label **Artefatos**. Ver Artefatos no Vite prova job no **worker instalado**. Ver **Bootstrap** (ou Static/Jest) prova emissor da receita + env ligado.

### Peças DietFlow

| Peça | Papel |
|------|--------|
| `scripts/ci/progress-emitter.sh` | Protocolo v1. No-op a menos que job id **e** `LOCAL_CI_PROGRESS_ENABLED=1`. Escreve `@@local-ci-progress`. |
| `LOCAL_CI_PROGRESS_ENABLED` | Ligado **só** pelo worker a partir do catálogo. Não herda o ambiente do operador. |
| `scripts/ci/playwright-progress-reporter.ts` | Reporter Playwright; mesmos dois env; casos `pw:<sha1>` sob o nó `playwright` (ou `LOCAL_CI_PROGRESS_PLAYWRIGHT_NODE_ID`). Ligado em `playwright.config.ts` só com os dois env. |
| `scripts/ci/smoketest-local.sh` | Fonte o emitter. Raízes Static + Jest. Chama `ci:local` com `LOCAL_CI_PROGRESS_PARENT_ID=static`. |
| `scripts/ci/full-local.sh` | Static, Jest, E2E, FlowUI opt-in. E2E filho via `ci:local:e2e`. |
| `scripts/ci/e2e-local-stack.sh` | Bootstrap → (preflight) → Supabase → Next → Playwright. Compartilhado por e2e/save/regression/conformance/p7/receitas-medidas/impact/goldens. |
| `scripts/ci-local.sh` | Gates estáticos. Só emite se `LOCAL_CI_PRESET` ∈ `{static, full, smoketest}`. Outro preset (ex. `flowui`) + job id → **zero** markers (teste de silêncio). |
| `scripts/ci/save-local-stack-runner.ts` | Delega ao stack; emite artefato `save-pack` / SAVE-PROOF. |
| `scripts/ci/run.ts` | Traduz `recipe.progress` → `flags.progressEnabled` no enqueue. |

### Peças do produto (worker instalado, não o checkout DietFlow)

| Peça | Papel |
|------|--------|
| `src/core/enqueue.ts` | Copia `preset.progress` → `flags.progressEnabled`. |
| `src/core/runner.ts` `buildJobEnv` | `LOCAL_CI_PROGRESS_ENABLED: progressEnabled ? "1" : ""`. |
| `src/core/runner.ts` `runJob` | Um `ProgressCollector`; stdout/stderr passam pelo decoder. |
| `src/core/progress.ts` | Aceita `@@ci-queue-progress` e legado `@@local-ci-progress`. Sidecar `progress/<id>.json`. |
| UI Vite | `job-drawer.tsx` aba Progresso; `progress-tree.tsx`; Status usa `progressSummary.roots`. |

Release antiga instalada **não** observa o catálogo novo até reinstalar. Docs DietFlow: `FLUXO-CI-GITHUB-ACTIONS.md` (patch #1291).

---

## C) Inventário `ci-queue.json` — `progress: true` vs silêncio

34 presets. 12 com `progress: true`. 22 sem.

### Com `progress: true` (12)

| Preset | argv | Emissor real |
|--------|------|----------------|
| `static` | `npm run ci:local` | `ci-local.sh` (gates) |
| `smoketest` | `npm run ci:smoketest` | `smoketest-local.sh` + gates |
| `full` | `npm run ci:local:full -- --with-flowui` | `full-local.sh` + stack E2E |
| `e2e` | `npm run ci:local:e2e` | `e2e-local-stack.sh` |
| `e2e-impact` | `npm run ci:e2e:impact` | `e2e-impact.ts` → stack |
| `save` | `npm run ci:save` | stack + `save-pack` |
| `receitas-medidas` | `npm run ci:receitas-medidas` | miniapp → `ci:local:e2e` → stack |
| `regression` | `npm run ci:local:regression` | stack |
| `c1-conformance` | `npm run ci:105:c1-conformance` | stack |
| `c2-conformance` | `npm run ci:105:c2-conformance` | stack |
| `ledger-concurrency` | `npm run ci:105:ledger-concurrency` | stack |
| `p7-selection-search-lab` | `npm run ci:105:p7-selection-search-lab` | stack |

Os seis de baixo foram o patch #1291. Os seis de cima já tinham o flag (smoke/full/e2e/save/static/impact).

### Sem `progress: true` (22) — dívida vs “toda receita de teste como full/smoke”

Já passam pelo stack (flag no catálogo **bastaria** para Bootstrap/…/Playwright):

- `proof-favoritos-anamnese`, `proof-favoritos-superficie`, `proof-modais-import-bulk`, `proof-colisao-save`, `proof-prescricao-importacao`, `proof-identidade-visivel`, `proof-selection-search-lab`, `proof-favoritos-conformance`, `proof-cross-module-conformance`, `proof-numeric-input` — `run-golden-proof.sh` → `npm run ci:local:e2e`
- `proof-importacao` — `importacao-local-stack.ts` → `e2e-local-stack.sh`

**Não** usam o emitter/stack hoje (precisam de instrumentação nova, não só o flag):

- `review` — `test:review` / `jest-scope.ts`
- `proof-care` — `capture-care-route.ts`
- `proof-receitas-medidas` — `receitas-medidas-proof.sh`
- `clinical-readonly`, `clinical-readonly-live` — `clinical-readonly-campaign.sh` (só **comenta** o stack; não o chama)
- `flowui` — Storybook + `ci-flowui.ts`
- `admin-relation` — `admin-relation-proof.sh`
- `export-atlas` — `export-atlas-local.sh`
- `clinical-date-evolution` — `clinical-date-evolution-pack.ts`
- `app-atlas` — `run-app-atlas-gate.ts`

Fora da tese “receita de teste”:

- `runtime-probe` — `node -p` de identidade Node; docs: **não** é proof de ship. Progresso factual seria um único estágio “probe”, se o produto quiser o card no Vite.

### Ratchet que **proíbe** `progress: true` extra

`scripts/ci/__tests__/progress-instrumentation.test.ts` caso `'liga progresso só nos seis presets que reusam e2e-local-stack, sem mexer argv'`:

1. Exige `progress: true` + argv congelado nos seis do #1291.
2. Monta `stillSilent` = qualquer outro preset com `progress === true` **exceto** a allowlist `static|smoketest|full|e2e|e2e-impact|save`.
3. `expect(stillSilent).toEqual([])`.

Ligar o flag em `proof-importacao` (ou em qualquer 13º preset) **quebra Jest** até o ratchet virar allowlist positiva / “toda receita de teste”.

Segundo buraco no mesmo arquivo: `runWithFakeNpm` só seta `LOCAL_CI_PROGRESS_ENABLED=1` para `static|smoketest|full|e2e|save`. Não inclui os seis do #1291. O caso p7/e2e/save força `'1'` à parte. O silêncio de `flowui` em `ci-local.sh` continua sendo a mutação protegida (“preset não instrumentado indeterminado”).

---

## D) Pacote de ship sem créditos de GitHub Actions

### Comandos que **existem** (quote)

`package.json`:

```text
npm run ship
npm run ci:smoketest
npm run ci:queue
npm run ci:queue:status
npm run ci:queue:logs
```

Docs / YAML / usage string (existem hoje):

```bash
npm run ci:queue -- smoketest --wait
npm run ci:queue:status
npm run ci:queue:logs -- latest --follow
npm run ship
npm run ship -- --dry-run
npm run ship -- --no-remote
npm run ship -- --remote
gh pr create --base dev --draft --title "..." --body "..."
gh pr merge <n> --merge --match-head-commit <HEAD>
```

Interruptor DietFlow: `scripts/ship/remote-verdict.json` com `verdict: skipped` **ou** `actions`. Flags `--no-remote` / `--remote` ganham do arquivo. **Não detecta cota.**

Interruptor do **produto** `ci-queue ship`: `remote-verdict.json` **ao lado do catálogo** (raiz DietFlow). Valores do produto: `wait` | `skipped` (não `actions`). DietFlow ainda **não** cutoverou: `CONSUMER-QUICKSTART.md` do CI Queue diz que DietFlow continua com o próprio `npm run ship`.

### O que o código DietFlow já faz (sem feature nova)

| Passo pedido | Código hoje | Dívida |
|--------------|-------------|--------|
| `npm run ci:queue -- smoketest --wait` | `ensureLocalProof` spawna exatamente isso se não houver ticket elegível | Procedural: precisa da CLI/worker **instalados**. Sem fila, cai em `ci:smoketest` direto (sem ticket → ship Linux/cloud). |
| `npm run ship` / `--dry-run` | `package.json` + `parseShipArgs` + `runShip` | Dry-run não muta (sem enqueue, attestation, ready, merge). |
| `remote-verdict.json` skipped | `readRemoteVerdictFile` → `noRemote: true` | **Dois arquivos.** DietFlow lê `scripts/ship/…`. Produto lê raiz. Os dois estão `skipped` aqui; divergir os dois é footgun. `19c491` criou o da raiz; o de `scripts/ship` já vinha skipped do #1224. |
| draft → ready | `ops.gh(['pr', 'ready', String(pr.number)])` no caminho `skipRemote` **e** no caminho Actions | PR precisa nascer `--draft`. Ready sem remoto **também** exige prova local. |
| `BASE_MOVED` | `assertBaseFresh` no passo 1 e de novo em `mergePinned` (re-fetch `origin/dev`) | Não há código `BRANCH_MOVED`. HEAD da PR vs local = `NO_PR`. Merge pinado = `gh pr merge --merge --match-head-commit <head>` (gh recusa se o HEAD da PR andou). Ticket `pinHeadSha` é preflight da **fila**, não do ship. |
| Quem mergeia | **`npm run ship` chama `gh pr merge`** (`mergePinned`). Não existe botão no Vite. Plano Free: **sem** required checks; merge manual na UI/`gh` continua possível | Dívida de procedimento, não de feature. |

Caminho skipped (Actions sem crédito), já testado em Jest (`ship.test.ts`): prova local → attestation `local/smoketest` `description=base:<sha>` → `gh pr ready` → **zero** `gh run watch` → `mergePinned`. Dry-run com `noRemote` reporta `remote: skipped`, `merged: false`.

`ci-queue.json#ship.acceptedPresets` **não** é lido por `scripts/ship/ship.ts`. É para `ci-queue ship` (produto), que exige `requireCleanTree` + `requireGitStability` + `pinHeadSha` + `fetchBase` na receita aceita — por isso `19c491` pôs `pinHeadSha` em smoke/full.

**Veredicto D:** o pacote “smoke na fila + `npm run ship` com skipped + draft→ready + `BASE_MOVED` + merge pinado” **já está no código DietFlow**. Não falta feature de skip-remote. Falta **procedimento** (usar o ship de verdade; não dar push em `dev`) e **teste de integração na fila instalada**. Cutover para `ci-queue ship` é outro produto; DietFlow `package.json#ship` ainda aponta para `tsx scripts/ship/ship.ts`.

---

## E) `.context` e `AGENTS.md` — “script de teste novo deve emitir progresso para o Vite”

**A frase pedida não existe.** Grep em `.context/domains`, `.context/patterns`, `docs/ci`, `AGENTS.md`:

| Lugar | O que tem | O que falta |
|-------|-----------|-------------|
| `.context/patterns/ci.yaml` `progress_and_retry` | `enabled_by: ci-queue.json#presets.*.progress`; emissores listados: `ci-local.sh`, `e2e-local-stack.sh`, `playwright-progress-reporter.ts`; testes do reporter | Não diz “receita/script novo **deve** emitir”. `e2e_impact_groups.progress_desde_2026_09_09` só cobre impact. `update_matrix` não tem linha de progresso. |
| `.context/patterns/ci.yaml` `public_commands` | `npm run ship`, dry-run, `ci:queue -- <preset> --wait` | — |
| `.context/patterns/ci.yaml` `skip_remote_verdict` | `scripts/ship/remote-verdict.json` | Não menciona o JSON da raiz. |
| `.context/domains/manifest.yaml` | Entry “como mexer no CI” → `patterns/ci.yaml` | Sem menção a progresso/Vite. |
| `.context/domains/infra.yaml` | Fila executa provas; ship coordena; ship não é preset | Sem emissores. |
| `.context/domains/*.yaml` (resto) | Hits de “progress” = widgets UI / exclusão de conta | Irrelevante. |
| `.context/patterns/testing.yaml` | Jest vs E2E, golden | **Zero** fila/progresso/Vite. |
| `docs/ci/CI-QUEUE-CONSUMIDOR.md` | Emissores + `progress: true` nas **instrumentadas** | Não obriga as novas. |
| `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md` | Flag do catálogo; worker liga env; sem allowlist | Mesma omissão normativa. |
| `docs/ci/CI-QUEUE-OPERACAO.md` | Sem hits de `progress: true` / emitter | — |
| `AGENTS.md` | Fila para CI pesado; ship; skipped via `scripts/ship/remote-verdict.json` | **Nenhuma** ocorrência de `progress: true`, `LOCAL_CI_PROGRESS`, emitter, “Vite”. |
| `.agents/skills/dietflow-ci/SKILL.md` | Ship + `scripts/ship/remote-verdict.json` | Sem progresso. |
| `AGENTS.md` spend-abort | Ainda diz que CI Queue `0.1.0` **não** tem a capability | #1291 atualizou o consumidor para `61069f4` anunciar `spend-abort-v1`. AGENTS ficou velho. |

Lugar certo para a regra futura: `ci.yaml#progress_and_retry` (mapa) + parágrafo em `AGENTS.md` na seção de fila + ratchet **positivo** no teste (hoje o ratchet é negativo).

---

## F) #1291 / autores testaram na fila **instalada** até o Vite?

### O que existe

| Evidência | O que prova | O que não prova |
|-----------|-------------|-----------------|
| Test plan [x] “Fila: p7 … Bootstrap + Artefatos no Vite” | Alguém **afirmou** ter visto o drawer | Sem ticket id, log, screenshot, `history/*.json` |
| Jest `progress-instrumentation` p7 | `e2e-local-stack.sh` com env forçado emite Bootstrap running→failed no preflight inválido | Spawn **direto**, não `ci-queue enqueue`; sem collector, sem Vite |
| Jest `playwright-progress-reporter` | TSV do reporter com env forçado | Idem |
| Nó **Artefatos** | Só o worker `publishArtifactNode` ingere esse label | Se viram Artefatos, o job passou pelo worker instalado. Jest **não** emite Artefatos |
| Nó **Bootstrap** no Vite | Exige env do worker + emitter | Só o checkbox do PR; o teste Jest não passa pelo worker |

Não há review comments, issue comments, check-runs de Actions, nem `gh run` na branch. O único status GitHub em `023a1810d` é `local/smoketest` success, `description=base:19c491a3f…`, criado `2026-09-18T02:04:00Z` (2 s antes do ready, 6 s antes do merge). Esse formato é a attestation do **ship DietFlow** (`PROOF_CONTEXT = 'local/smoketest'`).

Conclusão F (progresso): testes commitados = emissores isolados. A única evidência de Vite/fila instalada é o checkbox do PR, **sem artefato**. Ausência de ticket id = **não comprovado no git**.

### Ship vs `gh pr merge` no #1291

Sequência GitHub:

1. `02:04:00` attestation `local/smoketest`
2. `02:04:02` `ready_for_review`
3. `02:04:06` merge commit `--merge` (dois pais), actor `dietflowoficial`
4. Zero runs de `ci.yml`

Isso é o caminho `skipRemote` de `runShip` (attestation → ready → merge pinado, sem watch). O test plan deixou `[ ] npm run ship`. Não dá para distinguir no git `npm run ship` de um agente que replicou as três chamadas `gh`. **Não** foi squash/rebase UI. **Não** foi Actions.

`19c491a3f` **não** usou nem ship nem `gh pr merge`: é commit first-parent em `origin/dev` sem PR.

---

## Tabela de evidência (`path:line`)

| Claim | Evidência |
|-------|-----------|
| Seis flags no catálogo | `ci-queue.json:117,132,141,151,161,171` |
| Smoke/full/e2e/save/static/impact já tinham progress | `ci-queue.json:20,47,60,75,83,97` |
| Ship catalog: só smoketest | `ci-queue.json:342-345` |
| pinHeadSha smoke/full | `ci-queue.json:55,71` (introduzido em `19c491a3f`) |
| Wrappers fila | `docs/ci/CI-QUEUE-CONSUMIDOR.md:19-24` |
| Progresso consumidor | `docs/ci/CI-QUEUE-CONSUMIDOR.md:105-107` |
| Sem allowlist no worker | `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:484-489` |
| Comandos smoke/status/logs | `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:293-297` |
| Porta `npm run ship` / dry-run | `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:69-77` |
| Enqueue smoke no fluxo draft | `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:142-143` |
| Merge pinado | `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:172-173,625-626` |
| Interruptor `scripts/ship/remote-verdict.json` | `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md:635-637`; `AGENTS.md:628-632`; `scripts/ship/ship.ts:1051-1075` |
| `package.json` ship / ci:queue / ci:smoketest | `package.json:15,32,46` |
| Emitter gate | `scripts/ci/progress-emitter.sh:7-8,30-42` |
| Smoke emite Static/Jest | `scripts/ci/smoketest-local.sh:10,89-104` |
| Full emite raízes | `scripts/ci/full-local.sh:16-24,164-199` |
| Stack emite Bootstrap…Playwright | `scripts/ci/e2e-local-stack.sh:15-20,163,357,442,497-509` |
| ci-local só static/full/smoketest | `scripts/ci-local.sh:34-43,87-93` |
| Playwright reporter + config | `scripts/ci/playwright-progress-reporter.ts:32`; `playwright.config.ts:23-26` |
| Adapter `progress` → `progressEnabled` | `scripts/ci/run.ts:57`; `scripts/ci/queue-client.ts:42` |
| Ratchet proíbe extra `progress: true` | `scripts/ci/__tests__/progress-instrumentation.test.ts:22,87-93,131-152` |
| Fake npm só liga 5 presets | `scripts/ci/__tests__/progress-instrumentation.test.ts:22` |
| `ensureLocalProof` enfileira smoke | `scripts/ship/ship.ts:363-389` |
| Skip remote: ready sem wait | `scripts/ship/ship.ts:805-818` |
| `BASE_MOVED` ×2 + merge pinado | `scripts/ship/ship.ts:289-297,577-582` |
| Verdict file DietFlow | `scripts/ship/remote-verdict.json:1-3`; `scripts/ship/ship.ts:1059-1068` |
| Verdict file produto (raiz) | `remote-verdict.json:1-3`; produto `src/ship/system-ops.ts:45,345-349` |
| Jest skip-remote | `scripts/ship/__tests__/ship.test.ts:1111-1122,1242-1251` |
| Worker liga env | `~/ci-queue/src/core/runner.ts:446-465` |
| Collector + Artefatos | `~/ci-queue/src/core/runner.ts:291-292,589-647` |
| Enqueue copia `progress` | `~/ci-queue/src/core/enqueue.ts:79` |
| Protocolo público | `~/ci-queue/docs/CONTRACTS.md:52-61` |
| Produto: catalog-adjacent verdict | `~/ci-queue/docs/superpowers/specs/2026-09-17-ci-queue-plug-and-play-design.md:408-411` |
| `acceptedPresets` exige pinHeadSha | `~/ci-queue/src/contracts/config.ts:100-107` |
| Produto BASE_MOVED / HEAD da PR | `~/ci-queue/src/ship/system-ops.ts:628-630` |
| DietFlow mantém `npm run ship` | `~/ci-queue/docs/CONSUMER-QUICKSTART.md:33-35` |
| `progress_and_retry` no mapa | `.context/patterns/ci.yaml:749-760` |
| Comandos públicos YAML | `.context/patterns/ci.yaml:53-58,88-99,231-232,718-724` |
| Fila em AGENTS (sem progresso) | `AGENTS.md:532-544,573-635` |
| Goldens já chamam o stack | `scripts/proof/run-golden-proof.sh:96-97` |
| Importação já chama o stack | `scripts/ci/importacao-local-stack.ts:16-18` |
| Vite drawer Progresso | `~/ci-queue/ui/src/features/shared/job-drawer.tsx:436,511` |

---

## Files to patch later

### catalog

- `ci-queue.json` — `progress: true` em toda receita de teste ainda silenciosa (os 21 de teste; decidir `runtime-probe`). Goldens/importação: só o flag. Review/flowui/atlas/clinical-readonly/proof-care/admin-relation/export-atlas/clinical-date-evolution: flag **mais** emissor. Não mexer argv sem querer.
- `remote-verdict.json` (raiz) vs `scripts/ship/remote-verdict.json` — documentar/unificar dono (DietFlow ship vs `ci-queue ship`). Hoje os dois skipped; o risco é divergirem.

### emitters

- `scripts/ci/progress-emitter.sh` — comentário ainda fala em “job de regression não vira nós órfãos”; regression **já** é instrumentado. Atualizar a doutrina.
- `scripts/ci/e2e-local-stack.sh` — já serve goldens/importação quando o env liga; sem patch estrutural se o catálogo ligar o flag.
- `scripts/ci-local.sh` — hoje só emite para `static|full|smoketest`. Review/flowui que passem por gates precisam de `LOCAL_CI_PRESET` ou outro parent.
- `scripts/ci/jest-scope.ts` (`review`) — sem TSV.
- `scripts/ci/clinical-readonly-campaign.sh`, `scripts/ci/export-atlas-local.sh`, `scripts/ci-flowui.ts`, `scripts/proof/receitas-medidas-proof.sh`, `scripts/proof/admin-relation-proof.sh`, `scripts/proof/capture-care-route.ts`, `scripts/proof/clinical-date-evolution-pack.ts`, `scripts/proof/run-app-atlas-gate.ts` — estágios próprios (não herdados do stack).
- `scripts/ci/playwright-progress-reporter.ts` / `playwright.config.ts` — já cobrem Playwright quando o env está on; proofs que **não** passam pelo Playwright precisam de outro emissor.

### tests

- `scripts/ci/__tests__/progress-instrumentation.test.ts` — **inverter** o ratchet `stillSilent === []` (hoje **proíbe** o 13º `progress: true`). Expandir `runWithFakeNpm` além de `static|smoketest|full|e2e|save`.
- Teste de fila instalada (fora deste Jest): enqueue de um preset curto com `progress: true`, assert `flags.progressEnabled` + snapshot com Bootstrap (ou Static) **e** Artefatos. O #1291 não deixou isso no repo.
- `scripts/ship/__tests__/ship.test.ts` — skip-remote já existe; não é o buraco. O buraco é prova **ao vivo** na fila+Vite, não mais unit do controlador.

### docs

- `docs/ci/CI-QUEUE-CONSUMIDOR.md` — norma: receita de teste nova emite progresso (catálogo + TSV) para o Vite da fila instalada.
- `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md` — mesma norma; dois `remote-verdict.json`; AGENTS spend-abort desatualizado vs `61069f4`.
- `docs/ci/CI-QUEUE-OPERACAO.md` — hoje mudo sobre progresso.

### .context

- `.context/patterns/ci.yaml` `progress_and_retry` — `must_emit: true` para preset de teste novo; lista de emissores completa; `update_matrix` com progresso.
- `.context/patterns/testing.yaml` — ponte “teste na fila ⇒ `progress: true` + emitter”.
- `.context/domains/infra.yaml` e/ou `manifest.yaml` — entry “progresso no Vite da fila local”.

### AGENTS.md

- Seção **CI local pesado é fila**: qualquer receita/script de teste novo declara `progress: true` e emite o protocolo para o job aparecer no Vite; enqueue na fila instalada é a prova, Jest do emitter não basta.
- Corrigir o parágrafo spend-abort que ainda nega `spend-abort-v1` em `0.1.0`.
- Mencionar o JSON da raiz se o cutover para `ci-queue ship` existir; até lá, `scripts/ship/remote-verdict.json` continua o interruptor de `npm run ship`.
