# Cobertura do consumidor e fontes auditadas

## 1. Fronteira desta entrega

CI Queue mede o que recebe. O consumidor define que subetapas existem e publica os marcadores. Um timestamp no coletor resolve um gate com início/fim e duração `-`; não revela as funções internas de um processo que só escreveu um resumo final.

Esta etapa fecha os tempos dos **nós publicados**. Nenhum gate que possui fronteiras completas pode ficar sem tempo sob a desculpa de não haver duração explícita. Um nó sem fronteira suficiente, por outro lado, deve declarar ausência. Não criar testes ou suites fictícios para tornar uma árvore mais preenchida.

Não é necessário modificar runtime do DietFlow para essa fatia principal. O pacote não entrega um reporter Jest novo e não diz que o fez. A ampliação de granularidade de um consumidor requer seus eventos ou seu relatório nativo, sem alterar o motor do CI Queue. Isso não é licença para deixar os gates Static atuais sem medição.

## 2. Cobertura verificada no DietFlow

Revisão consultada de `dev`: **e0e65e8dfccb3612a00eb0bbd72b4e4a8978e609**. O operador local deve registrar uma revisão mais nova caso o consumidor tenha avançado, sem usar caminhos de uma lane morta como dependência do teste.

| Superfície | O que o emissor atual oferece | Resultado da etapa 2 |
| --- | --- | --- |
| `scripts/ci-local.sh` | 54 gates; cada gate publica running/terminal com `-`; grupo Gates tem fronteiras | Duração observada por gate e grupo, sem editar os 54 wrappers individualmente |
| `scripts/ci/smoketest-local.sh` | Raízes Static/Jest publicam duração terminal calculada pelo shell | Conservar o valor do emissor, não substituir pela observação do coletor |
| `scripts/ci/full-local.sh` | Estágios existentes com wrappers de progresso | Medir somente fronteiras publicadas, preservar tempos explícitos |
| `scripts/ci/playwright-progress-reporter.ts` | running e result.duration por caso; mesmo ID em retry; detalhamento limitado a 100 casos | Conservar duration do reporter; não somar tentativas; não declarar todos os casos detalhados |
| `jest.config.cjs` e `scripts/ci/jest-scope.ts` | Na configuração/caminho lidos não há reporter de progresso por arquivo Jest para o CI Queue | O estágio Jest é medido. Não prometer tempo individual por arquivo/it não publicado |

Uma nova coleta poderá revelar que um gate específico consome quase todo o Static. Investigar/otimizar o conteúdo dele pertence à fase de desempenho do consumidor, não a esta implementação.

## 3. Exemplos de contrato compartilhado

São mensagens exemplificativas, não comandos a executar no DietFlow:

```text
@@local-ci-progress\t1\tnode\tstatic\t-\tstage\trunning\t-\tStatic
@@local-ci-progress\t1\tnode\tstatic-gates\tstatic\tgroup\trunning\t-\tGates
@@local-ci-progress\t1\tnode\tgate-1\tstatic-gates\tgate\trunning\t-\tprisma generate
@@local-ci-progress\t1\tnode\tgate-1\tstatic-gates\tgate\tpassed\t-\tprisma generate
@@local-ci-progress\t1\tnode\tstatic-gates\tstatic\tgroup\tpassed\t-\tGates
@@local-ci-progress\t1\tnode\tstatic\t-\tstage\tpassed\t2000\tStatic
```

Nos testes, `\t` vira tab literal. Enviar as linhas com clock falso em instantes definidos para mostrar:

- gate sem tempo explícito recebe source collector;
- grupo sem tempo explícito é medido pelo seu próprio intervalo;
- Static recebe exatamente 2000/source emitter, mesmo que o coletor tenha observado outro intervalo;
- somar os filhos não altera nenhum desses valores.

## 4. Código do CI Queue consultado

Base: `829218cdcd4603fccc5bd3ee626ae2bcde7f1b61`.

