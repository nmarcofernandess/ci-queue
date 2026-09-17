# Evidência — etapa 2 (durações de progresso)

Candidata: branch `codex/phase2-progress-durations` · PR #6 draft.

## O que foi verificado nesta lane (rodada review R01–R06)

- Tracker + coletor real (`tests/core/progress-timing.test.ts`): missing-end, restart discontinuous, pending limpa âncora, clock-invalid, snapshot deep-clone, UTF-8 split.
- Publicação/sidecar/artifacts (`tests/core/progress-pipeline.test.ts`): emissor→runner→history, sidecar só após history autoritativa, artifacts running→terminal.
- Projeção Python defensiva (`tests/backend/test_progress_timing.py`): source só com duração; reason só na ausência; enums não-string não TypeError; `missing-end`.
- Modelo de UI (`tests/ui/progress-duration.test.ts`): legado `—`, tooltip com ms exatos + buffering.
- Browser com fixtures HTTP (`tests/browser/progress-timing.spec.ts`) — complementar; a passagem real das camadas está no pipeline acima + projeção Python.
- `npm run check` da própria candidata (dist local).

## Lacunas honestas

- Fixture original `timing-cases.json` (22/22 PASS) em `tests/fixtures/timing-cases.json` via `tests/core/timing-cases-fixture.test.ts` — expecteds do pacote intactos (`open-node-at-finish`→`missing-end`; `restart-loses-anchor`→`collector-restarted`).
- Pacote normativo copiado em `docs/ui/evidence/etapa-2/original-package/` (02/04/05).
- Focais E0 F04/F07: `tests/ui/project-manager-state.test.ts` PASS; F06 orçamento Resultados = consumidor etapa-1b (não reforma nesta rodada).
- Browser integrado R06: `tests/browser/progress-timing-integrated.spec.ts` PASS (API candidata real, sem fulfill de JSON fake).

## O que não foi feito

- Inspeção do produto instalado em `~/.local/share/ci-queue`.
- Escrita no state real `~/.local/state/local-ci/queue`.
- Ready/merge/release/install/promoção main.
- Alteração de receitas DietFlow.

## Check local (pré-commit desta rodada)

- `npm run check` EXIT 0
- Browser: 38 passed (incl. `progress-timing-integrated`)
- Fixture original: 22/22 PASS
- UI bundle (candidata): `index-DwsfbX4A.js` / `index-VpmK6FLj.css`
- State/instalação reais: nenhuma mutação

SHA de código: _preenchido no commit seguinte_.
