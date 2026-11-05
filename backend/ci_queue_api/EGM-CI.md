# API — projeção de estado e ações locais

## Overview

Leitura temática de `main@b793ebbd14f9`. Fronteira HTTP/estado/nativo; UI,
análise histórica completa e todos os readers delegados ficam fora do recorte.
[Blueprint](../../EGM-CI.md).

## Interface

- [server.py](server.py): `ApiContext`, `main`, `Handler`. State explícito é
  obrigatório; config do consumidor e UI compilada são opcionais.
- GET `/health`, `/build.json`, `/api/session`, `/api/status`,
  `/api/executions`, `/api/job`, `/api/log` e `/api/diagnostic` consultam
  identidade, estado ou evidência. Há escopos de projeto, Todos e Sem projeto.
- POST `/api/project-pick`, `/api/project-probe`, `/api/projects`,
  `/api/dashboard-state`, `/api/reveal` passam por guardas locais.
  Esta lista destaca fronteiras lidas; não é catálogo completo de endpoints.
- [records.py](records.py) projeta tickets/observações e ocupação;
  [completion.py](completion.py) compõe execução e finalização;
  [record_store.py](record_store.py) oferece snapshots reconstruíveis.
- [projects.py](projects.py), [worktrees.py](worktrees.py) e
  [native_actions.py](native_actions.py) recebem identidade de projeto e resolvem
  alvos/caminhos de operações locais no servidor.

## Invariants

- Bind público exige opt-in. POST exige cliente loopback, Origin/Host coerentes,
  CSRF, JSON e limite de corpo; capacidades resolvidas controlam operações.
- `records.py:globalOccupancy` inclui running ou queued, inclusive de outros
  projetos; é projeção, não mutex. Campos públicos são allowlist, sem argv/env.
- Filesystem é a autoridade. `RecordStore` usa cache reconstruível, snapshots
  imutáveis e fingerprints/stat antes e depois; não é banco independente.
- Completion vincula ticket, digest terminal e finalizationDigest. Passed de
  teste exige exit 0, mas não substitui finalização elegível. Observações direct
  têm limites explícitos de logs/diagnóstico e não viram tickets.
- Reveal reconsulta inventário e resolve IDs/owners; não aceita caminho arbitrário
  do browser. Writers do cadastro usam revisão esperada e lock próprio.

## Side Effects

Socket HTTP e leitura de distribuição/estado. Cadastro pode criar/reparar registro
bootstrap e gravar `projects.json` atomicamente sob flock. Writers autorizados
alteram metadados; picker/reveal usam comandos nativos de argv fixo no macOS.
Inventário consulta Git local sem fetch e mede tamanho em thread serial.
Implementações internas de análise/dashboard não foram auditadas neste recorte.

## Verification

`npm run test:backend` executa unittest configurado em `tests/backend`; apenas
identificado, não executado. O bootstrap não iniciou API nem validou autenticação
ou comportamento de rede em runtime.
