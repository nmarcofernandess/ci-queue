# PRD: Prova local com progress visível e ship sem Actions

## TL;DR

Marco olha o dashboard Vite da fila local para ver os testes andando. GitHub Actions está sem crédito, então o merge em `dev` tem de sair do ship local, não de `gh pr merge` na unha.

O happy path operacional já existe: receita com `progress: true`, worker que liga `LOCAL_CI_PROGRESS_ENABLED=1`, TSV, collector, aba Progresso, DietFlow `npm run ship` com `scripts/ship/remote-verdict.json` skipped, CI Queue `ci-queue ship --no-remote` com PUT `sha=H`. Um operador disciplinado já consegue ver o job e mergear sem Actions.

O CI Queue não conhece `full` nem `smoketest`. Conhece o processo de ship: receita que o consumidor listou como prova, ticket na fila, pré/pós-voo, HEAD pinado, base observada, merge pinado. Os nomes das receitas são vocabulário do cliente. Se o DietFlow declara que `full` também é prova de ship, esse `full` tem de passar **pelo mesmo pacote** — senão o pacote não é aplicável onde a pessoa quiser. O comando canônico continua sendo `ship`, não `gh pr merge`.

Progresso contínuo (etapas estruturadas no Vite) é contrato e diretriz, não trava. Receita sem `progress: true` gera aviso. Aviso não recusa enqueue, não recusa ticket `passed`, não recusa ship.

A falha das duas frentes foi categoria: suíte no checkout (tmp) + merge na mão. Isso não cria ticket em `~/.local/state/local-ci/queue`. O pin deixou um `node -p` sujo (`20260918030255-9d3a6e7e`). O progress DietFlow ligou seis flags e o ratchet Jest **proíbe** o resto. `19c491a3f` foi push direto em `origin/dev`.

Alvo: enfileirar a receita de prova de cada lane na fila instalada (DietFlow via `npm run ship` / `ci:queue`; CI Queue via `enqueue check` + `ci-queue ship --no-remote`) até aparecer o job. Iniciar já basta para ver occupancy. Cancelar antes das partes brutas prova só visibilidade. Merge exige ticket `passed` da receita aceita pelo ship, com base/HEAD pinados. Sem job na fila, a task não passa. Sem etapas no Vite, a task passa com aviso.

Fora: Build nesta passagem, sandbox de Node, cutover DietFlow para `ci-queue ship`, segundo worker, `remote-verdict.json` novo neste repo, recusar merge por falta de progress, teste de produto na fila live. Spec só neste repo. DietFlow depois na worktree `dietflow-ci-queue-node-pin`.

```text
npm run check no checkout     →  tmp, sem ticket     →  Vite mudo
enqueue check --config ...    →  fila instalada      →  Vite com stages
gh pr merge                   →  merge sem prova
ship --no-remote / npm run ship → reusa ticket, merge pinado
```

## State

