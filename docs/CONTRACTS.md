# Contratos do CI Queue

A entrada de adoção é [CONSUMER-QUICKSTART](CONSUMER-QUICKSTART.md); exemplos completos e diagramas estão no [manual offline](GUIA-INTEGRACAO-CI-QUEUE.html). Código e testes prevalecem sobre snapshots históricos.

## Fronteiras

O consumidor declara preparação, receitas, test runners e política. Seus comandos permanecem executáveis sem CI Queue; ao ser escolhida, a Queue executa argv no cwd, supervisiona processos, conserva registros e projeta observabilidade. O worker/runner nunca importa `src/ship` nem mergeia. O ship genérico é um controller separado; `passed` não o dispara. Dashboard não tem botão de merge.

Fonte do formato: `src/contracts/schema.ts` e `config.ts`. Tickets v1/v2/v3/v4 continuam legíveis segundo o parser; tickets novos usam schemaVersion 4. API pública/CLI: apiVersion 1. Catálogo: schemaVersion 1. Versão do protocolo progress é outro eixo: 1.

## Catálogo

| Campo | Contrato / leitor |
|---|---|
| `project.id` | Identidade estável, não derivada de display name. Enqueue a persiste; ship genérico e leitores scoped a validam. |
| `project.name` | Apresentação; renomear não cria outra série histórica. |
| `repository.path` | Localizador relativo ao arquivo de catálogo; define executionCwd. Não é scanner recursivo nem nome da branch principal. |
| `repository.baseRef` | Base observacional: enqueue por catálogo sem `fetchBase` congela o SHA resolvido quando disponível; com `fetchBase`, mantém a ref estrita. |
| `presets.<nome>.argv` | Vetor não vazio de strings válidas. Não é shell-string. Extras alteram a execução canônica. |
| `requireCleanTree` | Árvore limpa no preflight. |
| `requireGitStability` | Verde exige snapshot Git pré/pós estável. |
| `pinHeadSha` | HEAD no início precisa corresponder ao congelado no enqueue. |
| `fetchBase` | Ref não vazia, buscada/provada pelo runner. |
| `executionTimeoutMs` | Prazo opcional positivo de execução, limitado pelo parser; armado após captura de identidade do processo. Não é timeout de espera da CLI. |
| `abortOnStaleBase` | Política de gasto do worker; true exige fetchBase. Base remota comprovadamente não ancestral pode encerrar com `stale-base`. Observação indisponível não prova stale. |
| `progress` | Declaração da receita, persistida em `flags.progressEnabled`; nunca gate de ship. |
| `artifacts` | Compatibilidade de adoção: somente ausência ou `[]`. Nova seleção global, por receita ou CLI é recusada com orientação de migração para `finalization`. Tickets antigos mantêm os campos históricos, mas o worker novo nunca copia arquivos. |
| `finalization` | Hook obrigatório quando presente: `schemaVersion: 1`, `argv` não vazio, `timeoutMs` inteiro de 1 a 2.147.483.647, `contract` JSON finito até 64 KiB UTF-8 e `contractDigest` SHA-256 canônico. O enqueue congela o hook e seu `finalizationDigest` no ticket v4; o worker não relê o catálogo. |
| `note` | Documentação, não política executável. |
| `ship.acceptedPresets` | Lista não vazia/única de receitas existentes e ship-bound. É OR; sem prova reutilizável usa a primeira. |
| `ship.attestationContext` | Contexto remoto da atestação do ship genérico. Não é nome de teste. |
| `ship.remoteVerdict` | Workflow/job esperados quando policy=wait. Não configura teste clínico nem classificador por diff. |

Uma receita aceita por ship precisa de `requireCleanTree=true`, `requireGitStability=true`, `pinHeadSha=true` e `fetchBase` não vazio. Para exigir A **e** B, criar agregador no consumidor e aceitar esse agregador. Não ensinar `[lint,test]` como AND. CI Queue não exige que receitas importem helpers, consultem tickets ou publiquem observações para concluir com sucesso.

