# V01 — Índice para inspeção visual humana

## Estado deste índice

- **Owner da prova:** lane `codex/fase4-c04-history-refresh` em `/Users/marcoantonio/ci-queue-fase4-c04-refresh`.
- **Lifecycle:** o ticket oficial `20260921182802-ff7d493a` preserva a matriz 100%; o complemento `20260921190155-cd2acc99` preserva a matriz de equivalência 200%. A fila copiou seus `test-results/` para `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921182802-ff7d493a` e `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99`. Manter receipts e imagens até a inspeção do Marco; não apagar, promover, instalar ou declarar aceite sem ordem explícita.
- **Complemento V01 concluído:** o ticket `20260921190155-cd2acc99` terminou `passed`, exit `0`, no SHA `2a7a533d32850638b3867ff9729315588768c826`, com base `550409a92f359cffc3e75f34712d39133b8ab130` e preflight/postflight limpos. Ele passou 19 testes após build e preservou PNGs e metadados de viewport para `640/820/1440/1600`, claro e escuro.
- **Aceite humano:** **pendente**. Captura e teste automático não são aprovação visual do Marco.

## Identidade e limite da rechecagem

- Base visual integrada: CI Queue PR #18, merge commit `550409a92f359cffc3e75f34712d39133b8ab130` em `origin/dev`.
- Candidatas capturadas: `43ba1c3ccf8ec58c7cce75fe4d7f3f4b1cfb9898` (100%) e `2a7a533d32850638b3867ff9729315588768c826` (equivalência 200%), ambas sobre essa base.
- Receipts: `/Users/marcoantonio/.local/state/local-ci/queue/history/20260921182802-ff7d493a.json` e `/Users/marcoantonio/.local/state/local-ci/queue/history/20260921190155-cd2acc99.json` — terminais `passed`, exit `0`, head/base pinados e preflight/postflight limpos.
- Ambos executaram `npm --prefix ui run build` antes do browser, com sucesso. A página automatizada ainda é Vite de desenvolvimento/fixture do CWD `/Users/marcoantonio/ci-queue-fase4-c04-refresh/ui`: não é instalação nem prova de release instalada.

## Fixture e cenários da captura

- `tests/browser/table-layout.spec.ts` com `installConsistencyFixtures` e presets/branch/worktree longos.
- Cobertura capturada a 100%: `640×900`, `820×900`, `1440×900` e `1600×900`, claro e escuro. `390×900` também foi capturado como observação mobile adicional.
- **Equivalência 200% comprovada no harness; zoom nativo do navegador não é alegado.** O ticket `20260921190155-cd2acc99` usa viewport CSS físico÷2 e DPR 2 para aproximar o breakpoint/layout de `640/820/1440/1600` físicos a 200%, captura em escala `device` e registra `innerWidth`, `innerHeight` e `devicePixelRatio`. Os PNGs resultantes têm `640×900`, `820×900`, `1440×900` e `1600×900` pixels. A matriz passou em claro e escuro, mantendo as asserções de overflow local, checkbox/olho integralmente no container, alvo de título exposto antes do olho e operação por teclado. Isso é evidência de composição responsiva no harness, não emulação de zoom nativo do browser nem aceite humano.
- Histórico com projeto, variante **Personalizado** e indicador acessível `Passou · Flaky detectado`; o contrato não exibe badge textual de flaky junto ao nome.
- Worktrees no início, meio e final da rolagem: nome, checkbox e ação Inspecionar em viewport; retângulos de checkbox e olho sem sobreposição; checkbox seleciona e o olho abre o drawer por teclado.
- A C04 cobre em `tests/browser/dashboard.spec.ts` o refresh com erro, página 2 já carregada e recuperação com geração/snapshot/primeira página alterados.

## Capturas disponíveis para revisão humana

O ticket 100% produziu 61 PNGs duráveis. O complemento 200% passou 19/19 após build e preservou um PNG de Histórico, um PNG de Worktrees no meio da rolagem e um JSON de viewport para cada tema/largura. Capturas-chave a 100%:

- Meio de rolagem, 640 px/100% escuro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921182802-ff7d493a/test-results/table-layout-tables-keep-c-29398-le-at-640px-and-100-in-dark/worktrees-middle-640-dark.png`.
- Meio de rolagem, 1600 px/100% escuro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921182802-ff7d493a/test-results/table-layout-tables-keep-c-ca293-e-at-1600px-and-100-in-dark/worktrees-middle-1600-dark.png`.
- Histórico multi-projeto, tooltip flaky: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921182802-ff7d493a/test-results/table-layout-all-projects--05d9a--project-and-variant-badges/history-all-projects.png`.

Na revisão dessas três imagens a 100%, o nome permanece visível (com elisão quando necessária), checkbox e olho ficam expostos no meio de rolagem e o tooltip conserva `Passou · Flaky detectado`. As asserções do ticket também verificaram viewport, separação de hit-targets, operação por teclado do olho e ausência de overflow do body.

Matriz 200% (`history-*`, `worktrees-middle-*` e `viewport-*.json` em cada pasta):

- 640 claro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-640px-physica-98519-e-at-640px-and-200-in-light`.
- 640 escuro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-640px-physica-bd48c-le-at-640px-and-200-in-dark`.
- 820 claro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-820px-physica-5fe30-e-at-820px-and-200-in-light`.
- 820 escuro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-820px-physica-d6c17-le-at-820px-and-200-in-dark`.
- 1440 claro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-1440px-physic-b36a3--at-1440px-and-200-in-light`.
- 1440 escuro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-1440px-physic-1389f-e-at-1440px-and-200-in-dark`.
- 1600 claro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-1600px-physic-8e947--at-1600px-and-200-in-light`.
- 1600 escuro: `/Users/marcoantonio/.local/state/local-ci/queue/artifacts/20260921190155-cd2acc99/test-results/table-layout-1600px-physic-b5792-e-at-1600px-and-200-in-dark`.

A recipe da matriz 200% executada foi:

```text
npm --prefix ui run build &&
CI_QUEUE_CAPTURE_TABLE_LAYOUT=1 npx playwright test \
  tests/browser/table-layout.spec.ts \
  --grep "tables keep content and actions usable|all projects keeps the recipe readable"
```

O ticket `20260921190155-cd2acc99` declarou `test-results/` como artefato e passou 19 testes: 18 cenários de geometria (100% e equivalência 200%, claro/escuro) e Histórico multi-projeto. A C04 permanece coberta pelo ticket `20260921182802-ff7d493a`, que passou 2 casos de geração/escopo além de 13 cenários V01. A decisão visual continua reservada ao Marco.
