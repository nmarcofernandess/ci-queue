# Todos os projetos nas superfícies de Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `context=all` mostrar Meta, Pendências e Últimos verdes de todos os projetos ativos, com identidade de projeto preservada, composição shadcn atual e mutations de Meta sempre direcionadas a um projeto concreto.

**Architecture:** O servidor agrega projeções por projeto sem criar um catálogo global. A UI mantém os donos atuais de composição, amplia `ProjectChip` com dois modos explícitos, reutiliza uma seleção compartilhada de projeto e habilita Últimos verdes em Todos sem misturar receitas, tickets ou commits entre projetos.

**Tech Stack:** Python stdlib bridge, React 19, TypeScript, Vite, Tailwind 4, shadcn `radix-nova`, Radix via componentes instalados, Vitest, Playwright, ESLint 10.

**Spec:** `docs/superpowers/specs/2026-09-29-all-projects-status-surfaces-design.md`

## Global Constraints

- Trabalhe diretamente na branch `dev`, conforme pedido de Marco. Não crie feature branch nem worktree para esta entrega.
- Antes de editar, confirme `git branch --show-current == dev`, registre `git rev-parse HEAD` e leia o delta desde a base da SPEC. Não resete trabalho alheio.
- Se houver alterações locais não commitadas nos mesmos arquivos deste plano, pare a escrita nesses arquivos e reporte o conflito. Não use `git reset --hard`, stash destrutivo ou checkout que apague trabalho.
- Leia `AGENTS.md`, `DESIGN.md`, `.context/domains/manifest.yaml`, `.context/patterns/ui-composition.yaml`, `docs/ui/PRODUCT-CONTRACT.md` e `docs/ui/COMPOSITION-LEDGER.md` antes de JSX.
- Carregue `.agents/skills/ci-queue-shadcn/SKILL.md` antes de qualquer mudança em `ui/src/`.
- Rode `npx shadcn@latest info --json` e a documentação dos componentes listados na SPEC antes de escrever JSX.
- Não importe `vaul`, `radix-ui` ou `@radix-ui/*` em features.
- Não adicione cor raw, dark override manual, z-index manual, `space-y-*`, tamanho de SVG descendente ou card dentro de card.
- `ProjectChip` é o único dono do chip de projeto. Nenhum consumidor recebe `className` para corrigir geometria local.
- `context=all` é leitura agregada. Toda mutation de Meta continua com `projectId` concreto.
- Pendências continuam somente leitura.
- Últimos verdes continuam canônicos por receita atual do projeto. Não relaxe `canonical_green()`.
- O browser não faz fan-out por projeto em polling. Cada recurso agregado usa uma requisição `context=all`.
- Não altere worker, runner, queue, ship ou política de archive/restore.
- Faça TDD por tarefa. Cada tarefa termina com commit próprio em `dev` e revisão antes da próxima.
- Não declare verde sem executar o comando de prova correspondente.
- A promoção `dev -> main` revisa todo o delta existente entre as branches, não somente esta feature.
- A instalação local usa somente o bundle produzido a partir do commit mergeado em `main`.

## Review Focus

- Dois projetos com o mesmo preset e receitas diferentes: cada verde deve ser validado contra o catálogo do próprio projeto. Teste na Task 2.
- Dois projetos com o mesmo `headSha`: o modo Por commit deve produzir grupos separados. Teste nas Tasks 2 e 5.
- Um projeto com catálogo ou Git indisponível em Todos: dados dos outros projetos devem permanecer visíveis. Teste nas Tasks 1, 2 e 5.
- Abrir drawer em Todos e selecionar um projeto: o header global deve continuar em Todos e a mutation deve usar somente o projeto alvo. Teste na Task 4.
- Nome de projeto longo no card lateral: o chip deve truncar sem overflow em 390 px e manter o nome completo no Tooltip. Teste nas Tasks 3 e 6.

---

## Task 0: Revisar a SPEC contra o `dev` vivo e recuperar as composições shadcn

