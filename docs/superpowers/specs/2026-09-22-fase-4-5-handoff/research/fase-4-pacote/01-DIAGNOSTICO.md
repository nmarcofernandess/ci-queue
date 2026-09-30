# Fase 4 — auditoria do contrato, da Spec 121 e da cobertura

**Data:** 21/09/2026. **Parecer:** há correções pequenas e provas faltantes; não há fundamento para encerrar a 121, migrar framework ou limpar state.

## 1. Fotografia verificável e alcance

| Repositório | dev final auditado | Q2/Q3 contido | Atualização durante a auditoria |
|---|---|---|---|
| CI Queue | `550409a92f359cffc3e75f34712d39133b8ab130` | #17: merge `24d6a2b417876db209db4519c3826566ab94a1e7`, HEAD `e410dff80aa7e3423b8dd73b23d813cae6635d90` | #18 visual: merge 13:40:51 UTC, HEAD `17b379a55682489864d5d328ead68b1581d602fc` |
| DietFlow | `ffc99748f796d8f7923c9e46161b2a4dc735eef8` | #1305: merge `147c5ed5df0a53efe1dfb336f28861e99cafadb1`, HEAD `d8048fb4f6c760eb0c607b098038846757ac43a3` | Novos deltas de #1274/#1300; interseção CI/harness/121 reavaliada |

A leitura inicial fixou os merges Q2/Q3. A conferência final encontrou avanço nos dois dev: compare CQ24d6→550 = ahead6/behind0/merge-base24d6; DF147→ffc = ahead177/behind0/merge-base147. Os HEADs Q2/Q3 constam nos respectivos merges, e esses merges são ancestrais dos dev finais. A premissa “DietFlow ainda aguarda merge” já não é atual. A PR visual **também já entrou**; não há uma nova implementação de tabelas a encomendar.

