# CI Queue Fase 4 — censo e checkpoints

Consulta: 21/09/2026. Esta é uma reavaliação por delta dos 72 IDs do [censo-base](</Users/marcoantonio/Downloads/CI-QUEUE-FASE-4/02-CENSO-72-RESUMO.md>), não uma reescrita do TSV histórico. Os 72 IDs foram roteados: onde não há delta abaixo, vale a classe e a fronteira de prova do censo-base. A fotografia de `dev`/instalação não muda só porque existe uma candidata em PR draft.

## Atualização de integração · 21/09 19:10 -0300

O quadro de checkpoints abaixo preserva a fotografia das **candidatas antes do merge**. Depois dele, C01 #20 (`56eb86e5`), C02 #19 (`f52abf3f`), C04 #21 (`ab32c077`) e C03 #22 (`91d68ec2`) entraram em CI Queue `dev`, com checks finais passados; #22 também passou na prova integrada dedicada `20260921213858-f9700fe3`. C02 #1307 (`4a50e858`), C06 #1308 (`500bcf0c`) e C03 #1309 (`299981903`) entraram em DietFlow `dev`, com os smokes materiais passados. HEADs e merges foram conferidos como ancestrais, checkouts sincronizados e lanes limpas. **A release instalada do CI Queue continua `550409a9` nesta observação**; integração em Git ainda não comprova instalação ou boot. V01 visual continua sem aceite humano; C05 continua inventário sem causa única. Os 72 IDs não foram todos promovidos por esses merges, e a Spec 121 não está concluída por contagem de PRs.

## Checkpoints executados