**Files:**
- Read: `AGENTS.md`
- Read: `DESIGN.md`
- Read: `.agents/skills/ci-queue-shadcn/SKILL.md`
- Read: `.context/domains/manifest.yaml`
- Read: `.context/patterns/ui-composition.yaml`
- Read: `docs/ui/PRODUCT-CONTRACT.md`
- Read: `docs/ui/COMPOSITION-LEDGER.md`
- Read: arquivos apontados pela SPEC
- No product-code write in this task

**Interfaces:**
- Consumes: SPEC deste plano e `dev` atual.
- Produces: revisão inicial com `READY` ou uma lista curta de contradições concretas, mais a nota `need -> composition -> adapted data/action`.

- [ ] **Step 1: Confirmar a branch e a revisão inicial**

Run:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected: branch `dev`; registre o SHA. Não altere arquivos ainda.

- [ ] **Step 2: Comparar a SPEC com o código vivo**

Confirme os símbolos e contratos citados na SPEC. Se um nome mudou, ajuste o plano documental antes de codar. Não recrie a arquitetura por preferência local.

- [ ] **Step 3: Recuperar as composições shadcn**

Run from `ui/`:

```bash
npx shadcn@latest info --json
npx shadcn@latest docs badge
npx shadcn@latest docs item
npx shadcn@latest docs card
npx shadcn@latest docs popover
npx shadcn@latest docs drawer
npx shadcn@latest docs tooltip
```

Expected: os componentes usados pela SPEC estão instalados ou documentados. Se faltar uma composição necessária, registre o gap antes de JSX.

- [ ] **Step 4: Escrever a nota de seleção no relatório da execução**

Use exatamente as cinco linhas da seção "Composição de UI" da SPEC e acrescente somente diferenças factuais encontradas no checkout.

- [ ] **Step 5: Review gate**

Um reviewer lê SPEC, plano e código vivo. Corrija contradições documentais antes da Task 1. Não implemente código enquanto houver blocker de contrato.

---

## Task 1: Adicionar a projeção agregada de Meta e Pendências

**Files:**
- Modify: `backend/ci_queue_api/dashboard_state.py`
- Modify: `backend/ci_queue_api/validation_advisories.py`
- Modify: `backend/ci_queue_api/server.py`
- Modify: `ui/src/lib/types.ts`
- Modify: `ui/src/lib/api.ts`
- Test: `tests/backend/test_project_scope.py`
- Test: `tests/backend/test_api.py`

**Interfaces:**
- Consumes: registry e `ResolvedProject` atuais; `read_history()`; estado por projeto em `dashboard.json`.
- Produces: `read_dashboard_state_all(state_root, projects)`; resposta `DashboardAllState`; `getDashboardState(scope)` aceitando `project | all`. Mutation continua aceitando somente `ProjectScope`.

- [ ] **Step 1: Escrever testes HTTP falhando para `/api/dashboard-state?context=all`**

Cubra dois projetos ativos com metas distintas e pendências distintas. Asserte:

```python
self.assertEqual(payload["context"], {"kind": "all"})
self.assertEqual({item["projectId"] for item in payload["projects"]}, {"alpha", "beta"})
self.assertEqual({item["projectName"] for item in payload["projects"]}, {"Alpha", "Beta"})
```

Inclua projeto arquivado e prove que ele não entra.

- [ ] **Step 2: Escrever o teste de falha parcial**

Deixe um projeto sem catálogo utilizável. Asserte que o outro projeto continua presente e que o projeto sem catálogo não ganha checks canônicos inventados.

- [ ] **Step 3: Rodar os testes focalizados e confirmar falha**

Run:

```bash
python3 -m unittest tests.backend.test_project_scope tests.backend.test_api
```

Expected: FAIL nos novos cenários porque `context=all` ainda recusa `dashboard-state`.

- [ ] **Step 4: Implementar `read_dashboard_state_all(state_root, projects)`**

Leia o documento de dashboard uma vez. Leia o plano de validação e o snapshot de histórico uma vez por request. Agrupe por `projectId`.

Não chame um reader que releia todo o histórico dentro de um loop de projetos.

Retorne um item por projeto ativo e `projectErrors` apenas para falhas de leitura reais. Estado de capability como catálogo unlinked permanece dado factual do item.

- [ ] **Step 5: Habilitar a rota agregada no servidor**

Em `_serve_all`, aceite `/api/dashboard-state` e devolva a resposta com `with_context(..., scope)`.

