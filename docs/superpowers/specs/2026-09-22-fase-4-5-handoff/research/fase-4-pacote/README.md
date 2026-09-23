# CI Queue · Fase 4 — decisão em uma tela

**Auditoria:** 21/09/2026. **Bases finais:** CQ `550409a92f359cffc3e75f34712d39133b8ab130`; DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`.
**Q2/Q3:** merge e ancestry comprovados nos dois dev. **Visual:** PR #18 também mergeada durante esta auditoria. **121:** permanece aberta.

| Decisão | Próximo passo mínimo |
|---|---|
| Corrigir duas fronteiras de prova no runner | **C01 primeiro:** erro de `git status` não é clean; B0 do preflight deve chegar ao processo antes de executar. |
| Preservar o trabalho visual já entregue | **V01:** revisar capturas e limites residuais de #18, sem outra tabela. Flaky agora é indicador/tooltip, não badge junto ao nome. |
| Não esconder falha de refresh apagando o histórico | **C04:** dados anteriores da mesma consulta + erro local; nunca rows de outro projeto. |
| Fechar a integração de Q2/Q3 sem Full clínico | **C03:** emissor real → worker → API → UI compilada, mesmo ticket sintético. |
| Corrigir instruções contraditórias e lacunas de seleção | **C02 + C06:** manuais/121 e gatilhos de testes dos shells; preservar frameworks e contratos filesystem. |
| Tratar recursos sem atribuir causa por hipótese | **C05:** receipts/metadados existentes, ENOSPC por path/operação, Linux J/K separado do Mac; sem prune/experimento pesado. |

**Censo 72/72:** 37 CUMPRE COM PROVA · 14 SUBSTITUÍDO · 14 NÃO COMPROVADO · 7 OUT · 0 REGREDIU temporalmente demonstrado. “Prova” delimita código/teste inspecionado; não significa reexecução de suíte ou aceite do Mac. Defeitos atuais estão descritos mesmo sem commit causal atribuído.

**Frameworks:** manter Vitest/Node/Python/Playwright no CQ e Jest/Playwright/Storybook-Vitest no DF. Há papéis distintos, não uma migração obrigatória. **Grafos:** há dados parciais úteis para explicar seleção (`e2e-impact`); não há base suficiente para um DAG executivo global. Fica proposta.

## Entrega e navegação

- [Diagnóstico, riscos e decisões](01-DIAGNOSTICO.md)
- [Censo compacto por ID](02-CENSO-72-RESUMO.md) · [censo detalhado](02-CENSO-72.md) · [TSV para máquina](02-CENSO-72.tsv)
- [Estado M01–M07, Spec125 e Q1](03-ESTADO-121.md)
- [Artefatos faltantes e aceite](04-PROVAS-E-ACEITE.md)
- [C01 — runner/Git/B0](prompts/C01-GIT-E-BASE-CONGELADA.md)
- [C02 — reconciliação documental](prompts/C02-RECONCILIACAO-DOCUMENTAL.md)
- [C03 — prova integrada](prompts/C03-PROVA-INTEGRADA-Q2Q3.md)
- [C04 — refresh do Histórico](prompts/C04-ERRO-DE-REFRESH.md)
- [C05 — recursos, só leitura](prompts/C05-RECURSOS-E-RETENCAO-SOMENTE-LEITURA.md)
- [C06 — seleção e papéis dos testes](prompts/C06-SELECAO-E-FRONTEIRA-DOS-TESTES.md)
- [V01 — rechecagem pós-#18](prompts/V01-ACEITE-DA-PR-VISUAL-EXISTENTE.md)

Cada prompt é autônomo para o Codex: owner, base, limites, arquivos, comportamento esperado, prova focal e retorno ao orquestrador. Não dispare todos os cortes na mesma worktree. C01/C02/C05 são independentes em lógica; C04/V01 compartilham owners de UI e precisam coordenar; C03/C06 compartilham o produtor/testes no DF.

## Limites da auditoria

Dois excertos/sondas sintéticas de fronteira foram executados em Linux, sem receitas, Git real, worker ou state do operador. `probes/` e `results/` identificam o método. Não incorporá-los como runtime: o executor converte os cenários em testes proprietários do código vivo.

Não foi executado Full, suite de produto, browser integrado, install, cleanup, ready, merge ou deploy. Fontes e ancestry estão em [CHECKPOINT.json](CHECKPOINT.json). O único conteúdo produzido são estes artefatos de revisão. Receipts operacionais e capturas ainda não recebidos permanecem NÃO COMPROVADO; consultar a lista exata em [04](04-PROVAS-E-ACEITE.md).