| Corte | Candidata e evidência | Limite |
|---|---|---|
| C01 Git/B0 | CI Queue PR [#20](https://github.com/nmarcofernandess/ci-queue/pull/20), SHA `1377b5d`, ticket oficial `20260921180245-a04c738b` passed, pre/postflight limpos | Não instalada/mergeada; não prova o seletor Jest do consumidor |
| C02 docs/121 | CI Queue PR [#19](https://github.com/nmarcofernandess/ci-queue/pull/19) `11314e5`; DietFlow PR [#1307](https://github.com/dietflowoficial/Dietflow-app/pull/1307) `51dbbe3` | Reconciliação documental candidata; não muda runtime |
| C03 Q2/Q3 integrada | CI Queue PR [#22](https://github.com/nmarcofernandess/ci-queue/pull/22) `0ad8289` e DietFlow PR [#1309](https://github.com/dietflowoficial/Dietflow-app/pull/1309) `5d3914c`; ticket `20260921190328-112fbf75` passed, mesmo ticket interno `20260921190347-b1e4f77e`, 7 descobertos/executados, worker/API/UI compilada; ticket B/A `20260921192149-d86daff9` passed com API/CLI/UI compilada no mesmo estado temporário; DF focal `20260921190500-1e8df81f` passed, 5 suítes/47 testes | Provas focais distintas; os 47 testes e B/A não são o mesmo ticket do produtor 7/7; não equivalem a Full |
| C04 Histórico | CI Queue PR [#21](https://github.com/nmarcofernandess/ci-queue/pull/21), head final `2a7a533`; ticket C04/100% `20260921182802-ff7d493a` e complemento V01 `20260921190155-cd2acc99` passed | Refresh last-good, troca de filtro e geração testados; PR não instalado |
| C05 recursos | Leitura dos quatro eventos ENOSPC de 20/09 e inventário atual, sem remoção | Não há causalidade única comprovada nem política de retenção aprovada |
| C06 seletor | DietFlow PR [#1308](https://github.com/dietflowoficial/Dietflow-app/pull/1308), SHA `6310884`, ticket `20260921181801-475d3f29` passed | Candidata não mergeada; sem Full DietFlow |
| V01 visual | [Índice de capturas](V01-C04-visual-index.md); ticket 100% `20260921182802-ff7d493a` e matriz viewport/DPR `20260921190155-cd2acc99` passed no SHA `2a7a533` clean | A matriz de 200% é equivalência de composição/breakpoint, não zoom nativo do browser; aceite visual humano pendente |

## Delta dos 14 IDs classificados “não comprovado” na base

| ID | Reavaliação nesta fase |
|---|---|
| CTRL-001, CTRL-002 | C02 registra precedência, fontes e estado M01–M07 em candidatas; sem promover o carimbo de `dev`/instalação. |
| JEST-RELATED-001 | C01 corrige a passagem B0 no CQ e C06 amplia a prova do seletor DF; integração dessas candidatas ainda não é a base instalada. |
| LOGS-LEGACY-001 | Permanece sem inventário/hash físico completo do host; C05 não apagou logs. |
| DOC-DESTINATION-001 | Ponteiros e ownership reconciliados nas duas PRs C02, ainda drafts. |
| HISTORY-001, ERROR-001 | C04 corrige o refresh que escondia dados bons, com regressões de filtro e recuperação; ainda draft. |
| FULL-ADVISORY-001 | C02 reconcilia a instrução e C06 testa seleção; Full continua informativo conforme o contrato, sem execução Full nesta fase. |
| DOC-M06-PRD-001 | A fotografia atual é anotada em C02; o literal histórico no PRD não foi reescrito como contrato novo. |
| NATIVE-OPEN-001 | Sem novo receipt operacional/negativos HTTP nesta fase. |
| UI-TESTS-001 | C03 adiciona percurso same-ticket 7/7; C04/V01 adicionam regressões e capturas, mas não se credita matriz C03 inteira, aceite visual ou instalação. |
| VISUAL-ACCEPTANCE-001 | Capturas e índice não substituem aprovação de Marco; permanece aberta. |
| STATE-HYGIENE-001 | C05 inventariou sem poda; órfãos/ownership do host continuam sem fechamento geral. |
| INSTALL-PROVENANCE-001 | Não houve instalação, boot ou receipt de distribuição nova. |

Os demais 58 IDs não receberam mudança de classe nesta revisão. Em particular, `LAST-GREEN-001` mantém o contrato estrito anterior: ticket focal verde não vira “último verde” de outro preset/argv, release ou ship. Não atribuí “REGREDIU” sem before/after causal.

### Limite explícito do C03

O ticket integrado comprova a travessia real dos sete casos no mesmo ticket, `0/7` em live e `7/7` no histórico terminal observado no estado temporário, inclusive a remoção do sidecar após esse estado terminal. O receipt físico final preserva status, exit code e progresso terminal, além dos hashes e pins. Runtime interno foi observado como `unconfigured`, sem cobertura de observações. Não comprova na mesma cadeia os cenários de repeatEach/duas invocações, inventário 7→2, falha de descoberta, fail-fast/prep, caso 1001/retry omitido e capability/filtros. Cinco suítes focais do DietFlow (47 testes) passaram em ticket separado. O caso B-running/filtro-A/drawer-B com variante Focal igual em API/CLI/UI compilada passou em outro ticket focal de estado temporário; não é o mesmo run do produtor 7/7 nem uma instalação. Logo, “C03 passed” significa matriz de provas delimitadas, não Full.

## M01–M07 após os cortes

| Frente | Estado verificável e limite restante |
|---|---|
| M01 | Caps/guard existentes; sem admissão global provada sob pressão real de RAM/disco. |
| M02 | Worker on-demand/recovery existentes; sem causa fechada da #1086 ou receipt da instalação atual. |
| M03 | Política de workers e evidências verde/exit139 distintas; sem A/B causal SIGSEGV/Colima. |
| M04 | Caches/cópias identificados; sem ganho A/B que justifique mudar package manager, sparse ou cache. |
| M05 | Quatro registros ENOSPC distintos; sem ligação causal única nem autorização de prune/retenção. |
| M06 | Corte histórico fechado; C03 prova um percurso candidato e V01 produz inspeção, sem aceite visual/instalação. |
| M07 | `spend-abort-v1` e testes no produto; sem receipt instalado nem caso Mac de base movida. |

### C05 — eventos observados, sem poda

Em 20/09 houve quatro sinais distintos de `ENOSPC`: `20260920173639-87d295e5` falhou no check do CI Queue ao criar `ci-queue-observer-*` no temporário do macOS; `20260920180533-bb713034` concluiu E2E DietFlow apesar do aviso de cache webpack sem path/syscall; `20260920204727-88c7bf2b` foi interrompido durante `copyfile`/`mkdir` em `.next/standalone`; `20260920210955-18a05212` falhou ao abrir `.next/server/functions-config-manifest.json` na lane `dietflow-123-05-anamnese`. Os registros não demonstram um único incidente causal nem autorizam pruning. No inventário pontual havia cerca de 30 GiB livres no volume de 228 GiB; capacidade pontual não reconstrói o espaço livre em cada falha.

Este último parágrafo descrevia o checkpoint **antes** da integração. O estado atual de Git/instalação está na atualização do topo. Tickets focais não são Full nem release.
