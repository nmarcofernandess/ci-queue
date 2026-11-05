# Contracts — formatos compartilhados

## Overview

Leitura de `main@b793ebbd14f9`. Tipos, normalização e validação; persistência e
supervisão pertencem a outros componentes. [Blueprint](../../EGM-CI.md).

## Interface

- [config.ts](config.ts): `parseQueueConfig`, `readQueueConfig` e
  `ResolvedQueueConfig` com catálogo, raiz do projeto e cwd de execução.
- [schema.ts](schema.ts): versões API/ticket, `QueueProjectConfig`,
  `QueueTicket`, finalização, progresso, identidades de processo e envelopes CLI.
- [runtime.ts](runtime.ts): `RuntimeReceipt` e contratos privados de sessão.
- [execution-observation.ts](execution-observation.ts):
  `parseExecutionObservation`, `observationId`, `observationPayloadSha256` e
  `toObservedHistoryRecord` para observações externas terminais.

## Invariants

- Catálogo schema 1 exige identidade, nome e presets/argv válidos. Preferência
  normalizada de execução aceita Queue; a API consumer resolve overrides
  direct/Queue separadamente. Aliases documentados de transição permanecem.
- `abortOnStaleBase` exige `fetchBase`; `pauseSafeNodes` exige progresso.
  `ship.acceptedPresets` exige receitas existentes e política de prova estável;
  representa OR, não uma sequência de checks.
- Snapshots `artifacts` só aceitam ausência ou lista vazia; publicação usa
  contrato de finalização canônico, digest, tamanho/prazo e caminhos relativos
  válidos. IO/containment continuam responsabilidade do supervisor.
- `note`, `guide` e instruções de ship são ensino do catálogo bruto. O parser
  do motor não converte prosa em política de seleção/cobertura.
- Observação externa aceita executor direct e terminal coerente; não cria
  ticket Queue nem prova de ship. Projeção indica log não coletado.
- Receipt Node declara cobertura cooperativa ou unconfigured. Handles privados
  de sessão não são argumentos públicos de shell.

## Side Effects

`readQueueConfig` lê disco e resolve paths; normalizadores/hashes não persistem
tickets ou observações. Não há início de serviço, execução de receita ou merge.

## Verification

`npm run test:core` e `npm run test:examples` são scripts configurados, não
executados. [CONTRACTS](../../docs/CONTRACTS.md) é o owner documental dos formatos.
