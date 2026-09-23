# Fechamento F4/F5 — checkpoint inicial

Observado em 22/09/2026. Este é o estado **antes** das mudanças T1–T8. `HANDOFF.md` e `research/` continuam fotografias históricas. Nenhuma linha abaixo declara instalação nova, aceite humano ou Full atual.

## Identidade e operação

| Fonte | Estado observado |
|---|---|
| CI Queue `origin/dev` | `ef057973bd1f006f493487f6cc9b96b2b7e741f8`; ancestral da lane `codex/fase4-5-handoff` (upstream `origin/codex/fase4-5-handoff`) em `448b511d10c1e61e6304ce8b015920e2b51cf111`, tree `a19004a7b57e84c12c9233dcf272dde091c28031`; lane limpa antes de T0. Checkout principal `dev` acompanha `origin/dev`. Remote `git@github.com:nmarcofernandess/ci-queue.git`. |
| PR #25 | `refs/pull/25/head` remoto = `448b511d10c1e61e6304ce8b015920e2b51cf111`. A API `gh pr view` não resolveu o repositório com a autenticação desta sessão; estado draft provém do handoff/plan, não foi revalidado pela API. |
| DietFlow `origin/dev` | `490bf07ea38589156a4bbde1e72db2cfeccd678f`, tree `62814bd81353dffc1d1449683eb84eb483f85356`; descendente da base da SPEC `dcd7ac2c8410a05d0c9f4fccee303c3d9a8c7ed0`. Os dois commits posteriores mudam docs da Spec 126, sem tocar os owners T1–T3. Checkout principal `dev` tem upstream `origin/dev`, está limpo em `dcd7ac2c` e não foi atualizado por esta task. Lane desta execução `codex/fase4-5-feedback` acompanha `origin/dev` em `490bf07ea`. Remote `git@github.com-dietflow:dietflowoficial/Dietflow-app.git`. |
| Instalação oficial | `ci-queue version --json` e `installation.json`: revisão `3f2fb2481b40971cb77bbd5802fca4b3b3acfd9b`, manifest `fbe16b04fe321dadfb67b7ad7ac44d6e8bf6cdd58045c1e741406cee5e096608`, state `/Users/marcoantonio/.local/state/local-ci/queue`; labels worker/dashboard registrados. Isto não prova boot de login ou UI instalada recente. |
| Fila no instante da leitura | `ci-queue status --json`: `running=null`, `queued=[]`; último ticket `20260922221553-f81fd3f4`, `smoketest` passed. Não foi iniciado worker pela leitura. |

Os contratos locais lidos para este checkpoint são `AGENTS.md`, `.context/patterns/{ci,e2e}.yaml`, `.agents/skills/dietflow-ci/SKILL.md`, `docs/ci/CI-QUEUE-CONSUMIDOR.md` no `origin/dev` DietFlow e `AGENTS.md`, `docs/CONTRACTS.md`, `docs/INSTALL.md` no CI Queue. Não foram copiados `.env`, pacientes, logs completos ou state operacional para fixtures. As futuras fixtures TDD usarão states temporários.

Delta clínico Antropometria já integrado: merge de código PR #1318 `084746b9ad44cb26fa84c14d84e5c8e8385fbf5c` e merge documental PR #1319 `dcd7ac2c8410a05d0c9f4fccee303c3d9a8c7ed0` são ancestrais de `origin/dev` (verificado com `git merge-base --is-ancestor`). Esta task não assume ownership dessa lane nem chama o smoke anterior de prova do novo feedback.

## Aceite A1–A10

