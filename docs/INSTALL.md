# Instalação e verificação local

Uma release é uma pasta autocontida com JavaScript compilado, backend Python de biblioteca padrão, UI estática e manifest. Não aponta para checkout de desenvolvimento, symlink de lane ou dependência file:. Binários Node/Python do host são fornecidos separadamente. Entrada de adoção: [CONSUMER-QUICKSTART](CONSUMER-QUICKSTART.md); roteiro ilustrado: [manual offline, capítulo 9](GUIA-INTEGRACAO-CI-QUEUE.html#instalacao).

## Publicar dev e promover main neste repositório

A publicação usa PR e `ci-queue ship`. O catálogo deste repositório possui
`check` para a base dev e `check-main` para a base main. Ambos executam o mesmo
check integral com árvore limpa, HEAD pinado e estabilidade Git. A prova de uma
base não substitui a da outra.

Na branch candidata publicada, abra a PR para dev e execute:

```bash
ci-queue ship --cwd "$PWD" --config "$PWD/ci-queue.json" --pr <PR-para-dev> --json
```

Depois do merge observado em dev, use o checkout limpo e atualizado de dev,
abra a PR dev → main e produza a prova da promoção explicitamente:

```bash
ci-queue enqueue check-main --cwd "$PWD" --config "$PWD/ci-queue.json" --wait
ci-queue ship --cwd "$PWD" --config "$PWD/ci-queue.json" --pr <PR-para-main> --json
```

O ship reutiliza somente a prova elegível do mesmo HEAD e da base da PR. Sem
prova elegível, usa a primeira receita aceita, `check`, cuja base é dev. Por
isso a promoção para main exige o enqueue explícito de `check-main`. Se HEAD
ou main avançar, reconcilie a candidata e renove a prova exigida.

Produza o bundle na base integrada autorizada, atualizada e limpa: dev para
atualização de desenvolvimento; main somente quando a promoção estiver
autorizada. A autorização de publicação, promoção e instalação vem do pedido
do operador; uma prova verde não autoriza essas etapas por si só.

## Bootstrap excepcional de um corretivo da própria Queue

O caminho normal permanece ship → bundle da base integrada → update. Se a
instalação antiga bloquear o check/ship pelo gate histórico retirado, use esta
exceção somente no fechamento autorizado, depois da autoria e dos reviews:

1. Mantenha a candidata limpa, commitada e publicada, com HEAD/base registrados.
2. Execute `npm run check` integral diretamente nessa candidata e receba PASS.
   Esse resultado aprova a ativação provisória; não substitui o ticket do ship.
3. Produza e verifique o bundle oficial da mesma revisão. Use o instalador
   corrigido contido nele para ativá-lo provisoriamente no mesmo prefixo/state.
   Preserve o bundle anterior, ownership e sessões vivas. Confira o catálogo
   efetivamente usado pelo serviço e forneça seu caminho absoluto por `--config`,
   junto com Node, Python e comando; `--activate` não recupera o catálogo sozinho.
4. Confira a revisão instalada e execute o ship canônico, produzindo seu ticket
   real elegível. Depois do merge observado, produza e ative o bundle do dev
   integrado e confira novamente a revisão efetiva.

Release e installer aceitam uma revisão candidata íntegra sem gate por branch.
A candidata provisória não está integrada por isso. Não use attestation isolada,
edição de history/locks, troca de state ou outro worker para fechar o círculo.
Se a base avançar, reconcilie e renove a elegibilidade exigida. Rollback usa o
instalador oficial compatível e o bundle preservado; não suponha que o instalador
antigo aceite o mesmo resíduo. A rota não autoriza promoção main/PROD.

## Produzir e verificar

No checkout autorizado para produzir a release:

```bash
npm run release:bundle
node scripts/release.mjs verify --bundle releases/ci-queue-<versão>-<revisão>
```

Use o bundle efetivamente produzido, não um nome inventado. Manifest registra versão, revisão Git, protocolo e hashes. Launcher, worker, API e UI possuem stamps em `build-provenance/`, com a revisão e o inventário exato de cada build. `npm run build` sela runtime/API e `npm --prefix ui run build` sela UI; `release:bundle` executa ambos. Empacotar exige os quatro stamps na mesma revisão e rejeita bytes antigos ou misturados, mesmo se o manifest anunciar a revisão nova. O protocolo instalado exige API1/ticket4 e as capabilities `terminal-finalization-v1`, `no-artifact-snapshots-v1`, `recoverable-finalization-v1` e `node-runtime-session-v1`. Build, cópia, ativação e prova instalada são etapas diferentes. Uma revisão documental não autoriza nenhuma delas.

Adoção standalone, escolha do executor e configuração do consumidor seguem
[TESTING-METHOD](TESTING-METHOD.md); Node do worker e binding opt-in dos jobs são
contratos distintos em [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md). Instalar a Queue
não carrega os arquivos de ambiente do app nem transfere caches para o state.

## State único e preparação

Prefixo usual: `~/.local/share/ci-queue`. State novo usual: `~/.local/state/ci-queue`; instalação existente pode usar `~/.local/state/local-ci/queue`. Leia `installation.json` e mantenha o state real da máquina, CLI, worker e API. Não criar outra fila por copiar o exemplo.

No macOS, `ci-queue` sem argumentos abre o dashboard em `http://127.0.0.1:8765/dashboard` no navegador padrão. O serviço do dashboard precisa estar ativo; os subcomandos continuam encaminhados à CLI.

O launcher escrito em `~/.local/bin/ci-queue` (ou `--command`) exporta `CI_QUEUE_STATE_DIR` para o state passado em `install`/`update` quando a variável ainda não está no ambiente. Assim `observe`, `history`, worker e API usam o mesmo root — inclusive `<state>/observations/` — sem depender do fallback legado.

Sem `--activate`, o instalador copia/registra a release, sem provar serviços carregados:

```bash
node /bundle/scripts/install.mjs install \
  --bundle /bundle --prefix "$HOME/.local/share/ci-queue" \
  --state /caminho/absoluto/do/state
```

Antes de ativar/atualizar/remover: nenhum executor concorrente. O instalador verifica running, runner lock, claims, reservas e identidade do worker, além das sessões privadas descritas abaixo. Esses owners correntes protegem a manutenção. Finalização histórica pending/running/interrupted, recovery blocked, cleanup uncertain ou fonte ausente/inválida não comprovam execução corrente e não bloqueiam a atualização por si. O instalador preserva esses arquivos sem percorrer suas fontes; não certifica a publicação nem concede replay ou remoção daquele ID. Os guards de fonte, digest, geração e writer continuam nas operações do ticket. Não apague locks ou registros para ultrapassar a proteção dos owners correntes.

O executor antigo usava proper-lockfile com um alvo vazio em
`locks/jobs/YYYYMMDD-HHMMSS-6hex.state` ou `validation-plan.state`. A reserva real
ficava no diretório adicional `.state.lock`. O instalador reconhece somente
esses alvos regulares, vazios, com um único link e pertencentes ao usuário atual.
Eles permanecem intactos durante install/update/uninstall. Diretórios de lock,
reservas `.lock`, nomes desconhecidos, conteúdo, symlinks e hardlinks continuam
bloqueando a manutenção. Essa compatibilidade não dispensa conferir fila quieta
e ausência de executores antigos; idade ou tamanho isolados não provam inatividade.

Para uma finalização recuperável, use `ci-queue finalize <id> --state <root> --json`. O comando pode recusar o replay daquele ID por fonte ou ownership incerto, conservando diagnóstico e resíduo; isso não impede os próximos jobs nem exige cirurgia manual para instalar uma atualização. A tentativa corrente mantém claim/runner lock até seu término delimitado. O comando não autoriza matar outro owner, refazer testes ou editar o terminal histórico.

## macOS: ativação na sessão

```bash
node /bundle/scripts/install.mjs update \
  --bundle /bundle \
  --prefix "$HOME/.local/share/ci-queue" \
  --state /caminho/absoluto/do/state \
  --config /projeto/ci-queue.json \
  --node /caminho/absoluto/da/distribuicao/bin/node \
  --python "$(command -v python3)" \
  --command "$HOME/.local/bin/ci-queue" --activate
```

Use `install` na instalação inicial e `update` na atualização conforme o instalador da release. `--node` fixa o **worker**, não automaticamente os jobs. Registre os projectIds que precisam de pin usando `ci-queue runtime register`; [limites do runtime](RUNTIME-ISOLATION.md).

Launcher e envelopes pinam `CI_QUEUE_MANIFEST_PATH` e seu SHA-256. A CLI verifica o bundle antes de carregar o worker; a API confere seus próprios bytes e a UI servida contra o mesmo inventário. `version --json` e `/build.json` expõem revisão/protocolo para conferir a distribuição efetiva. Worker recebe state e executa tickets completos; dashboard recebe catálogo de bootstrap, UI, manifest e state. A interface instalada é estática servida pela API, não o Vite de desenvolvimento.

## Ignição e login: o que o código garante e o que verificar

O envelope do worker usa QueueDirectories para jobs e executa sob demanda. Fila vazia sem PID de worker pode ser normal. O dashboard tem envelope separado. Não iniciar outro worker porque não há processo idle.

O instalador observado gera envelopes sob a release e chama `launchctl bootstrap` no domínio GUI da sessão. Isso comprova o mecanismo de ativação **no código**, não comprova retorno após logout/login/reboot em uma máquina concreta. Esta reconciliação não observou boot nem state do Mac. Não declarar login automático provado com base em checkout ou receipt antigo.

Roteiro local de verificação:

```bash
ci-queue version --json
ci-queue status --state /caminho/absoluto/do/state --json
curl --fail --silent --show-error http://127.0.0.1:8765/health
curl --fail --silent --show-error http://127.0.0.1:8765/build.json
launchctl list | grep 'com.nmarcofernandess.ci-queue'
```

Conferir CLI, installation.json, manifest/revisão de `/build.json`, paths dos envelopes e o mesmo state. Enfileirar um teste pequeno verdadeiro autorizado, observar resultado e retorno a ocioso. Depois de novo login, repetir a verificação. Se os serviços não voltarem, registrar achado do instalador com os envelopes observados; não criar daemon improvisado no consumidor.

Falha em bootstrap retorna erro e não prova serviço saudável, mesmo quando installation.json já mudou. Verificar os serviços e repetir a operação documentada quando a fila estiver quieta. Preservar bundle anterior para recuperação; não remover histórico, `observations/` ou subir executor concorrente. Rollback/update troca a release ativa; o state (tickets, logs, observações, cadastros) permanece no path registrado.

## Remoção e recuperação

Com autorização e ownership conferidos, o instalador da release remove somente seu envelope/release, preservando state:

```bash
node "$HOME/.local/share/ci-queue/releases/<versão>-<revisão>/scripts/install.mjs" \
  uninstall --prefix "$HOME/.local/share/ci-queue" --deactivate
```

Não expirar/remover logs para “consertar” UI lenta. Jobs órfãos são reconciliados pelo único executor com verificação da identidade do grupo de processos. Não matar por PID sem identidade nem apagar running/locks manualmente.

## Históricos sem projectId

Não atribuir pela pasta. O helper confere commit no repo escolhido e grava somente `state/legacy-projects.json`, com evidência e digest, preservando os tickets:

```bash
node scripts/legacy-projects.mjs --state /estado --repo /projeto --project PROJECT_ID
```

Primeiro inspecionar sem `--apply`. Aplicação é mutação explícita, com fila quieta e decisão do operador. Registros sem evidência permanecem em Histórico sem projeto. Remover o ledger reverte atribuição, não apaga histórico.

## Testes isolados não provam a instalação

`tests/examples/init-ship.test.mjs` usa Git/HOME/state temporários e GitHub simulado. Browser tests usam API fixture. Nunca escrevem na fila do operador. Um teste do produto no checkout, um ticket real instalado e uma verificação de novo login são evidências diferentes. Não rodar suites longas somente por alteração destas docs.


### Sessões que sobrevivem ao job

Fila sem running/queued não basta para manutenção. O instalador lê também o
owner privado em `runtime-sessions/`: sessões active/closing e registros ou
locks incertos recusam install/update/uninstall, mesmo com o job já terminal.
Não apague o owner/bundle por idade ou por ausência de um PID. Confirme o release
pelo controle privado do launcher ou pelo recovery com binding, CAS e grupos
validados, usando runtime corrente. O receipt released fica durável para
reentrada; somente seu bundle é removido.

`ci-queue status --state STATE --json` e a API mostram `sessionRuntimes` sem
segredos. `globalOccupancy` conserva o significado de jobs; uma projeção vazia
não prova portas livres nem ausência de sessões direct. Dados apenas reservados
não bloqueiam instalação. O [contrato de runtime](RUNTIME-ISOLATION.md#observação-e-manutenção)
define identidade, limites e recuperação. Capability no código ou bundle staged
não prova instalação/ativação dessa revisão, nem habilita o consumidor por si.
