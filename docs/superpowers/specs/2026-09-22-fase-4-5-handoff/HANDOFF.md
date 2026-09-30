# Handoff factual — CI Queue / DietFlow, Fases 4 e 5

Congelamento: 22/09/2026, após leitura de `origin/dev`. Este documento preserva o estado desta task para uma próxima IA desenhar uma **nova** spec/plan. Não é a spec, o plan, um aceite de produto ou autorização para executar Full, merge, release ou instalação. Os pacotes históricos em `research/` foram importados sem alteração de conteúdo; origem, data de modificação e SHA-256 de **cada arquivo** estão em [`research/PROVENIENCIA.tsv`](research/PROVENIENCIA.tsv).

## Baseline e limites

| Repositório | `origin/dev` congelado | Checkout principal observado | Status / não publicados | Lane desta task |
|---|---|---|---|---|
| `nmarcofernandess/ci-queue` | `ef057973bd1f006f493487f6cc9b96b2b7e741f8` | `/Users/marcoantonio/ci-queue`, `dev`, HEAD e upstream `origin/dev` no mesmo SHA | limpo; nenhum commit não publicado | `/Users/marcoantonio/ci-queue-fase4-5-handoff`, `codex/fase4-5-handoff`, criada no SHA congelado para este handoff |
| `dietflowoficial/Dietflow-app` | `5e2b239f627982b779e4656bc494971a0052d6da` | `/Users/marcoantonio/dietflow-app`, `dev`, HEAD `62e8c5394f3e9d5f2023d8a63a287d572a1334e2`, upstream `origin/dev` (5 commits atrás) | limpo; nenhum commit não publicado | nenhuma lane F4/F5 local pendente desta task |

As lanes clínicas 123/02 e 123/07 e outras worktrees não pertencem a este fechamento; não foram alteradas. PR mergeada em `dev` prova integração de código, **não** instalação, aceitação visual, causalidade de performance ou Full. No Mac, `ci-queue version --json` e `installation.json` apontavam para `3f2fb2481b40971cb77bbd5802fca4b3b3acfd9b` (instalada em 21/09/2026 22:14:09Z), anterior ao `origin/dev` acima. Não houve reinstalação nesta task.

## Fase 4 — cortes C01–C06 e V01

Os estados abaixo se referem ao DoD **original do corte inteiro**, não apenas ao código. “INTEGRADO” não significa aceite de toda a Fase 4. Fonte primária da matriz: `research/fase-4-pacote/04-PROVAS-E-ACEITE.md`; checkpoints: `research/relatorios-desta-task/FASE-4-censo-e-checkpoints.md`.