| ID | Estado inicial | Prova ou ausência atual |
|---|---|---|
| A1 | PENDENTE | Método distribuído e adoção ainda não existem. |
| A2 | PENDENTE | Enqueue existe; falta tentativa quente em dois tickets reais. |
| A3 | PENDENTE | `dev-local-stack.sh` retém lock, mas não há sessão `start/status/stop` com identidade de ticket. |
| A4 | PENDENTE | Falta validar owner/listener/fingerprint de sessão nas duas bordas da tentativa. |
| A5 | PENDENTE | Falta claim e stop concorrentes com preservação do grupo próprio. |
| A6 | PENDENTE | `queue-current` já é publisher; falta override por receita e isolamento do scratch. |
| A7 | PENDENTE | Retenção específica de feedback ainda não existe. |
| A8 | PENDENTE | Protocolo Q2/Q3 existe; falta receita e percurso quente integrado. |
| A9 | PENDENTE | Regressões C03/C06/V01 e legado `artifacts` ainda exigem prova da candidata. |
| A10 | PENDENTE | Sem amostras comparáveis de sessão quente e preparação evitada. |

Fonte dos limites A1–A10: `SPEC.md` §9 e `PLAN.md` T1–T8 definem o comportamento ainda planejado; a ausência dos novos entrypoints/receita foi conferida nos owners `ci-queue.json`, `scripts/dev-local-stack.sh`, `scripts/ci/run.ts` e `scripts/ci/execution-evidence.ts` do `origin/dev` DietFlow. Para A8, `docs/CONTRACTS.md` e `tests/core/progress-pipeline.test.ts` no CQ mostram o protocolo existente, sem provar o ciclo quente novo. A10 usa apenas o limite causal explicitado em `research/fase-5-pacote/DIAGNOSTICO-RETOMADA-P05-P06-20260922.md`.

## Frentes herdadas

| Frente | Estado inicial e próximo critério |
|---|---|
| C01 | Código integrado; `tests/core/queue-engine.test.ts` cobre preflight/status. Reexecutar regressão pertinente, sem reimplementar. |
| C02 | Documentação integrada; fechamento global da 121 pendente. Reconciliar apenas cortes provados. |
| C03 | Emissor/collector integrados parcialmente; matriz producer→worker→API/UI de `research/fase-4-pacote/04-PROVAS-E-ACEITE.md` pendente. |
| C04 | Código integrado; `tests/browser/dashboard.spec.ts` cobre refresh falho preservando consulta/página. Reexecutar regressão pertinente. |
| C05/Q1 | Inventário histórico incompleto. Causa de ENOSPC: **INCONCLUSIVO_NÃO_BLOQUEANTE**; medir prospectivamente outputs do novo modo, sem poda global. |
| C06 | Seleção integrada; matriz de entrypoints/framework, leituras por filesystem e novos gatilhos pendente. |
| V01 | Tabela integrada e testes geométricos existentes; candidata/zoom nativo/aceite humano e instalação observada pendentes. |
| 72 IDs | Censo histórico tem 72 IDs únicos; 14 `NÃO COMPROVADO` exigem reconciliação: `CTRL-001`, `CTRL-002`, `JEST-RELATED-001`, `LOGS-LEGACY-001`, `DOC-DESTINATION-001`, `HISTORY-001`, `FULL-ADVISORY-001`, `ERROR-001`, `DOC-M06-PRD-001`, `NATIVE-OPEN-001`, `UI-TESTS-001`, `VISUAL-ACCEPTANCE-001`, `STATE-HYGIENE-001`, `INSTALL-PROVENANCE-001`. Manter 72/72, aceitando OUT/substituído quando provado. |
| P00 | Baseline AP17 é histórica e não A/B atual. |
| P01 | Instrumentação/durabilidade integradas; não reinstrumentar. |
| P02 | **HIPÓTESE_RECUSADA**: typechecks não equivalentes; não repetir. |
| P03 | Dedup por perfil integrado em DF `scripts/ci/jest-scope.ts`; ganho em minutos não creditado. |
| P04 | Build único integrado em CQ `scripts/ci/check-with-progress.sh`; `tests/core/check-composition.test.ts` prova composição. Ganho em minutos não creditado. |
| P05 | Medição limitada T7 capturou setup, subprocessos Git, `executeGreenProgress` e cleanup; disposição `INCONCLUSIVO_NÃO_BLOQUEANTE`, sem otimização causal aplicada. |
| P06 | Feedback quente, outputs e comparação de envelopes pendentes; smoke anterior não cobriu E2E/FlowUI. |
| P07 | **OPERADOR/RC115 PENDENTE**; Full exact-HEAD/base não executado por esta task. |