Avançar a base remota não recusa automaticamente uma receita sem `fetchBase`; o consumidor escolhe sua política de cancelamento. Ship é uma decisão separada e fica fora da fila que ele supervisiona: o controller genérico lê as flags ship-bound do catálogo; um ship próprio pode enfileirar a mesma receita, validar o ticket e revalidar HEAD/base. Não cadastre o próprio controller como job na fila que ele aguarda. A interface não participa da elegibilidade. Se o consumidor exige interrupção durante a prova quando a base avança, precisa enviar `abortOnStaleBase` e conferir `spend-abort-v1` na instalação; preflight/postflight e revalidação de ship continuam necessários.

`init` preserva ou cria a identidade e resolve receita/base; não inicializa Git, não instala dependências, não instrumenta scripts e não escreve o cadastro local do dashboard. `init --workflow` copia workflow/verificador de attestation, não suíte remota. Catálogo e política devem estar em H para ship.

## Fila, registros e comando

`ci-queue enqueue <preset> --config /projeto/ci-queue.json --state /estado` congela o pedido. O worker é dono do claim e executa argv/cwd do ticket, não relê internals de DietFlow. Estados: queued, running, passed, failed, cancelled, interrupted. Exit code, runtime e verificações Git podem determinar falha; progress não fabrica sucesso.

### Finalização terminal (`terminal-finalization-v1`)

A CLI mantém API 1 e anuncia `terminal-finalization-v1`,
`no-artifact-snapshots-v1` e `v4-ticket-read`; não anuncia `recipe-artifacts-v1`.
Um worker antigo recusa tickets v4. O consumidor deve conferir as capacidades
antes do enqueue e a identidade efetiva do worker antes de produzir outputs.

O catálogo declara `presets.<nome>.finalization`; o enqueue explícito aceita
`--finalization-json` com o mesmo objeto. `--artifacts-json` aceita somente `[]`
durante adoção. A Queue não interpreta o domínio do contrato nem publica no Git.
O hook recebe argv congelado, sem interpolação de shell, e prazo próprio.
Ausência de hook não exige arquivos de finalização.

`contractDigest` é SHA-256 do contrato serializado com chaves de objeto ordenadas
recursivamente e ordem de arrays preservada. `finalizationDigest` usa a mesma
serialização sobre o objeto completo `FinalizationSpec`, incluindo argv, prazo
e digest do contrato. Valores não JSON, ciclos e números não finitos são inválidos.

O resultado do teste após postflight permanece imutável em `history/<id>.json`.
O supervisor é o único writer de `state/finalization/<id>.json`: fase
pending/running/passed/failed/interrupted, identidade temporal do grupo, tentativa,
digests e resultado. O hook entrega `FinalizationResult` schema 1 com
`cleanup` confirmed/not-required/uncertain e `outputs` como referências
`{path, sha256, role}` relativas ao cwd do consumidor; não entrega mídia ao state.
A validação do resultado (até 64 KiB), supervisão e recuperação pertencem ao
supervisor. A finalização não converte teste reprovado em aprovado.

Antes de publicar history, o runner preserva sua candidata terminal em running
(ou no claim de cancelamento queued) e cria pending. O `ticketDigest` sela os
bytes reais de `history/<id>.json`; a recuperação nunca reescreve esse terminal
nem repete o teste. Só o pending ainda não iniciado pode reconciliar seu digest
com os bytes efetivamente publicados. Um protocolo recusado ou de schema futuro
não autoriza executar hook durante a recuperação.

O hook recebe `CI_QUEUE_FINALIZATION_INPUT`, caminho de
`state/finalization/<id>.input.json`, contendo schemaVersion 1, ticketPath,
ticketDigest, finalizationDigest, contract, resultPath e workerIdentity. Ele grava
atomicamente seu resultado em resultPath. Input/result são transitórios,
removidos pelo supervisor após consumo; o registro e o log são duráveis.
`state/worker.json`, o envelope e `CI_QUEUE_WORKER_IDENTITY` expõem a identidade
real do supervisor (host, PID, nascimento por ps e capacidades); variáveis
herdadas não criam autoridade de execução.

