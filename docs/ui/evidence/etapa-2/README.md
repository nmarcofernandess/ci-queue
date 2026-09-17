# Evidência — etapa 2 (durações de progresso)

Candidata: branch `codex/phase2-progress-durations`.

## O que foi verificado nesta lane

- Testes de coletor com relógio falso (`tests/core/progress-timing.test.ts`).
- Projeção Python (`tests/backend/test_progress_timing.py`).
- Modelo de UI (`tests/ui/progress-duration.test.ts`).
- Browser com fixtures HTTP (`tests/browser/progress-timing.spec.ts`).
- `npm run check` da própria candidata (dist local).

## O que não foi feito

- Inspeção do produto instalado em `~/.local/share/ci-queue`.
- Escrita no state real `~/.local/state/local-ci/queue`.
- Reconstrução de duração em tickets históricos.
- Alteração de receitas DietFlow.

O SHA de código capturado deve ser o HEAD do commit desta entrega (não o
commit que apenas adiciona este README).
