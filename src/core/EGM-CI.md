# Core — fila, processos, runtime e finalização

## Overview

Leitura de `main@b793ebbd14f9`. Fronteiras de execução; métricas, UI e todos os
detalhes de instalação ficam fora. [Blueprint](../../EGM-CI.md).

## Interface

- [enqueue.ts](enqueue.ts): `buildTicket`, `enqueueTicket`,
  `enqueueExplicitTicket` congelam identidade, argv, flags e finalização.
- [worker.ts](worker.ts): `runWorker` drena um state root ou reconcilia um ID;
  [runner.ts](runner.ts): `claimQueuedTicket`, `runJob`, `closeRunningTicket`,
  cancelamento e reconciliação. Worker não reconsulta o catálogo do consumidor.
- [state.ts](state.ts): paths, publicação atômica, fila/história e locks;
  [process.ts](process.ts): observação de identidade e grupos, término verificado.
- [completion.ts](completion.ts): `readExecutionSource` e
  `executionCompletion` juntam terminal e finalização.
- [finalization.ts](finalization.ts): hook posterior ao produtor, timeout e
  recuperação próprios. Não reexecuta teste nem substitui o writer consumidor.
- [execution-entry.ts](execution-entry.ts): `evaluateExecutionEntry`, guard
  opt-in da política Queue; admite Actions ou contexto Queue correspondente.
- [runtime.ts](runtime.ts) / [runtime-guard.ts](runtime-guard.ts):
  registro/binding Node, recibo e bundles privados de execução/sessão.
- [pause.ts](pause.ts) e [spend-abort.ts](spend-abort.ts): pausa segura e
  observação de base remota conforme flags/capacidades declaradas.

## Invariants

- `acquireRunnerLock` serializa worker por state root, não toda a máquina.
  `acquireDirectoryLock` usa mkdir/owner PID; não oferece sozinho identidade
  temporal completa. Worker/runner acrescentam stamps, reserva persistida e
  reconferência de posse antes de lançar. Locks de ticket/finalização são distintos.
- Claim move queued para reserva/running; história existente impede relançamento.
  História terminal persistida é autoridade e não é sobrescrita por outra candidata.
  Preflight e estabilidade Git são aplicados conforme flags, não universalmente.
- `buildJobEnv` herda ambiente do processo executor e injeta o protocolo.
  Ticket não transporta snapshot arbitrário do ambiente do caller. A origem
  material do ambiente do worker fica fora deste recorte.
- `observeProcessGroup` distingue vivo, morto e incerto com host/PID/nascimento;
  zombies não contam como executáveis. Término só sinaliza grupos verificados.
  Recuperação não é uma garantia idealizada: `reconcileInterruptedJob` ainda
  consulta PID do worker e pode registrar cleanup bloqueado.
- Terminal prioriza cancelamento/interrupção/timeout/falha. Verde não substitui
  finalização: `executionCompletion` junta digest dos bytes terminais e contrato
  do hook; quando exigido, ACK passed/exit 0 íntegro participa da elegibilidade.
- Finalizador relê fonte terminal e verifica contrato, produtor e ownership.
  Recuperação contratada retoma o journal idempotente; não reinicia o teste.
  Incerteza pode preservar runtime/recursos. `runWorker` registra bloqueios de
  finalização, sem tratá-los como veto geral a todo próximo claim.
- Binding Node é opt-in. Sem registro, recibo é unconfigured. Com binding,
  runtime sanitiza controles reservados, reconstrói ambiente/shims e valida argv;
  opções de `env`, inclusive `-u`, não são aceitas nesse caminho atual.
  Guarda cobre processos cooperantes; não é isolamento do sistema operacional.
- Sessão de runtime exige ticket running, protocolo/linhagem e autoridade
  privada. Release/recovery dependem de grupos/identidades e estado durável.
- Pause exige folhas permitidas e ausência de Git; resume não desfaz pausa
  manual automaticamente. Aborto por stale-base só ocorre com flag e observação
  remota conhecida; desconhecimento de rede/base conserva execução.

## Side Effects

Grava jobs, claims, running, história, logs redigidos, progresso, ownership,
locks e finalizações no state. Lança grupos de processos no cwd consumidor,
prepara bundles Node e pode enviar sinais verificados. Flags de base podem
fazer fetch e criar/remover refs de observação. Hooks executam argv do consumidor
e limpam transitórios apenas com posse suficiente; não fazem merge por conta do core.

## Verification

`npm run test:core` é configurado para Vitest de core, excluindo testes evidence;
`npm run test:runtime` faz build e testes de runtime. Apenas identificados;
nenhum worker/ticket ou comando de validação foi iniciado neste bootstrap.
Veja [contratos](../contracts/EGM-CI.md) e
[isolamento](../../docs/RUNTIME-ISOLATION.md).