Links: [CQ dev final](https://github.com/nmarcofernandess/ci-queue/commit/550409a92f359cffc3e75f34712d39133b8ab130), [DF dev final](https://github.com/dietflowoficial/Dietflow-app/commit/ffc99748f796d8f7923c9e46161b2a4dc735eef8), [PR17](https://github.com/nmarcofernandess/ci-queue/pull/17), [PR1305](https://github.com/dietflowoficial/Dietflow-app/pull/1305), [PR18](https://github.com/nmarcofernandess/ci-queue/pull/18).

Foram lidos código, testes, contratos atuais, as sete minispecs e o TSV completo. O delta final do CQ não altera runner/core/backend; as sondas de fronteira em 24d6 continuam pertinentes. No delta final do DF foram lidos os arquivos que cruzam CI/121; o pacote clínico da 123 não foi auditado funcionalmente. Incluem-se os incidentes J/K e o novo total de 56 gates Static, sem atribuir a esses gates a lentidão que já existia antes.

Não executei as suites de produto nem observei o Mac instalado. Duas sondas pequenas usam dados sintéticos; não certificam o runner inteiro. Procedência e limitações estão em `CHECKPOINT.json`.

Receipts referidos nos PRs: check CQ `20260921115512-ccc7ede4`; smoke DF `20260921121505-f0a9fe7e`; check visual CQ `20260921133518-b846929f` em `17b379a`, com 55 testes browser relatados. Eles não foram reexecutados aqui. O PR1305 declara que a fixture do produtor e a prova worker/API/UI são separadas, não um mesmo ticket ponta a ponta.

## 2. Resultado do censo

**72 IDs: 37 CUMPRE COM PROVA; 14 SUBSTITUÍDO POR DECISÃO POSTERIOR; 14 NÃO COMPROVADO; 7 OUT EXPLÍCITO; 0 REGREDIU demonstrado temporalmente.**

O estado `CUMPRE COM PROVA` significa mecanismo atual e teste/registro verificável lidos no repositório, na extensão declarada em cada linha. Não significa teste executado nesta sessão nem aprovação visual/instalada. Uma classificação integral de instalação exige o artefato operacional: por isso está como NÃO COMPROVADO.

`REGREDIU` foi reservado a uma comparação antes/depois suficiente. Os defeitos atuais são nomeados em `tipo_delta`, mesmo sem atribuir um commit causal. Zero regressões temporalmente demonstradas **não** significa zero defeitos. Uma linha composta pode estar NÃO COMPROVADO apesar de parte substancial do mecanismo funcionar.

O TSV histórico permanece intacto. `02-CENSO-72.tsv` é um censo novo, com requisito resumido, prova, efeito, owner, ação mínima, limite da prova e link à linha original. `02-CENSO-72.md` detalha cada ID; o resumo compacto permite varredura rápida. Não transformar o censo em mais um manual permanente.

### Substituições que precisam ficar explícitas

- STATUS-PROJECT-SCOPE: agora execução e fila são globais, listas são filtradas e detalhe pertence ao ticket. Restaurar o filtro antigo seria defeito.
- OBSERVER: continuam proibidos enqueue/cancel/merge visuais; CRUD de projetos e escolha nativa de pasta foram acrescentados. “Só Meta escreve” não rege mais todos os POSTs.
- ANALYSIS-RESULTS: porcentagem por preset, contagens exatas e multiselect/top10 substituem a apresentação anterior. Isso não autoriza percentual fictício de execução.
- CURRENT/TIME: há referência média observacional e novas posições dos tempos. Média não é ETA nem prova.
- JOB-BOUNDARY: Histórico humano une terminais da fila e observações diretas; observações não entram nas populações de canonicidade, Meta, ship ou análises de tickets.
- RETRY-FLAKY: #18 transfere o fato para o indicador/tooltip/nome acessível, em vez do badge junto ao nome. Não restaurar a badge antiga.
- Progress ganhou duração observada, contexto planned/active, variantes e retry omitido. O protocolo atual tem autoridade, não o limite silencioso do reporter antigo.

Fontes: [`CQ · docs/ui/PRODUCT-CONTRACT.md`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md), [`CQ · docs/CONTRACTS.md`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md), [`CQ · docs/ui/COMPOSITION-LEDGER.md`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md), [`CQ · tests/backend/test_project_scope.py`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_project_scope.py), [`CQ · tests/backend/test_execution_observations.py`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_execution_observations.py), [`CQ · tests/backend/test_live_active.py`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_live_active.py).

## 3. Deltas realmente abertos, por risco

### F4-01 · Alto · Falha de observação Git se transforma em árvore limpa

**Código:** [`CQ · src/core/runner.ts#L139-L173`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts#L139-L173) (`git`, `readGitInfo`), `assertPreflight` e `verifyGitStability`; consumidor de prova [`CQ · src/ship/eligibility.ts#L46-L160`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/ship/eligibility.ts#L46-L160).

`git()` devolve `undefined` se o subprocesso falha ou expira. `readGitInfo` calcula `statusShort = git(...status...) ?? ""`. Resultado: erro ao ler status é indistinguível da saída vazia que comprova árvore limpa.

**Sonda:** em `probes/git-observation-boundary.cjs`, duas leituras com falha produziram `statusShort=""` e pares estruturalmente iguais. O controle dirty foi identificado. A sonda usa excertos com a chamada de processo substituída; não executou ship nem produziu ticket verde.

**Efeito:** sob falha específica de Git, preflight/postflight podem registrar limpeza/estabilidade que não foram observadas. A elegibilidade verifica os valores registrados, não recupera a origem perdida.

**Menor ação:** manter ausência/erro distintos de saída vazia. Caminho canônico não pode admitir/atestá-los como clean. Receitas informacionais podem exibir Git indisponível, sem inventar vazio. C01 trata a fronteira no runner, com negativos de falha antes do child e depois do child. Não é uma regressão atribuída ao Q2/Q3.

### F4-02 · Alto · A base observada no preflight ainda não está no objeto usado para criar o env

**Código:** [`CQ · src/core/runner.ts#L438-L470`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts#L438-L470) (`buildJobEnv`) e [`CQ · src/core/runner.ts#L590-L641`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts#L590-L641) (`runJob`); [`DF · scripts/ci/smoketest-local.sh#L117-L139`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/smoketest-local.sh#L117-L139).

Sequência atual: `preflight = assertPreflight(...)`; `prepareJobRuntime(...buildJobEnv(root, ticket))`; só depois `mergeRunning({...ticket, preflight})`. `buildJobEnv` lê `ticket.preflight?.baseSha`, não a variável local recém-observada. Tickets novos de [`CQ · src/core/enqueue.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/enqueue.ts) não trazem esse preflight.

**Sonda da fronteira:** env contém base vazia; registro posterior contém B0. Está em `results/frozen-base-boundary.json`. É uma demonstração da ordem/argumento, não execução integral do runner.

No DietFlow, base vazia faz o smoke executar outro `git fetch` e resolver `origin/dev` **depois do Static**. Não é garantido que a base de seleção seja aquela observada no início do ticket.

**Efeito:** contrato do env e do receipt pode divergir; seleção e snapshot têm momentos de referência distintos. Não afirmo que isso explica os 40 minutos nem que um merge indevido aconteceu. Pode acrescentar fetch/reseleção e resultados descartados quando a base move.

**Menor ação:** criar env a partir do ticket enriquecido com o preflight efetivo, antes de preparar runtime/filho. C01 inclui teste do env recebido por um filho real curto e confronto com o ticket. Não editar o consumidor para esconder base faltante com mais fallback.

### F4-03 · Médio · Histórico guarda dados no hook, mas os apaga visualmente no erro de refresh

**Código:** [`CQ · ui/src/features/status/status-page.tsx#L691-L835`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/status-page.tsx#L691-L835), [`CQ · ui/src/features/shared/run-table.tsx`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) (ramo final de render).

O hook conserva rows e erro. O renderer só exibe tabela com `!error`; em `data + error`, exibe apenas ErrorState. Logo, a regra “dados bons permanecem durante refresh” não fecha na composição.

**Efeito:** erro de rede temporário faz a lista consultada sumir, apesar de os dados estarem preservados em memória. Leitura antiga não deve parecer atual confirmada, mas não precisa desaparecer.

**Menor ação:** separar erro inicial de falha de revalidação, com erro local e rows anteriores marcadas como dado anterior. Não reapresentar dados de outro scope/query. C04 é funcional e deve ser sincronizado com a lane visual porque compartilha RunTable; não reimplementar geometria.

### F4-04 · Médio · Os contratos de operação ainda se contradizem

Fontes: [`DF · .claude/CLAUDE.md`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/.claude/CLAUDE.md), [`DF · .context/patterns/ci.yaml`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/.context/patterns/ci.yaml), [`DF · docs/ci/README.md`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/docs/ci/README.md), [`DF · specs/121-harness-resource-exhaustion/status.md`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/status.md), [`DF · specs/121-harness-resource-exhaustion/minispecs/07-spend-abort-stale-base/status.md`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/07-spend-abort-stale-base/status.md), [`CQ · docs/ROADMAP.md`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ROADMAP.md).

A seção-resumo de Full nas instruções DietFlow exige Full em certos paths; outro trecho do mesmo dono o descreve como informativo e não enfileirado automaticamente. A política atual é a do código/configuração de ship e dos testes: não criar ritual a partir do parágrafo divergente. `dirty_campaign` ainda descreve execução direta apesar dos guards adotados. O índice da 121 ainda põe M06 aberta e poll M07 pendente. `RESULTADO-EXPERIMENTOS.md` aponta `status.json`, inexistente no ref lido. O roadmap CQ ainda se apresenta como “corte atual etapa1B”, sem refletir duração/latência/lifecycle entregues.

**Menor ação C02:** reconciliar instruções operacionais e acrescentar uma fotografia datada em estados. Preservar cronologia, checks e decisões antigas como antigas. Não mudar policy/testes para fazer a prosa velha parecer verdadeira. Não marcar mãe done.

### F4-05 · Rechecagem pós-merge · A PR visual #18 já corrigiu a geometria principal

O novo [ui/src/features/shared/run-table.tsx](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) limita a largura de identidade, remove o teto residual da revisão e fixa a ação. [ui/src/features/worktrees/worktrees-page.tsx](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/worktrees/worktrees-page.tsx) e [ui/src/index.css](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/index.css) mantêm seleção/nome à esquerda e olho à direita. [docs/ui/PRODUCT-CONTRACT.md](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) e [docs/ui/COMPOSITION-LEDGER.md](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md) agora registram que flaky pertence ao indicador, não a uma badge junto ao nome.

O teste novo [tests/browser/table-layout.spec.ts](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/table-layout.spec.ts) cobre 1440/820/390 px em claro/escuro, largura útil do nome, alinhamento, scroll local, nome/checkbox/olho no viewport ao fim da rolagem e abertura por teclado. Há caso de projeto+variante e tooltip de flaky, além de prioridade de falha no descritor. WORKTREES passa a CUMPRE COM PROVA **de código/teste lido**. TABLE-DENSITY e RETRY-FLAKY ficam como SUBSTITUÍDO: preservam o propósito, mas apresentam tempo/badges conforme o contrato posterior, com a geometria nova protegida por testes.

**O residual é prova, não outra tabela:** receber as capturas identificadas de #18 e conferir meio da rolagem, ausência de sobreposição/hit-targets e acesso de teclado a branch/revisão elididas. A suíte usa Vite de desenvolvimento com possibilidade de reuse; um build compilado verde em outro step não identifica a página capturada. V01 faz a conferência da entrega existente. VISUAL-ACCEPTANCE permanece NÃO COMPROVADO nesta auditoria. C04 trata somente o erro de refresh e não altera largura/sticky.

Adicionalmente, a nova prioridade vermelha deve ser exercitada com **API live**, não somente um payload mockado contendo `nodes`: um filho failed ausente de roots/active e sem counts agregados pode não fornecer ao descritor o mesmo contexto da árvore completa. Isso é um caso de prova a fechar em C03/V01; não afirmo um incidente real ou recomendo devolver a árvore inteira.

### F4-06 · Prova ausente · Q2/Q3 integrou o código, não uma prova única de todo o trajeto

A versão atual protege várias lacunas do review anterior: pending/planned, troca de inventário antecipado, identidade por invocação, resumo de retries omitidos, cap de compatibilidade e testes funcionais novamente no runner adequado. Fontes: [`CQ · tests/backend/test_live_active.py`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_live_active.py), [`CQ · tests/core/progress.test.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/progress.test.ts), [`CQ · package.json`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/package.json), [`DF · scripts/ci/playwright-progress-reporter.ts`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/playwright-progress-reporter.ts).

O browser integrado atual escreve `running.json`/progresso sintéticos, inicia a API real e inspeciona a UI; não passa pelo worker nem pelo reporter DF. [`CQ · playwright.config.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/playwright.config.ts) usa Vite dev e `reuseExistingServer=true`; um build separado verde não prova que aquele teste navegou no bundle compilado correto. [`CQ · tests/browser/progress-timing-integrated.spec.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/progress-timing-integrated.spec.ts) também cria diretório temporário e seu `stop()` apenas sinaliza a API, sem remover o diretório. É um resíduo de fixture identificado, não prova da causa do ENOSPC do Mac.

A pendência é uma fixture curta rastreável passando do produtor real à coleta, API e UI compilada **no mesmo ticket**, incluindo mismatch, retries omitidos e cross-project. C03 fecha esse percurso. Não é Full/clinical E2E e não autoriza instalar a candidata.

### F4-07 · Causalidade ausente · Disco, SIGSEGV e lentidão não têm uma causa única provada

M01–M05 continuam separados. Q1 é inventário datado, sem path/operação do ENOSPC recente. O Full verde da 125 é evidência de resultado naquele H, não experimento A/B de Colima nem prova universal de estabilidade serial. C05 coleta somente artefatos/metadados existentes; experimentos pesados exigem janela e protocolo próprios. O delta final inclui [specs/121-harness-resource-exhaustion/research/J-incident-calculo-uso-next-heap-20260916.md](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/research/J-incident-calculo-uso-next-heap-20260916.md) e [specs/121-harness-resource-exhaustion/research/K-incident-cursor-cloud-123-04-smoketest-swap-20260919.md](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/research/K-incident-cursor-cloud-123-04-smoketest-swap-20260919.md): Linux/Cursor Cloud, crescimento do Next e typecheck concorrente. São relatos de capacidade/mitigação, não pares controlados do Mac nem prova de cura por swap, recycle ou framework.


### F4-08 · Médio · Alteração isolada nos shells de Q2 não seleciona seus testes donos

[`DF · scripts/ci/jest-scope.ts#L116-L280`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/jest-scope.ts#L116-L280) mapeia contratos filesystem, mas não inclui os novos `playwright-discover.sh` e `playwright-invocation.sh`. Eles não casam com `CODE_PATH_PATTERN` de JS/TS. Pela lógica do classificador, um diff só nesses paths não seleciona seus testes Jest proprietários.

Isso não significa que nenhum gate Static veja o arquivo; significa que a suíte de regressão do wrapper pode ficar fora do related. C06 acrescenta o gatilho no mapa existente e assegura que o teste chama o wrapper real, não somente o binário Playwright diretamente. Não ampliar para Jest inteiro.

## 4. Testes: não há disputa inevitável entre Jest e Vitest

| Dono | Framework / entrada | O que cobre | O que não cobre sozinho |
|---|---|---|---|
| CQ | Vitest core/UI | Motor, contratos puros, modelos de UI; alguns testes integram IO real temporário. | Composição browser, instalação ativa, testes clínicos DF. |
| CQ | Node test runtime/examples/release/install | CLI/processos, distribuição e operações isoladas/simuladas. | Login real/launchd do host. |
| CQ | unittest Python | Readers, API/HTTP, scope, snapshots, metas e diagnósticos. | Domínio React/DOM e todos os caminhos do TS automaticamente. |
| CQ | Playwright browser | Interação e geometria nos cenários versionados, com fixtures/API conforme o teste. | Cenários não declarados; receipt local não aprova o Mac instalado. |
| DF | Jest + next/jest | Produto, helpers e contratos do harness; seleção relacionada ou varredura completa. | Journey de browser nem estrutura visual real de toda a UI. |
| DF | Playwright | Casos E2E e fixtures de descoberta/execução. | Prova do motor genérico CQ sem passar por ele. |
| DF | Vitest Browser + Storybook | Stories selecionadas (inclui tag `ai-generated`) em Chromium, com mocks de infraestrutura. | Substituição automática da suíte Jest ou da jornada clínica E2E. |

Fontes: [`CQ · package.json`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/package.json), [`CQ · scripts/ci/check-with-progress.sh`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/scripts/ci/check-with-progress.sh), [`DF · jest.config.cjs`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/jest.config.cjs), [`DF · vitest.config.ts`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/vitest.config.ts), [`DF · scripts/ci/full-local.sh`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/full-local.sh), [`DF · scripts/ci/jest-scope.ts`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/jest-scope.ts).

**Decisão: manter os frameworks atuais.** Não há benchmark causal que justifique mover 16 mil testes para outro runner. A presença de Vitest nos dois produtos não faz os testes equivalentes; tampouco um browser Storybook com mocks substitui Playwright clínico. Comparar comportamento, ambiente, seleção e custo, não marcas de bibliotecas.

### Nomes, suítes e internos até o protocolo

- CQ self-host: quatro fases externas (build/test/check-ui/browser). O wrapper filtra markers dos subprocessos para não promover fixtures que testam o protocolo a progresso real. Frameworks internos não ganham automaticamente seus nomes/casos no dashboard.
- DF Static: 56 gates no checkpoint final emitidos pelo wrapper, com running/terminal e counts. Saída de cada gate passa por arquivo temporário; não se deve chamar esse log de inventário de todos os testes internos.
- DF Jest: `jest-scope` e wrappers publicam etapa/invocação; não há reporter Jest per-suite/per-case integrado nessa trilha lida. O dado não existe no protocolo só porque o terminal imprimiu o nome.
- DF Playwright: reporter central, identidade de invocação/repeat, pending e counts; retries são fatos do mesmo caso. É a integração de granularidade mais detalhada nesta entrega.

Uma integração de reporter por framework é possível sem editar cada teste, mas precisa de fonte confiável e orçamento de eventos/sidecar. Não remover o filtro do self-host e interpretar output de fixture como execução real. C06 delimita a cobertura atual e seu aceite; ampliar a granularidade dos runners internos é incremento consciente, não condição disfarçada para encerrar esta auditoria.

### Duplicação concreta a medir

[`DF · scripts/ci/jest-scope.ts#L330-L380`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/jest-scope.ts#L330-L380) cria comandos independentes para catalog-proof, forced e related. Pode haver interseção; não há deduplicação entre esses comandos. [`DF · docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md) relata uma repetição numa baseline histórica de 14–15/09, não uma medição atual de todos os diffs.

No CQ, `check` chama build e `test:runtime` chama build novamente. Isso é custo redundante potencial, não explicação provada para dezenas de minutos. C06 primeiro enumera seleção e ambientes; só elimina repetição materialmente equivalente e com ganho medido, nunca contratos filesystem indispensáveis ao related.

## 5. Grafos: proposta, não novo grafo executivo

Há um uso concreto: explicar por que determinado grupo/spec entrou no `e2e-impact`. [`DF · e2e/impact-groups.json`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/e2e/impact-groups.json) declara três grupos e relações de seleção/dependência. O escopo é literalmente `partial-not-full`.

Essas relações não descrevem todo o sistema, não são uma autorização de agendamento paralelo e não são os edges de execução de cada caso. `parentId` do progresso significa hierarquia de apresentação, não precedência causal. O catálogo argv também não descreve dependências internas de um comando opaco.

**Decisão:** manter OUT-GRAPHS/OUT-MAP e a proposta no roadmap. Primeiro permitir explicação textual/receipt da seleção parcial do consumidor. Só propor UI de grafo com usuário, pergunta, cobertura e fonte de cada aresta definidos. Não instalar ReactFlow, inventar topologia por grep ou transportar o protótipo aposentado.

## 6. Q1 e Spec 121

`03-ESTADO-121.md` separa cada minispec e o cruzamento limitado com a 125. `04-PROVAS-E-ACEITE.md` especifica os artefatos faltantes e a matriz visual.

As decisões deste pacote não autorizam reduzir testes do Full, alterar `--fail-on-flaky-tests`, workers, Node, Colima, heap, package manager, caches compartilhados, retenção ou logs. Também não autorizam estágio/main/PROD.

## 7. Ordem mínima

1. **C01 primeiro:** corrigir observação Git e B0 no env; são fronteiras de prova, independentes do desenho de tabelas.
2. **C02 e C05 podem avançar já:** reconciliação documental e coleta de evidência existente, sem experimento pesado nem poda.
3. **V01 sobre a PR18 já mergeada:** conferir a entrega visual e pedir capturas; não abrir uma segunda implementação. **C04** segue no RunTable atual apenas para falha de refresh.
4. **C03** fecha a cadeia única de observabilidade nos dois repos; a dependência de merge Q2/Q3 já está satisfeita. **C06** fecha a seleção dos testes do harness e o mapa de papéis, sem migração de framework.

Se ambos Q2/Q3 ainda estivessem abertos, C01/C02/C05 e o levantamento da seleção poderiam andar; C03 dependeria dos contratos estabilizados. Agora os merges e sua ancestralidade estão comprovados. Permanecem necessárias rechecagem dos dev antes de cada corte, capacidade da distribuição usada pelo teste e prova integrada. Merge do source não comprova release instalada.

Artefatos exatos faltantes e critérios constam em `04-PROVAS-E-ACEITE.md`. Nenhum corte autoriza fechar a 121, executar Full ritual, instalar, limpar state ou promover stage/main/PROD.