Não habilite POST com `context=all`.

- [ ] **Step 6: Tipar a união no browser**

Defina tipos distintos para resposta de projeto e resposta Todos. `checks` precisa representar o estado real de catálogo indisponível.

Atualize `getDashboardState` para aceitar somente `project | all`.

- [ ] **Step 7: Rodar testes focalizados**

Run:

```bash
python3 -m unittest tests.backend.test_project_scope tests.backend.test_api
npm run test:ui -- --run tests/ui/project-context.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/ci_queue_api/dashboard_state.py backend/ci_queue_api/validation_advisories.py backend/ci_queue_api/server.py ui/src/lib/types.ts ui/src/lib/api.ts tests/backend/test_project_scope.py tests/backend/test_api.py
git commit -m "feat(api): aggregate status state across projects"
```

- [ ] **Step 9: Review gate**

Reviewer verifica isolamento por projeto, leitura única do histórico/plano e ausência de mutation global. Corrija Critical e Important antes da Task 2.

---

## Task 2: Adicionar Últimos verdes agregados sem cruzar catálogos

**Files:**
- Modify: `backend/ci_queue_api/history.py`
- Modify: `backend/ci_queue_api/server.py`
- Modify: `ui/src/lib/types.ts`
- Modify: `ui/src/lib/api.ts`
- Test: `tests/backend/test_api.py`
- Test: `tests/backend/test_project_scope.py`

**Interfaces:**
- Consumes: projetos ativos resolvidos e seus `ProjectConfig`; snapshot de histórico; readers de remote slots.
- Produces: projeção agregada de `preset-history` e `remote-slots` com identidade por projeto e falhas parciais por projeto.

- [ ] **Step 1: Escrever o teste de mesmo preset com receitas diferentes**

Crie `alpha/full` e `beta/full` com `argv` diferentes. Um ticket de Alpha que corresponda somente à receita de Alpha não pode aparecer como verde de Beta.

- [ ] **Step 2: Escrever o teste de mesmo SHA em projetos diferentes**

Crie verdes válidos em Alpha e Beta com o mesmo `headSha`. A resposta agregada deve manter duas linhas com `projectId` diferentes.

- [ ] **Step 3: Escrever o teste de Git parcial**

Faça Alpha ter slot válido e Beta ter espelho ausente ou payload inválido. Asserte que Alpha permanece em `greens` e que Beta aparece como cobertura/falha própria.

- [ ] **Step 4: Rodar os testes e confirmar falha**

Run:

```bash
python3 -m unittest tests.backend.test_api tests.backend.test_project_scope
```

Expected: FAIL nos novos endpoints `context=all`.

- [ ] **Step 5: Implementar a agregação de verdes da máquina**

Crie um reader agregado que percorra o snapshot de histórico uma vez e aplique `canonical_green(job, recipe)` com a receita do projeto dono.

Não altere `canonical_green()`.

- [ ] **Step 6: Implementar a agregação dos slots Git**

Leia cada espelho local no contexto do projeto correspondente. Preserve `projectId`, `projectName`, source e coverage por projeto.

Não execute `git fetch` e não aceite mismatch de projeto.

- [ ] **Step 7: Habilitar as rotas no `_serve_all`**

Aceite:

```text
/api/preset-history?context=all
/api/remote-slots?context=all
```

`unassigned` continua recusando ambas.

- [ ] **Step 8: Tipar e expor no cliente**

`getPresetHistory` e `getRemoteSlots` aceitam `project | all`. Use uniões discriminadas, sem casts de resposta de projeto para Todos.

- [ ] **Step 9: Rodar testes focalizados**

Run:

```bash
python3 -m unittest tests.backend.test_api tests.backend.test_project_scope
npm run test:ui -- --run tests/ui/remote-slots-contract.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/ci_queue_api/history.py backend/ci_queue_api/server.py ui/src/lib/types.ts ui/src/lib/api.ts tests/backend/test_api.py tests/backend/test_project_scope.py
git commit -m "feat(api): aggregate canonical greens across projects"
```

- [ ] **Step 11: Review gate**

Reviewer verifica receita por projeto, mismatch de Git, falha parcial e custo da leitura agregada.

