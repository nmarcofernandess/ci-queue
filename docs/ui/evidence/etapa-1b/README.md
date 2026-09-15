# Etapa 1B — evidências da candidata

Implementação e revisão interna concluídas. Review humano de Marco aguarda;
merge, release, instalação e etapa 2 não estão autorizados.

## Procedência

- Pacote: Etapa 1B (contexto de projeto, Análise proporcional, multi-seleção
  de Resultados).
- Branch: `codex/ui-consistency-phase1`, destino `dev`.
- HEAD do código desta evidência: `58589e1`.
- Base de partida da lane: `497acb862` (PR #5 ainda draft).
- UI candidata: Vite/`ui/dist` desta worktree.
- API candidata: `python3 -m ci_queue_api.server` com `--state` temporário,
  porta `18876`. Não é o daemon instalado em `8765`.
- `npm run check` neste HEAD: 23 core, 52 UI, 65 backend, 1 exemplo, 1
  release, 5 instalação, lint/build UI, 31 browser. Zero falhas.

## O que é real versus mock

| Cenário | Fonte |
| --- | --- |
| EV-01 / SC-01–02 (A/B) | UI Vite + API Python candidata, state temporário |
| AN-01–07, PR-01, UI-02 tema | Playwright com fixtures HTTP |
| B1 registry / B2 escopo | `tests/backend/test_projects.py`, `test_project_scope.py` |
| Ranking e URL | `tests/ui/results-model.test.ts`, `analysis-state.test.ts` |

## Aceite coberto nesta lane

AN-01, AN-02, AN-03, AN-04, AN-05, AN-06, AN-07, PR-01, SC-01, SC-02, UI-02
(tema/Bridge), EV-01. PR-02–04 e SE-01 ficam nos testes de backend do
registry/probe. UI-01/UI-03 reusam a suíte de consistência já existente; o
seletor novo foi exercido em 390 e 1440 nessa suíte.

## Limitações factuais

- A instalação macOS permanece na release anterior; esta lane não a atualiza.
- A prévia temporária não usa a fila real nem inicia worker.
- O warning de Select incontrolado→controlado aparece ao abrir Duração sem
  preset; o placeholder oficial permanece.
- Cronômetros, smoke e reforma de performance continuam fora do corte.

Aguardando Marco. Sem merge, main, release, instalação ou etapa 2.
