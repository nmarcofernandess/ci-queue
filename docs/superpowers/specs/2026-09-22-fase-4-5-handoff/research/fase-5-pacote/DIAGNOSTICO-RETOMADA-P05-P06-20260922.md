# P05/P06 — retomada verificada em 22/09/2026

Base consultada: DietFlow dev `a1870e03e`. Análise somente leitura; nenhum job, stack, instalação ou alteração de runtime.

## Correção do handoff

P01 não é apenas proposta. #1312 integrou 17 arquivos de instrumentação. `docs/ci/P01-MEDICAO-FINA-2026-09-21.md` documenta smoke 20260921231014-02d628ee passed e 75 medições. O código vivo confirma `performance-measurement.ts/.sh`, Prisma generate/normalize, MDX, Next typegen, tsc, seleção+execução Jest e preparo E2E/FlowUI. Não reinstrumentar o que já existe.

## Falha de durabilidade comprovada no caminho consultado

- Produtor: `scripts/ci/performance-measurement.ts:129`, em `$DIETFLOW_CI_RUN_DIR/diagnostics/performance-measurements.jsonl`.
- Catálogo: `ci-queue.json:394` copia artifacts/proofs, artifacts/flowui-ci, test-results e playwright-report; não artifacts/ci/runs.
- Consumidor: CI Queue `src/core/runner.ts:273` copia somente ticket.artifacts a partir do cwd.
- Histories 20260921231014-02d628ee e 20260922003509-e4822b1c preservam passed, log oficial e a lista acima. Os dois snapshots não contêm performance-measurements.jsonl. As duas worktrees de origem foram removidas.
- Isso comprova ausência nesses destinos; não afirma inexistência de qualquer backup em outro local.

Próximo corte prioritário: preservar somente o diagnóstico/receipt da execução corrente em destino já recolhido pela fila, com identidade do run e teste de durabilidade após remoção da origem. Não copiar toda a história artifacts/ci/runs por ticket, nem criar cleaner. Verificar primeiro os leitores/contratos antes de escolher o destino.

## P05

Não existe A/B causal demonstrado. O smoke P01 registrou Jest correlacionado ~80,9s; P03 eliminou uma repetição exata mantendo perfis separados. Comparar totais entre commits/populações diferentes não mede a economia.

A próxima observação deve aproveitar um smoke necessário após corrigir a durabilidade. Só então escolher um recorte estável e uma variável, se o Jest continuar dominando. Preservar no-sparkplug e política de workers. Sem piloto pesado enquanto 123 usa a stack.

## P06

P01 já cobre spans de MDX, migrate, seed, realtime, discovery, Chromium, Next build/start/health, Playwright e FlowUI. O smoke de P01 não prova esses caminhos E2E/FlowUI ao vivo. Usar o próximo focal necessário dos módulos para verificar os registros, sem inferir tempos puros dos envelopes antigos AP17.

Lacuna nominal remanescente: seleção/pretest/runner Jest ainda aparecem num envelope comum de smoketest; separar somente se a evidência justificar custo diagnóstico adicional.

## Q1

Nenhum byte físico foi medido nesta rodada. O snapshot da fila guarda cópias de artifacts/proofs, inclusive material que não foi produzido pelo smoke corrente. Isso exige inventário por produtor/leitor e comparação de hashes antes de qualquer conclusão sobre redundância ou descarte. Não há autorização de poda; ENOSPC não recebe causa por inferência.

## Estado

P05/P06 não estão concluídos. P01 existente confirmado; durabilidade do diagnóstico é o menor próximo problema concreto. A leitura exaustiva do inventário Q1 e eventual piloto continuam pendentes. Nenhum ganho temporal ou cura de SIGSEGV declarado.

## Amostra durável examinada — 22/09 04:14 UTC

Ticket `20260922023429-7ffcebb3`, HEAD `11fccd500`, smoketest passed. History: `~/.local/state/local-ci/queue/history/20260922023429-7ffcebb3.json`. Medições: snapshot do mesmo ticket, `artifacts/ci/queue-current/diagnostics/performance-measurements.jsonl` (75 registros). Log: `~/.local/state/local-ci/queue/logs/20260922023429-7ffcebb3.log`.

- Parede do worker: 463,720 s (7m43,7s), entre 02:36:59.201Z e 02:44:42.921Z.
- Envelope seleção+execução Jest: 161,395 s. Segunda invocação Jest: 11 suítes/285 testes, 150,95 s. A primeira: 2 suítes/20 testes, 0,63 s.
- Dentro da segunda invocação, `scripts/harness/__tests__/green-progress.test.ts`: **143,08 s**, aproximadamente 95% do tempo reportado dessa invocação. Isso localiza o primeiro candidato de perfil, mas não prova causa nem tempo economizável.
- Static: typecheck 91,823 s (contém tsc 83,694 s); lint-ratchet 53,996 s; fixtures-tsc 35,881 s; field-identity-ratchet 26,058 s; typecheck Storybook 21,870 s (contém tsc 17,541 s). Não somar pais e filhos.
- A leitura de `green-progress.test.ts` mostra fixtures Git reais via spawnSync, commits e chamadas a executeGreenProgress. Não foi medido quanto pertence a cada subprocesso, setup ou assert. Não trocar Git real por mocks nem remover oráculos para reduzir custo.
- CPU/RSS dos filhos indisponíveis no JSONL. Metadado de diretório de cache não mede bytes físicos nem prova cache quente.

### Menor próximo passo P05

Preparar um recorte da suíte green-progress pelo harness admitido, mantendo todos os seus casos, runtime/workers/flags e fixtures reais. Primeiro medir baseline por caso/setup/subprocesso sem tratamento; só escolher uma otimização após atribuir o custo. Usar janela serial após as validações necessárias de Dieta/Perfil. Nada de Full novo, mudança de no-sparkplug ou concorrência de stack. A amostra não é A/B e não demonstra recuperação do smoke histórico de 31 minutos.

### P06

Este smoke não executou E2E/FlowUI, logo não mede sua decomposição. Reaproveitar os próximos focais necessários dos módulos quando já incluírem P01/#1315; runs de branches anteriores não ganham retroativamente durabilidade. Q1 segue leitura de metadados, sem cleaner e sem scan recursivo concorrente.