---

## Task 3: Centralizar os modos do `ProjectChip` e fazer o lint barrar forks

**Files:**
- Modify: `ui/src/features/shared/project-chip.tsx`
- Modify: `ui/src/features/status/status-page.tsx`
- Modify: `ui/src/features/shared/run-table.tsx`
- Modify: `ui/src/features/shared/job-drawer.tsx`
- Modify: `ui/src/features/worktrees/worktrees-page.tsx`
- Modify: `ui/eslint.config.js`
- Modify: `tests/ui/ui-policy.test.ts`
- Browser test later: `tests/browser/ui-consistency.spec.ts`

**Interfaces:**
- Consumes: `Badge variant="outline"` e Tooltip instalados.
- Produces: `ProjectChipMode = "inline" | "compact-context"`; `ProjectChip({name, facts, mode})`; lint que exige modo literal e proíbe `className`.

- [ ] **Step 1: Escrever os testes de lint falhando**

Adicione casos que rejeitam:

```tsx
<ProjectChip name="A" />
<ProjectChip name="A" mode={mode} />
<ProjectChip name="A" mode="inline" className="..." />
```

Adicione casos que permitem `mode="inline"` e `mode="compact-context"`.

- [ ] **Step 2: Rodar o teste e confirmar falha**

Run:

```bash
npm run test:ui -- --run tests/ui/ui-policy.test.ts
```

Expected: FAIL porque as regras ainda não existem.

- [ ] **Step 3: Tornar `mode` obrigatório em `ProjectChip`**

`inline` conserva o visual atual.

`compact-context` continua usando o mesmo Badge e Tooltip, limita a largura no dono e trunca somente o texto visual. Não exponha `className`.

- [ ] **Step 4: Atualizar todos os consumidores atuais para `mode="inline"`**

Não mude sua posição ou geometria nesta etapa.

- [ ] **Step 5: Adicionar o enforcement no ESLint**

Use `no-restricted-syntax` no mesmo estilo das regras atuais. Exija `mode` literal e proíba `className` no `ProjectChip`.

- [ ] **Step 6: Rodar lint e testes de policy**

Run:

```bash
npm --prefix ui run lint
npm run test:ui -- --run tests/ui/ui-policy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/src/features/shared/project-chip.tsx ui/src/features/status/status-page.tsx ui/src/features/shared/run-table.tsx ui/src/features/shared/job-drawer.tsx ui/src/features/worktrees/worktrees-page.tsx ui/eslint.config.js tests/ui/ui-policy.test.ts
git commit -m "refactor(ui): centralize project chip presentations"
```

- [ ] **Step 8: Review gate**

Reviewer procura classes locais, chips duplicados e mudança visual não intencional nos consumidores inline.

---

## Task 4: Mostrar Metas e Pendências misturadas e permitir alvo local no drawer

**Files:**
- Create: `ui/src/features/projects/project-selection-panel.tsx`
- Create: `ui/src/features/status/status-state-cards.tsx`
- Create: `ui/src/features/status/status-state-model.ts`
- Modify: `ui/src/features/projects/project-switcher.tsx`
- Modify: `ui/src/features/status/status-page.tsx`
- Modify: `ui/src/features/status/status-state-drawer.tsx`
- Modify: `ui/src/lib/api.ts`
- Modify: `ui/src/lib/types.ts`
- Test: `tests/ui/project-context.test.ts`
- Test: `tests/browser/dashboard.spec.ts`

**Interfaces:**
- Consumes: `DashboardProjectState | DashboardAllState`; projetos ativos de `ProjectContext`; `SelectionPanel`; `ProjectChip`.
- Produces: `ProjectSelectionPanel` apresentacional; `ProjectTarget = all | project`; selectors puros de preview; cards e drawer com modo Todos.

- [ ] **Step 1: Escrever testes puros para os previews**

Em `status-state-model.ts`, planeje funções puras para:

```ts
metaPreviewRows(state, 3)
pendingPreviewRows(state, 3)
```

Teste ordem determinística das Metas, ordem global por `createdAt` das Pendências e limite de três itens.

- [ ] **Step 2: Extrair a seleção apresentacional de projeto**

