# Runtime por job: pin opt-in

Estado: **camada 1 — hardening de espaço de usuário, não isolamento de SO**.
`verified` significa que os processos observados concordaram com o Node registrado.
Não significa que toda a árvore de descendentes foi mediada.

## Contrato

O consumidor declara requisitos em `package.json#engines.node`, `.nvmrc` e/ou
`.node-version`. O operador registra a instalação local em:

```text
<state-root>/runtimes.json
```

A chave é o `projectId` do ticket. Não há campo de runtime em `ci-queue.json`.

Sem entrada para aquele projeto, o job permanece `unconfigured`: herda o
ambiente legado e executa o argv como hoje. Com entrada, o runner reconstrói
PATH, instala shims de `node`/`npm`/`npx`/`bash`/`sh`/`zsh`, injeta um preload
e grava um receipt.

```bash
ci-queue runtime show --state "$CI_QUEUE_STATE_DIR" --json
ci-queue runtime register --project PROJECT_ID --node /absolute/node --state "$CI_QUEUE_STATE_DIR" --json
```

`--node` tem de ser o executável absoluto da distribuição (por exemplo o Node
24.20 de `dietflow-runtime`). Não use `command -v node` se o PATH do shell
puder apontar para outra major.

## Falhas com binding

| Situação | Resultado |
| --- | --- |
| Node/CLI ausente | `RUNTIME_NOT_INSTALLED` |
| Versão real ≠ versão exata registrada | `RUNTIME_VERSION_MISMATCH` |
| Range do checkout incompatível | `RUNTIME_REQUIREMENT_MISMATCH` |
| Login/interativo no argv estruturado | recusa antes do spawn |
| Processo observado com outro execPath | `RUNTIME_PROCESS_MISMATCH`; ticket não fica verde |
| PATH efetivo escolheria outro `node` | `RUNTIME_PATH_MISMATCH` |

Um `.nvmrc` incompatível com `engines.node` é intersectado, não priorizado.
Aliases `lts/*` são recusados. Login shell só é recusado com binding ativo.

## Limite reproduzido

```bash
bash -c '/usr/bin/env -i /absolute/other-node -e "/* trabalho */"'
```

O descendente limpa o ambiente e chama outro Node absoluto. O código desse
Node executa. O ticket pode terminar `passed` com `runtime.state=verified`,
porque o launcher observado concordou e o filho não carregou o preload.
Esse teste existe para impedir um badge de isolamento absoluto.

Outros riscos no mesmo UID: shells absolutos aninhados, `NODE_OPTIONS`
substituído, evidência reescrita, binário trocado durante o job.

## Evidência

O JSON autoritativo é `history/TICKET_ID.json` (`runtime`). A linha `[runtime]`
no log mostra seleção e cobertura. O Dashboard não ganhou card dedicado;
`passed` sozinho não prova pin.

Sidecars em `<state-root>/runtime/job-*` são removidos depois que o history
é autoritativo.

## Instalação

O `--node` do LaunchAgent fixa o worker, não os filhos. Depois de instalar a
release, registre cada `projectId` que precisa do pin. Worker antigo ignora
`runtimes.json`; não deixe duas versões no mesmo state root.