## Limites do checkpoint inicial (22/09)

Não há RED/GREEN do novo comportamento, bundle candidato, PR de código, instalação ou aceite do Marco neste checkpoint. `CLOSURE.md` será atualizado somente com ticket, SHA, teste e alcance identificados; ausência permanece ausência.

## Observação da candidata após T6 (23/09/2026)

Esta seção acrescenta evidência posterior sem reescrever a fotografia inicial nem o censo histórico.

| Lane | Identidade observada | Alterações T6 | Provenance do teste/captura |
|---|---|---|---|
| CI Queue | `/Users/marcoantonio/ci-queue-fase4-5-handoff`, `codex/fase4-5-handoff`, base `5bff6a270442a6961b33c9d06fe53bae3814c4f8` | `tests/browser/progress-timing-integrated.spec.ts`, `tests/browser/table-layout.spec.ts`; saídas persistentes sob `docs/superpowers/specs/2026-09-22-fase-4-5-handoff/evidence/feedback/` | Diff de fontes no fechamento: `35415916c6b23b6d0bc99ee3804affa7d09902acd2f043a536fb119254e0914d`. Browser receipts incluem HEAD e este hash. |
| DietFlow | `/Users/marcoantonio/dietflow-fase4-5-feedback`, `codex/fase4-5-feedback`, base `9efb74b1504cb3b60309aec1a108d60c280a1684`; `AGENTS.md` aponta para `.claude/CLAUDE.md` | `scripts/ci/jest-scope.ts`, `scripts/ci/__tests__/jest-scope.test.ts`, `scripts/ci/__tests__/e2e-feedback.test.ts`, fixtures `pw-observe` | Diff de fontes no fechamento: `b0ea5d3410bb55c2c5d821e3daecd41247cfd109534b3d4e7b0a9e97f04674a4`. |

Os únicos testes de host/browser desta fase foram submetidos à fila oficial. Os números abaixo apontam para os logs sob `/Users/marcoantonio/.local/state/local-ci/queue/logs/`; cwd, argv, receita e `artifacts: []` ficam registrados nos relatórios T1–T6 e nos próprios logs.

