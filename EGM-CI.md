# CI Queue — blueprint atual de execução e integração

## System Overview

Bootstrap EGM temático em 05/11/2026 por leitura de
`main@b793ebbd14f99381fe144a9ee5bb9c5f5e72b083`, versão 0.2.0.
Descreve as fronteiras de CI existentes; não documenta toda a UI, instalação ou
análise histórica. Nenhum teste, serviço, worker ou job foi iniciado.

O produto é independente dos consumidores. Estes possuem catálogo, receitas,
preparo e critérios de produto. A distribuição operacional executa a fila;
o pacote npm também expõe uma entrada leve de ensino, sem instalar o worker.
Fontes: [package](package.json), [AGENTS](AGENTS.md) e
[índice documental existente](docs/README.md).

## Interface

| Fronteira | Contrato documentado | Entrada |
|---|---|---|
| Ensino e escolha do executor | [Consumer](consumer/EGM-CI.md) | `./consumer`, `ci-queue-consumer guide/inspect` |
| Formatos e validação | [Contracts](src/contracts/EGM-CI.md) | Catálogo, ticket, runtime, finalização e observações |
| Execução e supervisão | [Core](src/core/EGM-CI.md) | `src/cli.ts` → enqueue/worker/runner |
| Integração | [Ship](src/ship/EGM-CI.md) | Controlador separado do worker |
| Leitura HTTP e ações locais | [API](backend/ci_queue_api/EGM-CI.md) | `server.py`, records e adapters nativos |

[src/cli.ts](src/cli.ts) oferece init, guard, ship, enqueue, finalize, worker,
status, observe, history, runtime e operações de controle. O launcher operacional
[bin/ci-queue.mjs](bin/ci-queue.mjs) carrega a distribuição compilada e confere
manifest quando presente. `package.json#bin` publica somente
`ci-queue-consumer`; o worker não aparece por consequência de instalar essa entrada.

## Invariants

- `consumer/index.cjs:resolveExecutor` resolve escolha sem executar trabalho;
  detecção de instalação não é diagnóstico de saúde ou recurso livre.
- `src/contracts/config.ts` valida catálogo do consumidor; ele conserva os owners
  de preparo/seleção/produto. Os contratos não importam regras clínicas.
- `src/core/worker.ts` e `src/core/runner.ts` supervisionam processos/terminal/finalização;
  não fazem merge GitHub. `src/ship/ship.ts` coordena integração separadamente.
- O estado em arquivos sustenta projeções da API. `records.py:globalOccupancy`
  inclui queued e running; sua leitura não adquire o lock da execução.
- O runtime Node é binding opt-in e guarda cooperativa de reprodutibilidade;
  não é sandbox do sistema operacional (`src/core/runtime-guard.ts`).

## Side Effects

CLI/worker persistem e supervisionam execuções; runtime pode criar bundles e
receipts; API abre socket, lê estado e oferece writers locais protegidos;
ship usa Git/GitHub e pode solicitar merge. A entrada consumer apenas lê
catálogo/host e imprime dados. Instalação e release têm owners próprios em
[INSTALL](docs/INSTALL.md) e não foram executados pelo bootstrap.

## Verification

Scripts configurados, não executados: `npm run test:examples`,
`npm run test:core`, `npm run test:backend`, `npm run test:runtime`.
O último faz build; `check` é campanha mais ampla e não foi utilizado.
Ver [quickstart](docs/CONSUMER-QUICKSTART.md), [formatos](docs/CONTRACTS.md) e
[limites de runtime](docs/RUNTIME-ISOLATION.md) para os owners normativos.

## Scope and provenance

Mapa temático dos componentes listados, sem censo de todos os arquivos do repo.
READMEs e políticas existentes foram preservados. Este retrato não aprova
hipóteses de consumidor, instalação efetiva, sucesso de testes ou elegibilidade
real de uma candidata.