| Caminho | Funções/papel consultados |
| --- | --- |
| `src/core/progress.ts` | parseProgressLine, applyProgressLine, ProgressLineDecoder, ProgressCollector, attachProgressToTicket |
| `src/contracts/schema.ts` | ProgressNode, JobProgress, QueueTicket e compatibilidade de schemas |
| `src/core/runner.ts` | runJob, finalProgress, closeRunningTicket, reconcileInterruptedJob, buildJobEnv |
| `src/core/state.ts` | atomicWriteJson, sidecar/history paths, ledger e readers |
| `src/core/worker.ts` | runWorker e fronteira de recovery/ownership |
| `backend/ci_queue_api/records.py` | progress_summary/public, lookup e projeção |
| `backend/ci_queue_api/projects.py` | _belongs_to_common/living_worktrees/resolve_repository e unlink |
| `ui/src/features/analysis/results-model.ts` | validação anterior ao ranking em visibleResultRows |
| `ui/src/features/analysis/analysis-page.tsx` | erro local com snapshot preservado |
| `ui/src/features/shared/progress-tree.tsx` | duração na árvore e slots compartilhados |
| `ui/src/features/shared/execution-stages.tsx` | duração na faixa horizontal |
| `ui/src/features/shared/format.ts` | formatDuration existente |
| `tests/core/progress.test.ts` | retry e remoção da duração anterior |
| `AGENTS.md`, `docs/CONTRACTS.md`, `package.json` | limites de propriedade, protocolo e comandos de verificação |

Links canônicos para recuperar código:

- [ProgressCollector e parser](https://github.com/nmarcofernandess/ci-queue/blob/829218cdcd4603fccc5bd3ee626ae2bcde7f1b61/src/core/progress.ts)
- [Tipos de contrato](https://github.com/nmarcofernandess/ci-queue/blob/829218cdcd4603fccc5bd3ee626ae2bcde7f1b61/src/contracts/schema.ts)
- [Runner e finalização](https://github.com/nmarcofernandess/ci-queue/blob/829218cdcd4603fccc5bd3ee626ae2bcde7f1b61/src/core/runner.ts)
- [Reader e projeção Python](https://github.com/nmarcofernandess/ci-queue/blob/829218cdcd4603fccc5bd3ee626ae2bcde7f1b61/backend/ci_queue_api/records.py)
- [Contratos atuais](https://github.com/nmarcofernandess/ci-queue/blob/829218cdcd4603fccc5bd3ee626ae2bcde7f1b61/docs/CONTRACTS.md)
- [Correção residual](https://github.com/nmarcofernandess/ci-queue/commit/829218cdcd4603fccc5bd3ee626ae2bcde7f1b61)
- [Gates Static do consumidor](https://github.com/dietflowoficial/Dietflow-app/blob/e0e65e8dfccb3612a00eb0bbd72b4e4a8978e609/scripts/ci-local.sh)
- [Emissor de estágio do smoke](https://github.com/dietflowoficial/Dietflow-app/blob/e0e65e8dfccb3612a00eb0bbd72b4e4a8978e609/scripts/ci/smoketest-local.sh)
- [Reporter Playwright](https://github.com/dietflowoficial/Dietflow-app/blob/e0e65e8dfccb3612a00eb0bbd72b4e4a8978e609/scripts/ci/playwright-progress-reporter.ts)
- [Configuração Jest](https://github.com/dietflowoficial/Dietflow-app/blob/e0e65e8dfccb3612a00eb0bbd72b4e4a8978e609/jest.config.cjs)

## 5. Fontes primárias de plataforma

- [Node: process.hrtime.bigint](https://nodejs.org/docs/latest-v24.x/api/process.html#processhrtimebigint): relógio de intervalo não ligado à hora civil. Fundamenta a escolha de monotônico; não é benchmark de precisão ou promessa uniforme de sleep/wake.
- [Node: child_process close](https://nodejs.org/api/child_process.html#event-close): close ocorre após encerramento do processo e fechamento dos streams. Fundamenta o flush antes do snapshot final.
- [Node: StringDecoder](https://nodejs.org/api/string_decoder.html): reconstrução de caracteres UTF-8 que atravessam chunks. A implementação pode usar stream.setEncoding com a mesma propriedade.

Essas APIs já pertencem ao runtime Node suportado. Não justificar um upgrade de Node, Jest, shadcn ou Playwright para acrescentar o relógio.

## 6. Procedência do pacote

Este pacote contém review e instruções, não um patch aplicado. O revisor consultou o Git e o relatório do operador. Não executou o serviço instalado em 8765 nem a suíte inteira da candidata nesta sessão.

A fixture temporal é sintética. Não contém logs reais, tickets reais ou cópias da auditoria de migração. A validação do ZIP confirma a existência e integridade dos anexos, não a implementação do recurso no produto.