| Gate | Disposição atual | Provenance | Alcance e limite |
|---|---|---|---|
| A1 — método e adoção | `PROVADO_DOCUMENTAL` | T5: bundle/adoption `20260923063130-6cf127ff`, 1/1; discovery independente em `task-5-report.md` | Método genérico e ponteiros do consumidor encontráveis. O doctor DF `20260923062652-7092dc28` ficou limitado por `.env` ausente; não foi provisionado ambiente. |
| A2 — ciclo quente | `PROVADO_COM_FIXTURE_DE_FILA` | `20260923073421-2e9ebcc2`, terminal passed, 21/21 | Três tickets na sessão `896f7fe2-7cf6-46db-85ba-140401e5e105`: falha 1/1; alteração apenas da aplicação servida, sucesso 1/1 com o mesmo hash de teste; alteração apenas do teste, sucesso 1/1 com o mesmo hash de aplicação. Uma inicialização; `databaseResetSeedOrBuild=false`. Sequência completa na linha 6 do log oficial. |
| A3–A5 — sessão/identidade/concorrência | `PROVADO_COM_TESTES_DE_OWNER` | Owner T2 `20260923020833-d4a8ae6a`, 3 suítes/21 testes; T3 e2e integrado `20260923050659-cbe2a9c0`, 20/20 | Cobre posse, listener/fingerprint, claim/stop e isolamento da sessão em estados temporários. Os tickets T2/T3 estão detalhados em seus relatórios. |
| A6 — artifacts por receita | `PROVADO_COM_TESTES_DE_OWNER` | T1 CQ `20260922233648-4f3b32aa`, 49/49; T3 material/ship `20260923050324-66bb0d20`, 2 suítes/146; T3 owners `20260923050532-bb3c2b84`, 3 suítes/30 | Override ausente/herdado/`[]`, capability e elegibilidade de prova foram cobertos; feedback segue fora de `ship.acceptedPresets`. |
| A7 — retenção | `PROVADO_COM_TESTES_DE_OWNER` | T4 oversize GREEN `20260923055436-b2b5fdab`, 8/8; owner `20260923054032-900b2277`, 4 suítes/159; integração `20260923055524-ca2afde5`, 20/20 | Evidência do modo feedback e rotação conforme contrato. Sem varredura ou poda global do host. |
| A8 — progresso/ciclo integrado | `PROVADO_NO_ESCOPO_C03` | T3/T4 receipts acima; C03 produtor real `20260923080332-b5cdc2ed`, 1/1 | Teste C03 envia producer real do DF por ticket/worker/API/UI compilada CQ. Um fixture de sete casos ficou ativo em `0/7`, com um caso `running` e seis `pending`, e terminou `7/7` em histórico/UI. O fixture interno de browser da própria suíte não é tratado como execução real de produto. |
| A9 — regressões C03/C06/V01 e compatibilidade | `PROVADO_NA_CANDIDATA` | C06 final `20260923073023-db80e7ca`, 6/6 novos casos; owner DF `20260923075754-a2494e65`, 5 suítes/124; browser final `20260923081250-17e11114`, 20/20 | C03/C06/V01/C04/R06 no alcance desta candidata; os subitens estão discriminados abaixo. Não equivale a Full, instalação ou release. |
| A10 — comparação de envelopes | **PARCIAL; NÃO ACEITO (T7 INCOMPLETO)** | Baseline focal `20260923084134-fac32de7`; perfil medido `20260923160345-bc5a18e4`; sequência de fixture T6 `20260923073421-2e9ebcc2`; `evidence/performance/T7-P05-P06-A10.md` | T7 mede fila, runner e publicação do seu artifact; faltam validação/reuso da sessão e tempos/bytes por tentativa P06, além de três retestes quentes contra o primeiro preparo. A sequência de três tickets, por si, não fecha A10 nem prova economia. |

### C03, C06 e V01/C04/R06

| Corte | Prova e observação | Limite explícito |
|---|---|---|
| C03 producer → ticket → worker → API/UI | Ticket de browser `20260923080332-b5cdc2ed`, terminal passed, 1/1. O receipt interno do ticket fixture `20260923081033-6d5e698e` registra candidato CQ `5bff6a2`, consumidor DF `9efb74b`, hash de diff `83b2e9e7a2c001eb542a13fa284fd456c797461edf117267b45f5fa7083a0aa6`, execução de sete casos, API `running 1/pending 6`, UI drawer `0 de 7`, depois histórico `passed 7/7` e drawer terminal `7 de 7`. | A população observada é a fixture de sete casos. Os contratos protocol-level adicionais de retry, repeatEach, múltiplas invocações, mismatch, cap e filtro são cobertos pelos owners sintéticos relatados em T3/T4; este receipt não os converte em E2E clínico/Full. |
| C06 selector/filesystem | Ticket focal `20260923073023-db80e7ca`, 6/6 novos casos com os 89 testes anteriores filtrados; owner matrix `20260923075754-a2494e65`, 5 suítes/124. | Contratos owner `.sh` são forced-only; paths `.ts` selecionáveis preservam `relatedPaths` e também forçam o owner que lê o filesystem. Não deduplicar um caminho relacionado selecionável. |
| C04 histórico | Incluído em `20260923081250-17e11114`: falha acessível de refresh com consulta e página carregada preservadas. | Prova somente o comportamento exercitado no teste `history keeps the loaded query, its next page and an accessible refresh error`; não atesta toda combinação histórica de filtro/URL. |
| R06 duração | Incluído em `20260923081250-17e11114`: duração zero do emitter, collector e unavailable foram exercitados via API; zero e fonte foram exibidos no drawer. | Sem alegação sobre tempos de runtime do produto; são estados de contrato. |
| V01 tabela | Incluído em `20260923081250-17e11114`: 18 casos geométricos em 1600/1440/820/640/390, claro/escuro e escalas configuradas; rolagem início/meio/fim, título/olho alcançáveis, hit targets separados, seleção e teclado. | Os casos marcados 200% usaram `deviceScaleFactor`; `nativeBrowserZoomObserved=false`. Logo não há prova de zoom nativo 200%. Capturas não constituem aceite visual humano. |

