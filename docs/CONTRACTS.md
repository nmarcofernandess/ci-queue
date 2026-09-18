# Contratos e operação

O produto possui fila, supervisão, armazenamento, API e UI. O consumidor possui
receitas, preparação, testes e política de aprovação. Configuração mínima e
comandos executáveis estão no [exemplo independente](../examples/local-project/README.md).
Instalação e recuperação ficam em [INSTALL](INSTALL.md); superfícies no
[contrato da interface](ui/PRODUCT-CONTRACT.md).

## Configuração e execução

`ci-queue.json` usa `schemaVersion: 1`, `project: { id, name }` estável e
`presets: { nome: { argv: [...] } }`. `repository.path` é resolvido relativo ao
arquivo; `repository.baseRef` define a comparação Git. Flags de receita opcionais:
`requireCleanTree`, `fetchBase`, `requireGitStability`, `pinHeadSha`,
`executionTimeoutMs`, `progress` e `abortOnStaleBase`. O bloco opcional `ship`
declara `acceptedPresets`, `attestationContext` e, se houver wait remoto,
`remoteVerdict.{workflow,job}`. A fonte tipada é `src/contracts/schema.ts`;
o leitor valida `src/contracts/config.ts`. Início zero-to-ship:
[CONSUMER-QUICKSTART](CONSUMER-QUICKSTART.md).

`ci-queue enqueue <preset> --config /projeto/ci-queue.json --state /estado`
cria o ticket. `--wait` espera um terminal; terminar o cliente não cancela o job.
`status`, `history [--project ID] [--legacy]`, `preset-history`, `logs <id>` e
`cancel <id>` são operações da CLI. `--json` responde com
`{ apiVersion: 1, ok, result|error }`. A CLI de logs é leitura local integral;
o browser usa trechos limitados e redigidos. Ausência de log é erro, não sucesso
vazio. `version --json` identifica capabilities; na distribuição, a CLI
informa a revisão e o digest do manifest adjacente ao runtime. No checkout sem
manifest esses campos são null; nunca são inferidos do Git ou do cwd.
A capability `node-runtime-guard-v1` anuncia o pin opt-in de Node por
`projectId` em `<state-root>/runtimes.json`. Sem entrada, o job permanece
`unconfigured`. Com entrada, o receipt em `history/<id>.json` registra o
executável, a versão e as observações. `verified` cobre processos observados,
não a árvore inteira. Detalhe: [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md).
`ci-queue runtime show|register` grava o registry; não coloque o pin em
`ci-queue.json`.

Tickets v1/v2/v3 permanecem legíveis. `jobs/` contém a espera, `running.json`
a reserva ativa e `history/` os terminais. O único worker reivindica a fila sob
lock; o runner possui o grupo de processos. Cancelamento e timeout usam identidade
de processo, não busca por nome. Reserva órfã termina interrompida sem adotar a
execução; limpeza incerta bloqueia o próximo claim, preservando o diagnóstico.
Não remova locks para forçar um segundo executor.

`logs/<id>.log` é append-only durante a execução. `progress/<id>.json` é o
sidecar atômico, incorporado ao ticket terminal. Temporários reconhecidos,
antigos e sem produtor vivo são movidos para `jobs-rejected/`; arquivos não
reconhecidos e processos vivos são preservados. Não há expiração automática
nova para logs ou artifacts. O consumidor declara os artifacts; sua política de
retenção não foi redesenhada neste corte.

## Progresso sem dependência de biblioteca

A receita com `progress: true` pode emitir linhas TSV em stdout:

```text
@@ci-queue-progress<TAB>1<TAB>node<TAB>id<TAB>parentId-ou--<TAB>kind<TAB>status<TAB>durationMs-ou--<TAB>label
@@ci-queue-progress<TAB>1<TAB>counts<TAB>id<TAB>kind<TAB>completed<TAB>total<TAB>passed<TAB>failed<TAB>running<TAB>pending<TAB>skipped
```

`<TAB>` significa um tab literal. `@@local-ci-progress` continua aceito.

### Duração dos nós (etapa 2)

Campos opcionais e retrocompatíveis em cada nó de progresso:

- `durationMs` — inteiro ≥ 0; **0 é valor real** quando o emissor o publica.
- `durationSource` — `emitter` (valor do TSV) ou `collector` (intervalo monotônico `running→terminal` observado pelo coletor).
- `durationUnavailableReason` — ausência honesta: `missing-start`, `collector-restarted`, `clock-invalid`, `missing-end`.

Precedência: valor explícito do emissor vence, inclusive 0. Sem duração no terminal, o coletor mede se viu um `running` contínuo na mesma tentativa; caso contrário publica reason, nunca inventa 0. Pai não é soma dos filhos. Retry mantém a duração da tentativa atual/última. Árvore, faixa, API, CLI e diagnóstico preservam os mesmos campos.

IDs são estáveis dentro do job. Tipos de nó: stage, group, gate, suite, case,
artifact; estados: pending, running, passed, failed, skipped. Contadores são
inteiros não negativos: passed + failed + skipped = completed e
completed + running + pending = total. Tipos de contador: gates, suites, cases,
artifacts, items. Duração ausente permanece ausente. Emita o pai antes dos filhos.

