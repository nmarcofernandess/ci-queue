# Instalação do CI Queue

Cada release é uma pasta autocontida com runtime compilado, backend Python de
biblioteca padrão, interface estática e `manifest.json`. A instalação nunca
aponta para checkout de desenvolvimento, symlink ou dependência `file:`.

## Produzir e verificar uma release

No checkout que será publicado:

```bash
npm run release:bundle
node scripts/release.mjs verify --bundle releases/ci-queue-<versão>-<revisão>
```

O manifest registra versão, revisão Git e SHA-256 de cada arquivo distribuído.
Verifique-o antes de instalar uma release recebida.

## Preparar uma instalação

O bundle contém o instalador que o acompanha. Sem `--activate`, o comando apenas
copia e registra a release; esse modo permite validar uma atualização em
diretório isolado antes do cutover.

```bash
node /caminho/para/ci-queue-<versão>-<revisão>/scripts/install.mjs install \
  --bundle /caminho/para/ci-queue-<versão>-<revisão> \
  --prefix "$HOME/.local/share/ci-queue" \
  --state "$HOME/.local/state/ci-queue"
```

`--state` contém a fila, histórico, logs e artifacts mutáveis. A instalação
recusa prosseguir se `running.json` ou `runner.lock` existem: antes de atualizar
ou remover, recupere ou aguarde o único executor responsável pela fila.

No macOS, passe o catálogo do projeto, os binários reais, o destino do comando e
`--activate` para gerar e carregar os LaunchAgents da release:

```bash
node /caminho/para/ci-queue-<versão>-<revisão>/scripts/install.mjs update \
  --bundle /caminho/para/ci-queue-<versão>-<revisão> \
  --prefix "$HOME/.local/share/ci-queue" \
  --state "$HOME/.local/state/ci-queue" \
  --config /caminho/do/projeto/ci-queue.json \
  --node "$(command -v node)" \
  --python "$(command -v python3)" \
  --command "$HOME/.local/bin/ci-queue" \
  --activate
```

O worker recebido pelo envelope observa somente o state root e executa tickets
já completos; o dashboard recebe a configuração do projeto explicitamente.
Nenhum dos dois procura arquivos internos do DietFlow.

O envelope do dashboard também recebe o `manifest.json` copiado e o SHA-256
que a instalação registrou. Assim `/build.json` identifica versão, revisão e
se o manifest ainda corresponde à instalação, sem tentar adivinhar procedência
a partir de um checkout.

## Recuperação e remoção

```bash
node "$HOME/.local/share/ci-queue/releases/<versão>-<revisão>/scripts/install.mjs" \
  uninstall --prefix "$HOME/.local/share/ci-queue"
```

Isso remove somente a release e seus envelopes registrados, preservando o
state root para leitura e recuperação. `--purge-state` só deve ser usado depois
de uma inspeção que prove fila quieta e de uma decisão explícita de descartar
histórico.

Para remover a release ativa no macOS, descarregue também os serviços que ela
possui:

```bash
node "$HOME/.local/share/ci-queue/releases/<versão>-<revisão>/scripts/install.mjs" \
  uninstall --prefix "$HOME/.local/share/ci-queue" --deactivate
```

Antes de ativar, atualizar ou remover, prove que não há job em andamento e que
nenhum executor legado continuará observando o mesmo state root. O instalador
recusa `running.json` e locks; o corte operacional é responsável por retirar o
serviço anterior antes de carregar o novo.

Se `launchctl bootstrap` falhar durante uma atualização, a operação retorna
erro: isso não confirma serviço ativo, mesmo que `installation.json` já
aponte para a release. Confira `launchctl list` e a fila ociosa; repita o mesmo
comando de instalação e confirme `/build.json` antes de enfileirar. O unload
assíncrono do launchd pode causar uma recusa transitória imediata ao reload.
Persistindo a falha, use o mesmo instalador com o bundle anterior preservado;
não remova estado ou locks e não inicie um worker concorrente.

## Historical tickets without a project ID

An old ticket is never attributed by its folder name. The migration helper
checks its recorded commit against the repository explicitly selected by the
operator. It writes only `state/legacy-projects.json`; original history and logs
remain unchanged. Existing assignments are preserved. First inspect the counts:

```bash
node scripts/legacy-projects.mjs --state /path/to/state --repo /path/to/project --project PROJECT_ID
```

When the installation is idle, repeat with `--apply`. Each assignment includes
the observed commit and original ticket digest. Keep this small ledger with state
backups; removing it reverses the attribution without changing any ticket.
CLI history, API history, statistics and canonical greens read the same explicit
ownership. Tickets without sufficient evidence stay available through
`ci-queue history --legacy --json` and **Legado sem projeto** in the history
surface. They do not contribute to a project's green or statistics.

A missing historical log is unavailable, not a successful empty log. The
installation never reruns a job to reconstruct it and does not expire old logs.

## Browser regression tests

After `npm ci` and `npm --prefix ui ci`, provision the test browser once with
`npx playwright install chromium --only-shell`. `npm run test:browser` starts
its own Vite on port 5191 and uses isolated API fixtures. It never enqueues jobs
or changes the installed service. The fixtures prove UI behavior; the separate
backend/core suites and the real installed consumer run prove integration.
