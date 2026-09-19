# Integrar um projeto ao CI Queue

Esta é a entrada genérica. Leia o **[manual HTML autocontido](GUIA-INTEGRACAO-CI-QUEUE.html)** para o passeio completo e o exemplo Static + Jest. O HTML abre offline, sem CDN; o GitHub exibe seu fonte. Contratos formais: [CONTRACTS](CONTRACTS.md). Instalação: [INSTALL](INSTALL.md).

## 1. Separe máquina, projeto e estado

A máquina precisa de uma release verificada, Node compatível, CLI/worker e das dependências reais das receitas. API Python e UI compilada são a observabilidade; Vite de desenvolvimento não precisa rodar na instalação. `gh` é necessário para ship GitHub, não para todo teste standalone.

O projeto precisa de Git, comando de teste verdadeiro, dependências e catálogo. O state pertence à máquina. Confirme `installation.json`; não troque `~/.local/state/local-ci/queue` por uma fila vazia em `~/.local/state/ci-queue` sem intenção. Use o mesmo state na CLI, worker e API.

## 2. Prepare o comando antes do catálogo

O teste continua executável fora da fila. `npm run check` direto não cria prova queue por si só. Para exigir duas verificações, faça um agregador que execute ambas e preserve falhas. `acceptedPresets: ["lint","test"]` significa **OR**, não AND.

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

No Project Manager, confira e registre pasta/catálogo para inventário e histórico filtrado. Running e fila permanecem globais. Binding Node em `runtimes.json` é separado do cadastro; ver [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md).

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

O ship reusa uma receita elegível de `ship.acceptedPresets`; se nenhuma existir, enfileira a **primeira**. Não há AND entre os nomes. O worker nunca mergeia e `passed` sozinho não dispara ship. A UI não tem botão de merge.

## 6. Remoto opcional e limites

Arquivo `remote-verdict.json` ao lado do catálogo: `wait|skipped`; ausente significa wait. Wait exige `ship.remoteVerdict.workflow` e `job`. `--no-remote` força skipped, não corrige JSON inválido nem dispensa prova/identidade/HEAD/base/PR. `init --workflow` copia verificador de attestation, não uma suíte de testes remota. O verificador deve existir na base que o workflow fará checkout; verificar isso na primeira adoção.

Garantia: **HEAD pinado, base observada**. Revalidação antes e inspeção depois não são lock atômico H+B. `MERGED_BASE_CHANGED` exige inspeção, não novo merge cego. Nenhum `--admin`, status manual ou ticket fabricado.

**DietFlow não fez cutover.** Continua `npm run ship` em `scripts/ship/ship.ts`, com seu arquivo de política em `scripts/ship/remote-verdict.json`; leia a [entrada consumidora](https://github.com/dietflowoficial/Dietflow-app/blob/dev/docs/ci/CI-QUEUE-CONSUMIDOR.md).