`ProjectSelectionPanel` usa `SelectionPanel`, busca, projeto ativo e opção Todos. Ele não conhece `ReadScope` e não chama `requestScopeChange`.

Adapte `ProjectSwitcher` para usar esse dono sem mudar a experiência do header.

- [ ] **Step 3: Escrever o browser test de Todos antes da UI**

Fixture com Alpha e Beta. Em `context=all`, asserte:

- cards mostram itens dos dois projetos;
- cada preview possui o chip do projeto;
- nenhum texto **Selecione um projeto** aparece nesses cards;
- Meta e Pendências vazias globais usam seus vazios factuais.

O teste deve falhar antes da implementação.

- [ ] **Step 4: Implementar `StatusStateCards` fora de `status-page.tsx`**

Preserve Card, ItemGroup, Item, Progress e ações existentes.

Em Todos use `ProjectChip mode="compact-context"` em uma linha própria. Não coloque o chip na mesma flex-row do nome da Meta ou do preset.

Em projeto único preserve o comportamento atual.

Em `unassigned` preserve **Selecione um projeto**.

- [ ] **Step 5: Escrever o teste do drawer e mutation direcionada**

Em Todos:

1. abra **Abrir metas**;
2. confirme alvo **Todos os projetos**;
3. selecione Beta no seletor local;
4. declare ou edite a Meta;
5. intercepte POST e asserte `projectId=beta`;
6. confirme que o seletor global do header continua **Todos os projetos**.

Para Pendências, prove que o seletor local filtra e que não existe CTA de criação.

- [ ] **Step 6: Implementar o alvo local no `StatusStateDrawer`**

No alvo `all`, renderize resumo de todos os projetos. No alvo de projeto, reutilize `MetaRead`, `MetaEditor`, `PendingRead` e a mutation atual.

Não faça mutation com `context=all`.

Preserve drafts por `projectId + revision`.

- [ ] **Step 7: Rodar os testes focalizados**

Run:

```bash
npm run test:ui -- --run tests/ui/project-context.test.ts
npx playwright test tests/browser/dashboard.spec.ts
npm --prefix ui run lint
npm --prefix ui run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add ui/src/features/projects/project-selection-panel.tsx ui/src/features/status/status-state-cards.tsx ui/src/features/status/status-state-model.ts ui/src/features/projects/project-switcher.tsx ui/src/features/status/status-page.tsx ui/src/features/status/status-state-drawer.tsx ui/src/lib/api.ts ui/src/lib/types.ts tests/ui/project-context.test.ts tests/browser/dashboard.spec.ts
git commit -m "feat(ui): aggregate metas and advisories in all projects"
```

- [ ] **Step 9: Review gate**

Reviewer verifica composição shadcn, estabilidade do ProjectSwitcher, ausência de mudança do scope global e ausência de escrita global.

---

## Task 5: Habilitar Últimos verdes em Todos com identidade de projeto

**Files:**
- Create: `ui/src/features/status/green-rows.ts`
- Modify: `ui/src/features/status/status-page.tsx`
- Modify: `ui/src/features/status/green-commit.ts`
- Modify: `ui/src/features/status/green-commit-table.tsx`
- Modify: `ui/src/features/shared/run-table.tsx` only if its current API cannot expose the existing project chip in this mode
- Test: `tests/ui/green-commit.test.ts`
- Test: `tests/browser/dashboard.spec.ts`

**Interfaces:**
- Consumes: respostas agregadas da Task 2; `RunTableJob.projectId/projectName`; `ProjectChip mode="inline"`.
- Produces: conversão de verdes com identidade de projeto; dedupe namespaced; agrupamento `projectId + headSha`; Últimos verdes disponível em `project | all`.

- [ ] **Step 1: Escrever testes unitários de identidade**

Cubra:

```ts
alpha + shaX !== beta + shaX
alpha + full + ticket1 !== beta + full + ticket1
```

Asserte que `groupGreenCommits` cria dois grupos para o mesmo SHA em projetos diferentes.

- [ ] **Step 2: Extrair helpers puros para `green-rows.ts`**

Mova somente conversão, merge, filtro e identidade que hoje vivem em `status-page.tsx`.

Inclua `projectName` na busca.

