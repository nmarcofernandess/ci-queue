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
`executionTimeoutMs` e `progress`. A fonte tipada é `src/contracts/schema.ts`;
o leitor valida `src/contracts/config.ts`.

`ci-queue enqueue <preset> --config /projeto/ci-queue.json --state /estado`
cria o ticket. `--wait` espera um terminal; terminar o cliente não cancela o job.
`status`, `history [--project ID] [--legacy]`, `preset-history`, `logs <id>` e
`cancel <id>` são operações da CLI. `--json` responde com
`{ apiVersion: 1, ok, result|error }`. A CLI de logs é leitura local integral;
o browser usa trechos limitados e redigidos. Ausência de log é erro, não sucesso
vazio. `version --json` identifica capabilities; na distribuição, o launcher
acrescenta a revisão do manifest.

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

A API lê fatos por projeto: status, executions, preset-history, remote-slots,
job, log, diagnostic, worktrees, analysis e dashboard-state. Fila/running de
outro projeto só produzem ocupação global, não links inacessíveis. Histórico
legado sem atribuição fica em bucket explícito. Instalação descreve a atribuição
por commit comprovado e seu rollback; nenhum reader adivinha origem pelo path.

O verde local exige receita atual, argv idêntico, projeto, passed, exitCode 0 e
nenhum custom/extraArgs. Git é somente um espelho de resumo publicado pelo
consumidor, sem logs ou histórico completo; a leitura não dispara rede. CLI e
HTTP têm implementações próprias, com testes de paridade de fatos.

Meta é um único objetivo editável por projeto, sem SHA informado. Pendências
são recomendações readonly geradas por `advisory upsert`, idempotentes por
projeto/preset/PR; nunca bloqueiam o executor ou o merge. A resolução exige um
verde canônico posterior cuja revisão contenha a recomendada. Somente Meta e
Abrir pasta têm mutações no dashboard; loopback, origem, CSRF e IDs observados
protegem ações nativas, que usam argv fixa sem shell.

Análise agrega todos os terminais retidos no período. Duração usa verdes da
receita atual com início e duração válidos. Máquina publica somente disco livre
atual. Não existe causalidade inferida de RAM/OOM, catálogo de Problemas ou
histórico de recursos neste MVP.
