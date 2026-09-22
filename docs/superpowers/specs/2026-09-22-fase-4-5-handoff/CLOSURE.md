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
| P05 | Suíte `green-progress.test.ts` 143,08 s é pista histórica, sem causa. Perfil limitado T7 pendente. |
| P06 | Feedback quente, outputs e comparação de envelopes pendentes; smoke anterior não cobriu E2E/FlowUI. |
| P07 | **OPERADOR/RC115 PENDENTE**; Full exact-HEAD/base não executado por esta task. |

## Limites do checkpoint

Não há RED/GREEN do novo comportamento, bundle candidato, PR de código, instalação ou aceite do Marco neste checkpoint. `CLOSURE.md` será atualizado somente com ticket, SHA, teste e alcance identificados; ausência permanece ausência.
