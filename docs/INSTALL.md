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

O exemplo abaixo apenas copia e registra a release. Ele não usa `launchctl` e
não muda serviços existentes; isso permite validar uma atualização em diretório
isolado antes da janela de cutover.

```bash
node scripts/install.mjs install \
  --bundle /caminho/para/ci-queue-<versão>-<revisão> \
  --prefix "$HOME/.local/share/ci-queue" \
  --state "$HOME/.local/state/ci-queue"
```

`--state` contém a fila, histórico, logs e artifacts mutáveis. A instalação
recusa prosseguir se `running.json` ou `runner.lock` existem: antes de atualizar
ou remover, recupere ou aguarde o único executor responsável pela fila.

Para gerar os envelopes de LaunchAgent que serão ativados na janela de cutover,
passe também o catálogo do projeto e binários reais:

```bash
node scripts/install.mjs update \
  --bundle /caminho/para/ci-queue-<versão>-<revisão> \
  --prefix "$HOME/.local/share/ci-queue" \
  --state "$HOME/.local/state/ci-queue" \
  --config /caminho/do/projeto/ci-queue.json \
  --node "$(command -v node)" \
  --python "$(command -v python3)"
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
node scripts/install.mjs uninstall --prefix "$HOME/.local/share/ci-queue"
```

Isso remove somente a release e seus envelopes registrados, preservando o
state root para leitura e recuperação. `--purge-state` só deve ser usado depois
de uma inspeção que prove fila quieta e de uma decisão explícita de descartar
histórico.

Ativar ou descarregar LaunchAgents reais ainda pertence à etapa de cutover:
ela deve primeiro provar que não há um worker antigo, que a release e o
manifest correspondem, e que um único executor ficará responsável pela fila.