O collector deriva `retryCount` quando **o mesmo ID** transita failed → running.
Repetição de running não incrementa; passed não apaga o fato. Não crie um nó por
tentativa. A UI mostra Flaky detectado na execução atual, histórico e drawer,
mas o exit code do runner continua soberano. O consumidor que proíbe verde após
retry deve configurá-lo em seu próprio test runner. O protocolo não decide merge.

## Leitura e ações

A API lê fatos por contexto de requisição: `projectId`, `context=all` ou
`context=unassigned`. Os três são mutuamente exclusivos. `projectId=all` continua
sendo um identificador de projeto válido; a vista Todos é só `context=all`.
Pedido sem `projectId`/`context` cai no bootstrap; omitir a query **não** é Todos.
Não existe `activeProject` mutável no servidor.

Execução atual e fila são ocupação da **máquina**: `running` e `queued` em
`/api/status` são globais em qualquer filtro, com `projectName` no ticket.
Histórico, worktrees e análise seguem o filtro (`project` | `all` | `unassigned`).
Meta, pendências, últimos verdes Git, preset-history, remote-slots e
dashboard-state exigem um projeto concreto; em Todos ou sem projeto esses
modos não misturam.

Detalhe de um ticket (`/api/job`, log, export, diagnostic) lê por `jobId` e
**não** recorta pelo filtro da request. O eco de `context` permanece o da
request. Listas continuam filtradas. Órfãos sem `projectId` só entram na lista
unassigned.

Histórico sem `projectId` comprovado fica no arquivo separado. O cadastro local
mora em `state/projects.json` e não controla a fila. Instalação descreve a
atribuição por commit comprovado e seu rollback; nenhum reader adivinha origem
pelo path.

`GET /api/worktrees?context=all` agrega os projetos ativos do cadastro, marca
cada linha com o dono e conserva erro factual por projeto. Reveal e
worktree-view em Todos exigem o `projectId` do dono da linha.

Análise de Resultados em um projeto agrega todos os terminais retidos daquele
projeto no período, inclusive nomes históricos. Em Todos, agrupa
`(projectId, preset)` com `projectName` e não mistura órfãos. Duração usa verdes
da receita atual com início e duração válidos e um único preset declarado; em
Todos o par é `projectId:preset` (UUID + `PRESET_NAME`) e preset solto é 400.
Unassigned permanece `PROJECT_REQUIRED` na análise. Máquina publica somente disco
livre atual. Não existe causalidade inferida de RAM/OOM, catálogo de Problemas ou
histórico de recursos neste MVP.

O verde local exige receita atual, argv idêntico, projeto, passed, exitCode 0 e
nenhum custom/extraArgs. Git é somente um espelho de resumo publicado pelo
consumidor, sem logs ou histórico completo; a leitura não dispara rede. CLI e
HTTP têm implementações próprias, com testes de paridade de fatos. `ci-queue ship`
reutiliza o ticket terminal que o worker gravou; last-green e o nome da receita
não são prova. Worker e runner não importam `src/ship` e não chamam merge no
GitHub. O merge, quando o operador pede `ship`, é PUT REST com `sha` = HEAD
congelado e `merge_method=merge`; a base é observada antes e inspecionada
depois (`guarantee: head-pinned-base-observed`). Não há transação atômica H+B.
`MERGED_BASE_CHANGED` significa que o merge ocorreu sobre outro primeiro pai.

Meta é um único objetivo editável por projeto, sem SHA informado. Pendências
são recomendações readonly geradas por `advisory upsert`, idempotentes por
projeto/preset/PR; nunca bloqueiam o executor ou o merge. A resolução exige um
verde canônico posterior cuja revisão contenha a recomendada. Meta, Abrir pasta e o cadastro local de projetos têm mutações no dashboard;
loopback, origem, CSRF e IDs observados protegem ações nativas, que usam argv
fixa sem shell. GET nunca escreve o registry. `repositoryPath` é localizador, não identidade.
Cadastro e bootstrap persistem a worktree principal do Git (o checkout do
clone, em qualquer branch) quando o common-dir lista uma árvore viva. Leitura
resolve pasta e catálogo por `gitCommonDir` se o path gravado sumiu. Não se
assume o nome de branch `main`. O probe inspeciona só a pasta
escolhida, sem rede Git, hooks ou execução de receita. Procurar pasta ou
arquivo abre o diálogo nativo do host (`POST /api/project-pick`); o campo
continua colável. O input file do browser não é tratado como caminho absoluto.
Cancelar a escolha não escreve o registry.

Análise de Resultados agrega todos os terminais retidos do projeto no período,
inclusive nomes históricos, e devolve contagens por preset. Duração usa verdes
da receita atual com início e duração válidos e um único preset declarado.
Máquina publica somente disco livre atual. Não existe causalidade inferida de
RAM/OOM, catálogo de Problemas ou histórico de recursos neste MVP.