O runner permanece serializado durante o hook. Cancel nessa fase registra a
solicitação e deixa publicação/cleanup encerrar sob o prazo independente. Grupo
vivo ou ownership incerto preserva reserva e razão visível; PID reutilizado ou
host divergente nunca autoriza sinalização. Depois de morte comprovada, cada
acionamento pode reentrar uma vez no hook idempotente do consumidor, que decide
sua transação/journal. Falha terminal sem produtor vivo/incerto libera a fila.

## Método de teste adotado pelo consumidor

O método de feedback/prova e seus templates de adoção estão em
[TESTING-METHOD](TESTING-METHOD.md). O mapa do consumidor é apenas navegação;
`ci-queue.json` continua sendo a autoridade executável de receitas, flags e
finalização. `feedback.available: false` significa que não existe receita de
feedback adotada. Feedback não é prova final nem entra em ship por progresso;
`ship.acceptedPresets` continua definindo as receitas aceitas, com semântica
OR.

State: `jobs/`, `running.json`, `history/`, `logs/`, `artifacts/`, `progress/`, `observations/`. Registro terminal em history é autoritativo para tickets de fila. Sidecar progress é consolidado no ticket ao fim e removido. Logs usam o caminho do ticket. `artifacts/` conserva somente snapshots históricos: não há novas cópias nem limpeza automática desses dados. Ausência de log é indisponibilidade, não conteúdo vazio bem-sucedido.

O state explícito/ambiente deve ser o mesmo da API/worker. Sem override, o caminho compatível `~/.local/state/local-ci/queue`, se presente, é preservado; não criar outra fila ao copiar um comando de instalação nova. O launcher instalado exporta `CI_QUEUE_STATE_DIR` para o state registrado; CLI, worker e API leem o mesmo root.

`--wait` e seu timeout não cancelam o job. `cancel` é explícito e segue ownership do processo. Um worker por state. Worker on-demand ausente enquanto a fila está vazia pode ser saudável. Não apagar locks ou sinalizar PID sem identidade para forçar recuperação.

CLI JSON usa `{apiVersion, ok, result}` ou `{apiVersion, ok:false, error}`. Comandos reais vivem em `src/cli.ts`: version, config, init, enqueue, worker, status, history, observe, preset-history, logs, cancel, runtime, advisory, guard e ship. `guard` é opcional e só impõe admissão quando o consumidor decide invocá-lo; não é requisito das receitas nem da adoção. Não inventar `ci-queue doctor` ou `logs --follow`; o wrapper DietFlow oferece seu próprio follow.

### Observações de execução directa (`execution-observe-v1`)

Capability anunciada em `ci-queue version --json`. Publicação:

```bash
ci-queue observe --stdin --json < observation.json
ci-queue history --include-observed --project PROJECT_ID --state "$STATE" --json
```

Schema: `src/contracts/execution-observation.ts` (`kind=ci-execution-observation`, schemaVersion 1). Grava em `<state>/observations/`; **não** cria ticket, **não** toca `jobs/` / `running.json` / `history/` de fila, **não** controla o processo da receita e **não** é prova de ship, Meta, last-green nem advisory. `history` sem `--include-observed` permanece só tickets. A superfície humana do Histórico une tickets e observações; contagens de Análise/prova continuam só com tickets. Observação sem log local do produto é ausência legítima — o consumidor publicou metadados, não stdout bruto.

## Progress TSV v1

Separador é TAB real, não espaços ou caracteres literais barra-t. O manual contém blocos copiáveis com TAB.

