# Rastreabilidade — fonte integral, conversa e realidade atual

## Fonte preservada

Anexo reenviado por Marco: `ARQUITETURA-PACKS-CI-QUEUE.md`, documento de 20/09/2026, 575 linhas e 46.607 bytes UTF-8.

- SHA-256: `bd6ee15650226a4a761db31b789364d5ad252c5f07de8b44e66b5df0ab882abe`.
- Git blob: `13f9092eb1f4286e914e93164eb58c4898460c85`.
- Cópia integral: [ARQUITETURA-PACKS-CI-QUEUE.fonte-20260920.md](ARQUITETURA-PACKS-CI-QUEUE.fonte-20260920.md).

A fonte fica intacta para não perder contexto ou decisões antigas. A entrada de trabalho é o PRD/SPEC atuais, não esse anexo. A intenção continua viva; o que foi substituído é a recomendação de implementar imediatamente e alguns pressupostos de contrato. Não copiar commands propostos da fonte como commands disponíveis.

## Destino dos 20 tópicos

| Seção original | Destino atual | Disposição explícita |
|---|---|---|
| 1. Decisão executiva | PRD; status; Analyst | Preservar problema; substituir recomendação de entrega imediata por backlog pausado. |
| 2. O que existe/falta | Analyst/Recon; fontes abaixo | Atualizado para dev e candidatas de 23/09; não usar bases de 20/09 como runtime atual. |
| 3. Vocabulário | SPEC/Integração; handbook | Receita, ticket, lote, sessão, política e proof pack permanecem distintos. |
| 4. Degraus de adoção | PRD/Escopo; SPEC C08 | Básico continua independente. Degraus avançados não são requisitos de adoção. |
| 5. Pedido/membros/atomicidade | SPEC C01–C04, G02–G09 | Preservar durabilidade/recovery/fail-fast. Bloco contíguo e cancelamento combinado foram reabertos para decisão explícita. |
| 6. Execução versus prova | SPEC C01/C04/C08 | Sem reuso silencioso, verde duplicado ou transferência de ownership. Zero members não vira passed. |
| 7. UI | SPEC C05; PRD A08/A10 | Agrupamento externo, árvore por ticket, detalhe sob demanda, sem nova sidebar obrigatória. |
| 8. Envelopes de ship/runner | SPEC/Integração C06 | Domínio/fixtures continuam no consumidor; worker não passa a mergear. |
| 9. Runner de família | PRD/Alternativas; SPEC C06 | Manter e aproveitar o método de feedback da candidata, sem implantar documentação paralela. |
| 10. Sessão única versus jobs | Analyst/Alternativas; SPEC/Integração | Agregador reconhecido como primeira escolha quando atende; sua perda de reuso independente é explícita. |
| 11. DietFlow impact | SPEC C08 | Seletor nativo é exemplo, não mapa completo de cobertura nem substituto de Full. |
| 12. Seleção por diff | SPEC C08; Analyst/Gaps | Ideia preservada para decisão separada, com ações e obrigações distintas. Não escolhida agora. |
| 13. Identidade dinâmica | SPEC C01/C06/C08 | Seleção/env precisam de proveniência; args operacionais não comprovam recorte; legacy sem fato fica desconhecido. |
| 14. Proofs e commit | SPEC C07; PRD A11 | Gerar/revisar/commitar/verificar separados; sem hash autorreferente nem promoção entre Hs. |
| 15. Ship | SPEC/Integração C08; Analyst | OR atual preservado; AND/OR futuro exige contrato/compatibilidade; sequência no ship também pausada. |
| 16. CLI | PRD U01–U06; SPEC C01–C05 | Formas `pack run/inspect/cancel` da fonte são conceituais e inexistentes; sintaxe final só em retomada. Retomar waiter não cancela. |
| 17. Docs/distribuição | PRD A01/A12; SPEC G12 | Reusar Quickstart/método/templates atuais; comandos novos só documentados como disponíveis após entrega. |
| 18. Cortes | SPEC/Sequência candidata | Pack manual primeiro apenas se justificado. Seleção/ship posteriores são opções, não agenda obrigatória. |
| 19. Aceites | PRD A01–A12; SPEC G01–G12 e Verificação | Todos os cenários preservados nas classes de compatibilidade, durabilidade, prova, fail-fast, isolamento, UI e seleção. Nenhum marcado executado. |
| 20. Conclusão | Analyst/Parecer; status | Memória preservada; decisão final atual é não assumir a feature no fechamento F4/F5. |

## Alterações deliberadas após a conversa

1. Persistência de sessão resolve preparação; pack resolve intenção de conjunto. Não creditar 80% como medida.
2. FIFO não é TOCTOU e enqueues separados não são lote atômico.
3. Enfileirar todos e cancelar pelo polling do ship pode admitir B antes de perceber A vermelho.
4. Ship que submete progressivamente é alternativa implementável, mas traz workflow/retomada próprios; não o adotar como substituto gratuito.
5. Agregador num ticket pode ser a decisão mais simples para produção; preservar cleanup depois de falha e impedir nested enqueue com espera na mesma fila.
6. Ordem contígua de um pack não está aprovada; fila e política de interleaving precisam de decisão que considere feedback curto.
7. Parar restantes e cancelar ativo não devem compartilhar semântica surpresa.
8. Receitas somente por nome não cobrem sessão/seletores do feedback novo; essa extensão é decisão antes de afirmar suporte.
9. Atualização da proposta não cria plan.json ativo nem dependência do fechamento F4/F5.