O primeiro C03 browser enqueue `20260923074253-d367009a` parou antes de executar testes porque faltavam dependências da UI na worktree. O coordenador fez `npm ci` reversível em `ui/` (559 pacotes, exit 0, sem alteração rastreada de fonte/lock): preparo local de dependências para compilar a candidata, **não** instalação/cutover do CI Queue. Depois, `20260923075320-9cd26466` encontrou a observação de caso ativo ausente por consultar a projeção live sem nós; `20260923080053-4a42c107` identificou duas ocorrências legítimas de `0 de 7`. Os locators foram ajustados para consultar detalhe e verificar ambos os nós; o GREEN final é `20260923080332-b5cdc2ed`. As tentativas com falha permanecem no evidence index para preservar a causalidade.

### Reconciliação dos 14 IDs do censo

`02-CENSO-72.tsv` mantém 72 IDs únicos e as classificações históricas. A tabela abaixo atualiza somente disposição atual de cada um dos 14 IDs antes marcados `NÃO COMPROVADO`; não reescreve evidência de 15/09 nem afirma aprovação retroativa.

| ID | Disposição atual | Evidência e residual |
|---|---|---|
| `CTRL-001` | `RECONCILIADO_NO_CORTE` | Este fechamento preserva o checkpoint e separa evidência atual de limites. Não certifica a auditoria/aceite humano de 15/09. |
| `CTRL-002` | `RECONCILIADO_NO_CORTE` | `task-5-report.md` registra owners editáveis, pointers e descoberta sem transcript; T6 adiciona tickets e capturas reproduzíveis. Não substitui a fotografia histórica da 121. |
| `JEST-RELATED-001` | `PROVADO_NO_CORTE` | C06 `20260923073023-db80e7ca` (6/6) e owner matrix `20260923075754-a2494e65` (124 testes). `.sh` usa forced-only; `.ts` selecionável retém `relatedPaths` e owner forçado. |
| `LOGS-LEGACY-001` | `OPERADOR_PENDENTE` | Há logs e evidência dos tickets atuais, mas nenhum inventário/hash completo dos logs legados no host. Não inferir preservação física total. |
| `DOC-DESTINATION-001` | `PROVADO_NO_CORTE` | T5 introduz `docs/TESTING-METHOD.md`, ponteiros no CQ e `docs/ci/FEEDBACK-LOOP.md` como owner DF; teste de bundle/adoption `20260923063130-6cf127ff` passou. O doctor ambiental permanece limitado pelo `.env` ausente. |
| `HISTORY-001` | `PROVADO_PARCIAL_C04` | `20260923081250-17e11114` exercitou query carregada, próxima página e erro de refresh acessível. Combinações adicionais de filtro/URL não estão certificadas por este caso. |
| `FULL-ADVISORY-001` | `COMPORTAMENTO_ATUAL_PROVADO; DOCUMENTO_LEGADO_A_CORRIGIR` | `.context/onboarding.yaml:333-337`, `scripts/ship/ship.ts`/testes e `ci-queue.json#ship.acceptedPresets` mostram recomendação informativa e ausência de enqueue automático. `.agents/skills/dietflow-ci/SKILL.md:168-170` ainda conflita ao dizer que o ship pede Full e depois smoke; não editado no escopo T6. |
| `ERROR-001` | `PROVADO_PARCIAL_C04` | O mesmo teste C04 cobre erro de refresh após dados bons e preservação da consulta carregada. Não generalizar para todos os estados de erro/contexto do painel. |
| `DOC-M06-PRD-001` | `OWNER_ATUAL_IDENTIFICADO; HISTÓRICO_PRESERVADO` | T5 aponta método de feedback para o owner vivo (`docs/TESTING-METHOD.md` no CQ e `docs/ci/FEEDBACK-LOOP.md` no DF). A narrativa histórica M06/PRD não foi reescrita nem apresentada como manual operacional atual. |
| `NATIVE-OPEN-001` | `OPERADOR_PENDENTE` | Nenhuma ação Finder/reveal instalada foi acionada/observada neste T6. Testes de API não são recibo de operação nativa do host. |
| `UI-TESTS-001` | `PROVADO_NO_ESCOPO_CANDIDATO` | C03 `20260923080332-b5cdc2ed` e browser V01/C04/R06 `20260923081250-17e11114`, 20/20. A cobertura é focada nos contratos listados, não teste Full da UI inteira. |
| `VISUAL-ACCEPTANCE-001` | `OPERADOR_PENDENTE` | Capturas identificadas e receipts em `evidence/feedback/` estão disponíveis para inspeção. O teste automatizado e a inspeção técnica não equivalem a aceite humano nem a screenshot da instalação ativa. |
| `STATE-HYGIENE-001` | `OPERADOR_PENDENTE` | Fixtures do C03 usam state temporário e encerram seus processos próprios. Nenhum scan global ou prova de ausência de resíduos no state do operador foi feito. |
| `INSTALL-PROVENANCE-001` | `OPERADOR_PENDENTE` | Não houve instalação, cutover nem coleta atual de `version`, `build.json`, `installation.json` ou `launchctl`. `npm ci` foi dependência local de build da candidata, não instalação do produto. |

