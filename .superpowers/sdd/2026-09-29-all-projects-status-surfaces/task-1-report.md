# Task 1 — agregação de Meta e Pendências

Status da implementação: concluída em `dev`, partindo de `a6319961570b472c68ebd31d96947de10322b27a`.

## Implementação

- Adicionada `read_dashboard_state_all(state_root, projects)`, com um snapshot de `dashboard.json`, do plano de validação e do histórico por requisição. Cada projeto ativo mantém seu identificador, nome, catálogo, Meta, checks e pendências; erros de estado isoláveis são associados ao projeto.
- O reader de pendências passou a aceitar snapshots existentes. O reader de slots Git recebeu um parâmetro opcional de IDs de tickets locais, preservando o comportamento antigo para callers que não o usam. Isso removeu a leitura indireta de `history` por projeto descoberta através de `read_remote_slots`.
- `/api/dashboard-state?context=all` resolve somente projetos ativos e responde com `context: {kind: "all"}`. A rota POST não foi habilitada para Todos; mutation segue recebendo `ProjectScope`.
- Tipos de projeto e agregados agora são distintos. Checks aceitam `null` quando não há catálogo capaz de calculá-los, e `getDashboardState` possui assinaturas separadas para `project` e `all`.
- Projetos arquivados ficam fora da agregação. Catálogo ausente continua como dado factual do item, sem inventar checks canônicos.

## TDD

**RED — rota agregada:**

Comando:

```bash
python3 -m unittest tests.backend.test_project_scope.ProjectScopeHttpTests.test_dashboard_state_all_aggregates_active_projects_and_excludes_archived tests.backend.test_project_scope.ProjectScopeHttpTests.test_dashboard_state_all_keeps_linked_project_when_another_catalog_is_unavailable
```

Saída relevante antes da implementação: os dois testes falharam com `HTTP Error 409: Conflict`, porque a rota ainda recusava `dashboard-state` em `context=all`. O primeiro teste cobre metas e pendências de Alpha/Beta e exclui Gamma arquivado; o segundo cobre catálogo indisponível sem perder Alpha.

**RED — leitura única do histórico, incluindo slots Git:**

Comando:

```bash
python3 -m unittest tests.backend.test_api.StateAndDiagnosticTests.test_dashboard_all_reads_shared_snapshots_once_including_remote_ticket_lookup
```

Saída relevante antes do adapter: `AssertionError: 2 != 0` para chamadas indiretas a `history.read_history`; cada espelho válido causava releitura. O teste envolve os readers reais com spies (`wraps`) e conta uma leitura do dashboard, uma do plano, uma do histórico principal e zero leituras indiretas.

**GREEN:**

```bash
python3 -m unittest tests.backend.test_project_scope tests.backend.test_api
```

Resultado final: 63 testes passaram (`OK`).

## Outras verificações

- `npm run test:ui -- --run tests/ui/project-context.test.ts` — 15 arquivos e 86 testes passaram.
- `npm run typecheck` em `ui/` — passou.
- `git diff --check` — passou.

Os testes HTTP precisaram de permissão para abrir um servidor efêmero em loopback; a primeira tentativa dentro do sandbox falhou no bind antes de executar as asserções. Com a permissão de execução, o RED foi observado e os testes finais passaram.

## Arquivos alterados

- `backend/ci_queue_api/dashboard_state.py`
- `backend/ci_queue_api/validation_advisories.py`
- `backend/ci_queue_api/history.py` — adapter opcional indispensável, aprovado pelo controller, para evitar reread do histórico a partir dos slots Git.
- `backend/ci_queue_api/server.py`
- `ui/src/lib/types.ts`
- `ui/src/lib/api.ts`
- `tests/backend/test_project_scope.py`
- `tests/backend/test_api.py`

## Self-review e limites

- A inspeção do diff confirmou que a agregação é somente leitura e que a validação canônica continua usando a receita do projeto dono. Worker, runner, fila, ship e política de archive/restore não foram alterados.
- Não houve JSX nesta tarefa; a skill `ci-queue-shadcn` foi carregada antes de editar `ui/src`, e seu fluxo de composição visual não foi necessário para mudanças de tipos/API.
- Commit: `feat(api): aggregate status state across projects`.
