# Ship — controlador de integração do produto

## Overview

Leitura de `main@b793ebbd14f9`. Controlador separado do worker e independente de
receitas clínicas de consumidores. [Blueprint](../../EGM-CI.md).

## Interface

- [ship.ts](ship.ts): `runShip` recebe `ShipOps` e `ShipRequest`;
  [ops.ts](ops.ts) define target/report/efeitos e `ShipError`.
- [system-ops.ts](system-ops.ts): `createSystemOps` implementa Git, GitHub,
  consulta/enqueue de prova e merge.
- [eligibility.ts](eligibility.ts): `evaluateShipTicket`, `findEligibleTicket`.
- [init.ts](init.ts): `initProject` cria/adapta catálogo e, opcionalmente,
  workflow/verificador; não instala o executor nem cadastra o dashboard.
- [CLI](../cli.ts): ship aceita `--pr`, `--repo`, `--dry-run`, `--remote`,
  `--no-remote`, `--timeout-ms`; opções desconhecidas são recusadas.

## Invariants

- `acceptedPresets` é OR. Consulta considera a tentativa terminal canônica mais
  recente por receita/HEAD/base; não recupera verde encoberto por tentativa
  posterior inválida. Sem prova elegível ou pendente, enfileira a primeira aceita.
- Elegibilidade exige completion íntegro, identidade/cwd/preset/argv/flags,
  execução passed canônica, prazo e snapshots Git estáveis. Progresso não é gate.
- Target precisa de árvore limpa, HEAD da PR e base ancestral; catálogo/política
  correspondem aos bytes commitados. Suporta github.com, PR sem fork/merge queue
  e merge commit. Base alterada não vira prova funcional reutilizada.
- `skipped` pode registrar falha de attestation como limitação e continuar;
  modo wait exige veredito remoto causal de PR/HEAD/base/workflow/job.
- `mergePinnedHonestly` inspeciona resultado ambíguo e parents/árvore do merge.
  Merge ocorrido em base diferente é relatado como tal, com efeitos preservados.
- Init preserva catálogo inválido e arquivos de workflow existentes. Identidade
  conflituosa é recusada; não presume `origin/dev` como base universal.

## Side Effects

Consultas e mutações Git/GitHub, enqueue/espera de prova, status, ready e merge.
Dry-run ainda faz consultas. Init pode escrever catálogo e assets opcionais;
isso não inicia serviço. Worker/runner não recebem responsabilidade pelo merge.

## Verification

Scripts configurados, não executados: `npm run test:core` e
`npm run test:examples`. Testes pertinentes existem em `tests/core/ship.test.ts`,
`tests/core/init.test.ts` e `tests/examples/init-ship.test.mjs`.
Veja [contrato](../../docs/CONTRACTS.md) e [quickstart](../../docs/CONSUMER-QUICKSTART.md).