### Medição T7 — P05/P06/A10 (23/09/2026)

O baseline não instrumentado foi executado uma vez pela fila oficial: ticket `20260923084134-fac32de7`, HEAD DietFlow `6b307a35c46fbdf2f3e2c2069512353e2ce9c312`, tree `cd2e46ec53ec36bc0e27c774e9059760e71d9185`, receita `feedback-contract-review`, 42/42. A suíte durou 137,497 s e a invocação Jest 137,891 s. O run externo foi 139,990 s; espera da fila 125,072 s. A observação instrumentada `20260923160345-bc5a18e4` também passou 42/42, com o mesmo HEAD/argv/runtime e apenas o arquivo de teste sujo: Jest 143,365 s, suíte 142,918 s, runner externo 146,072 s, espera 492,544 s e publicação do artifact em 2 ms. São perfis distintos; não se declara diferença causal nem ganho. A tentativa `20260923154909-e5251823` passou sem produzir telemetria porque `jest.setup.js` remove a alias usada na primeira versão do perfil; a versão temporária usada no terceiro ticket foi corrigida para ler `CI_QUEUE_JOB_ID` e não conta como amostra instrumentada sem spans. Os 143,08/150,95 s históricos seguem como pista não comparável por diferirem HEAD, receita e população.

O patch de instrumentação foi temporário, identificado pelo hash no relatório de evidência, e foi revertido depois que o artifact oficial foi conferido. No fechamento desta tarefa a worktree DF está limpa em `6b307a35c46fbdf2f3e2c2069512353e2ce9c312`; não permanece mudança de fonte T7.

