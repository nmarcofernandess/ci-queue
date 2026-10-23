# Runtime por job e sessão: pin opt-in

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

O hook terminal recuperável usa o mesmo binding Node do projeto e valida o
runtime da própria tentativa. Seu prazo é independente do teste; ele não cria
sessão permanente nem supervisor adicional. Sidecars `runtime/job-*`, inclusive
os usados pelo hook, são temporários do respectivo owner. O descarte exige
confirmação de término do grupo. Uma tentativa corrente mantém seu claim/lock;
resíduo ou ownership incerto histórico conserva diagnóstico sem bloquear drain
ou instalação. Não confunda esses sidecars com o owner de sessão viva abaixo.
Siga [CONTRACTS](CONTRACTS.md) para reentrada pública do mesmo ID.

## Instalação

O `--node` do LaunchAgent fixa o runtime da distribuição instalada; o manifest
confere launcher/worker/API/UI na mesma revisão e protocolo. Esse pin não fixa
automaticamente os filhos. Depois de instalar a
release, registre cada `projectId` que precisa do pin. Worker antigo ignora
`runtimes.json`; não deixe duas versões no mesmo state root.


## Sessão independente do job

A capability aditiva `node-runtime-session-v1` permite a um launcher nativo
manter um bundle próprio em `<state>/runtime/session-<sessionId>`. O builder é
o mesmo do job: Node registrado, verificação dos requisitos, shims, PATH
reconstruído e preload permanecem ativos. Não copia `runtime/job-*` e não
conserva referências a ele. A sessão pode iniciar filhos depois que o job
terminar e seu bundle temporário for removido. O consumidor continua dono do
lifecycle da stack; a Queue não conhece seu banco, portas ou política de dados.
Execução direct permanece no runtime estável do consumidor e não depende dessa
capability. Origem Queue inválida nunca autoriza reinterpretar a execução como direct.

O `RuntimeReceipt.requirementDigest` e a variável nativa
`CI_QUEUE_RUNTIME_REQUIREMENT_DIGEST` expõem o SHA-256 do JSON canônico dos
`RuntimeRequirement[]` resolvidos pelo builder, na sua ordem de leitura. Esse
digest é distinto de fingerprints de dados ou do ambiente do consumidor.
O consumidor recebe o valor, sem importar o código da Queue nem repetir seu
algoritmo. Prepare relê os requisitos reais e compara o receipt do ticket;
a string recebida não concede autoridade.

### Controle privado

Os três comandos recebem somente JSON por stdin. O launcher deve manter stdin
e stdout em pipes privados e não registrar o retorno de prepare, que contém
handle, token, env e diretório. Nenhum token entra em argv ou status:

```text
ci-queue runtime prepare-session --stdin --state STATE --json
ci-queue runtime checkpoint-session --stdin --state STATE --json
ci-queue runtime release-session --stdin --state STATE --json
```

Prepare recebe `projectId`, `ticketId`, `sessionId`, `producerStamp` e
`sessionStamp` (`pid`, `startedAt`), `requirementDigest` e
`launchBindingDigest`. Exige o contexto `job-env-v1`, ticket running persistido,
projeto correspondente, produtor/grupo vivo e launcher do mesmo UID na linhagem
do produtor; a chamada precisa estar na linhagem do launcher. O stamp usa o
nascimento observado por `ps`, não o horário escolhido pelo caller. Um sessionId
aceita letras, números, `_` e `-`, até 96 caracteres. O mesmo binding e os mesmos
stamps retornam o mesmo handle; divergência recusa sem substituir o bundle.

Checkpoint e release normais recebem o handle retornado. O produtor antigo
não precisa continuar vivo depois do prepare; o owner da sessão precisa estar
vivo, com stamp válido, e a chamada deve pertencer à sua linhagem. Checkpoint
consome somente os novos appends da evidência do guard; o registro conserva no
máximo 64 observações e 512 grupos únicos. O arquivo append-only é limitado a 16 MiB.
Use checkpoint nas fronteiras de claim/release, não como polling de observação.

O release valida os grupos registrados pelo guard e a ausência de filhos da
sessão, permitindo somente o owner e a cadeia da chamada de controle. Persiste
`closing` antes do efeito, remove apenas o bundle com UID/inode/device
confirmados e só então sela `released`. Reentrada normal devolve o mesmo receipt.
Grupos vivos, descendentes sem líder verificável, PID reutilizado, evidência
inválida ou bundle substituído impedem o ACK e preservam a manutenção bloqueada.

### Recuperação explícita

