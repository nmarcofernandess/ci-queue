# Tabelas de Histórico e Worktrees — revisão visual

## Comparação

As capturas [Histórico antes](screens/before-historico.png) e [Worktrees antes](screens/before-worktrees.png) são as referências fornecidas por Marco. Elas mostram, respectivamente, uma receita flaky esmagada pelos badges, revisão cortada antes da borda útil e nomes de Worktree cortados cedo. As capturas abaixo usam dados de fixture na candidata e servem para comparar a composição, não os valores dos registros.

| Superfície | Visão inicial da candidata | Após rolagem horizontal |
| --- | --- | --- |
| Histórico, 1440, claro | [Nome, badges e revisão](screens/history-initial-1440-light.png) | [Olho permanece visível](screens/history-1440-light.png) |
| Histórico, 820, escuro | [Visão inicial](screens/history-initial-820-dark.png) | [Revisão e olho](screens/history-820-dark.png) |
| Histórico, 390, escuro | [Nome e olho](screens/history-initial-390-dark.png) | [Olho após scroll](screens/history-390-dark.png) |
| Worktrees, 1440, claro | [Nome e branch ampliados](screens/worktrees-initial-1440-light.png) | [Nome, seleção e olho](screens/worktrees-1440-light.png) |
| Worktrees, 820, escuro | [Visão inicial](screens/worktrees-initial-820-dark.png) | [Nome, seleção e olho](screens/worktrees-820-dark.png) |
| Worktrees, 390, escuro | [Visão inicial](screens/worktrees-initial-390-dark.png) | [Nome, seleção e olho](screens/worktrees-390-dark.png) |

[Histórico com projeto, variante e Flaky juntos](screens/history-all-projects.png) cobre a combinação de maior pressão sobre o nome da receita. As demais combinações de claro/escuro e 1440/820/390 também estão em `screens/`.

## Implementação e prova

- **Necessidade → composição → adaptação:** tabelas → Data Table do Dashboard 01 com Table Nova/TanStack v9 → largura mínima semântica para Histórico e Worktrees, coluna de revisão flexível e células sticky para as ações e, em Worktrees, seleção e nome.
- `DataTableFrame` mantém o scroll local e oferece a largura `wide`. `run-table` e Worktrees reservam espaço para seu conteúdo. O shell aceita encolher para que a tabela role sem alargar o body.
- O olho continua com `InspectButton`, a seleção com Checkbox/TanStack e o nome completo fica no título acessível e no drawer. A branch longa pode elidir na célula; o atributo `title` e o drawer guardam o texto completo.
- `CI_QUEUE_CAPTURE_TABLE_LAYOUT=1 npx playwright test tests/browser/table-layout.spec.ts --reporter=line`: 7/7. O teste mede alinhamento entre header/célula, receita e badges, largura de revisão, scroll local, ausência de overflow do body, sticky e seleção em 1440/820/390 px, claro e escuro. A fixture cobre nome longo, sem nome, flaky, variante e múltiplos projetos. O servidor Vite partiu desta worktree na porta 5191, sem outro listener antes da execução; nenhuma API do operador foi usada.
- `npx playwright test tests/browser/ui-consistency.spec.ts --grep 'review regressions keep dense identities' --reporter=line`: 1/1.
- `npm --prefix ui run lint` e `npm --prefix ui run build`: passaram após o rebase em `origin/dev@24d6a2b`, que já contém Q2/Q3.

Esta evidência é de UI em fixture. O check oficial da fila deve ser registrado separadamente pelo ticket; ela não comprova instalação nem resultado em dados reais. A PR fica draft para revisão visual de Marco, sem merge ou instalação.
