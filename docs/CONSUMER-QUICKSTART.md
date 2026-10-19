# Integrar um projeto ao CI Queue

Esta é a entrada genérica. Leia o **[manual HTML autocontido](GUIA-INTEGRACAO-CI-QUEUE.html)** para o passeio completo e o exemplo Static + Jest. O HTML abre offline, sem CDN; o GitHub exibe seu fonte. Contratos formais: [CONTRACTS](CONTRACTS.md). Instalação: [INSTALL](INSTALL.md).

Para decidir entre um reteste rápido e uma prova, siga o [método de feedback e
prova](TESTING-METHOD.md). Ele explica como adotar os
[templates](../templates/adoption/) sem inventar comandos para o consumidor.

## 1. Separe máquina, projeto e estado

Para usar CI Queue, a máquina precisa de uma release verificada, Node compatível e CLI/worker. As receitas precisam das dependências que seus comandos já usam. API Python e UI compilada são opcionais para o dashboard; Vite de desenvolvimento não precisa rodar na instalação. `gh` é necessário para ship GitHub, não para teste standalone. Sem CI Queue, o consumidor executa seus próprios comandos normalmente.

O projeto precisa do comando de teste verdadeiro e das dependências que ele usa. Para adotar CI Queue, acrescente o catálogo. O consumidor continua executando seus comandos sem a instalação ou o state da fila. O state pertence à máquina; ao usar Queue, confirme `installation.json` e use o mesmo state na CLI, worker e API.

## 2. Mantenha o comando independente; aponte a Queue se desejado

O catálogo aponta para comandos que já funcionam no projeto; CI Queue os executa com supervisão, fila e registros. Rodar o comando diretamente continua válido e não cria ticket nem prova reutilizável pelo ship genérico. Para exigir duas verificações, faça um agregador que execute ambas e preserve falhas. `acceptedPresets: ["lint","test"]` significa **OR**, não AND.

Mantenha o teste como uma única receita. Um teste avulso pode continuar mesmo que a base avance; não configure `fetchBase` ou `abortOnStaleBase` só para transformá-lo em prova. Se o repositório possui um ship próprio, esse processo pode aplicar flags estritas no enqueue da mesma receita, validar o ticket e revalidar HEAD/base antes do merge. O ship genérico atual lê as flags do catálogo e exige que as receitas aceitas já sejam ship-bound. O consumidor decide se um teste isolado é cancelável. O CI Queue executa as flags recebidas; não deduz intenção de ship pelo nome da receita ou pelo diff.

Sem `fetchBase`, enqueue pelo catálogo congela em SHA a base observada em
`repository.baseRef`, quando ela existe. HEAD pode estar atrás dessa base.
Avanço remoto só muda a tracking ref local quando algum processo a atualiza;
essa atualização durante o job isolado não muda sua base congelada. Branch,
HEAD e árvore continuam verificados por `requireGitStability`. Uma ref ausente
permanece observação ausente, sem inventar SHA ou prometer frescor remoto.
No enqueue explícito, o caller deve omitir `baseRef` ou fornecer o SHA observado
para isolamento; refs flutuantes permanecem sua escolha. Com `fetchBase`,
ancestralidade, fetch e verificações estritas de ship são preservados.

`WAIT_TIMEOUT` encerra a espera do cliente, não cancela o job. Consulte o mesmo
ticket antes de repetir ou cancelar; resultado ausente não significa PASS.

```bash
git remote -v
git branch --show-current
git status --short
# Base e argv devem existir no SEU projeto:
ci-queue init --cwd "$PWD" --name "Meu projeto" --base-ref origin/dev \
  --argv-json '["npm","run","check"]' --json
```

`init` não inicializa Git, não instala dependências, não inventa testes e não cadastra o projeto no dashboard. Pode declarar progress, mas não instrumenta o script. Preserve `project.id`. O catálogo precisa estar commitado em H antes do ship.

## 3. Atualize as instruções do consumidor

Antes do commit de adoção, atualizar **AGENTS.md ou seu alvo se symlink** e a **skill/instrução operacional versionada**. Registrar: entrada canônica; comando standalone; fila e state conferido; receitas aceitas; autorização de ship; progresso como aviso; fonte de diagnóstico. Evitar cópias paralelas. Se uma skill só existir fora do Git, entregar delta aplicável e caminho, sem alegar aplicação local.

Use `templates/adoption/AGENTS.fragment.md` como ponteiro e adapte
`templates/adoption/ci.yaml` para `.context/patterns/ci.yaml`. Mantenha
`feedback.available: false` até existir uma receita real no catálogo; então
aponte `method` para o procedimento do consumidor e registre seus comandos e
perfil. O mapa é navegação para humanos/agentes, não é lido pelo runtime. O
catálogo `ci-queue.json` continua sendo a autoridade de receitas, flags e
artefatos. A skill curta de adoção está em `templates/adoption/SKILL.md`.

## 4. Enfileire no state correto

```bash
PROJECT="$PWD"
STATE="$HOME/.local/state/ci-queue" # substituir pelo state instalado conferido
ci-queue config --cwd "$PROJECT" --config "$PROJECT/ci-queue.json" --json
ci-queue enqueue check --cwd "$PROJECT" --config "$PROJECT/ci-queue.json" \
  --state "$STATE" --json
ci-queue status --state "$STATE" --json
ci-queue logs TICKET_ID --state "$STATE" --json
```