Não mude a regra de origem, período ou dedupe além do namespace de projeto.

- [ ] **Step 3: Habilitar o modo no `HistoryPanel`**

`greensAvailable` é true para `project` e `all`. Continua false para `unassigned`.

As queries usam o scope atual, sem fan-out.

- [ ] **Step 4: Mostrar ProjectChip no modo Por preset**

Em Todos, passe `showProjectChip` ao `RunTable`. Em projeto único, não adicione chip redundante.

- [ ] **Step 5: Mostrar ProjectChip no modo Por commit**

`GreenCommitGroup` carrega projeto. A tabela coloca `ProjectChip mode="inline"` na identidade do commit. O drawer repete o projeto no header.

- [ ] **Step 6: Preservar falhas parciais**

Se alguma fonte selecionada tiver dados, preserve a tabela e descreva a cobertura parcial por projeto. Só use erro global quando nenhuma fonte selecionada tiver produzido dados.

- [ ] **Step 7: Escrever o browser test completo**

Em Todos, prove:

- toggle Últimos verdes habilitado;
- Alpha e Beta visíveis com chips;
- filtro de busca encontra pelo nome do projeto;
- origem Máquina, Git e ambas funcionam;
- mesmo SHA em Alpha e Beta continua em dois grupos Por commit;
- drawer de commit mostra o projeto correto;
- `unassigned` continua com o toggle desabilitado.

- [ ] **Step 8: Rodar testes focalizados**

Run:

```bash
npm run test:ui -- --run tests/ui/green-commit.test.ts tests/ui/remote-slots-contract.test.ts
npx playwright test tests/browser/dashboard.spec.ts
npm --prefix ui run lint
npm --prefix ui run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add ui/src/features/status/green-rows.ts ui/src/features/status/status-page.tsx ui/src/features/status/green-commit.ts ui/src/features/status/green-commit-table.tsx ui/src/features/shared/run-table.tsx tests/ui/green-commit.test.ts tests/browser/dashboard.spec.ts
git commit -m "feat(ui): enable all-project canonical greens"
```

- [ ] **Step 10: Review gate**

Reviewer procura perda de identidade, merge cross-project e duplicação de composição.

---

## Task 6: Fechar responsividade, contexto e documentação normativa

**Files:**
- Modify: `tests/browser/ui-consistency.spec.ts`
- Modify: `tests/browser/table-layout.spec.ts` only if the existing status-width suite owns this assertion
- Modify: `.context/patterns/ui-composition.yaml`
- Modify: `DESIGN.md`
- Modify: `docs/ui/PRODUCT-CONTRACT.md`
- Modify: `docs/ui/COMPOSITION-LEDGER.md`
- Modify: `docs/CONTRACTS.md`

**Interfaces:**
- Consumes: comportamento implementado nas Tasks 1 a 5.
- Produces: browser proof de composição e documentação que aponta para os mesmos donos e modos.

- [ ] **Step 1: Adicionar a prova de largura dos cards laterais**

Use pelo menos 390, 640, 820, 1440 e 1600 px. Em Todos com nomes de projeto longos, asserte:

```ts
document.documentElement.scrollWidth <= innerWidth
```

Confirme que o chip compacto está acima do título do item e que o Tooltip expõe o nome completo.

- [ ] **Step 2: Provar temas e estados**

Cubra claro e escuro nos cenários relevantes. Cubra Meta/Pendências com dados, vazio e falha parcial.

Não introduza snapshot visual bruto se a suite atual usa asserts semânticos e geométricos para esse comportamento.

- [ ] **Step 3: Atualizar o pattern de composição**

Em `project_chip`, documente:

- owner;
- modos `inline` e `compact-context`;
- consumidores de cada modo;
- regra de não aceitar classe local.

Documente também `project_selection_panel` como dono da lista pesquisável de projetos se a extração da Task 4 existir.

- [ ] **Step 4: Atualizar DESIGN, PRODUCT-CONTRACT e COMPOSITION-LEDGER**

Remova o contrato antigo que desabilita Últimos verdes em Todos e que manda Meta/Pendências mostrarem **Selecione um projeto** em Todos.

Preserve essa regra para `unassigned`.

Registre que a mutação de Meta exige um projeto concreto escolhido localmente.