Um ator corrente, executado por runtime estável que não será apagado, envia:

```json
{
  "mode": "recover",
  "root": "/absolute/state",
  "operationId": "recovery-operation",
  "original": {
    "runtimeId": "session-example",
    "projectId": "example",
    "sessionId": "example",
    "bindingDigest": "<sha256 do binding original>",
    "expectedStateRevision": 1
  },
  "recoveryOwnerStamp": { "pid": 123, "pgid": 123, "startedAt": "<stamp observado>" }
}
```

A Queue lê seus próprios grupos; uma lista do caller não dá autorização. Sob o
DirectoryLock existente do registro, revalida UID, catálogo, bundle, binding,
revisão CAS e morte confirmada do produtor, owner e grupos originais. Persiste
a operationId e o ator antes de remover o bundle. Se o release normal já
persistiu closing e removeu o bundle antes de o owner morrer, essa autoridade
pode ser recebida pelo recovery sob o mesmo CAS e prova de grupos mortos;
a ausência isolada do bundle não concede autorização. Operações concorrentes não
selam dois resultados: outra operationId recebe BUSY/CAS. A mesma operação
reentra após falha; um novo ator só assume a autoridade ainda closing quando
a morte do ator anterior estiver confirmada. Uma operação já released devolve
o receipt durável sem repetir efeitos nem mudar a autoridade terminal.

`RuntimeReceipt.session` liga runtimeId e bindingDigest originais à revisão do
resultado, `disposition: released` e, em recovery, operationId, revisão original
e stamp do ator que concluiu. O consumidor valida essa ligação antes de compor
seu ACK; processos parados sem release confirmado da Queue continuam blocked.
O owner durável é `<state>/runtime-sessions/session-<id>.json`; não é necessário
que o bundle removido ou o produtor antigo executem outro comando.

### Observação e manutenção

CLI `status` e todas as views de `/api/status` acrescentam `sessionRuntimes`:
`projectId`, `sessionId`, `state` (`active`, `closing`, `unknown`), `pid`,
`startedAt`, `stateRevision` e `lastCheckpointAt` quando disponível. TS e Python
leem o mesmo owner privado; não projetam tokens, env, handle ou caminhos privados.
Registro ilegível, publicação incompleta ou owner morto/incerto permanece
`unknown`; um release confirmado desaparece da projeção. `globalOccupancy`
continua descrevendo apenas jobs, sem incorporar sessões.

Instalação, atualização e uninstall recusam sessões não liberadas, registros
incertos e locks de publicação. O estado released só é aceito com o owner
privado íntegro e bundle ausente, inclusive sem symlink quebrado. A identidade
histórica do catálogo pode diferir da atual nesse receipt terminal; essa
tolerância é exclusiva da manutenção, não do reader operacional nem das
operações de recovery/reentrada/descarte da sessão. Uma reserva de dados sem
processo não é uma sessão Queue e não bloqueia instalação. Inversamente, ausência de sessionRuntimes
não prova porta livre, ausência de sessão direct ou descarte de dados.

O guard continua sendo cooperação em espaço de usuário. Grupos Node observados
não representam cobertura completa de SO; os escapes descritos acima permanecem
fora da cobertura, inclusive para uma sessão.

## Configuração do consumidor no executor

Worker Node é o interpretador da distribuição; binding de jobs é opt-in.
Nenhum deles materializa a configuração do app. O shell que chama enqueue e o
worker iniciado pelo serviço são processos distintos. A receita usa o cwd real
do ticket e carrega somente configuração própria disponível nesse executor,
sem copiar dotenv de outro projeto ou registrar seus valores.

Use a API nativa compatível com a versão instalada. Next carrega `.env*` e expõe
`@next/env` para código fora de seu runtime; Vite usa arquivos por modo e
`import.meta.env`, com prefixo público próprio; Node oferece `--env-file` nas
versões que o suportam. Esses loaders têm regras próprias de precedência e de
exposição pública: não os substitua por `source .env` nem generalize opções de
Next para Vite. Consulte as fontes primárias da versão consumida:
[Next environment variables](https://nextjs.org/docs/app/guides/environment-variables),
[Vite env and mode](https://vite.dev/guide/env-and-mode),
[Node CLI env-file](https://nodejs.org/api/cli.html#--env-filefile).

O consumidor decide o lifecycle de outputs, temporários, dados e cache. Preserve
cache útil de dev/build; cache não é output selecionado nem resíduo que a Queue
deva apagar. Um build descartável precisa de política explícita no seu produtor,
sem timer, TTL global ou faxina manual como pré-condição do próximo comando.
