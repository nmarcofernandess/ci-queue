# Etapa 1 — evidências da candidata

Implementação e revisão interna concluídas. Review humano de Marco aguardando; T9, merge, release e instalação não autorizados nesta entrega.

[PR draft #5](https://github.com/nmarcofernandess/ci-queue/pull/5), base `dev`. O job Complete check iniciou no PR (run 35001688609); o resultado do HEAD final deve ser consultado no próprio PR, sem reutilizar resultado de um SHA anterior.

## Procedência

- Base auditada e origem de dev: `20de7eb5faa73c31b1cf721ccfb3880248d8f649`.
- Branch: `codex/ui-consistency-phase1`, destino `dev` do CI Queue.
- HEAD do código, build e capturas finais: `6eab3d67f2479ba898e2346d84df24522cd8167a`.
- Commits posteriores de fechamento adicionam somente documentação e estas evidências. O HEAD entregue e o resultado remoto exato ficam no PR draft.
- Ambiente local: macOS, Node 25.6.1 (engines >=20), npm 11.9.0, Chromium/Playwright 1.63.0, dependências dos lockfiles sem upgrades.
- Screenshots reproduzíveis via `CI_QUEUE_CAPTURE_FINAL=1 npm run check`. Fixtures tipadas em `tests/browser/fixtures/ui-consistency.ts`, relógio inicial 15/09/2026 12:00 UTC, dados de exemplo; nenhum registro real foi modificado para criar estados.

## Validação

`npm run check` passou no HEAD de captura: build TypeScript, 23 testes core, 41 UI, 34 backend, 1 exemplo, 1 release, 5 instalação, lint/build UI e 22 testes de browser. Release e instalação são testes isolados, não operações sobre os serviços instalados.

Os 106 screenshots finais foram abertos na revisão integrada: 48 dark, 24 mobile light e 34 desktop/intermediários light. Pendências foi corrigido após essa revisão e suas quatro capturas foram reabertas. A matriz cobre os cinco drawers, menus, seleção, erro/vazio/loading, Log/diagnóstico, formulários e confirmação, árvore de quatro níveis, resize 639/640/700/767/768/820/1440, temas claro/escuro/sistema, faixa de oito etapas em 1600 e zoom CSS 200%. Os testes de interação preservam chevrons, foco, texto selecionável, regiões fixas, triggers, follow/pause e estados terminais.

## Desfecho do review

| Achado | Implementação e prova |
| --- | --- |
| UI-01 | EntityIdentity e escala fechada current/drawer/table; status, execution-progress, worktree e tabelas. |
| UI-02 | DetailDrawer em Execução, Worktree, Meta, Pendências e Commit; matriz completa. |
| UI-03 | ProgressTree reserva a coluna de expansão inclusive para folhas; teste de coordenadas e quatro níveis. |
| UI-04 | StatusIndicator e descritores únicos; terminal sem animação residual; testes de representação. |
| UI-05 | DataTableFrame centraliza gutter, células e densidade em card/body; tabelas e overflow local verificados. |
| UI-06 | FactsTable com colgroup fixo de labels e valores completos quebráveis; SHA/caminho longos e zoom. |
| UI-07 | data-icon conforme posição real; política ESLint com casos positivos/negativos. |
| UI-08 | Tamanho detail segue direção efetiva; resize em todos os limiares coberto. |
| UI-09 | Header compartilhado à esquerda em bottom/right; cinco famílias nos dois temas. |
| UI-10 | AGENTS, skill, dois mapas .context, DESIGN e contrato/ledger apontam aos donos reais. |
| UI-11 | Classificador docs-only corrigido; mesmo workflow aceita PR dev e executa Complete check para código. |
| UI-12 | Suíte sistêmica e índice abaixo; inspeção das imagens complementa as asserções. |

## Correções encontradas durante a revisão interna

- Ficha dividida indevidamente em 50/50: colgroup explícito no dono da tabela.
- Lista do Commit ampliava o conteúdo interno do ScrollArea e cortava ficha: contenção inline no body compartilhado, mantendo overflow apenas da lista.
- Títulos/metadados longos: quebra no conteúdo da identidade sem redimensionar mídia.
- Pendências: badge de tentativa abaixo do contexto, sem comprimir a descrição lateralmente.
- Teste antigo de follow avançava 6s para polling de 10s: teste corrigido; polling não mudou.
- Medições durante transição do drawer: prova aguarda animação da superfície; gráficos são capturados após a animação e presença real das séries é verificada.

## Prévia compilada e limites

[Prévia local compilada](http://127.0.0.1:5192/) servida pelo Vite preview da lane, com proxy de leitura para a API instalada em 8765. Status/histórico e drawer real foram inspecionados. O serviço instalado não aponta para a lane e não foi reiniciado nem atualizado.

A API instalada apresentou um timeout inicial de 10s; outra leitura retornou 200 em aproximadamente 4s. A latência existente não foi alterada nesta etapa de composição. O build ainda informa chunk acima de 500 kB; não foi feita mudança de performance ou divisão de bundle. Zoom capturado é CSS 200%, não uma alegação de teste de todos os recursos de acessibilidade do sistema operacional.

## Antes e depois

- execution 700: [baseline](screens/baseline-execution-700-light.png) → [candidata](screens/final-700-light-execution-resize.png).
- worktree 700: [baseline](screens/baseline-worktree-700-light.png) → [candidata](screens/final-700-light-worktree.png).
- execution 1440: [baseline](screens/baseline-execution-1440-light.png) → [candidata](screens/final-1440-light-execution-progress.png).
- worktree 1440: [baseline](screens/baseline-worktree-1440-light.png) → [candidata](screens/final-1440-light-worktree.png).

## Índice completo de capturas finais

| Captura | Abrir |
| --- | --- |
| 1440-dark-analysis-duration-empty | [PNG](screens/final-1440-dark-analysis-duration-empty.png) |
| 1440-dark-analysis-duration | [PNG](screens/final-1440-dark-analysis-duration.png) |
| 1440-dark-analysis-period | [PNG](screens/final-1440-dark-analysis-period.png) |
| 1440-dark-analysis-presets | [PNG](screens/final-1440-dark-analysis-presets.png) |
| 1440-dark-analysis-results | [PNG](screens/final-1440-dark-analysis-results.png) |
| 1440-dark-commit | [PNG](screens/final-1440-dark-commit.png) |
| 1440-dark-diagnostic | [PNG](screens/final-1440-dark-diagnostic.png) |
| 1440-dark-execution-collapsed | [PNG](screens/final-1440-dark-execution-collapsed.png) |
| 1440-dark-execution-log | [PNG](screens/final-1440-dark-execution-log.png) |
| 1440-dark-execution-progress | [PNG](screens/final-1440-dark-execution-progress.png) |
| 1440-dark-execution-terminal | [PNG](screens/final-1440-dark-execution-terminal.png) |
| 1440-dark-filtered-empty | [PNG](screens/final-1440-dark-filtered-empty.png) |
| 1440-dark-meta-edit | [PNG](screens/final-1440-dark-meta-edit.png) |
| 1440-dark-meta-empty | [PNG](screens/final-1440-dark-meta-empty.png) |
| 1440-dark-meta-remove-confirmation | [PNG](screens/final-1440-dark-meta-remove-confirmation.png) |
| 1440-dark-meta-save-error | [PNG](screens/final-1440-dark-meta-save-error.png) |
| 1440-dark-meta | [PNG](screens/final-1440-dark-meta.png) |
| 1440-dark-pending-empty | [PNG](screens/final-1440-dark-pending-empty.png) |
| 1440-dark-pending | [PNG](screens/final-1440-dark-pending.png) |
| 1440-dark-status-empty | [PNG](screens/final-1440-dark-status-empty.png) |
| 1440-dark-status-error | [PNG](screens/final-1440-dark-status-error.png) |
| 1440-dark-status | [PNG](screens/final-1440-dark-status.png) |
| 1440-dark-worktree | [PNG](screens/final-1440-dark-worktree.png) |
| 1440-dark-worktrees-selection-copy | [PNG](screens/final-1440-dark-worktrees-selection-copy.png) |
| 1440-light-analysis-duration-empty | [PNG](screens/final-1440-light-analysis-duration-empty.png) |
| 1440-light-analysis-duration | [PNG](screens/final-1440-light-analysis-duration.png) |
| 1440-light-analysis-error | [PNG](screens/final-1440-light-analysis-error.png) |
| 1440-light-analysis-loading | [PNG](screens/final-1440-light-analysis-loading.png) |
| 1440-light-analysis-period | [PNG](screens/final-1440-light-analysis-period.png) |
| 1440-light-analysis-presets | [PNG](screens/final-1440-light-analysis-presets.png) |
| 1440-light-analysis-results | [PNG](screens/final-1440-light-analysis-results.png) |
| 1440-light-commit | [PNG](screens/final-1440-light-commit.png) |
| 1440-light-diagnostic | [PNG](screens/final-1440-light-diagnostic.png) |
| 1440-light-execution-collapsed | [PNG](screens/final-1440-light-execution-collapsed.png) |
| 1440-light-execution-log | [PNG](screens/final-1440-light-execution-log.png) |
| 1440-light-execution-progress | [PNG](screens/final-1440-light-execution-progress.png) |
| 1440-light-execution-terminal | [PNG](screens/final-1440-light-execution-terminal.png) |
| 1440-light-filtered-empty | [PNG](screens/final-1440-light-filtered-empty.png) |
| 1440-light-meta-edit | [PNG](screens/final-1440-light-meta-edit.png) |
| 1440-light-meta-empty | [PNG](screens/final-1440-light-meta-empty.png) |
| 1440-light-meta-remove-confirmation | [PNG](screens/final-1440-light-meta-remove-confirmation.png) |
| 1440-light-meta-save-error | [PNG](screens/final-1440-light-meta-save-error.png) |
| 1440-light-meta | [PNG](screens/final-1440-light-meta.png) |
| 1440-light-pending-empty | [PNG](screens/final-1440-light-pending-empty.png) |
| 1440-light-pending | [PNG](screens/final-1440-light-pending.png) |
| 1440-light-status-empty | [PNG](screens/final-1440-light-status-empty.png) |
| 1440-light-status-error | [PNG](screens/final-1440-light-status-error.png) |
| 1440-light-status | [PNG](screens/final-1440-light-status.png) |
| 1440-light-worktree-zoom-200 | [PNG](screens/final-1440-light-worktree-zoom-200.png) |
| 1440-light-worktree | [PNG](screens/final-1440-light-worktree.png) |
| 1440-light-worktrees-error | [PNG](screens/final-1440-light-worktrees-error.png) |
| 1440-light-worktrees-loading | [PNG](screens/final-1440-light-worktrees-loading.png) |
| 1440-light-worktrees-selection-copy | [PNG](screens/final-1440-light-worktrees-selection-copy.png) |
| 1600-light-filtered-empty | [PNG](screens/final-1600-light-filtered-empty.png) |
| 1600-light-stages-tables | [PNG](screens/final-1600-light-stages-tables.png) |
| 390-dark-analysis-duration-empty | [PNG](screens/final-390-dark-analysis-duration-empty.png) |
| 390-dark-analysis-duration | [PNG](screens/final-390-dark-analysis-duration.png) |
| 390-dark-analysis-period | [PNG](screens/final-390-dark-analysis-period.png) |
| 390-dark-analysis-presets | [PNG](screens/final-390-dark-analysis-presets.png) |
| 390-dark-analysis-results | [PNG](screens/final-390-dark-analysis-results.png) |
| 390-dark-commit | [PNG](screens/final-390-dark-commit.png) |
| 390-dark-diagnostic | [PNG](screens/final-390-dark-diagnostic.png) |
| 390-dark-execution-collapsed | [PNG](screens/final-390-dark-execution-collapsed.png) |
| 390-dark-execution-log | [PNG](screens/final-390-dark-execution-log.png) |
| 390-dark-execution-progress | [PNG](screens/final-390-dark-execution-progress.png) |
| 390-dark-execution-terminal | [PNG](screens/final-390-dark-execution-terminal.png) |
| 390-dark-filtered-empty | [PNG](screens/final-390-dark-filtered-empty.png) |
| 390-dark-meta-edit | [PNG](screens/final-390-dark-meta-edit.png) |
| 390-dark-meta-empty | [PNG](screens/final-390-dark-meta-empty.png) |
| 390-dark-meta-remove-confirmation | [PNG](screens/final-390-dark-meta-remove-confirmation.png) |
| 390-dark-meta-save-error | [PNG](screens/final-390-dark-meta-save-error.png) |
| 390-dark-meta | [PNG](screens/final-390-dark-meta.png) |
| 390-dark-pending-empty | [PNG](screens/final-390-dark-pending-empty.png) |
| 390-dark-pending | [PNG](screens/final-390-dark-pending.png) |
| 390-dark-status-empty | [PNG](screens/final-390-dark-status-empty.png) |
| 390-dark-status-error | [PNG](screens/final-390-dark-status-error.png) |
| 390-dark-status | [PNG](screens/final-390-dark-status.png) |
| 390-dark-worktree | [PNG](screens/final-390-dark-worktree.png) |
| 390-dark-worktrees-selection-copy | [PNG](screens/final-390-dark-worktrees-selection-copy.png) |
| 390-light-analysis-duration-empty | [PNG](screens/final-390-light-analysis-duration-empty.png) |
| 390-light-analysis-duration | [PNG](screens/final-390-light-analysis-duration.png) |
| 390-light-analysis-period | [PNG](screens/final-390-light-analysis-period.png) |
| 390-light-analysis-presets | [PNG](screens/final-390-light-analysis-presets.png) |
| 390-light-analysis-results | [PNG](screens/final-390-light-analysis-results.png) |
| 390-light-commit | [PNG](screens/final-390-light-commit.png) |
| 390-light-diagnostic | [PNG](screens/final-390-light-diagnostic.png) |
| 390-light-execution-collapsed | [PNG](screens/final-390-light-execution-collapsed.png) |
| 390-light-execution-log | [PNG](screens/final-390-light-execution-log.png) |
| 390-light-execution-progress | [PNG](screens/final-390-light-execution-progress.png) |
| 390-light-execution-terminal | [PNG](screens/final-390-light-execution-terminal.png) |
| 390-light-filtered-empty | [PNG](screens/final-390-light-filtered-empty.png) |
| 390-light-meta-edit | [PNG](screens/final-390-light-meta-edit.png) |
| 390-light-meta-empty | [PNG](screens/final-390-light-meta-empty.png) |
| 390-light-meta-remove-confirmation | [PNG](screens/final-390-light-meta-remove-confirmation.png) |
| 390-light-meta-save-error | [PNG](screens/final-390-light-meta-save-error.png) |
| 390-light-meta | [PNG](screens/final-390-light-meta.png) |
| 390-light-pending-empty | [PNG](screens/final-390-light-pending-empty.png) |
| 390-light-pending | [PNG](screens/final-390-light-pending.png) |
| 390-light-status-empty | [PNG](screens/final-390-light-status-empty.png) |
| 390-light-status-error | [PNG](screens/final-390-light-status-error.png) |
| 390-light-status | [PNG](screens/final-390-light-status.png) |
| 390-light-worktree | [PNG](screens/final-390-light-worktree.png) |
| 390-light-worktrees-selection-copy | [PNG](screens/final-390-light-worktrees-selection-copy.png) |
| 700-light-execution-resize | [PNG](screens/final-700-light-execution-resize.png) |
| 700-light-worktree | [PNG](screens/final-700-light-worktree.png) |
| 820-light-execution-resize | [PNG](screens/final-820-light-execution-resize.png) |