- Source: inline (pedido do operador + PRs mergeados #10 / #1291 / #1292 + `research/`)
- Confidence: medium
- Route: analyst_prd
- Phase budget: deep
- Execution strategy: single
- Created: 2026-09-18T18:30:06+00:00
- PRD status: gathering (humano corrige; Build só depois da confirmação)
- Research: `specs/001-prova-local-progress-ship/research/`

## Problem

Duas frentes foram mergeadas em `dev` como se o produto de fila local estivesse provado. Nenhuma das duas fechou o contrato que justificava o trabalho: **ver o teste no Vite da fila instalada** e **deixar o ship mergear sem GitHub Actions**.

A frase que o operador marcou como intuito:

> Testes do CI Queue vs fila instalada. `npm run check` rodou no checkout `~/ci-queue` (build, test:runtime, UI, Playwright). Isso é suíte do produto, em tmp. Não vira job no worker instalado. Não aparece como processo/ticket em `~/.local/state/local-ci/queue`.

Isso não foi um detalhe de QA. Era o critério de existência. Sem job na fila, o dashboard que o operador usa para operar o produto não vê nada. Sem ship, o merge ignora o pack que foi escrito exatamente porque o Actions está sem crédito.

## Goal

Anotar, com evidência de código e de fila, o que cada frente fez, o que o código **já** permite, o que ainda é dívida de código versus dívida de teste/procedimento, e o contrato de ativação (DietFlow + CI Queue) para o próximo agente executar **depois** deste PRD ser confirmado.

O resultado desta fase é o pacote Superflow (`PRD.md` + `analysis.md` + `research/`). Não é código.

## Users / Actors

| Actor | Papel |
| --- | --- |
| Marco | Opera a fila pelo Vite. Lê e corrige este PRD. Confirma ou veta o Build. |
| Agente progress/ship (frente DietFlow #1291 + commit `19c491a3f`) | Ligou progress em seis presets local-stack e o catálogo de ship. Não enfileirou a suíte do CI Queue. Push direto de um commit em `origin/dev`. |
| Agente pin (esta conversa, CI Queue #10 + DietFlow #1292) | Pin opt-in de Node. Rodou `npm run check` no checkout. Mergeou com `gh pr merge`. Não enfileirou `check`. Não ligou progress no restante das receitas DietFlow. |
| Worker LaunchAgent | Único drenador de `~/.local/state/local-ci/queue`. Executa `ticket.cwd` + `ticket.argv`. Não mergeia. |
| Dashboard Vite | Lê o mesmo state root. Mostra occupancy e a aba Progresso. Não tem botão de ship. |
| Controllers de ship | DietFlow: `npm run ship` (`scripts/ship/ship.ts`). CI Queue: `ci-queue ship` (`src/ship/ship.ts`). Worker e runner não importam `src/ship`. |

## Story de Usuario

Como operador da fila local, eu preciso ver o teste da lane como job no Vite e deixar o ship mergear o PR draft em `dev` sem esperar GitHub Actions. Se o teste só passa no terminal do checkout, não passou: não há occupancy, não há ticket, o ship não tem o que reusar. Etapas estruturadas no drawer são o contrato de receita nova; se a receita não as declara, eu quero um aviso — não um merge recusado.

## Story Tecnica

O processo de ship é um pacote. O produto pergunta: esta receita é prova de ship? Então valem X e Y (ticket na fila, argv da receita aceita, pré/pós-voo, HEAD, base, merge pinado). Não pergunta se o nome é `full` ou `smoketest`.

Progresso contínuo é declaração no catálogo (`progress: true`) + emissor TSV. Worker liga `LOCAL_CI_PROGRESS_ENABLED=1`. Drawer já desenha a árvore. Receita sem a declaração: aviso. Ship não lê essa flag para elegibilidade — e **não deve** passar a recusar por isso.

- Enqueue com `--config` do repo certo contra o state instalado.
- Ticket `passed` com argv da receita que o consumidor listou em `ship.acceptedPresets`, HEAD pinado, base observada.
- Ship do dono da lane (`npm run ship` no DietFlow; `ci-queue ship --no-remote` neste repo).
- Se o consumidor quiser que `full` prove ship, `full` entra na lista de receitas aceitas e carrega os mesmos flags de ship-bound que a outra prova. Senão o pacote furou.
- Sem fila persistente no Mac: o ship não substitui o pacote por `npm run ci:smoketest` direto.
- Sem ticket na fila: task vermelha. Sem etapas no Vite: aviso.

## Scope

### In Scope

- Relato honesto das duas entregas (intent, DoD, o que foi testado, o que foi mergeado).
- Inventário de comandos que **existem hoje**.
- Separação dívida de **código** (aviso de progresso contínuo, ratchet, emissores, `full` no pacote de ship, fallback fora da fila) × dívida de **teste/procedimento** (não enfileirar, merge na unha).
- Contrato de ativação: fila instalada + Vite + ship, para DietFlow e para CI Queue.
- Lista de arquivos DietFlow (código, testes, docs, `.context`, `AGENTS.md`) que o próximo agente deve patchar **depois** da confirmação. Spec DietFlow: **não**.
- Worktree DietFlow futura: a mesma `~/dietflow-ci-queue-node-pin`, nova branch a partir de `origin/dev`. Checkout canônico `~/dietflow-app`: observação only.
- Analyst de viabilidade neste pacote. Critica GPT contra o pedido.

### Out of Scope

- Build, Plan, Execute, QA de código **nesta** passagem.
- Novo protocolo de progress, nova aba Vite, novo card de runtime, novo collector.
- Cutover DietFlow de `npm run ship` para `ci-queue ship`.
- Fechar o bypass `env -i` do pin (non-goal documentado).
- Recusar ship ou task por falta de progresso contínuo.
- Last-green como prova de ship. `full` só conta se estiver no pacote de ship do consumidor.
- Segundo worker no mesmo state.
- Teste de produto (vitest/node:test) que escreva em `~/.local/state/local-ci/queue` — o plano plug-and-play **proíbe**. A prova instalada é sequência de operador / QA deste spec.
- Editar `~/dietflow-app`.
- Mutar GitHub nesta fase.

## Expected Behavior

Depois da confirmação humana e da execução (fase posterior):

1. Enfileirar o `check` deste repo na fila instalada cria job no Vite. Cancelar depois de iniciar ainda conta como prova de occupancy.
2. Enfileirar a receita de prova DietFlow na worktree da lane cria job no Vite. Idem.
3. Merge DietFlow em `dev` só via `npm run ship` (pacote: ticket na fila, `remote-verdict` skipped, draft→ready, base/HEAD). `full` vale se for receita aceita de ship e usar os mesmos pré/pós-voo. Sem `ci:smoketest` direto no Mac com fila.
4. Merge CI Queue em `dev` só via `ci-queue ship --no-remote` depois do `check` enfileirado `passed`. Draft vira ready. Base e HEAD revalidados. Sem `gh pr merge` avulso.
5. Receita sem progresso contínuo: aviso no drawer (e diretriz em docs/AGENTS). Enqueue e ship seguem.
6. Receita de teste nova nasce com o contrato de progresso contínuo (catálogo + emissor + docs). O ratchet deixa de proibir o 13º flag.

## Current Behavior / Bug

Evidência em `research/01`–`04`. Resumo factual:

| O que o operador espera | O que aconteceu |
| --- | --- |
| Job `check` do CI Queue na fila instalada, stages no Vite | `npm run check` no checkout. Zero ticket `check` em 2026-09-18. Últimos `check` são 2026-09-17, sem `runtime`. |
| Job smoketest DietFlow da **lane do pin** na fila, depois `npm run ship` | Pin plan disse “não smoketest”. Merge #1292 = `gh pr merge`. Probe `runtime-probe` não é proof de ship. |
| Toda receita DietFlow com progress como full/smoke | 12 de 34 presets com `progress: true`. Ratchet Jest **quebra** se ligar o 13º. |
| Ship fecha o PR | #10 e #1292: `gh pr merge --merge` sem `--match-head-commit`. `19c491a3f`: push direto em `origin/dev`, sem PR. |
| CI Queue no `runtimes.json` | Só DietFlow está registrado. `check` deste produto, se enfileirado hoje, sai `unconfigured`. |

Duas categorias, não uma:

1. **Procedimento:** as frentes não enfileiraram e mergearam na unha. Collector, wrapper e invocação de ship já existem.
2. **Código:** ratchet DietFlow impede o 13º `progress: true`; famílias sem emissor não ganham árvore só com o flag; aviso de progresso contínuo ainda não existe (o empty “Progresso não registrado” fala de publicação, não de configuração da receita); DietFlow `npm run ship` aceita `full` mas `ci-queue.json#ship.acceptedPresets` lista só `smoketest` — o pacote fura se alguém usar o controller do produto; sem fila persistente, `ci:smoketest` direto.

## Desired Behavior

O pack de comportamento abaixo é o DoD de **qualquer** task desta dívida. Vale para DietFlow e para CI Queue. Sem ele, não há pass — mesmo que testes tmp estejam verdes, mesmo que o PR já esteja no GitHub.

### Decisão (2026-09-18, operador)

Progresso contínuo **não** é obrigatório para pass nem para merge. O que é obrigatório: contrato que ensina a configurar, diretriz para IA, job na fila, merge pelo ship. Progresso indisponível = aviso. Aviso não assusta nem barra. Texto do aviso: a receita não tem progresso contínuo configurado para mostrar os estágios.

`full` vs `smoketest`: o CI Queue não conhece esses nomes. Conhece o processo de ship. Se o consumidor quer que uma receita prove ship, ela entra no pacote (lista aceita + mesmos pré/pós-voo). Canônico é rodar `ship`. Se `ship` com `full` não reusa o mesmo recurso que `smoketest`, o pacote falhou.

### DoD inegociável (job na fila / Vite)

Testes do DietFlow **e** do CI Queue têm de aparecer como job no Vite da fila local. Sem job, a task não passa. Os testes podem ser cancelados antes das partes brutas. **Iniciar na fila já é suficiente para ver occupancy.**

Concretamente: existe `history/<id>.json` (ou running) no state instalado, `projectId` certo. Screenshot não substitui ticket id. Etapas no drawer são desejáveis; ausência delas não zera a task.

### DoD inegociável (progresso contínuo = aviso)

Receita de teste nova declara `progress: true` e emite o protocolo. Docs, `.context` e `AGENTS.md` ensinam isso. Se a receita não declara, a UI mostra aviso (não `destructive`):

- título: Progresso contínuo não configurado
- descrição: Esta receita não declara progresso contínuo. Os estágios da execução não aparecem.

Nada nisso recusa enqueue, ticket ou ship. Não acrescentar frase sobre IA, merge ou bloqueio.

Empty atual (“Progresso não registrado” / “Esta execução não publicou etapas estruturadas”) mistura “não configurou” com “não emitiu”. Execute alinha o chrome ao aviso de configuração quando `progressEnabled` é falso; se a receita declara e não emite, outro aviso factual, igualmente não destrutivo.

### DoD inegociável (DietFlow merge em `dev`)

Merge em `dev` pelo `npm run ship`, **sem** GitHub Actions (sem crédito). Interruptor: `scripts/ship/remote-verdict.json` `skipped`. Prova: ticket na fila da **worktree da lane**, receita que o consumidor trata como prova de ship, HEAD+base+cwd, pré/pós-voo. Hoje isso é `smoketest` e, no controlador DietFlow, também `full` se o ticket for elegível. Para o pacote não furar: as duas receitas que o DietFlow aceita como prova precisam dos mesmos flags ship-bound **e** aparecer em `ci-queue.json#ship.acceptedPresets` se o cutover para `ci-queue ship` algum dia ocorrer. `runtime-probe` não conta. Quem mergeia é `npm run ship`, não `gh pr merge` avulso, não push em `dev`, não `npm run ci:smoketest` fora da fila.

### DoD inegociável (CI Queue merge em `dev`)

O `check` (a receita que **este** catálogo listou como prova de ship) tem de passar **na fila local**. Quem fecha e mergeia é `ci-queue ship --no-remote`, não merge manual. Sequência: PR draft → prova enfileirada `passed` → ship atesta → PR ativo → PUT merge `sha=H` com inspeção de pais / `BASE_MOVED`. Progresso contínuo no `check` já está no catálogo; se faltasse, seria aviso, não recusa.

## Relato: o que o outro agente fez (progress / ship)

Fontes: `research/02-dietflow-progress-ship.md`, commits `19c491a3f` e `023a1810d`, PR DietFlow #1291.

### Intent

Ligar progresso factual nas receitas local-stack que **já emitiam** Bootstrap/Supabase/Next/Playwright, mas cujo catálogo estava mudo. Tornar smoketest a prova de ship do catálogo do produto, com wait remoto skipped, para mergear sem crédito de Actions.

### O que mergeou

1. **`19c491a3f`** — `chore(ci): bind smoketest as ci-queue ship proof with skipped remote verdict`. Dois arquivos: `pinHeadSha` em smoke/full, bloco `ship.acceptedPresets: ["smoketest"]`, e `remote-verdict.json` **na raiz** (`skipped`). **Push direto em `origin/dev`.** Sem PR. Sem `npm run ship`. Contraria o intuito do próprio commit: poder PR+merge com os comandos certos sem Actions.
2. **`023a1810d` / PR #1291** — `progress: true` em seis presets (`receitas-medidas`, `regression`, `c1-conformance`, `c2-conformance`, `ledger-concurrency`, `p7-selection-search-lab`). Docs `spend-abort-v1` a partir de `61069f4`. Ratchet Jest que **congela** essa allowlist e **proíbe** extra `progress: true`.

### DoD do PR #1291 (test plan)

- [x] Jest focado (`progress-instrumentation`, `playwright-progress-reporter`)
- [x] Fila: `p7` com `progressEnabled` e nós Bootstrap + Artefatos no Vite — **afirmado, sem ticket id no git**
- [ ] `npm run ship` — **deixado desmarcado**

Timeline GitHub do #1291: attestation `local/smoketest` → ready → merge em 6 segundos, zero Actions. Formato da attestation é o do ship DietFlow. O test plan mesmo assim deixou ship desmarcado. `19c491a3f` não tem sequer essa ambiguidade: foi first-parent em `dev`.

### O que ele não testou

- Não enfileirou o `check` do **CI Queue** na fila instalada. A suíte do produto em tmp nunca vira occupancy.
- Não criou teste de produto que prove o collector+Vite com o `check` canônico (e a suíte **não deve** escrever na fila do operador).
- Testes commitados = emissores com env **forçado** no Jest. Isso prova o bash/TS do DietFlow, não o dashboard.
- Não ligou progress nas 22 receitas restantes. O ratchet que ele adicionou **impede** o pedido posterior “todo teste igual full/smoke”.
- `AGENTS.md` / `.context/patterns/testing.yaml` **não** ganharam a norma “script novo emite progress”. `.context/patterns/ci.yaml#progress_and_retry` descreve o mecanismo e não obriga receita nova.

Alerta: ele validou o DietFlow (Jest + checkbox Vite) e empurrou o contrato de ship para `dev` no caminho errado. O intuito de tudo isso era precisamente **não** precisar de crédito no Actions e **ainda assim** passar por PR draft + prova local + ship. Push em `dev` e `gh pr merge` na unha são o anti-padrão do pack.

## Relato: o que este agente fez (pin de Node)

Fontes: `research/03-node-pin-actual-vs-dod.md`, `research/04-ship-merge-commands.md`, PRs #10 e #1292.

### Intent e DoD da implementação (só o pin)

Camada 1, opt-in, registry do operador em `<state>/runtimes.json` por `projectId`. Sem entrada: `unconfigured`, herda o ambiente, **não** recusa. Com entrada: shim+preload, receipt `verified` = processos **observados**, não sandbox. Mac `realpath` (`/var` vs `/private/var`). CLI `runtime show|register`. Capability `node-runtime-guard-v1`. Sem card no dashboard. Sem pin no `ci-queue.json` do consumidor. `env -i` + Node absoluto estrangeiro permanece non-goal, com teste que **exige** `passed`+`verified`+arquivo `forbidden`.

Provas nomeadas no plano do pin (fracas frente a este spec, mas eram o combinado daquela frente):

- CI Queue: `npm run check` **neste Mac**, processo local.
- DietFlow: enqueue `runtime-probe`, `register --version 99.0.0`, restaurar 24.20.
- Explicitamente fora: Full, smoketest, last-green, fail-closed global.

### O que mergeou

- CI Queue #10 → `f4f502e`. Release instalada `0.1.0-f4f502ed30fa`.
- DietFlow #1292: preset `runtime-probe` (`node -p`), `isValidPresetArgv` aceita `node`, docs. Canonical `dietflow-app` **não** editado.

### O que este agente testou vs o que deveria ter testado **da própria implementação do pin**

Não entra aqui o extra (progress em toda receita, Vite como DoD de task, ship sem Actions). O operador já sabe que esse extra faltou. Fechar o **pin**:

| Prova do pin | Fez? |
| --- | --- |
| Isolation + CLI register em **tmp** | Sim. Não toca a fila instalada. |
| `npm run check` no checkout (inclui `test:runtime`) | Sim, como processo. **Não** como ticket. |
| Enfileirar `check` deste repo no worker instalado (argv npm, shim, receipt `runtime`) | **Não.** Zero `check` em 2026-09-18. Isso prova o pin **como job do produto**, não o ship. |
| Registrar `projectId` do CI Queue em `runtimes.json` | **Não.** Só DietFlow. Sem isso o `check` sairia `unconfigured`. |
| Probe DietFlow na fila | **Sim, estreito:** `20260918030255-9d3a6e7e`, `node -p`, árvore suja, `headSha` ainda #1291, `progress.nodes` = só Artefatos. |
| `register --version 99.0.0` no registry instalado | **Claim no body do #1292. Zero hits no state root.** UNPROVEN durável. |
| Mac realpath como ticket instalado | Código + tmp. Não como job. |
| Receita DietFlow `npm` bound como prova do pin | **Não.** Catálogo saiu `node -p`. |

Ship / `gh pr merge` **não** testam o runtime pin. Pertencem ao pack extra (item 5 do pedido + DoDs 11–13), que este agente também não fez.

O operador pediu para o outro agente testar na fila. Ele não testou. Passou a responsabilidade para este agente. Este agente também não enfileirou o `check` nem o smoketest. Os dois fecharam com suíte tmp + `gh pr merge`.

### Extra pedido a este agente e não feito

Ajustar progress do DietFlow para **todo e qualquer teste**, no mesmo contrato de full/smoke. Não feito. O ratchet do #1291 ainda **falha** se alguém ligar o 13º `progress: true`.

## Comandos que existem hoje — dava para ter feito?

**Invocar** o happy path: sim, sem feature nova. Identidade/árvore/`gh` errados falham fechado — isso já estava no código.

**Garantir** o DoD “sem progress no Vite, não passa”: não. Ship dos dois lados aceita ticket `passed` mudo. Detalhe dos comandos: `research/04-ship-merge-commands.md`. Enforcement: `research/05-gpt-sol-critique.md`.

### DietFlow (worktree da lane, não `dietflow-app`)

```bash
npm run ci:queue -- smoketest --wait
npm run ci:queue:status
npm run ship -- --dry-run
npm run ship
```

`scripts/ship/remote-verdict.json` já é `skipped` → equivalente a `--no-remote`. Continua exigindo ticket material. **Código hoje:** `findLocalProofTicket` tenta `full` antes de `smoketest` (`scripts/ship/ship.ts:335-337`). Este PRD não trata `full` como substituto até o Marco confirmar. Merge: `gh pr merge --merge --match-head-commit <HEAD>` **chamado pelo ship**. `BASE_MOVED` no authorship e de novo antes do merge. Identidade Mac: `git user.name=Dietflowoficial` e `gh=dietflowoficial`. Sem fila persistente: `ci:smoketest` direto, **sem ticket** (`ship.ts:369-375`) — incompatível com o DoD Vite.

### CI Queue (conta `nmarcofernandess`, `--config` deste repo)

```bash
ci-queue enqueue check \
  --config /Users/marcoantonio/ci-queue/ci-queue.json \
  --cwd /Users/marcoantonio/ci-queue \
  --state "$HOME/.local/state/local-ci/queue" \
  --json

ci-queue ship --dry-run --no-remote --json
ci-queue ship --no-remote --json
```

Equivalentes: `npm run ci-queue -- enqueue check …` e `npm run ci-queue -- ship --no-remote`. **Não há** script npm `ship`. Sem `--no-remote`, o default `wait` recusa (`SHIP_CONFIG`) porque este repo **não tem** `remote-verdict.json` nem `ship.remoteVerdict`. Isso é invocação, não feature faltando. Merge: PUT `/pulls/{n}/merge` com `sha=H`, **não** `gh pr merge`.

`npm run check` **fora** da fila não produz ticket elegível. `runtime-probe` não é accepted preset.

### Dava com o código atual?

| Pedido | Código atual | O que faltou |
| --- | --- | --- |
| Ver `check` no Vite | Preset `progress: true` + wrapper TSV + collector + drawer | Enqueue no state instalado com `--config` deste `ci-queue.json` |
| Ver smoketest no Vite | Preset já tem progress; `smoketest-local.sh` emite | `npm run ci:queue -- smoketest --wait` na lane |
| Merge DietFlow sem Actions | `npm run ship` skipped; aceita ticket `full` ou `smoketest` | Rodar o ship; não `gh pr merge`; não push em `dev` |
| Merge CI Queue sem Actions | `ci-queue ship --no-remote`; prova = `check` | Passar a flag; ter ticket `check`; `gh` = `nmarcofernandess` |
| Pacote de ship portável (`full` = mesmo recurso que smoke) | DietFlow `findLocalProofTicket` aceita `full` primeiro; `ci-queue.json#ship.acceptedPresets` = só `smoketest` | Alinhar lista aceita com o que o controlador DietFlow já trata como prova |
| Aviso se progresso contínuo não configurado | Empty “Progresso não registrado” só quando `nodes` vazio; `progressEnabled` **não** vai para o JobRecord público | Alert não destrutivo + expor se a receita declara progresso |
| Recusar merge sem etapas | **Não recusa — e não deve.** Elegibilidade ignora progress | Nenhum patch de recusa |
| Sem fila persistente no Mac | Cai em `ci:smoketest` direto, retorna `null` | Fail-closed neste contrato (saiu do pacote) |
| Progress em **toda** receita DietFlow | **Não.** Ratchet + 22 presets mudos. Famílias sem stack precisam de emissor | Código DietFlow (catálogo + emissores + inverter ratchet) + docs |
| Pin visível como job do produto | Isolation tmp não vira occupancy | Enqueue `check` **e** registrar o `projectId` do CI Queue em `runtimes.json` |

## Dívida conjunta (código + teste) depois das duas frentes

### Código (ainda existe)

1. Aviso de progresso contínuo: JobRecord público não leva `progressEnabled`; empty atual não distingue “não configurado” de “não emitiu”. Reusar `Alert` (já usado no drawer para `failureReason`). Não criar `advisory upsert` para isso — aquele comando é recomendação de validação por preset+PR, outro objeto.
2. DietFlow: `ci-queue.json#ship.acceptedPresets` só `smoketest` enquanto `findLocalProofTicket` aceita `full` (`ship.ts:335-337`). Pacote fura entre os dois controllers.
3. DietFlow: sem `hasPersistentQueue()`, `ensureLocalProof` roda `ci:smoketest` direto (`ship.ts:369-375`).
4. DietFlow: 22 presets sem `progress: true`. Goldens/importação: só o flag. Sem stack: `review`, `flowui`, `clinical-readonly*`, `proof-care`, `admin-relation`, `export-atlas`, `clinical-date-evolution`, `app-atlas`, `proof-receitas-medidas`.
5. DietFlow: ratchet negativo em `progress-instrumentation.test.ts` (`stillSilent === []`) **quebra** o 13º flag.
6. DietFlow: `ci-local.sh` só emite para `static|full|smoketest`.
7. Dois `remote-verdict.json`. Documentar donos; **não** unificar nesta frente.
8. CI Queue: comando canônico sem Actions é `--no-remote`. Não criar `remote-verdict.json` neste repo.
9. Docs stale: design diz que `npm run check` não emite; `CLI-CONTRACT.md` omite `init`/`ship`; INSTALL vs `local-ci/queue`; DietFlow `AGENTS.md` ainda nega `spend-abort-v1`.
10. LaunchAgent dashboard `--config` = DietFlow. Running é occupancy **global**; histórico terminal é filtrado por projeto.
11. Pin: `env -i` aberto de propósito. CI Queue ausente de `runtimes.json`.
12. Wrapper do `check`: quatro stages agregados. Case-level Vitest é non-goal.

### Teste / procedimento (o buraco que os dois agentes deixaram)

1. Nenhum `check` canônico na fila instalada nesta revisão.
2. Nenhum smoketest da lane do pin na fila com `runtime`.
3. Nenhum `ci-queue ship` / `npm run ship` das duas PRs do pin.
4. `99.0.0` sem rastro no state.
5. Probe sujo, antes do commit DietFlow.
6. “Vite” do #1291 sem ticket id.
7. Push `19c491a3f` em `dev`.
8. `gh pr merge` #10 e #1292.
9. Extra “todo teste DietFlow com progress”: zero.

## O que tem de ser feito para ativar (depois da confirmação)

Não é collector/UI novos. É (a) usar o pacote de ship no fecho, (b) contrato+diretriz de progresso contínuo, (c) aviso quando a receita não declara, (d) alinhar `full` ao mesmo pacote se o DietFlow já o trata como prova. Registrar CI Queue em `runtimes.json` é só para o pin.

### Como ver no Vite (escolha fechada)

O dashboard LaunchAgent nasce com `--config` DietFlow. Occupancy **running/queued é global** (`backend/ci_queue_api/records.py:307-319`). Enquanto o `check` do CI Queue está `running`, o card de execução atual mostra os stages mesmo com o seletor em DietFlow (`otherProjectOccupancy` / running global).

Histórico **terminal** é filtrado por `projectId`. Para reler o job depois que ele acabou: cadastrar o projeto CI Queue no Project Manager (`ui/src/features/projects/project-manager-drawer.tsx`) e selecioná-lo. Cadastro ≠ `runtimes.json`.

Prova de visibilidade: ticket id + primeiro stage `running` no card global (ou drawer). Screenshot é complemento, não substituto.

Cancelar depois do primeiro occupancy **fecha só visibilidade**. Ship precisa de ticket `passed` (o mesmo se não cancelou) com argv canônico. Etapas no drawer não entram na elegibilidade.

### CI Queue (este repo, depois do Build autorizado)

1. Commitar (ou ignorar) `specs/` para árvore limpa — `requireCleanTree`.
2. `gh auth switch --user nmarcofernandess`.
3. Um worker LaunchAgent. Não subir segundo.
4. Enfileirar:

```bash
ci-queue enqueue check \
  --config /Users/marcoantonio/ci-queue/ci-queue.json \
  --cwd /Users/marcoantonio/ci-queue \
  --state "$HOME/.local/state/local-ci/queue" \
  --json
```

5. Ver occupancy no card global. Opcional: cadastrar projeto CI Queue para o histórico. Cancelar só se a meta for visibilidade.
6. Se cancelou: enqueue de novo até `passed`.
7. PR draft contra `dev`. `ci-queue ship --dry-run --no-remote --json`, depois `ci-queue ship --no-remote --json`. Sem `--no-remote` → `SHIP_CONFIG`. Sem `gh pr merge`.
8. Aviso de progresso contínuo: se a receita não declara, Alert no drawer. Sem recusa no ship.

### DietFlow (worktree `dietflow-ci-queue-node-pin`, nova branch de `origin/dev`)

1. Identidade `Dietflowoficial` / `dietflowoficial`. Nunca editar `dietflow-app`.
2. Inverter o ratchet (sketch abaixo).
3. Flag nas receitas que já emitem; emissores nas que não.
4. Norma docs / `.context` / `AGENTS.md`.
5. `npm run ship` na lane (reusa ou enfileira a prova aceita). Cancelar um job só prova occupancy.
6. Se `full` já é prova no controlador DietFlow, listá-lo em `ship.acceptedPresets` com os mesmos flags ship-bound que `smoketest`. Canônico continua `npm run ship`.
7. Nunca push em `dev`. Nunca `runtime-probe` como proof. Nunca `ci:smoketest` direto no Mac com fila.

### Norma para script de teste novo (DietFlow)

Qualquer receita/script de teste novo:

1. Declara o preset em `ci-queue.json` com `progress: true` (salvo non-goal explícito, ex. probe de identidade).
2. Emite o protocolo (`@@local-ci-progress` / `@@ci-queue-progress`) via `progress-emitter.sh` ou reporter Playwright / wrapper de stack.
3. IDs de stage estáveis.
4. Prova: enqueue na fila instalada até o Vite mostrar o job. Jest do emissor com env forçado **não** fecha sozinho.
5. Ship é o pacote. Receita nova **não** entra em `acceptedPresets` só porque existe. Entra se o consumidor decidir que ela prova ship — e aí leva os mesmos flags.

## Arquivos DietFlow a editar (quando autorizado)

Sem spec DietFlow. Mesma worktree. Hunks completos dos emissores novos são Build; aqui o contrato + sketches determinísticos. Fonte: `research/02-dietflow-progress-ship.md`.

### Catálogo — `ci-queue.json`

Antes (exemplo de golden mudo):

```json
"proof-favoritos-anamnese": { "argv": ["npm", "run", "ci:proof:favoritos-anamnese"] }
```

Depois: o mesmo argv + `"progress": true`. Não mudar argv. Aplicar a todo preset de teste que já chama `e2e-local-stack.sh` / `ci:local:e2e` / `run-golden-proof.sh` / `importacao-local-stack.ts`.

`runtime-probe`: fica **sem** progress neste PRD (identidade, não receita de teste). Um stage `probe` só se o Marco pedir.

### Ratchet — `scripts/ci/__tests__/progress-instrumentation.test.ts`

Antes (o que **proíbe** o pedido):

```ts
const stillSilent = /* presets with progress:true except static|smoketest|full|e2e|e2e-impact|save */
expect(stillSilent).toEqual([])
```

Depois: allowlist **positiva** = toda receita de teste (união fechada no teste). `runtime-probe` fora da allowlist. `runWithFakeNpm` liga `LOCAL_CI_PROGRESS_ENABLED=1` para a mesma união, não só cinco nomes.

### Elegibilidade de ship — `scripts/ci/queue-ticket-contract.ts` + `scripts/ship/ship.ts`

Não exigir `progressEnabled` nem estágios. Elegibilidade continua git+argv+cwd+status.

Alinhar o pacote:

- Receitas que `findLocalProofTicket` aceita (`full`, `smoketest`) têm os mesmos flags ship-bound.
- `ci-queue.json#ship.acceptedPresets` lista essas receitas, para o controller do produto e o do DietFlow não divergirem.
- `ensureLocalProof`: se `!hasPersistentQueue()` no Mac desta dívida → `LOCAL_RED`, não spawn `ci:smoketest`.
- Testes: `full` elegível usa o mesmo critério de estabilidade que `smoketest`; prova muda de progress **não** recusa.

### Emissores — contrato de stages (não o script inteiro)

Quem já chama o stack: **zero** patch estrutural; o flag liga Bootstrap → Playwright.

Quem não chama o stack — IDs estáveis, `running`/`passed`/`failed` via `progress-emitter.sh`:

| Preset | Arquivo | Roots mínimos |
| --- | --- | --- |
| `review` | `scripts/ci/jest-scope.ts` | `review` |
| `flowui` | `scripts/ci-flowui.ts` | `flowui` (Storybook não herda `ci-local.sh`) |
| `clinical-readonly`, `clinical-readonly-live` | `scripts/ci/clinical-readonly-campaign.sh` | `clinical-readonly` |
| `proof-care` | `scripts/proof/capture-care-route.ts` | `care` |
| `proof-receitas-medidas` | `scripts/proof/receitas-medidas-proof.sh` | `receitas-medidas-proof` (não confundir com o preset stack) |
| `admin-relation` | `scripts/proof/admin-relation-proof.sh` | `admin-relation` |
| `export-atlas` | `scripts/ci/export-atlas-local.sh` | `export-atlas` |
| `clinical-date-evolution` | `scripts/proof/clinical-date-evolution-pack.ts` | `clinical-date` |
| `app-atlas` | `scripts/proof/run-app-atlas-gate.ts` | `app-atlas` |

`scripts/ci-local.sh`: emitir também quando o parent já ligou env, ou documentar que `review`/`flowui` **não** passam por ele.

### Docs / `.context` / `AGENTS.md` — parágrafo canônico

Inserir o mesmo invariante (infinitivo, sem ticket id):

> Receita de teste nova declara `progress: true` no catálogo e emite o protocolo da fila. Jest com env forçado não fecha a prova de occupancy. Progresso contínuo ausente é aviso, não recusa. Ship é o pacote de prova+merge; o nome da receita é do consumidor.

Destinos: `docs/ci/CI-QUEUE-CONSUMIDOR.md`, `docs/ci/FLUXO-CI-GITHUB-ACTIONS.md`, `docs/ci/CI-QUEUE-OPERACAO.md`, `.context/patterns/ci.yaml` (`progress_and_retry` + `update_matrix`), `.context/patterns/testing.yaml`, `.context/domains/infra.yaml` ou `manifest.yaml`, `AGENTS.md` seção de fila (e corrigir a frase que nega `spend-abort-v1`), `.agents/skills/dietflow-ci/SKILL.md`.

Dois verdict files: DietFlow `npm run ship` lê `scripts/ship/remote-verdict.json`; `ci-queue ship` lê o da raiz. Não unificar nesta frente.

### CI Queue (Execute)

- Expor no JobRecord público se a receita declarou progresso contínuo (`flags.progressEnabled`). Sem isso o aviso não distingue configuração de emissão.
- Drawer: `Alert` padrão (não `destructive`) com o copy do DoD quando não configurado. Reusar o `Alert` já usado para `failureReason`. Empty atual só para o caso “declarou e não emitiu”, ou fundir os dois avisos sem tom de falha.
- **Não** alterar `evaluateForRecipe` / `recipeFlags` para recusar progress.
- Docs stale do wrapper/`CLI-CONTRACT`/`INSTALL` se o mesmo Execute passar por eles.
- **Não** adicionar `remote-verdict.json` neste repo.
- **Não** reusar `advisory upsert` (outro objeto: recomendação de validação por preset+PR).

## System Pattern / Contract

Reuso, não fork:

- Progress: protocolo TSV e UI existentes. Aviso = `Alert` existente, tom padrão. **Não** fork de collector/drawer. **Não** `advisory upsert`.
- Ship: reusar controllers. Nomes de receita são do consumidor (`acceptedPresets`). Alinhar DietFlow `full` ao mesmo pacote.
- Isolamento da suíte: testes do produto **não** tocam a fila live.
- Worker único. Dashboard sem botão de merge.
- `runtimes.json` ≠ `projects.json`.

## Acceptance Criteria

- [ ] PRD relido pelo Marco; correções aplicadas; só então `prd_status: ready` e Build.
- [ ] Research em `research/` citável por path; claims técnicos com `path:line` ou `UNPROVEN`.
- [ ] Analyst responde viável / over-engineering / intenção, com crítica GPT anexada.
- [ ] Nenhum Build/Execute nesta passagem.
- [ ] **Regressão / non-goal:** não se declara pass de task se o Vite da fila instalada não mostrou o job, mesmo com suíte tmp verde.
- [ ] **Regressão / non-goal:** `gh pr merge` avulso e push em `origin/dev` não contam como ship.
- [ ] **Regressão / non-goal:** `runtime-probe` e `npm run check` fora da fila não contam como prova de merge.
- [ ] **Regressão / non-goal:** falta de progresso contínuo não recusa ship nem pinta o job de falha.
- [ ] Quando executar (fase posterior): ticket DietFlow da receita de ship **e** ticket CI Queue `check` visíveis no Vite (iniciar basta para occupancy; merge exige `passed`).
- [ ] Quando executar: merge via `npm run ship` / `ci-queue ship --no-remote`; `full` no DietFlow só se estiver no pacote; sem `ci:smoketest` direto no Mac com fila.
- [ ] Quando executar: receita sem progresso contínuo mostra o aviso do DoD; ship **não** recusa por isso.
- [ ] Quando executar DietFlow extra: ratchet positivo; docs/AGENTS/.context com o invariante; famílias sem stack com os roots da tabela; `acceptedPresets` alinhado ao que o controlador já aceita.

## Definition of Complete

- [ ] Este PRD responde as perguntas do operador (relatos, comandos, dívidas, ativação, arquivos, DoDs das duas frentes, testes que cada um deveria ter feito).
- [ ] `analysis.md` existe; validator Superflow exit 0; PRD permanece `gathering` até confirmação humana.
- [ ] `status.json` e `progress.md` atuais.
- [ ] **Entre todos os DoDs, este vence:** testes de DietFlow e do CI Queue aparecem como job no Vite da fila local. Sem job, não há pass. Iniciar já é suficiente para ver occupancy. Progresso contínuo ausente é aviso, não recusa.
- [ ] **DietFlow:** merge em `dev` pelo `npm run ship`, sem GitHub Actions. Receita de prova = o que o pacote lista (`smoketest` e `full` se `full` usa o mesmo pré/pós-voo).
- [ ] **CI Queue:** `check` na fila local; quem fecha e mergeia é o CI Queue depois do ship, PR draft→ativo, branch/base não andaram.
- [ ] Dívida restante listada: aviso de configuração, alinhamento `full` no pacote, fallback fora da fila, ratchet, emissores, docs. Não reescrever procedimento como “faltou collector” nem como “faltou recusar no ship”.

## Technical Context

- CI Queue HEAD desta branch = `origin/dev` = `f4f502ed30fa` no momento do scaffold.
- State instalado: `~/.local/state/local-ci/queue`. CLI `~/.local/bin/ci-queue`.
- Dashboard LaunchAgent: `--config` DietFlow `dietflow-app/ci-queue.json` + mesmo `--state`. Occupancy é global; filtro de projeto precisa do cadastro.
- DietFlow worktree: `/Users/marcoantonio/dietflow-ci-queue-node-pin`. Canonical `~/dietflow-app` em `dev` atrás de `origin/dev`.
- Contas: CI Queue GitHub `nmarcofernandess/ci-queue`. DietFlow `dietflowoficial/dietflow-app`. Product ship não troca `gh`.
- Capability pin: `node-runtime-guard-v1`. Capability spend-abort: `stale-base` no worker desde `61069f4`.

## Data / Contracts

| Objeto | Onde | Shape que importa para o Vite / ship |
| --- | --- | --- |
| Ticket | `history/<id>.json` + sidecar `progress/<id>.json` enquanto running | `preset`, `argv`, `cwd`, `flags.progressEnabled`, `progress.nodes[]`, `headSha`, `baseSha`, `status` |
| Progress node | `ticket.progress` / API `progressSummary.roots` | id estável, `running\|passed\|failed`, label |
| Runtime receipt | `ticket.runtime` | `state`, `coverage`, `node.version`, `node.executable` — **não** prova de ship |
| DietFlow remote verdict | `scripts/ship/remote-verdict.json` | `{ "verdict": "skipped" \| "actions" }` |
| Produto remote verdict | ao lado do catálogo | `wait` \| `skipped`; ausente = `wait` |
| Registry Node | `<state>/runtimes.json` | por `projectId`; mode 0600 |

Payload da Status page: `progressSummary.roots`. Drawer: tab Progresso. Execute adiciona no JobRecord público um booleano da declaração (`progressEnabled` ou equivalente), só para o aviso. Sem schema bump de ticket.

## UX / States

| Estado | O que prova | O que não prova |
| --- | --- | --- |
| Occupancy running | Enqueue chegou no worker instalado | Não autoriza merge |
| Alert “Progresso contínuo não configurado” | Receita sem `progress: true` | Não é falha do job |
| Terminal `passed` + estágios | Receita completou e emitiu | Merge só depois do ship |
| Só Artefatos | Job no worker; declaração ou emissor ausente | Aviso, não recusa |
| Suíte no terminal do checkout | Código da suíte | **Não** satisfaz este spec |

Copy do aviso (invariante):

| Superfície | Texto | Destino |
| --- | --- | --- |
| Drawer Alert título | Progresso contínuo não configurado | invariante |
| Drawer Alert descrição | Esta receita não declara progresso contínuo. Os estágios da execução não aparecem. | invariante |

Sem frase de IA, merge ou bloqueio. `Alert` padrão, não `destructive`. Tab “Progresso” e “Artefatos” ficam.

## Risks

- Confirmar este PRD e ainda executar `npm run check` / Jest como “pass” — regressão do bug original.
- Segundo worker (`busy: true`) enquanto o LaunchAgent vive.
- Enqueue sem `--config` a partir de cwd DietFlow: ticket com a receita errada.
- `abortOnStaleBase` mata `check`/smoke longo se `origin/dev` andar no meio.
- Identidade `gh` errada: DietFlow ship recusa `nmarcofernandess`; CI Queue ship não vê o repo com conta DietFlow.
- Árvore suja / `specs/` untracked bloqueia ship deste repo até o pacote ser commitado.
- Tratar `verified` do pin como isolamento.
- Occupancy running mostra o job de outro projeto; histórico filtrado esconde o `check` terminal se CI Queue não estiver selecionado — não confundir com collector morto.
- Declarar pass com suíte tmp + `gh pr merge`.
- Recusar ship porque faltou estágio — regressão desta decisão.
- Over-engineering: collector novo, card de runtime, cutover `ci-queue ship` no DietFlow, `remote-verdict.json` neste repo, vitest na fila live, `advisory upsert` para este aviso, unificar os dois verdict files agora.

## Open Questions

Nenhuma. Decisões de 2026-09-18 (operador):

- Progresso contínuo ausente = aviso, não recusa.
- Ship é o pacote; `full`/`smoketest`/`check` são nomes do consumidor. `full` no DietFlow vale se usar o mesmo pacote.

Já fechado:

- Cancelar no primeiro occupancy prova só visibilidade; merge exige `passed`.
- Comando CI Queue sem Actions: `ci-queue ship --no-remote`.
- `runtime-probe` sem progresso contínuo (aviso se alguém enfileirar).
- Spec `001-*` entra no commit da branch antes do `check` (árvore limpa).

## Next Phase

PRD ainda `gathering` até você dizer que pode Build. Analyst recodificado (recode 7).