- [ ] **Step 5: Atualizar `docs/CONTRACTS.md`**

Na seção multi-projeto, declare que Histórico, Worktrees, Análise, Meta, Pendências e Últimos verdes aceitam Todos para leitura. Meta mutation continua project-scoped. Sem projeto continua separado.

- [ ] **Step 6: Rodar a família de UI**

Run:

```bash
npm --prefix ui run lint
npm --prefix ui run build
npm run test:ui
npm run test:browser
```

Expected: PASS.

- [ ] **Step 7: Rodar backend focal completo**

Run:

```bash
npm run test:backend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/browser/ui-consistency.spec.ts tests/browser/table-layout.spec.ts .context/patterns/ui-composition.yaml DESIGN.md docs/ui/PRODUCT-CONTRACT.md docs/ui/COMPOSITION-LEDGER.md docs/CONTRACTS.md
git commit -m "docs(ui): define all-project status composition"
```

- [ ] **Step 9: Review gate**

Reviewer compara documentação, tipos, browser e backend. Nenhuma frase normativa pode descrever comportamento que os testes não cobrem.

---

## Task 7: Revisar a candidata inteira em `dev`

**Files:**
- No planned product edit. Fix only findings from review or verification.

**Interfaces:**
- Consumes: todos os commits desta entrega.
- Produces: `dev` candidata à promoção, com findings Critical/Important resolvidos.

- [ ] **Step 1: Registrar SHAs da entrega**

Run:

```bash
git log --oneline --decorate -n 12
git status --short
git rev-parse HEAD
```

Expected: working tree limpa antes da prova final.

- [ ] **Step 2: Fazer review whole-branch contra SPEC e plano**

O reviewer deve inspecionar o diff desde o SHA registrado na Task 0 até HEAD. Foque em:

- escopo e ownership;
- cross-project leaks;
- tipos;
- shadcn;
- lint;
- mutation;
- refresh/stale response;
- partial failure;
- acessibilidade e overflow.

Corrija Critical e Important em commits pequenos. Reexecute o teste dono de cada correção.

- [ ] **Step 3: Rodar o check canônico da candidata**

Run:

```bash
npm run check
```

Expected: PASS. Retry não transforma falha em verde se o contrato do check não o permitir.

- [ ] **Step 4: Confirmar diff limpo**

Run:

```bash
git status --short
git rev-parse HEAD
```

Expected: working tree limpa. Registre `DEV_RELEASE_SHA`.

---

## Task 8: Promover `dev` para `main` por PR

**Files:**
- GitHub PR only, salvo correções exigidas por review.

**Interfaces:**
- Consumes: `DEV_RELEASE_SHA`; estado atual de `main`.
- Produces: PR `dev -> main`, revisão de todo o delta e merge identificável.

- [ ] **Step 1: Atualizar refs e comparar todo o delta**

Run:

```bash
git fetch origin
git rev-parse origin/main
git rev-parse origin/dev
git log --oneline --left-right origin/main...origin/dev
git diff --stat origin/main...origin/dev
```

O escopo do PR é tudo que está em dev e ainda não está em main. Não descreva o PR como se contivesse somente esta feature.

- [ ] **Step 2: Fazer review da promoção inteira**

Use um reviewer independente. Se o delta antigo de dev tiver trabalho ainda não pronto para main, não masque o problema com um PR parcial ou cherry-pick improvisado. Registre o blocker.

- [ ] **Step 3: Abrir PR `dev -> main`**

A descrição deve incluir:

- `DEV_RELEASE_SHA`;
- resumo de todo o delta promovido;
- SPEC desta feature;
- comandos e resultados da prova final;
- riscos ou mudanças de contrato;
- plano de instalação após merge.

- [ ] **Step 4: Revisar o PR**

Resolva Critical e Important. Se houver correção em dev, rode a prova dona e depois `npm run check` novamente.

- [ ] **Step 5: Mergear em `main`**

Merge somente após o PR estar revisado e a revisão de dev ainda corresponder ao head aprovado.

- [ ] **Step 6: Registrar `MAIN_RELEASE_SHA`**

Após merge:

```bash
git fetch origin
git rev-parse origin/main
```