```text
prefix TAB 1 TAB node TAB id TAB parentId-ou-- TAB kind TAB status TAB durationMs-ou-- TAB label
prefix TAB 1 TAB counts TAB id TAB kind TAB completed TAB total TAB passed TAB failed TAB running TAB pending TAB skipped
```

Prefixos: `@@ci-queue-progress` e legado `@@local-ci-progress`. Node tem 9 campos; counts tem 12. IDs usam letras, números, `_ . : -`; mantenha identidade estável. Emita pai antes do filho e nó antes de counts. Tipos: stage/group/gate/suite/case/artifact. Estados de nó: pending/running/passed/failed/skipped, não cancelled/interrupted.

Counts: inteiros não negativos; `completed = passed + failed + skipped`; `total = completed + running + pending`. Tipos de contagem: gates/suites/cases/artifacts/items. Linhas inválidas ou counts sem nó não são prova. O collector não deduz pai, resultado, total ou duração pela soma dos filhos.

`prefix TAB 1 TAB variant TAB focal` é a confirmação tardia e opcional de um recorte de população pelo produtor durante o próprio ticket. Só o token `focal` é aceito nesse evento: `custom` deve ser declarado no enqueue. O worker associa a linha ao ticket que está executando; o sidecar projeta o badge live e o registro terminal conserva a confirmação. O evento não altera status, contadores, argv ou elegibilidade de ship. Um ticket legado continua sem badge; uma descoberta falha não emite confirmação.

`progress-q2q3-v1` anuncia o contrato completo de inventário, retries omitidos, variante e projeção live. O consumidor que depende dele confere a capability e o manifest instalado antes do enqueue. Na instalação, confira também a revisão efetiva do worker e da API.

`prefix TAB 1 TAB replace-children TAB ownerId` substitui somente os descendentes ainda pendentes do owner estrutural. O collector preserva filhos de outro owner e recusa substituir resultados observados; remove o detalhe antigo do owner e marca `inventoryReplaced=true`. O produtor usa o evento quando o inventário antecipado difere da população real do `onBegin`, antes de publicar os novos nós e contadores. A árvore mostra “Inventário atualizado na execução”; casos removidos não viram passed nem skipped.

`prefix TAB 1 TAB retries TAB ownerId TAB count` registra a quantidade de casos com retry fora do detalhe materializado. O valor é um inteiro não negativo por owner e não altera o veredito nem cria caso ou tentativa fictícia. `hasRetries` combina esse resumo com `retryCount` dos nós visíveis, inclusive na projeção live e no terminal.

Na projeção live, `roots` inclui o detalhe da própria raiz e `active` continua limitado aos contextos estruturais running. `planned` conserva até 32 descendentes estruturais pending com contagens válidas e `rootId`; a faixa pode mostrar um denominador conhecido antes da corrida sem promover pending a running. A árvore completa permanece no detalhe do ticket.

Emissão é cooperativa: worker sobrescreve `LOCAL_CI_PROGRESS_ENABLED` com 1 somente quando a flag persistida é true e informa job id/aliases. Collector ingere linhas independentemente da declaração. API deriva `progressEnabled` top-level de `job.flags.progressEnabled is True`; não expõe flags/argv inteiros. Drawer atual prioriza o aviso se não declarado, mesmo se linhas foram capturadas. Declarado sem nós mostra ausência de publicação; no terminal pode haver apenas Artefatos, o que não prova instrumentação da receita.

Copy de configuração, variante default:

- **Progresso contínuo não configurado**
- **Esta receita não declara progresso contínuo. Os estágios da execução não aparecem.**

Aviso não altera status, failureReason ou elegibilidade. Ticket legado sem flag é false; não reescrever histórico para remover aviso. FailureReason continua objeto separado.

### Duração e retry

Fonte: `src/core/progress-timing.ts`. Duração explícita do emissor prevalece; zero só quando medido. Collector usa observação monotônica running→terminal do mesmo ciclo e a UI a apresenta como aproximada. Ausência não vira zero: missing-start, missing-end, collector-restarted ou clock-invalid. O relógio decorrido do browser é outro dado, não duração de nó nem ETA.