| Corte | Disposição T7 | Limite | Evidência |
|---|---|---|---|
| P05 | `INCONCLUSIVO_NÃO_BLOQUEANTE` | Uma amostra P01 mediu hooks, subprocessos Git diretos, `executeGreenProgress`, cleanup e bytes. Não prova equivalência semântica/redundância em fixtures Git mutáveis; owner sem alteração. O patch de perfil foi temporário e já voltou ao HEAD. | Baseline `20260923084134-fac32de7`; perfil/artifact `20260923160345-bc5a18e4`; 2.712 spans/4.285.585 B JSONL, hash `45349053eb3dfc0d0eeb9cd383068ebde3ea726b34402cc6036b90aaeba1bb69`. |
| P06 | `PARCIAL; CRITÉRIO NÃO CUMPRIDO` | T6 reutilizou o preparo em três tickets de fixture: um inicial falhou e só dois foram retestes. Ainda não há três retestes quentes com a primeira preparação nem spans/bytes por ticket de uma prova canônica de módulo/RC. | T6 `20260923073421-2e9ebcc2`, `T6_WARM_FEEDBACK_SEQUENCE`, uma sessão, `serverLaunches:1`, `databaseResetSeedOrBuild:false`; ticket receipt traz cinco arquivos sujos. O diff SHA registrado no fechamento T6 é `b0ea5d3410bb55c2c5d821e3daecd41247cfd109534b3d4e7b0a9e97f04674a4`. |
| A10 | `PARCIAL; NÃO ACEITO` | O runner e a cópia de artifacts foram medidos no ticket P05, mas isso não mede validação/reuso da sessão, publicação/bytes por tentativa P06 nem três retestes quentes. O caso interno T6 de 13,275 s cobre a sequência e não deve ser somado ao run externo. | Histories/logs oficiais T7/T6 e relatório `evidence/performance/T7-P05-P06-A10.md`. |
| P03 | `CONTADOR FUNCIONAL; SEM CRÉDITO TEMPORAL` | Uma sobreposição de mesmo perfil sai de `forcedTests` e permanece uma vez em `jest:related`; asserção mede o plano de invocação, não runtime. | `jest-scope.test.ts`, teste de sobreposição, ticket owner `20260923075754-a2494e65` (5 suítes/124). |
| P04 | `CONTADOR FUNCIONAL; SEM CRÉDITO TEMPORAL` | Cada fixture observa uma chamada `build` em `check` e em `test fresh`; não há par temporal compatível. | `tests/core/check-composition.test.ts`, arrays de chamadas do check agregado e `test fresh`. |

No T6, o preflight registrou modificados `scripts/__tests__/fixtures/pw-observe/c03-producer.sh`, `scripts/__tests__/fixtures/pw-observe/cases.spec.ts`, `scripts/ci/__tests__/e2e-feedback.test.ts`, `scripts/ci/__tests__/jest-scope.test.ts` e `scripts/ci/jest-scope.ts`; `baseSha` estava vazio. O JSON do ticket não retém diff SHA. O fechamento T6 preserva o fingerprint `b0ea5d3410bb55c2c5d821e3daecd41247cfd109534b3d4e7b0a9e97f04674a4`, confirmado pela reconstrução atual do diff entre HEADs. Portanto, o HEAD `9efb74b` isolado não é identidade suficiente do estado testado.

O detalhe de comandos, tempos, população, runtime, cache, workers, subprocessos, bytes, fontes e limitações está em [`evidence/performance/T7-P05-P06-A10.md`](evidence/performance/T7-P05-P06-A10.md). P05 foi medido e encerra inconclusivo não bloqueante. Não há prova canônica de módulo/RC com três retestes quentes já necessária indicada no PLAN T8; T7 não deve ordenar execução extra apenas para obter um gráfico.

### Limites atuais e handoff

- C02/Spec 121: somente os cortes documentais comprovados por T5 e as reconciliações acima foram registrados. O fechamento global da 121 não foi declarado.
- C05/Q1: causa do ENOSPC histórico continua `INCONCLUSIVO_NÃO_BLOQUEANTE`; nenhum arquivo ou log legado foi podado.
- M03/SIGSEGV: sem atribuir causa nova ou estabilidade ao runtime pelo conjunto de provas T6.
- T7 permanece incompleto: P05 encerrou `INCONCLUSIVO_NÃO_BLOQUEANTE`; P06/A10 seguem pendentes por falta de prova canônica naturalmente necessária com três retestes quentes e spans/bytes por ticket, ou decisão explícita de contrato sobre essa lacuna. RC115/P07 permanece `OPERADOR/RC115 PENDENTE`.
- Sem commit, push, PR, merge, Full, instalação/cutover ou aceite humano nesta observação. O teste de browser valida a candidata identificada pela worktree, não a release ativa.