Registre o SHA real mergeado. Ele é a única revisão autorizada para o bundle da Task 9.

---

## Task 9: Produzir, verificar e instalar a release local nova

**Files:**
- Runtime artifacts under `releases/` and local installation paths.
- No source edit expected.

**Interfaces:**
- Consumes: checkout em `MAIN_RELEASE_SHA`; `docs/INSTALL.md`; receipt da instalação atual.
- Produces: bundle verificado, instalação atualizada e prova de que CLI, dashboard, worker e manifest apontam para `MAIN_RELEASE_SHA`.

- [ ] **Step 1: Trabalhar a partir do `main` mergeado**

Run:

```bash
git switch main
git pull --ff-only
git rev-parse HEAD
```

Expected: HEAD igual a `MAIN_RELEASE_SHA`.

- [ ] **Step 2: Ler a instalação real antes de montar o comando**

Leia `~/.local/share/ci-queue/installation.json` e preserve:

- prefix;
- stateRoot;
- configPath efetivo dos serviços;
- Node;
- Python;
- command path;
- launch-agent ownership.

Não invente paths e não troque o state implicitamente.

- [ ] **Step 3: Confirmar fila quieta e ownership**

Use os comandos documentados em `docs/INSTALL.md`. Não apague locks para ultrapassar a proteção.

- [ ] **Step 4: Produzir o bundle**

Run:

```bash
npm run release:bundle
```

Expected: um diretório real `releases/ci-queue-<versão>-<revisão>`. Use o nome produzido.

- [ ] **Step 5: Verificar o bundle produzido**

Run:

```bash
node scripts/release.mjs verify --bundle releases/ci-queue-<versão>-<revisão>
```

Expected: PASS e manifest com revision igual a `MAIN_RELEASE_SHA`.

- [ ] **Step 6: Atualizar a instalação com os paths do receipt**

Use:

```bash
node /bundle/scripts/install.mjs update   --bundle /bundle   --prefix "<prefix-real>"   --state "<state-real>"   --config "<config-real>"   --node "<node-real>"   --python "<python-real>"   --command "<command-real>"   --activate
```

Substitua somente pelos valores observados da instalação. Não use os placeholders literalmente.

- [ ] **Step 7: Provar a instalação**

Run:

```bash
ci-queue version --json
ci-queue status --state "<state-real>" --json
curl --fail --silent --show-error http://127.0.0.1:8765/health
curl --fail --silent --show-error http://127.0.0.1:8765/build.json
launchctl list | grep 'com.nmarcofernandess.ci-queue'
```

Asserte que `/build.json` e `installation.json` apontam para `MAIN_RELEASE_SHA`.

- [ ] **Step 8: Fazer uma prova pequena instalada autorizada**

Enfileire o menor preset real permitido pelo próprio CI Queue. Confirme ticket, execução terminal e retorno ao estado ocioso. Não use fixture isolada como prova da instalação.

- [ ] **Step 9: Registrar o fechamento**

Registre:

- PR;
- merge SHA;
- bundle;
- manifest SHA;
- installation revision;
- health;
- build revision;
- ticket da prova instalada;
- qualquer limite não provado, como login/reboot se não foi observado.

## Self-review do plano

- Cobertura da SPEC: Tasks 1 e 2 cobrem agregação; Task 3 cobre ProjectChip/lint; Task 4 cobre cards e drawer; Task 5 cobre verdes; Task 6 cobre composição e docs; Tasks 7 a 9 cobrem review, promoção e instalação.
- Granularidade: cada task tem um owner claro e um gate de teste/review.
- Tipos: `context=all` é leitura; mutations continuam `ProjectScope`.
- Review Focus: os cinco riscos estão ligados a testes específicos.
- Proporção: o plano define interfaces, testes e comandos. Ele não contém corpos de implementação.

## Execution handoff

A execução foi escolhida por Marco: **Agent Spec Driven Delivery**, trabalhando diretamente em `dev`, com review antes da implementação, TDD por task, review por task e promoção final `dev -> main`.

O executor não deve pedir uma nova escolha de método. Ele deve iniciar pela Task 0, revisar a SPEC e o plano contra o `dev` vivo e, se não houver contradição bloqueante, seguir task por task.
