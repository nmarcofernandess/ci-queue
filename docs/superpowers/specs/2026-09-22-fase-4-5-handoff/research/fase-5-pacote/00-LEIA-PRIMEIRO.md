# CI Queue · Fase 5 — decisões em uma tela

**Consulta: 21/09/2026. Entrega: diagnóstico + prompts; nenhuma implementação ou execução de suíte.**

| Objeto | Revisão auditada |
|---|---|
| CI Queue `dev` | `550409a92f359cffc3e75f34712d39133b8ab130` |
| DietFlow `dev` | `ffc99748f796d8f7923c9e46161b2a4dc735eef8` |
| Full histórico | ticket `20260919075127-addfb8a5`, H `008cab050649c7d11255aef1e3a5f574581f02c1`, B0 `3d411dab21554040f9337d6564c3bce620e5129a` |

**Decisão principal:** primeiro fechar a confiabilidade de H/B0 da Fase 4; depois atacar repetição comprovada de preparação/typecheck no Static. Não começar por troca de framework, Colima, outro dashboard ou redução de cobertura.

| Pergunta | Resposta demonstrável |
|---|---|
| A fila esperou duas horas? | Não nesse Full: espera **0,360 s**, job **6.928,041 s**. |
| Onde estão as duas horas? | Static **805 s**, Jest **2.247 s**, E2E **3.544 s**, FlowUI + agregação Care **322 s**. |
| Ainda faltam tempos individuais de Static? | Há **54 gates** no ticket histórico. Maiores: typecheck **241,226 s**, fixtures **197,537 s**, field-identity **104,836 s**, lint **103,517 s**, Storybook types **33,010 s**. |
| O E2E é só testes? | Não: Playwright **2.674,085 s**, Next/preparação **762,211 s**, Supabase/preparação **100,811 s**, Bootstrap **3,832 s**; intervalos collector. |
| Prune da fila vai recuperar dezenas de minutos? | A cópia histórica durou **0,931 s**. Q1 mostra populações grandes em worktrees; não prova o path do ENOSPC. |
| Existe A/B Mac × Cursor? | Não. H, base, cache, escopo, workers, resultado e ambiente diferem. |
| Pode prometer Full em X minutos? | Não há baseline atual comparável para uma nova meta absoluta. Há orçamento histórico por estágio e um plano de comparação limitada. |

Fontes: [ticket](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/queue-ticket.json), [receipt](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/execution-receipt.json), [fronteiras do Full no H histórico](https://github.com/dietflowoficial/Dietflow-app/blob/008cab050649c7d11255aef1e3a5f574581f02c1/scripts/ci/full-local.sh), [Q1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/superpowers/specs/2026-09-20-q1-disk-inventory.md).

## Ordem

1. **P00**: reunir amostras existentes e verificar dependências F4, sem jobs novos.
2. **P01**: medir subcomandos que ainda estão agregados; reutilizar relógios já existentes.
3. **P02**: primeiro candidato de otimização — Static, mesma prova com menos trabalho repetido.
4. **P03/P04**: deduplicação de seleção Jest / build duplicado do CQ, só após provar equivalência e custo.
5. **P05/P06**: pilotos separados de estabilidade Jest e preparação E2E/FlowUI. Q1 só inventário.
6. **P07**: consumir o Full do RC115 quando o dono do selo o autorizar; não disparar outro.

Q2/Q3 #17/#1305 e visual #18 estão mergeados e ancestrais dos checkpoints. A instalação atual no Mac e a execução das correções propostas na Fase 4 **não** estão comprovadas. O código das duas lacunas Git/B0 permanece no runner auditado.

Leia [diagnóstico](01-DIAGNOSTICO.md), [matriz de medições](02-MATRIZ-MEDICOES.md), [orçamento/experimentos](03-ORCAMENTOS-E-EXPERIMENTOS.md) e [artefatos faltantes](04-ARTEFATOS-PENDENTES.md). Prompts completos na pasta `prompts/`.