Use o ID real retornado. Não execute um segundo `worker` após enqueue: na instalação macOS ele é on-demand. Fila vazia sem processo worker pode ser saudável. `--wait` e seu timeout não cancelam o job. Cancelamento explícito: `ci-queue cancel TICKET_ID --state "$STATE" --json`.

### 4.1 Guard opcional de entrada

O consumidor pode usar o guard para um comando que, por decisão própria, deva aceitar somente uma execução Queue válida. Isso é uma política explícita do consumidor; não é requisito para adotar CI Queue nem para executar suas receitas normalmente:

```bash
# humano (stderr): diagnóstico legível
ci-queue guard --cwd "$PROJECT" --config "$PROJECT/ci-queue.json" --state "$STATE"
# máquina: acrescente --json (envelope em stdout)
```

O comando `guard` valida a associação com um ticket em execução e pode retornar `QUEUE_REQUIRED` fora desse contexto. Não enfileira automaticamente. O worker injeta `CI_QUEUE_JOB_ID` / aliases. Scripts que não adotam essa política não precisam chamar o guard.

No Project Manager, confira e registre pasta/catálogo para inventário e histórico filtrado. Running e fila permanecem globais. Binding Node em `runtimes.json` é separado do cadastro; ver [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md).

### 4.2 Observação terminal opcional (sem enfileirar)

Quando um comando roda diretamente e o consumidor quer que o Histórico mostre esse fato, ele pode publicar metadados na CLI instalada. Exige capability `execution-observe-v1`. Isso **não** executa trabalho, **não** cria ticket e **não** autoriza ship:

```bash
# observation.json: schema execution-observation-v1 (kind, projectId, executionId,
# status terminal, timestamps, recipe, cwd, headSha, …). Sem argv bruto nem logPath
# absoluto inventado — ver CONTRACTS.
ci-queue observe --stdin --json --state "$STATE" < observation.json
ci-queue history --include-observed --project PROJECT_ID --state "$STATE" --json
```

Reimportação do mesmo `projectId`+`executionId` é idempotente. CLI antiga sem a capability: falhe fechado ou ignore conforme a política do consumidor; o produto não inventa bypass. Análise/Meta/Últimos verdes/prova de ship **não** contam observações.

## 5. Ship começa depois da autoria

Árvore limpa; HEAD publicado; PR aberto na base correta, preferencialmente draft; catálogo em Git; identidade API/Git adequada. O genérico não tem classificador automático de docs-only.

```bash
# Inspeção: não enfileira, não atesta, não marca ready e não mergeia.
ci-queue ship --cwd "$PWD" --config "$PWD/ci-queue.json" \
  --state "$STATE" --dry-run --no-remote --json
```

Sem prova reutilizável, o dry-run retorna `LOCAL_RED`. Isso é esperado: não cria uma prova. A execução real abaixo só deve ocorrer após autorização de merge:

```bash
ci-queue ship --cwd "$PWD" --config "$PWD/ci-queue.json" \
  --state "$STATE" --no-remote --json
```

O ship reusa uma receita elegível de `ship.acceptedPresets`; se nenhuma existir, enfileira a **primeira**. Não há AND entre os nomes. Ele confere HEAD/base e PR antes da prova, valida preflight/postflight do ticket, revalida antes do merge e inspeciona o resultado. Base movida, prova inválida ou veredito remoto negativo encerram o fluxo sem promover a mudança. `abortOnStaleBase` pode encerrar o job durante a execução quando o worker comprova base obsoleta; o consumidor deve exigir a capability instalada se essa interrupção fizer parte de sua política de ship. O worker nunca mergeia e `passed` sozinho não dispara ship. A UI não tem botão de merge. O repositório pode implementar esse mesmo ciclo no seu próprio comando de entrega, sem depender do dashboard nem do controller genérico.

## 6. Remoto opcional e limites

Arquivo `remote-verdict.json` ao lado do catálogo: `wait|skipped`; ausente significa wait. Wait exige `ship.remoteVerdict.workflow` e `job`. `--no-remote` força skipped, não corrige JSON inválido nem dispensa prova/identidade/HEAD/base/PR. `init --workflow` copia verificador de attestation, não uma suíte de testes remota. O verificador deve existir na base que o workflow fará checkout; verificar isso na primeira adoção.

Garantia: **HEAD pinado, base observada**. Revalidação antes e inspeção depois não são lock atômico H+B. `MERGED_BASE_CHANGED` exige inspeção, não novo merge cego. Nenhum `--admin`, status manual ou ticket fabricado.

**DietFlow não fez cutover.** Continua `npm run ship` em `scripts/ship/ship.ts`, com seu arquivo de política em `scripts/ship/remote-verdict.json`; leia a [entrada consumidora](https://github.com/dietflowoficial/Dietflow-app/blob/dev/docs/ci/CI-QUEUE-CONSUMIDOR.md).

## Caso de consumidor: DietFlow e portabilidade

O [mapa de portabilidade do DietFlow](https://github.com/dietflowoficial/Dietflow-app/blob/dev/docs/harness/MAPA-CLOUD-PORTABILIDADE.md) preserva resultados Mac/Cursor/Codex, limites de backend e hipóteses de retomada. O mapa aponta de volta a este quickstart. São evidências e contratos do consumidor; CI Queue não instala o backend, não concede capacidade Docker/rede, não exige uma conta GitHub nominal e não certifica o produto por executar seu comando. Contratos genéricos da fila permanecem nesta documentação.