| Corte / propósito | Estado; PR / commit | Prova e DoD real; falta |
|---|---|---|
| C01 — Git/B0: erro de status não virar checkout limpo; base/env observados | **INTEGRADO**; CI Queue [#20](https://github.com/nmarcofernandess/ci-queue/pull/20), merge `56eb86e5` | Ticket `20260921180245-a04c738b` focal passou. DoD de correção/prova focal sim; instalação da revisão não demonstrada. |
| C02 — reconciliar Spec 121 e documentação de ownership | **DOCUMENTAL PENDENTE**; CI Queue [#19](https://github.com/nmarcofernandess/ci-queue/pull/19) `f52abf3`, DietFlow [#1307](https://github.com/dietflowoficial/Dietflow-app/pull/1307) `4a50e858` mergeados | Reconciliação documental entregue; a Spec 121-mãe não está encerrada. DoD de fechamento global não. |
| C03 — prova integrada Q2/Q3 do emissor ao dashboard | **PROVA PENDENTE**; CI Queue [#22](https://github.com/nmarcofernandess/ci-queue/pull/22) `91d68ec2`, DietFlow [#1309](https://github.com/dietflowoficial/Dietflow-app/pull/1309) `299981903` mergeados | Ticket focal no mesmo job `20260921213858-f9700fe3` passou; evidências anteriores `20260921190328-112fbf75` e `20260921190347-b1e4f77e` cobrem 7/7. Não equivale à matriz original inteira de retry/repeatEach, discovery failure, cap 1001, cross-project, terminal e UI instalada. DoD inteiro não demonstrado. |
| C04 — refresh de histórico mantém últimos dados bons e mostra erro | **INTEGRADO**; CI Queue [#21](https://github.com/nmarcofernandess/ci-queue/pull/21) `ab32c077` | Tickets `20260921182802-ff7d493a` e `20260921190155-cd2acc99` passaram. DoD focal sim; revisão instalada no Mac é anterior. |
| C05/Q1 — inventariar recursos/retenção e explicar ENOSPC | **NÃO FECHADO**; inventário documental `docs/superpowers/specs/2026-09-20-q1-disk-inventory.md` no CI Queue | Quatro eventos de 20/09 foram mapeados (`20260920173639-87d295e5`, `20260920180533-bb713034`, `20260920204727-88c7bf2b`, `20260920210955-18a05212`). `.next` de worktrees apareceu na ordem de 3,1–3,9 GB; queue state ~57 MB. Não se provou qual operação/path/filesystem consumiu o último bloco no incidente nem se o cache causou a falha. Sem política de retenção/correção comprovada. DoD não. |
| C06 — seleção e fronteiras Static/Jest/E2E/FlowUI | **PROVA PENDENTE**; DietFlow [#1308](https://github.com/dietflowoficial/Dietflow-app/pull/1308) `500bcf0c` mergeado | Ticket `20260921181801-475d3f29` passou; wrapper/gatilhos revisados. Matriz completa de entrypoints/framework, paths lidos por filesystem e regressões listadas em `04-PROVAS-E-ACEITE.md` ainda não comprovada. Não houve migração de framework nem Full. DoD inteiro não. |
| V01 — aceite visual da tabela compartilhada PR #18 | **PROVA PENDENTE**; CI Queue [#18](https://github.com/nmarcofernandess/ci-queue/pull/18), head `17b379a55682489864d5d328ead68b1581d602fc`, merge `550409a92f359cffc3e75f34712d39133b8ab130` | Índice em `research/relatorios-desta-task/V01-C04-visual-index.md`; 19 testes, tickets C04 acima, larguras 640/820/1440/1600 e claro/escuro. O cenário 200% foi aproximação por viewport/DPR, **não zoom nativo**. Falta aceite visual humano com build/SHA da captura e confirmação da instalação observada. DoD não. |

**Censo dos 72 IDs:** censo histórico roteou 72/72 IDs; 58 ficaram sem mudança e 14 exigiam confirmação da baseline. O anexo nominal **agora está versionado** em `research/fase-4-pacote/02-CENSO-72.tsv`, com resumo e resultados no mesmo pacote. Isso não é recenso pós-merge nem aceite dos 14.

## Fase 5 — P00–P07

| Corte / propósito | Entregue; PR / commit | Tempo, evidência e DoD |
|---|---|---|
| P00 — baseline e envelopes | Pacote histórico importado em `research/fase-5-pacote/`; sem otimização | Full AP17 `20260919075127-addfb8a5`, HEAD `008cab050649c7d11255aef1e3a5f574581f02c1`, base `3d411dab21554040f9337d6564c3bce620e5129a`: 6.928,041 s; Static 805 s, Jest 2.247 s, E2E 3.544 s, FlowUI+Care 322 s. Baseline observada, não A/B atual. DoD de baseline sim, de ganho não aplicável. |
| P01 — instrumentação **e durabilidade** de spans | DietFlow [#1312](https://github.com/dietflowoficial/Dietflow-app/pull/1312) `e4aa2d50bf0f6ab0139204bd121cecac580f95e8` e correção de durabilidade [#1315](https://github.com/dietflowoficial/Dietflow-app/pull/1315) `11fccd50023cd3eb8b2c0bc5396e16e067c5e160`, mergeados | Smoke `20260921231014-02d628ee` passou, 75 medições; amostra durável `20260922023429-7ffcebb3` no HEAD de #1315. DoD de instrumento/durabilidade sim; não mede ganho causal nem E2E/FlowUI nesse smoke. |
| P02 — avaliar reuso do typecheck Static | DietFlow docs [#1313](https://github.com/dietflowoficial/Dietflow-app/pull/1313) `4fc832197f0dc9c3c3090b0ac5900cea24f75472`, mergeado | Hipótese **RECUSADA**: fixture e typecheck estrito não são equivalentes em `.next/types` e semântica de falha. DoD de decisão sim; nenhuma otimização/corte de tempo implementado ou creditado. |
| P03 — deduplicar seleção Jest equivalente | DietFlow [#1314](https://github.com/dietflowoficial/Dietflow-app/pull/1314), head `0487e1a53d9f1be6e14c343cb3362d6003416407`, merge `a1870e03e24b955db6ce4ef20e63912418e403c6` | Exact-HEAD smoke `20260922003509-e4822b1c`, receipt `20260922003712-9509f93f-967`: Static 56/56, Jest 3 suítes/101 testes. Corrigida seleção de paths não selecionáveis; só deduplicar mesmo arquivo selecionável no mesmo perfil. DoD funcional focal sim; **ganho causal ainda não creditado**. |
| P04 — um único build no check CI Queue | CI Queue [#24](https://github.com/nmarcofernandess/ci-queue/pull/24), head `bb10b376ea60cf055f2855d8597a8ebe9ce1174f`, merge `ef057973bd1f006f493487f6cc9b96b2b7e741f8` | `Test` reusa `dist` do check; testes independentes mantêm build. Focais 12/12, release 2/2, instalação fixture 18/18. DoD de composição sim; delta de wall time não medido, revisão ainda não instalada neste Mac. Predecessor de liveness [#23](https://github.com/nmarcofernandess/ci-queue/pull/23), merge `3f2fb2481b40971cb77bbd5802fca4b3b3acfd9b`. |
| P05 — custo/estabilidade Jest | Diagnóstico importado: `research/fase-5-pacote/DIAGNOSTICO-RETOMADA-P05-P06-20260922.md`; sem correção/PR | **Aberto.** Amostra e limite causal detalhados abaixo. SIGSEGV de `20260919055151-8c2dd256` continua sem causa demonstrada; `--no-sparkplug` já estava em uso. DoD não. |
| P06 — decompor E2E/FlowUI/recursos | Instrumentação P01 e diagnóstico importado; sem otimização/PR própria | **Aberto.** AP17 histórico: Supabase 100,811 s; Next 762,211 s; Playwright 2.674,085 s; FlowUI+Care 322 s. Smoke P01 não exercitou E2E/FlowUI. Sem A/B, mudança de cache, limpeza ou runtime. DoD não. “Feedback quente versus prova pesada” é apenas input novo ao próximo design, sem análise ou solução nesta lane. |
| P07 — Full de confirmação | Dependência do Full do RC115, sem PR próprio | **Não executado.** Não criar Full paralelo. DoD depende do owner RC115 e de receipt exact-HEAD/base futuro; o AP17 antigo não o substitui. |

**Jest ~143 s, sem causalidade atribuída:** no receipt/ticket durável `20260922023429-7ffcebb3` (HEAD `11fccd500`), worker total 463,720 s; envelope de seleção+execução Jest 161,395 s; segunda invocação 150,95 s para 11 suítes/285 testes. A suíte `scripts/harness/__tests__/green-progress.test.ts` reportou **143,08 s**, ~95% da segunda invocação. Mediu-se duração por suíte/invocação, não tempo de cada `spawnSync`, setup, assert, subprocesso, CPU ou RSS dos filhos. Ela usa Git real e `executeGreenProgress`; não foi provado que um subprocesso específico causou os 143 s nem que uma alteração reduziria o total. Não há A/B controlado. Fonte: diagnóstico P05/P06 importado e snapshot do ticket indicado nele.

## Quatro categorias de estado

### A. IMPLEMENTADO + MERGEADO

C01, C03, C04, C06 e o código prévio de V01; P01 (inclusive durabilidade #1315), P03 e P04. C02/P02 são entregas documentais mergeadas. Os commits/PRs e limites de prova estão nas duas tabelas; **merge não é aceite nem instalação**.

### B. IMPLEMENTADO/PESQUISADO + AINDA SÓ NA LANE

Apenas este handoff e a cópia versionada dos pacotes de pesquisa na lane documental `codex/fase4-5-handoff`. Nenhum código F4/F5 desta task ficou em lane de implementação não mergeada. Os documentos históricos não ganham status de conclusão por serem publicados.

### C. SOMENTE LOCAL FORA DO GIT

Após o push deste handoff: **nenhum material técnico F4/F5 identificado nesta task**. Fontes originais em `Downloads/CI-QUEUE-FASE-4`, `Downloads/CI-QUEUE-FASE-5` e `Documents/Codex/2026-09-21/ci-queue-fase-4/outputs` permanecem no Mac, mas cópias byte a byte e hashes estão neste repositório. Tickets/receipts operacionais em `~/.local/state/local-ci/queue/history/<ticket>.json` não foram copiados em bloco: ler pelos IDs acima, preservando dados sensíveis e temporalidade.

### D. IDENTIFICADO, MAS NÃO CORRIGIDO/COMPROVADO

14 IDs do censo aguardam confirmação; matriz completa C03/C06, aceite V01/zoom nativo/instalação das revisões recentes, causa e política de ENOSPC, ganho causal de P03/P04, estabilidade e custo Jest P05, decomposição/prova E2E/FlowUI P06, Full exact-HEAD do RC115 para P07. Nenhum deles deve ser chamado de resolvido por diagnóstico, smoke ou PR verde.

## Fontes prioritárias para retomada

Ler primeiro este arquivo, `research/PROVENIENCIA.tsv`, `research/fase-4-pacote/04-PROVAS-E-ACEITE.md`, `research/fase-4-pacote/02-CENSO-72.tsv`, `research/relatorios-desta-task/FASE-4-censo-e-checkpoints.md` e `research/fase-5-pacote/DIAGNOSTICO-RETOMADA-P05-P06-20260922.md`. Os arquivos importados são **observações da época**, não substitutos de `origin/dev` vivo.

- CI Queue @ `ef057973bd1f006f493487f6cc9b96b2b7e741f8`: `docs/CONTRACTS.md`, `docs/INSTALL.md`, `docs/RUNTIME-ISOLATION.md`, `docs/README.md`, `docs/superpowers/specs/2026-09-20-q1-disk-inventory.md`, `src/core/runner.ts`, `src/core/worker.ts`, `src/ship/ship.ts`, `scripts/ci/check-with-progress.sh`, `tests/core/progress-pipeline.test.ts`, `tests/core/check-composition.test.ts`, `tests/core/progress-emit.test.ts`, `tests/install/install.test.mjs`, `tests/browser/progress-timing-integrated.spec.ts`; PRs #18–#24 (em especial #23/#24).
- DietFlow @ `5e2b239f627982b779e4656bc494971a0052d6da`: `specs/121-harness-resource-exhaustion/PLANO-EXPERIMENTO-SIGSEGV.md`, `specs/121-harness-resource-exhaustion/progress.md`, `docs/ci/P01-MEDICAO-FINA-2026-09-21.md`, `docs/ci/P02-STATIC-EQUIVALENCIA-2026-09-21.md`, `docs/ci/P03-JEST-PERFIL-2026-09-22.md`, `ci-queue.json`, `scripts/ci-local.sh`, `scripts/ci/performance-measurement.ts`, `scripts/ci/performance-measurement.sh`, `scripts/ci/jest-scope.ts`, `scripts/ci/e2e-local-stack.sh`, `scripts/ci/preflight-local-stack.sh`, `scripts/ci/playwright-invocation.sh`, `scripts/ci-flowui.ts`, `scripts/jest/worker-memory-policy.cjs`, `scripts/ci/__tests__/performance-measurement-boundary.test.ts`, `scripts/ci/__tests__/jest-worker-memory-policy.test.ts`; PRs #1307–#1309 e #1312–#1315.
- Recibos: `~/.local/state/local-ci/queue/history/<ticket>.json` para todos os tickets nomeados acima; AP17 versionado no DietFlow em `specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/{queue-ticket.json,execution-receipt.json}`. Confirmar disponibilidade/HEAD/base antes de inferir execução atual. Nenhuma lane clínica ou ocorrência operacional de outro chat é escopo deste handoff.