## Fontes e procedência

Consulta em 23/09/2026, somente leitura dos repositórios para análise. As escritas desta tarefa são exclusivamente deste backlog no CI Queue. Não houve acesso ao state nem prova instalada do Mac.

| ID | Fotografia conferida | Alcance |
|---|---|---|
| S01 | [CI Queue dev ef057973](https://github.com/nmarcofernandess/ci-queue/tree/ef057973bd1f006f493487f6cc9b96b2b7e741f8) | Base da branch documental; não traz por consequência a PR candidata. |
| S02 | [CQ #26](https://github.com/nmarcofernandess/ci-queue/pull/26), HEAD `83dfd5e285a24c1fdcb9cd4c0cbb8f47e9a51161` | Draft, não mergeada na consulta; resultados da descrição são relatos, não testes desta auditoria. |
| S03 | [worker.ts](https://github.com/nmarcofernandess/ci-queue/blob/83dfd5e285a24c1fdcb9cd4c0cbb8f47e9a51161/src/core/worker.ts#L85-L157) e [state.ts](https://github.com/nmarcofernandess/ci-queue/blob/83dfd5e285a24c1fdcb9cd4c0cbb8f47e9a51161/src/core/state.ts#L95-L164) | Pipeline individual, publicação por ticket, ordenação createdAt/ID; não há disciplina de membros nesse caminho. |
| S04 | [ship.ts](https://github.com/nmarcofernandess/ci-queue/blob/83dfd5e285a24c1fdcb9cd4c0cbb8f47e9a51161/src/ship/ship.ts#L260-L310), [Quickstart](https://github.com/nmarcofernandess/ci-queue/blob/83dfd5e285a24c1fdcb9cd4c0cbb8f47e9a51161/docs/CONSUMER-QUICKSTART.md) | Uma alternativa aceita; agregador recomendado; timeout não é cancelamento; prova ≠ progresso. |
| S05 | [Método CQ](https://github.com/nmarcofernandess/ci-queue/blob/83dfd5e285a24c1fdcb9cd4c0cbb8f47e9a51161/docs/TESTING-METHOD.md) | Templates, sessão do consumidor, feedback e prova separados na candidata. |
| S06 | [DF dev c3885e9](https://github.com/dietflowoficial/Dietflow-app/tree/c3885e9acebc178a1a9e58b1d5a71f84b11cd13a); [DF #1323](https://github.com/dietflowoficial/Dietflow-app/pull/1323), HEAD `fbe5f4a86431667da08979f143392a6aab5cf03e`; [procedimento](https://github.com/dietflowoficial/Dietflow-app/blob/fbe5f4a86431667da08979f143392a6aab5cf03e/docs/ci/FEEDBACK-LOOP.md) | Draft de feedback, sessão verificada, seleção e retenção por tentativa. Não é instalação observada. |
| S07 | [AGENTS CQ](https://github.com/nmarcofernandess/ci-queue/blob/ef057973bd1f006f493487f6cc9b96b2b7e741f8/AGENTS.md), [Roadmap](https://github.com/nmarcofernandess/ci-queue/blob/ef057973bd1f006f493487f6cc9b96b2b7e741f8/docs/ROADMAP.md) | Ownership, não duplicar fontes e não introduzir políticas por documentação histórica. |
| S08 | [Superflow b99f78e](https://github.com/nmarcofernandess/superflow/tree/b99f78eee3251e3ac2ed4feffe04632a17ad0eb1); [contrato de estado](https://github.com/nmarcofernandess/superflow/blob/b99f78eee3251e3ac2ed4feffe04632a17ad0eb1/plugins/superflow/assets/references/state-contract.md); [comandos](https://github.com/nmarcofernandess/superflow/blob/b99f78eee3251e3ac2ed4feffe04632a17ad0eb1/plugins/superflow/assets/references/commands-contract.md) | PRD/status obrigatórios; SPEC/plan condicionais; somente pending/done; raiz padrão specs sem config adicional. |

As seções [S10–S19] do anexo original preservam suas fontes e datas de consulta. Esta revisão não afirma tê-las reexecutado nem transfere a certeza de 20/09 para uma instalação atual. Não compara ou migra frameworks. Os links externos do anexo são contexto de capacidades, não evidência de implementação de packs.

## Conservação sem ativação

A fonte integral fica em research para consulta histórica; o pacote não é movido a uma área de specs obsoletas. O roadmap aponta para esta entrada viva e o status descreve a pausa. Sem cópia do plugin, servidor QG, novo hook ou alteração de consumer runtime. Não há relação Superflow inventada para specs que não possuem ID registrado nesta coleção.