Failed→running no mesmo ID incrementa retry observado. Repetir running não é retry. A duração representa a tentativa corrente, não soma de tentativas. O projeto decide política de flaky e o exit code; collector/UI não inventam verde.

## Ship e prova material

Fontes: `src/ship/eligibility.ts`, `ship.ts`, `system-ops.ts`. A tupla inclui projeto, cwd absoluto normalizado lexicalmente, HEAD, base, receita/argv e flags materiais. Não prometer resolução de symlink pelo helper que usa `path.resolve`.

Prova exige queue/legado compatível, passed/exit0, timestamps, prazo coerente, ausência de custom/extraArgs, flags fetch/clean/stability/pin/timeout e snapshots Git limpos/iguais. Progress, runtime receipt e abortOnStaleBase não são requisitos de elegibilidade.

Por receita, considerar a tentativa canônica **terminal** mais recente por startedAt (fallback createdAt, desempate id). Failed/cancelled/interrupted posterior impede reutilizar verde anterior dessa receita. Queued/running não sombreiam. O genérico percorre acceptedPresets na ordem e reusa a primeira receita cujo latest é elegível; sem prova pode reusar pending correspondente ou enfileirar [0]. O DietFlow tem seleção entre receitas própria; não presumir implementação idêntica.

Política adjacente `remote-verdict.json`: wait/skipped, ausente=wait. Wait requer remoteVerdict configurado. `--no-remote` dispensa espera remota, não prova/PR/identidade/base. JSON inválido continua erro. Dry-run lê e não enfileira, atesta, marca ready, despacha ou mergeia; leitura Git pode atualizar refs. Não é prova de merge.

Autoria ocorre antes: commit/push/PR. Ship congela H/B0/catálogo, obtém prova, atesta, marca ready, espera remoto se aplicável, revalida e integra. Worker jamais faz esses passos. O template genérico verifica attestation; não executa testes como fallback.

Garantia: **head-pinned-base-observed**, não lock atômico H+B. PUT de merge leva sha=H; revalidar B0 antes e inspecionar pais/árvore depois. `MERGED_BASE_CHANGED` pode significar merge já realizado: inspecionar antes de repetir. Sem admin/status manual/ticket fabricado.

## Multi-projeto e UI

Cadastro local: `<state>/state/projects.json`; runtimes: `<state>/runtimes.json`; atribuição legada: `<state>/state/legacy-projects.json`. São autoridades diferentes. Registry usa gitCommonDir e `git worktree list`, não busca recursiva em pasta pai. Main worktree não significa branch main. Se common-dir vive, outro checkout pode permitir recuperação; se o clone inteiro mudou, relocalização explícita é necessária.

Histórico, Worktrees, Análise, Meta, Pendências e Últimos verdes aceitam projeto/Todos para leitura. Running e Fila são globais. Abrir ticket de B com A selecionado não troca A. `context=all` é modo; `projectId=all` é ID literal. Todos agrega somente projetos ativos e preserva projectId/projectName e falhas por projeto; não cria catálogo, Meta ou receita global. Mutations de Meta continuam project-scoped: exigem um projectId concreto escolhido localmente no drawer. Pendências continuam somente leitura; verdes canônicos usam a receita atual do projeto dono. Sem projeto mantém legado separado, sem atribuição inferida. Ampliar o Histórico humano com observações **não** altera o denominador das análises de tickets/greens nesta entrega.

## Runtime Node

`node-runtime-guard-v1` é opt-in por projectId. Sem binding: unconfigured, ambiente legado. `runtime show` lê; `runtime register` escreve registry local. Node do worker não fixa todos os filhos. Requisitos versionados e detalhes do PATH/shims/preload/receipt e escape env-i estão em [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md). Verified cobre processos observados, não sandbox.
