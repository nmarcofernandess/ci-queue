# CI Queue · Etapa 1B: Análise proporcional e lifecycle local

> Checklist de execução. As decisões de produto estão no material desta
> campanha. Não abrir outro ciclo de planejamento.

**Lane:** `codex/ui-consistency-phase1` no PR draft [#5](https://github.com/nmarcofernandess/ci-queue/pull/5), base `dev`.
**Partida:** `497acb862348e8f926f5af3fe70c3b9e18aa63cd`. Árvore limpa. Delta posterior a essa revisão era vazio.
**Objetivo:** Resultados percentuais, multi-seleção e contexto de projeto em todas as views.
**Parada:** PR draft atualizado. Merge só depois do aceite de Marco.

## Material da campanha

- [Executar](./2026-09-15-ci-queue-analysis-project-lifecycle/00-EXECUTAR.md)
- [Decisões](./2026-09-15-ci-queue-analysis-project-lifecycle/01-DECISOES-E-REVIEW.md)
- [Contratos](./2026-09-15-ci-queue-analysis-project-lifecycle/02-CONTRATOS.md)
- [Plano detalhado](./2026-09-15-ci-queue-analysis-project-lifecycle/03-PLANO-EXECUTAVEL.md)
- [Casos sintéticos de Análise](./2026-09-15-ci-queue-analysis-project-lifecycle/fixtures/analysis-cases.json)

`04-ACEITE-E-CENARIOS.md` e `05-ROADMAP-E-FONTES.md` não estavam no disco do pacote. O aceite usa os IDs de `01` (A-01…C-01), a matriz de `02` e as transições de `03`. O roadmap permanente será reconciliado em B7 a partir de `01` §7 e dos contratos, sem inventar etapas 2–5.

## Substituições autorizadas

| Antes | Depois |
| --- | --- |
| Eixo Y de Resultados em contagens brutas | Percentual por preset, denominador = passou+falhou+cancelado+interrompido |
| Um preset remoto em Resultados | Multi-seleção local sobre um agregado por projeto/período |
| Footer com três botões de tema soltos | Menu de ambiente local com Bridge e tema |
| `ApiContext.config` único mutável | Registry local + Scope imutável por requisição |
| Aviso “legado” no histórico do projeto ativo | Histórico sem projeto, separado |

Não substitui os aceites técnicos da etapa 1 (R1/R2/R3/V1, famílias de drawer, TanStack v9).

## Tarefas

- [x] B0 Fixar candidata e incorporar o contrato
- [ ] B1 Registry persistente e lifecycle local
- [ ] B2 Resolver contexto por requisição e migrar o backend
- [ ] B3 Contexto por aba, transporte e estado das views
- [ ] B4 Projeto global, gerenciamento e ambiente local
- [ ] B5 Agregados de Resultados e barras percentuais
- [ ] B6 Multi-seleção, ranking, atualização e URL
- [ ] B7 Consistência dos controles e documentação permanente
- [ ] B8 Prova integrada, revisão interna e PR draft
- [ ] B9 Merge em `dev` (não autorizado por este pacote)

## Registro B0

- `pwd`: `/Users/marcoantonio/ci-queue-ui-consistency-phase1`
- Branch: `codex/ui-consistency-phase1` → `origin/codex/ui-consistency-phase1`
- HEAD: `497acb862348e8f926f5af3fe70c3b9e18aa63cd`
- PR #5: OPEN, draft, base `dev`, HEAD igual à referência
- Trabalho local posterior: nenhum
