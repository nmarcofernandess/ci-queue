# Projeto exemplo

Este diretório é um consumidor mínimo do CI Queue. Ele não importa o produto,
não depende do DietFlow e não instala um serviço. Os comandos abaixo aceitam
`ci-queue` do `PATH` ou, num checkout do produto, `node ../../bin/ci-queue.mjs`.

```bash
export CI_QUEUE_STATE_DIR="$(mktemp -d)"
export QUEUE="ci-queue"
# Em um checkout: export QUEUE="node ../../bin/ci-queue.mjs"
```

## Êxito, falha e espera

Cada `enqueue` só grava o ticket. O worker é quem drena a fila.

```bash
$QUEUE enqueue success --cwd . --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE enqueue failure --cwd . --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE enqueue wait --cwd . --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE status --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE worker --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE history --project ci-queue-example --state "$CI_QUEUE_STATE_DIR" --json
```

O histórico contém um ticket `passed`, um `failed` com saída 7 e um `passed`
depois da espera curta. O worker continua depois de uma falha.

## Cancelamento

```bash
$QUEUE enqueue cancel --cwd . --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE worker --state "$CI_QUEUE_STATE_DIR" --json &
WORKER_PID=$!
$QUEUE status --state "$CI_QUEUE_STATE_DIR" --json
# Copie o id do ticket running retornado por status.
$QUEUE cancel <ticket-id> --state "$CI_QUEUE_STATE_DIR" --json
wait "$WORKER_PID"
```

O ticket termina como `cancelled`; o worker encerra o grupo de processo que ele
criou, sem depender deste README ou do checkout consumidor.

## Interrupção e recuperação

```bash
$QUEUE enqueue interrupt --cwd . --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE worker --state "$CI_QUEUE_STATE_DIR" --json &
WORKER_PID=$!
# Aguarde status indicar running e simule morte abrupta do supervisor:
kill -KILL "$WORKER_PID"
$QUEUE worker --state "$CI_QUEUE_STATE_DIR" --json
$QUEUE history --project ci-queue-example --state "$CI_QUEUE_STATE_DIR" --json
```

O worker seguinte reconcilia o ticket abandonado e o registra como
`interrupted`; não adota o subprocesso de forma silenciosa.
