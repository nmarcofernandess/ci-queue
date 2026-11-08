# Consumer — ensino e resolução de executor

## Overview

Leitura de `main@b793ebbd14f9`. API CommonJS leve, sem importar o motor;
[blueprint](../EGM-CI.md).

## Interface

- [index.cjs](index.cjs) / [index.d.cts](index.d.cts): API v1,
  `CONSUMER_FEATURES`, `selectExecutor`, `detectQueueHost`, `resolveExecutor`,
  `appendRecipeArgs`, `buildGuide` e `formatGuide`.
- [CLI consumer](../bin/ci-queue-consumer.cjs): `guide [--json]` e
  `inspect <receita> [--executor direct|queue] [-- extras]`.
  Procura `ci-queue.json` nos ancestrais do cwd. Inspect retorna `started:false`,
  argv, escolha/motivo e próximo comando; erros retornam exit 2.
- `buildGuide` lê `presets.*.note`, `guide.verify/notes` e
  `ship.command/notes` diretamente do catálogo e informa declarações ausentes.

## Invariants

- `resolveExecutor`: explícito → ambiente `CI_QUEUE_EXECUTOR` → direct quando
  o catálogo prefere Queue e o host informa instalação ausente → preferência
  configurada → direct. `selectExecutor` legado não conhece o host.
- `detectQueueHost` consulta executável, `CI_QUEUE_STATE_DIR` ou installation
  metadata conhecida. State configurado não exige existência comprovada do
  diretório; presença de instalação não comprova serviço saudável.
- `appendRecipeArgs` copia tokens e acrescenta separador quando necessário;
  não interpreta shell nem altera o comando para executá-lo.
- Guide/inspect não validam recursos da receita, outputs, elegibilidade ou
  protocolo vivo do worker. Instalar o pacote não instala a distribuição.

## Side Effects

Leitura de catálogo, paths/permissões e ambiente; stdout/stderr e exitCode na
CLI. Não inicia, repete, certifica ou cancela jobs.

## Verification

`npm run test:examples` é o script configurado para exemplos, incluindo
`tests/examples/consumer-entry.test.mjs`. Apenas identificado, não executado.
[Quickstart](../docs/CONSUMER-QUICKSTART.md) mantém a instrução de adoção.


## Execution description extension

`buildExecutionDescription` / `formatExecutionDescription` validate and format
consumer facts without I/O. Unknown selection differs from observed zero;
units/profiles/attempts remain separate. Inspect emits structured nextArgv when
guide.verify is an array, with ship guidance separate. Contract: docs/CONTRACTS.md.
