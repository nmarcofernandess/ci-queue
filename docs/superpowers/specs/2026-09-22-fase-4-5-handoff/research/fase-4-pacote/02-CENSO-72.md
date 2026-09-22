# Censo vivo — 72 IDs do CI-QUEUE-VERDADE.tsv

**Consulta:** 21/09/2026. **CI Queue:** `550409a92f359cffc3e75f34712d39133b8ab130`. **DietFlow:** `ffc99748f796d8f7923c9e46161b2a4dc735eef8`.
A conferência final incorpora a PR visual #18 e a ancestralidade de Q2/Q3 nos dois dev. O TSV original da convergência de 15/09 não foi alterado.

## Como ler

**CUMPRE COM PROVA** = mecanismo atual e teste/registro pertinente inspecionados no repositório, com o alcance descrito. Não significa suíte reexecutada nesta sessão nem homologação do Mac. **SUBSTITUÍDO POR DECISÃO POSTERIOR** = o literal antigo não deve ser restaurado; o sucessor está citado. **NÃO COMPROVADO** = defeito atual, conflito documental ou prova material ausente; `tipo_delta` os distingue. **OUT EXPLÍCITO** = exclusão do MVP permanece, sem proibir esta auditoria dos owners. **REGREDIU** exige um before/after causal comparável; não foi aplicado somente porque havia um carimbo KEEP antigo.

**Totais: 37 CUMPRE; 14 SUBSTITUÍDO; 14 NÃO COMPROVADO; 7 OUT; 0 REGREDIU temporalmente demonstrado.** Zero regressões atribuídas não significa zero defeitos: F4-01 a F4-04 e F4-08 estão explicitamente descritos no diagnóstico.

Duas sondas sintéticas de fronteira foram executadas. Não executei suites, API/browser integrados, instalação ou testes clínicos. O check #18 é relato identificado no PR, não reexecução desta auditoria.

Este anexo é uma paráfrase por ID. Cada item aponta à linha original, que conserva requisito, forbidden e acceptance completos. A lista não vira um novo manual permanente.



## 01. CTRL-001 — NÃO COMPROVADO

**Requisito:** Preservar precedência do operador, censo integral e rastreabilidade de decisões.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/AGENTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 3](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/STATUS-VERDADE.md) · [TSV L2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L2)

**Tipo:** documentação. **Efeito:** O carimbo histórico não resolve divergências ativas de CI/Full e novos contratos.

**Owner:** CQ + DF. **Menor ação:** Corte C02: mapa atual de substituições sem reescrever a prova de 15/09.

**Limite da prova:** Censo histórico lido; esta auditoria produz o mapa atual, não aprovação retroativa.


## 02. CTRL-002 — NÃO COMPROVADO

**Requisito:** Retomar de checkpoints, fatos e evidências, não da memória do chat.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/status.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/07-spend-abort-stale-base/status.md) · [TSV L3](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L3)

**Tipo:** documentação. **Efeito:** Próximo passo M07 ainda aponta implementação que já existe no produto.

**Owner:** DF. **Menor ação:** C02: apêndice de estado vivo M01–M07, com owner e prova pendente.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 03. BOUNDARY-001 — CUMPRE COM PROVA

**Requisito:** Produto independente; receitas, frameworks e preparação pertencem ao consumidor.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts) · [fonte 3](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/run.ts) · [TSV L4](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L4)

**Tipo:** contrato. **Efeito:** O worker recebe argv e fatos genéricos; não incorpora DietFlow.

**Owner:** CQ + DF. **Menor ação:** Preservar fronteira; C03 integra por protocolo/fixture, não por import de internals.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 04. UI-SHADCN-001 — CUMPRE COM PROVA

**Requisito:** Composição oficial Nova, primitives e owners compartilhados, sem sistema visual paralelo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/data-table-frame.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [TSV L5](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L5)

**Tipo:** preservar. **Efeito:** Composição e família estão implementadas; geometria específica de tabela precisa do aceite dedicado.

**Owner:** CQ. **Menor ação:** Não recriar primitives; V01 verifica o corte visual existente.

**Limite da prova:** Código/composições e assertions inspecionados. Qualidade visual atual está em VISUAL-ACCEPTANCE-001, sem novo aceite humano.


## 05. UI-REFERENCE-001 — CUMPRE COM PROVA

**Requisito:** Referências rejeitadas são históricas; composição aprovada não licencia copiar CSS/JSX antigo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/AGENTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md) · [TSV L6](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L6)

**Tipo:** contrato. **Efeito:** Evita restaurar o dashboard aposentado para corrigir uma tabela atual.

**Owner:** CQ. **Menor ação:** Conservar referência somente nos aspectos explicitamente preservados.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 06. UI-PROGRESS-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Faixa de raízes e árvore recursiva preservam fatos publicados.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_live_active.py) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/progress.test.ts) · [TSV L7](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L7)

**Tipo:** decisão posterior. **Efeito:** Q2/Q3 introduziu active/planned limitados, troca de inventário e resumo de retry omitido.

**Owner:** CQ + DF. **Menor ação:** C03 comprovar percurso integrado; não restabelecer árvore inteira em live.

**Limite da prova:** Sucessor implementado/testado em partes; prova única produtor→worker→API→UI permanece ausente.


## 07. API-PROGRESS-001 — CUMPRE COM PROVA

**Requisito:** API preserva árvore, parentesco, counts, retry e tempos seguros no detalhe.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_live_active.py) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_progress_timing.py) · [fonte 4](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py) · [TSV L8](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L8)

**Tipo:** contrato. **Efeito:** Detalhe preservado; live é projeção distinta e limitada, por decisão posterior.

**Owner:** CQ. **Menor ação:** Preservar testes de ciclos, duração zero/ausente e exclusão da árvore no live.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 08. EMITTER-STATIC-001 — CUMPRE COM PROVA

**Requisito:** Static publica gates reais sob o agregado, sem durações inventadas.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci-local.sh) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/progress-pipeline.test.ts) · [TSV L9](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L9)

**Tipo:** preservar. **Efeito:** Gate emite running/terminal; collector pode medir intervalo observado.

**Owner:** DF + CQ. **Menor ação:** C05 extrair tempos existentes do ticket antes de repetir execução.

**Limite da prova:** Emissor e collector lidos; 54/54 do receipt é relato identificado, não nova execução local.


## 09. EMITTER-E2E-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Bootstrap/Supabase/Next/Playwright compõem etapas reais, inclusive como filhos de Full.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/docs/ci/CI-QUEUE-CONSUMIDOR.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/e2e-local-stack.sh) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_live_active.py) · [TSV L10](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L10)

**Tipo:** decisão posterior. **Efeito:** Agora Playwright é planejado antes do Next e possui invocações próprias.

**Owner:** DF. **Menor ação:** C03: provar pending antes de prep, evolução e término no mesmo ticket.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 10. EMITTER-PW-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** IDs estáveis, população e duração por caso; retries não inflacionam total.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/playwright-progress-reporter.ts) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/progress.test.ts) · [TSV L11](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L11)

**Tipo:** decisão posterior. **Efeito:** Identidade passou a incluir invocação/repeatEach; detalhe limitado e retry omitido explícito.

**Owner:** DF + CQ. **Menor ação:** C03 usa emissor real e cenário 1001 com retry omitido; não repetir o limite silencioso antigo.

**Limite da prova:** Não declarei uma execução clínica nem repeti os testes do PR.


## 11. RETRY-FLAKY-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Retry real no mesmo job/nó aparece em current, histórico e drawer; não muda veredito.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/presentation.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/ui/presentation.test.ts) · [fonte 4](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/table-layout.spec.ts) · [fonte 5](https://github.com/nmarcofernandess/ci-queue/pull/18) · [TSV L12](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L12)

**Tipo:** decisão posterior / apresentação. **Efeito:** O fato retry/flaky permanece, mas #18 substitui o badge junto ao nome pelo tooltip e nome acessível do indicador. Cor terminal representa o resultado; em execução, falha precede retry.

**Owner:** CQ; DF fornece fato. **Menor ação:** Preservar o sucessor. V01 confere a candidata/artefatos de #18; C03 cobre o mesmo fato pela projeção live real, inclusive retry fora do detalhe.

**Limite da prova:** Descritor, testes unitários/browser e relato do check #18 lidos. Sem reexecução local ou aceite visual instalado nesta auditoria.


## 12. JEST-RELATED-001 — NÃO COMPROVADO

**Requisito:** Smoke seleciona relacionados e contratos filesystem sem fallback silencioso para Jest inteiro.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/jest-scope.ts) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/smoketest-local.sh) · [TSV L13](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L13)

**Tipo:** defeito de integração/duplicação potencial. **Efeito:** Selector existe, mas o env é preparado antes de ticket receber preflight; smoke pode resolver outra base após Static. Forced/related também podem repetir suíte.

**Owner:** CQ + DF. **Menor ação:** C01 entrega B0 observado ao filho; C06 mede interseção sem enfraquecer cobertura.

**Limite da prova:** Fonte e sonda do argumento/ordem lidas; não executei o runner integral nem enumerei testes de um diff neste host.


## 13. HISTORY-LEGACY-001 — CUMPRE COM PROVA

**Requisito:** Atribuição por ledger explícito, preservando JSONs originais e escopo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L329-L370) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L14](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L14)

**Tipo:** contrato. **Efeito:** Testes conferem bytes inalterados e não reatribuição de outro projeto.

**Owner:** CQ. **Menor ação:** Preservar; números 1668/734 são datados, não população atual.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 14. LOGS-LEGACY-001 — NÃO COMPROVADO

**Requisito:** Log ausente/erro/recorte distintos; preservar os bytes existentes.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L610-L691) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/evidence/ci-queue-verdade/README.md) · [TSV L15](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L15)

**Tipo:** evidência operacional ausente. **Efeito:** Contrato de leitura existe, mas preservação do conjunto físico atual requer manifest do Mac.

**Owner:** CQ + operador. **Menor ação:** Pedir inventário/hash não destrutivo; C05 não apaga logs.

**Limite da prova:** Recibo de 15/09 comprova somente seu conjunto/revisão; não certifica os arquivos presentes em 21/09.


## 15. OUT-MAP-001 — OUT EXPLÍCITO

**Requisito:** Catálogo/Explorar/Workflows não pertencem ao MVP de observação.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv) · [TSV L16](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L16)

**Tipo:** fora do corte. **Efeito:** Não há obrigação de construir um catálogo de testes nesta entrega.

**Owner:** Produto/roadmap. **Menor ação:** Manter OUT; relação parcial de impacto fica no consumidor.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 16. OUT-RAM-001 — OUT EXPLÍCITO

**Requisito:** Não publicar memória disponível/causalidade ou charts RAM sem contrato confiável.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L17](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L17)

**Tipo:** fora do corte. **Efeito:** Disco livre atual não autoriza inferir saúde de RAM.

**Owner:** Produto/roadmap. **Menor ação:** Sem gráfico de RAM; dados de experimento M03 ficam como evidência, não painel executivo.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 17. OUT-ARTIFACTS-001 — OUT EXPLÍCITO

**Requisito:** Retenção/redesenho de artefatos é corte M05 separado, não poda de UI.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/05-politica-artefatos-retencao/PRD.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/superpowers/specs/2026-09-20-q1-disk-inventory.md) · [TSV L18](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L18)

**Tipo:** fora do corte. **Efeito:** Inventário não autoriza exclusão.

**Owner:** CQ + DF + operador. **Menor ação:** C05 classifica ownership/consumidores; qualquer prune exige outro aceite.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 18. OUT-GRAPHS-001 — OUT EXPLÍCITO

**Requisito:** Sem ReactFlow/DAG/topologia de execução no MVP.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/e2e/impact-groups.json) · [TSV L19](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L19)

**Tipo:** fora do corte. **Efeito:** parentId e dependsOn de grupos não provam grafo executivo completo.

**Owner:** Produto/roadmap. **Menor ação:** Manter proposta de explicação de seleção, sem nova tela/biblioteca.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 19. DOC-DESTINATION-001 — NÃO COMPROVADO

**Requisito:** Produto tem manuais canônicos; DF guarda integração e 121 guarda história.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/docs/ci/README.md) · [fonte 3](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/.context/patterns/ci.yaml) · [TSV L20](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L20)

**Tipo:** documentação. **Efeito:** Há ponteiros antigos e descrições de owner/runtime superadas.

**Owner:** CQ + DF. **Menor ação:** C02 corrige owners/ponteiros atuais sem duplicar manual nem reescrever histórico.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 20. CTRL-003 — CUMPRE COM PROVA

**Requisito:** 72 IDs únicos e enumeração histórica íntegra, sem linhas desaparecidas.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/STATUS-VERDADE.md) · [TSV L21](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L21)

**Tipo:** preservar. **Efeito:** O conjunto de 72 foi preservado; os estados antigos não viram automaticamente estados vivos.

**Owner:** DF. **Menor ação:** Preservar TSV original; anexar este censo datado por ID.

**Limite da prova:** 72 IDs lidos em partes pelo connector; blob declarado 18c9f829…, não checksum de cópia local do TSV original.


## 21. SHELL-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Sidebar/header/Bridge/tema sem chrome de protótipo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [TSV L22](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L22)

**Tipo:** decisão posterior. **Efeito:** Footer passou a ambiente local/menu com tema; seletor de projeto é global no header.

**Owner:** CQ. **Menor ação:** Testar composição atual e não restabelecer três botões por literal antigo.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 22. STATUS-001 — CUMPRE COM PROVA

**Requisito:** Current, fila, histórico e rail têm áreas distintas, responsivas.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/status-page.tsx) · [TSV L23](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L23)

**Tipo:** contrato. **Efeito:** Estados e localização não exigem redesenho; tabela é owner compartilhado.

**Owner:** CQ. **Menor ação:** V01 verifica que correção de largura não transborda o page body.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 23. JOB-BOUNDARY-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Running/queued/terminais não se duplicam indevidamente.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_execution_observations.py) · [TSV L24](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L24)

**Tipo:** decisão posterior. **Efeito:** Histórico também recebe observações diretas terminais, sem convertê-las em prova.

**Owner:** CQ. **Menor ação:** C03 preserva source/identidade; não remover observações por TSV datado.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 24. CURRENT-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Execução atual mostra identidade e contexto real; não repete último terminal.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/status-page.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_live_active.py) · [TSV L25](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L25)

**Tipo:** decisão posterior. **Efeito:** Agora há chip de projeto, elapsed destacado, média observacional opcional e contexto planejado.

**Owner:** CQ. **Menor ação:** V01/C03 preservam média só quando publicada, identidade e 0/N antes do Next.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 25. TABLE-001 — CUMPRE COM PROVA

**Requisito:** Uma composição TanStack/Table compartilhada, só título/olho abrem.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/data-table-frame.tsx) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/worktrees/worktrees-page.tsx) · [fonte 4](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [TSV L26](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L26)

**Tipo:** contrato. **Efeito:** Owner compartilhado existe; não é necessário framework de UI novo.

**Owner:** CQ. **Menor ação:** A lane visual corrige a família uma vez; V01 verifica todos os consumidores.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 26. TABLE-DENSITY-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Linhas uniformes de tabela, ícone acessível, preset/olho como triggers, tempo e revisão comparáveis; a forma de apresentar tempo/badges mudou depois do TSV.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/data-table-frame.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/table-layout.spec.ts) · [fonte 4](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md) · [fonte 5](https://github.com/nmarcofernandess/ci-queue/pull/18) · [TSV L27](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L27)

**Tipo:** decisão posterior de apresentação; geometria corrigida em #18. **Efeito:** O literal antigo combinava absoluto/relativo visíveis na célula e vedava badges textuais. O contrato atual mantém absoluto na célula e relativo no tooltip, admite projeto/variante e move flaky para o indicador. #18 corrige largura, revisão e ação fixa com testes geométricos.

**Owner:** CQ / lane visual existente. **Menor ação:** Preservar o sucessor e a correção #18; não restaurar a densidade/copy histórica. V01 verifica as capturas e o acesso completo; C04 não muda geometria.

**Limite da prova:** Mecanismo e testes geométricos 1440/820/390 claro/escuro inspecionados; check 55/55 relatado no PR. Não é inspeção visual desta sessão.


## 27. QUEUE-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Ordem real, vazio compacto, sem filtros e sem terminal na fila.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) · [TSV L28](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L28)

**Tipo:** decisão posterior. **Efeito:** Fila é global com identidade do projeto; regra antiga scoped foi substituída.

**Owner:** CQ. **Menor ação:** Preservar globalidade e chip; não voltar a ocultar ocupação alheia.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 28. HISTORY-001 — NÃO COMPROVADO

**Requisito:** Histórico único, filtros/URL e paginação coerentes sem falso vazio.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/status-page.tsx) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [TSV L29](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L29)

**Tipo:** defeito de apresentação. **Efeito:** data+error é preservado no hook, porém RunTable exige !error para renderizar linhas; refresh pode ocultar os dados.

**Owner:** CQ. **Menor ação:** C04: estado dados+erro local sem sumir linhas; V01 cobre geometria depois da lane visual.

**Limite da prova:** Caminho fonte confirmado; não houve execução React/browser nesta sessão.


## 29. GREENS-001 — CUMPRE COM PROVA

**Requisito:** Máquina/Git e agrupamento não substituem canonicidade nem buscam verde mais velho pelo período.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/status-page.tsx) · [TSV L30](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L30)

**Tipo:** contrato. **Efeito:** Reader/projeção diferenciam fontes e não fazem refresh remoto pelo browser.

**Owner:** CQ + DF slots. **Menor ação:** Preservar testes de origem/recorte e exclusão de observações diretas.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 30. COMMIT-DRAWER-001 — CUMPRE COM PROVA

**Requisito:** Grupo por commit não fabrica ticket/log; SHA copiável e tabela interna.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/green-commit-table.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L31](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L31)

**Tipo:** contrato. **Efeito:** Browser versionado usa Git-only sem abrir execução inexistente e mede tabela interna.

**Owner:** CQ. **Menor ação:** V01 inclui esse consumidor na regressão da família; sem nova estrutura.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 31. MACHINE-001 — CUMPRE COM PROVA

**Requisito:** Somente disco livre atual, sem ação e sem zero/saúde inferidos.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/status-page.tsx) · [TSV L32](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L32)

**Tipo:** contrato. **Efeito:** Não confundir esse snapshot com diagnóstico causal ENOSPC/RAM.

**Owner:** CQ. **Menor ação:** C05 mede volume/caminho separadamente, não acrescenta painel de recursos.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 32. META-001 — CUMPRE COM PROVA

**Requisito:** Uma meta, presets futuros permitidos, candidato só quando verdes convergem.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L475-L550) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [TSV L33](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L33)

**Tipo:** contrato. **Efeito:** Testes cobrem meta única, referência faltante e candidato nulo com SHAs diferentes.

**Owner:** CQ. **Menor ação:** Preservar; Meta não vira requisito de ship.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 33. META-DRAWER-001 — CUMPRE COM PROVA

**Requisito:** CRUD local com revisão, cancelamento/draft e erro preservados; não recebe SHA manual.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py) · [TSV L34](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L34)

**Tipo:** contrato. **Efeito:** Testes existentes verificam cancel, edit+erro e revisão.

**Owner:** CQ. **Menor ação:** Não incluir Meta na task de geometria das listas além do teste compartilhado.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 34. PENDING-001 — CUMPRE COM PROVA

**Requisito:** Advisory automático/idempotente/leitura; verde posterior elegível pode resolvê-lo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L545-L610) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L35](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L35)

**Tipo:** contrato. **Efeito:** Há teste de resolução por verde local e espelho Git verificado, sem writer visual.

**Owner:** CQ + DF. **Menor ação:** Preservar assinatura/contexto de publicação; sem lista manual nova.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 35. FULL-ADVISORY-001 — NÃO COMPROVADO

**Requisito:** Smoketest é piso; recomendação Full não bloqueia nem enfileira Full automaticamente.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/.claude/CLAUDE.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/.context/patterns/ci.yaml) · [fonte 3](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ship/ship.ts) · [TSV L36](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L36)

**Tipo:** documentação conflitante. **Efeito:** Instrução ativa §8 manda Full antes de ship por path enquanto seção específica o chama informativo.

**Owner:** DF. **Menor ação:** C02 unifica instrução; C06 regressão por chamadas e cenários, não por string.

**Limite da prova:** Não reexecutei ship; sem atribuir a esse texto um bloqueio de runtime não observado.


## 36. EXEC-DRAWER-001 — CUMPRE COM PROVA

**Requisito:** Família de drawers fixa header/tabs/footer, centro rola, fatos não redundantes.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [TSV L37](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L37)

**Tipo:** contrato. **Efeito:** Testes de log longo e cinco drawers verificam regiões fixas e gatilhos.

**Owner:** CQ. **Menor ação:** V01 smoke da família após alteração compartilhada; aprovação humana permanece separada.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 37. FAILURE-CONTEXT-001 — CUMPRE COM PROVA

**Requisito:** failureReason factual no contexto/diagnóstico, mesmo sem log; não inferir causa de texto.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L639-L677) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L38](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L38)

**Tipo:** contrato. **Efeito:** Teste usa ENOSPC/OOM/SIGSEGV no log e exige não criar classificador de incidentes.

**Owner:** CQ. **Menor ação:** Manter distinção erro do processo vs causa não comprovada.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 38. DIAGNOSTIC-001 — CUMPRE COM PROVA

**Requisito:** Popover no footer, copiar/baixar bundle com cobertura, sem botão de log paralelo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L39](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L39)

**Tipo:** contrato. **Efeito:** Browser cobre cópia/download e ausência de download separado de log.

**Owner:** CQ. **Menor ação:** Preservar texto e acesso por teclado.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 39. LOG-FOLLOW-001 — CUMPRE COM PROVA

**Requisito:** Offset incremental, follow/pausa por seleção e drenagem no terminal.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L677-L698) · [TSV L40](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L40)

**Tipo:** contrato. **Efeito:** Testes cobrem cursores, Unicode/redação, seleção, append e parada depois do terminal.

**Owner:** CQ. **Menor ação:** Não trocar polling por Full nem usar log como fonte de status inferido.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 40. WORKTREES-001 — CUMPRE COM PROVA

**Requisito:** Busca/seleção e triggers reais; nome e olho ficam visíveis no scroll pela decisão atual.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/worktrees/worktrees-page.tsx) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/index.css) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/table-layout.spec.ts) · [fonte 4](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [TSV L41](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L41)

**Tipo:** correção visual incorporada / preservar. **Efeito:** Nome e seleção têm sticky à esquerda, ação à direita. Teste de #18 exige nome/checkbox/olho no viewport após rolagem e abertura por teclado, sem tornar linha/checkbox trigger.

**Owner:** CQ / lane visual existente. **Menor ação:** V01 usa os testes novos e acrescenta somente prova residual de meio da rolagem, sobreposição e elisão acessível quando faltar; nenhuma tabela paralela.

**Limite da prova:** Código e teste de comportamento lidos, não executados aqui. Receber capturas identificadas para VISUAL-ACCEPTANCE-001.


## 41. WORKTREE-REFRESH-001 — CUMPRE COM PROVA

**Requisito:** Um ciclo de inventário/Git/tamanho, serial/coalescido, drawer mesmo snapshot.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_worktrees.py) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/worktrees/worktrees-page.tsx) · [TSV L42](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L42)

**Tipo:** contrato. **Efeito:** Testes demonstram coalescência, tamanho anterior e mesma coleção do drawer.

**Owner:** CQ. **Menor ação:** Preservar. C05 não inicia scans paralelos do host.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 42. WORKTREE-DRAWER-001 — CUMPRE COM PROVA

**Requisito:** Dados reais da worktree, abrir pasta validada e copiar, sem ações destrutivas.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_worktrees.py) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/worktrees/worktrees-page.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [TSV L43](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L43)

**Tipo:** contrato. **Efeito:** Ação nativa resolve inventário; testes recusam ID/path removido e retorno não zero.

**Owner:** CQ. **Menor ação:** Preservar código e teste; gesto nativo no Mac atual ainda demanda evidência operacional.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 43. ANALYSIS-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Análise só estatísticas Resultados/Duração, controles coerentes.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/analysis-selection.spec.ts) · [TSV L44](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L44)

**Tipo:** decisão posterior. **Efeito:** Resultados virou multiselect cumulativo top10; Duração continua single preset.

**Owner:** CQ. **Menor ação:** Não impor ao Results o Select único antigo.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 44. ANALYSIS-RESULTS-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Quatro estados da população retida, sem teto200, contagem exata acessível.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L167-L194) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_analysis_results.py) · [TSV L45](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L45)

**Tipo:** decisão posterior. **Efeito:** Altura das barras agora é percentual por preset, contagens permanecem exatas.

**Owner:** CQ. **Menor ação:** Manter denominador por preset/projeto e seleção top10; não taxa global.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 45. ANALYSIS-DURATION-001 — CUMPRE COM PROVA

**Requisito:** Scatter canônico iniciado/comparável, mediana/faixa/amostra; zero só se real.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/analysis-integrated.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L46](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L46)

**Tipo:** contrato. **Efeito:** Contrato separa população de duração da contagem geral; sem linha/trend.

**Owner:** CQ. **Menor ação:** Preservar testes de duração ausente, canonicidade e fonte; sem migração de gráfico.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 46. ANALYSIS-PROBLEMS-001 — CUMPRE COM PROVA

**Requisito:** Problemas e ação equivalente na Máquina ficam removidos.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L167-L197) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L47](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L47)

**Tipo:** contrato. **Efeito:** Testes exigem ausência de problems/problemTotal/nextOffset e navegação substituta.

**Owner:** CQ. **Menor ação:** Não usar fase4 para ressuscitar incident hub.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 47. CHARTS-001 — CUMPRE COM PROVA

**Requisito:** Shell oficial de chart, tooltip/legend e altura limitada com unidades corretas.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/COMPOSITION-LEDGER.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [TSV L48](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L48)

**Tipo:** contrato. **Efeito:** Testes geométricos e de tipos de série existem; distribuição/percentual é decisão posterior.

**Owner:** CQ. **Menor ação:** Preservar; aceite visual final continua separado do check.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 48. ERROR-001 — NÃO COMPROVADO

**Requisito:** Erro local não vira vazio nem apaga dados bons durante refresh; contexto correto.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/status/status-page.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L49](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L49)

**Tipo:** defeito de produto. **Efeito:** Hook retém data+error, renderer do Histórico só renderiza dados com !error.

**Owner:** CQ. **Menor ação:** C04 trata cold-error versus refresh-error e testa recuperação/troca de filtro.

**Limite da prova:** Mecanismo lido, não browser próprio. Não atribuído à lane visual que trata largura.


## 49. TIME-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Âncora correta de tempo, cancelamento sem início sem duração; relógio local compartilhado.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [TSV L50](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L50)

**Tipo:** decisão posterior. **Efeito:** Nas tabelas a decisão atual põe absoluto na célula e relativo no tooltip; collector fornece duração aproximada.

**Owner:** CQ. **Menor ação:** Preservar ausência/zero e tempo local; não repetir literal antigo absoluto+relativo inline.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 50. CLICK-001 — CUMPRE COM PROVA

**Requisito:** Só título/olho abrem detalhe; linhas, seleção e metadados inertes.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/shared/run-table.tsx) · [fonte 4](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/ui/src/features/worktrees/worktrees-page.tsx) · [TSV L51](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L51)

**Tipo:** contrato. **Efeito:** Fixtures verificam interação; não mudar linha inteira para link para facilitar scroll.

**Owner:** CQ. **Menor ação:** V01 prova hit targets após rolagem sem cobrir checkbox.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 51. OUT-DEEP-TEST-001 — OUT EXPLÍCITO

**Requisito:** Causa do Full e harness profundo ficam na 121, não no MVP visual.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/STATUS-VERDADE.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/status.md) · [TSV L52](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L52)

**Tipo:** fora do corte visual. **Efeito:** Esta fase autoriza auditoria desse tema, não Full automático nem conclusão da 121.

**Owner:** DF / Spec121. **Menor ação:** C05/C06 leem evidências e seleção; experimento pesado fica em janela separada.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 52. OUT-SAAS-001 — OUT EXPLÍCITO

**Requisito:** SaaS, OAuth/billing/worker remoto não fazem parte do corte.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ROADMAP.md) · [TSV L53](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L53)

**Tipo:** fora do corte. **Efeito:** Intenção futura de produto não autoriza redesenhar instalação/execução.

**Owner:** Produto/roadmap. **Menor ação:** Conservar proposta e fronteiras atuais.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 53. DOC-M06-PRD-001 — NÃO COMPROVADO

**Requisito:** M06 registra convergência e aponta dono canônico, sem se tornar novo manual.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/PRD.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L54](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L54)

**Tipo:** documentação. **Efeito:** Há literal histórico de direto sem instalação, superado pela adoção opt-in do guard nos agregados.

**Owner:** DF. **Menor ação:** C02 anota substituição no estado atual; não restaura bypass.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 54. DOC-M06-EXEC-001 — CUMPRE COM PROVA

**Requisito:** Registro de execução separa evidência produto/instalação/consumidor e revisões.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/evidence/ci-queue-verdade/README.md) · [TSV L55](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L55)

**Tipo:** preservar. **Efeito:** A cronologia distingue checks, falhas, smoke e preservação; prova é datada.

**Owner:** DF. **Menor ação:** Preservar sem atualizar contagens antigas como se fossem do runtime vivo.

**Limite da prova:** Cumpre como registro histórico, não prova operacional do Mac em 21/09.


## 55. DOC-M06-STATUS-001 — CUMPRE COM PROVA

**Requisito:** M06 pode estar done sem encerrar a 121 inteira.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/status.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/status.md) · [TSV L56](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L56)

**Tipo:** contrato. **Efeito:** O corte de 15/09 tem fechamento próprio; mãe continua pendente.

**Owner:** DF. **Menor ação:** C02 reconciliar índice/resumo vivo, sem reabrir M06 por features novas.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 56. REF-HIST-001 — CUMPRE COM PROVA

**Requisito:** Prototipagem e materiais preservados não regem o produto vivo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/AGENTS.md) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/STATUS-VERDADE.md) · [TSV L57](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L57)

**Tipo:** contrato. **Efeito:** Não copiar o antigo Vite/harness ou decisões revogadas.

**Owner:** CQ + DF. **Menor ação:** Usar links de história com data e dono, nunca implementar a partir deles.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 57. PERSIST-PROGRESS-001 — CUMPRE COM PROVA

**Requisito:** Sidecar atômico é conservado até publicação terminal; retry/tempos íntegros.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts#L294-L353) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/progress-pipeline.test.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/progress.test.ts) · [TSV L58](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L58)

**Tipo:** preservar. **Efeito:** Teste de lock bloqueado mantém sidecar; emitter→worker→history preserva duração.

**Owner:** CQ. **Menor ação:** C03 acrescenta mesma passagem com emissor real e API/UI.

**Limite da prova:** Teste de chmod para simular falha precisa confirmar que falhou sob o usuário do runner; não tratar chmod isolado como falha observada.


## 58. CANCEL-001 — CUMPRE COM PROVA

**Requisito:** Cancelamento queued vira terminal/log sem startedAt/duração; execução cancela por identidade.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts#L393-L444) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/queue-engine.test.ts) · [TSV L59](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L59)

**Tipo:** contrato. **Efeito:** Motor separa queued/running e preserva terminal. UI usa não iniciada conforme contrato.

**Owner:** CQ. **Menor ação:** Preservar controle PID/PGID/nascimento; sem botão cancel no dashboard.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 59. CLI-PARITY-001 — CUMPRE COM PROVA

**Requisito:** CLI/HTTP compartilham fatos, com diferenças legítimas de capacidades e sem Git como arquivo de logs.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L370-L394) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L60](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L60)

**Tipo:** contrato. **Efeito:** Teste compara identidade/status/verde/log em fixture de state; Git continua transporte resumido.

**Owner:** CQ. **Menor ação:** C03 amplia paridade com variante efetiva, retries omitidos e inventário do mesmo ticket.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 60. DIAG-COVERAGE-001 — CUMPRE COM PROVA

**Requisito:** Diagnóstico usa fatos backend e cobertura/redação, não texto DOM nem causas inferidas.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L611-L701) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L61](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L61)

**Tipo:** contrato. **Efeito:** Teste distingue metadata de logs/export e recorte head/tail.

**Owner:** CQ. **Menor ação:** Preservar; C05 usa log para localizar erro, não inferir saúde geral.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 61. WORKTREE-SIZE-001 — CUMPRE COM PROVA

**Requisito:** du serial, cache last-good, erro local e sem medidor paralelo.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_worktrees.py) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [TSV L62](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L62)

**Tipo:** contrato. **Efeito:** Teste confirma uma solicitação quando stale e retenção após timeout.

**Owner:** CQ. **Menor ação:** Não comparar bytes lógicos agregados com livre físico sem qualificação.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 62. NATIVE-OPEN-001 — NÃO COMPROVADO

**Requisito:** Abrir pasta por ID observado, Host/Origin/CSRF e argv fixo; ausência é erro.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_worktrees.py) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L728-L752) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L63](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L63)

**Tipo:** cobertura operacional. **Efeito:** Core de ação e sessão têm testes, mas não li toda combinação HTTP específica de reveal nem observei a ação no host atual.

**Owner:** CQ. **Menor ação:** C03/recepção conferir negativos HTTP; pedir recibo somente se afirmar operação instalada.

**Limite da prova:** Não há novo gesto nativo/macOS comprovado nesta sessão; nenhum prompt deve abrir Finder para esta auditoria.


## 63. PENDING-LEGACY-001 — CUMPRE COM PROVA

**Requisito:** Remover notas manuais e writer visual de Pendências.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L476-L490) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [TSV L64](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L64)

**Tipo:** contrato. **Efeito:** save-note é recusado e painel é somente leitura.

**Owner:** CQ. **Menor ação:** Preservar; não transformar recomendações em backlog editável do dashboard.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 64. META-LEGACY-001 — CUMPRE COM PROVA

**Requisito:** Não aceitar SHA-alvo manual; derivar candidato das fontes reais.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L499-L544) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [TSV L65](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L65)

**Tipo:** contrato. **Efeito:** Candidato nulo quando verdes divergem; editor não solicita SHA.

**Owner:** CQ. **Menor ação:** Preservar; não usar Meta como attestation/ship.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 65. OUT-RESOURCES-001 — OUT EXPLÍCITO

**Requisito:** Sem séries/causalidade de host ou tab Recursos no MVP.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L66](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L66)

**Tipo:** fora do corte. **Efeito:** Observações diretas terminais não são o antigo painel de RAM/incidentes e não violam esta exclusão.

**Owner:** Produto/roadmap. **Menor ação:** Manter OUT para telemetria de host; não apagar histórico direto por palavra observations.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 66. LAST-GREEN-001 — CUMPRE COM PROVA

**Requisito:** Máquina exige receita/projeto/argv/resultado canônicos; Git é só fotografia publicada.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L147-L166) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L394-L474) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [TSV L67](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L67)

**Tipo:** contrato. **Efeito:** Leitores não recuperam logs por tag nem promovem custom. Prova material estrita é outra fronteira.

**Owner:** CQ + DF. **Menor ação:** C01 corrige origem desconhecida de status Git no runner; não muda regra dos readers de último verde.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 67. OBSERVER-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Dashboard não opera jobs/merge; estados editáveis locais têm owners e guardas.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L68](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L68)

**Tipo:** decisão posterior. **Efeito:** CRUD local de projetos e escolha nativa de pasta foram adicionados; “somente Meta” ficou datado.

**Owner:** CQ. **Menor ação:** Preservar proibição de mutar jobs/Git; não remover registry por regra histórica.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 68. STATUS-PROJECT-SCOPE-001 — SUBSTITUÍDO POR DECISÃO POSTERIOR

**Requisito:** Todo job exibido abre detalhe, sem atribuição falsa a outro projeto.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L195-L229) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/ui/PRODUCT-CONTRACT.md) · [TSV L69](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L69)

**Tipo:** decisão posterior. **Efeito:** Contrato vigente: execução/fila globais, listas filtradas e detalhe por ticket, sem trocar seletor.

**Owner:** CQ. **Menor ação:** Não restaurar running/fila scoped. C03 prova projeto diferente do filtro.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 69. UI-TESTS-001 — NÃO COMPROVADO

**Requisito:** Testes de composição/estados/teclado/responsivo falham em regressões reais.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/dashboard.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/package.json) · [fonte 4](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/table-layout.spec.ts) · [TSV L70](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L70)

**Tipo:** cobertura. **Efeito:** #18 acrescentou regressão geométrica e de estado em 55 testes browser relatados; faltam a cadeia única produtor/worker/API/UI compilada e provas operacionais/visuais não substituídas por fixtures.

**Owner:** CQ. **Menor ação:** V01 + C03 + C04; não acrescentar somente snapshots/classes.

**Limite da prova:** Prova de repositório; não atesta instalação atual.


## 70. VISUAL-ACCEPTANCE-001 — NÃO COMPROVADO

**Requisito:** Aceite explícito da candidata identificada, sem confundir check com inspeção humana.

**Prova e autoridade:** [fonte 1](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/evidence/ci-queue-verdade/README.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/browser/ui-consistency.spec.ts) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/pull/18) · [TSV L71](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L71)

**Tipo:** evidência visual ausente. **Efeito:** #18 já está mergeada e relata inspeção/check; o índice e as capturas da candidata/instalação atual não foram recebidos. Não transferir a aprovação histórica para esse build.

**Owner:** CQ + operador. **Menor ação:** V01: pedir índice de capturas e procedência de #18, conferir os critérios faltantes; não pedir nova implementação ou novo merge.

**Limite da prova:** Não acessei :8765 nem as novas capturas; não emiti aceite humano.


## 71. STATE-HYGIENE-001 — NÃO COMPROVADO

**Requisito:** Resíduos tratados apenas por propriedade/idade provadas; conservação de terminais/logs.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts#L344-L444) · [fonte 2](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/evidence/ci-queue-verdade/README.md) · [TSV L72](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L72)

**Tipo:** evidência operacional/retention. **Efeito:** Fechamento normal apaga runtime, mas recuperação sem runtimeDirectory não prova ausência de órfãos do host.

**Owner:** CQ + operador. **Menor ação:** C05 inventário nominal e owners; nenhuma poda nesta fase.

**Limite da prova:** Quarentena histórica de quatro resíduos não prova raiz atual limpa; sem scans do host.


## 72. INSTALL-PROVENANCE-001 — NÃO COMPROVADO

**Requisito:** CLI/API/worker são mesma release imutável, state conservado e boot observado.

**Prova e autoridade:** [fonte 1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/CONTRACTS.md) · [fonte 2](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/backend/test_api.py#L789-L827) · [fonte 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/INSTALL.md) · [TSV L73](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/minispecs/06-dashboard-observabilidade-vite/material/CI-QUEUE-VERDADE.tsv#L73)

**Tipo:** evidência operacional ausente. **Efeito:** Código integrado e boot antigo não provam que Q2/Q3 está na instalação ativa.

**Owner:** CQ + operador. **Menor ação:** Receber version, build.json, receipt instalação e launchctl sanitizados; não instalar por este pacote.

**Limite da prova:** Prova atual do host indisponível; PR merge não equivale a cutover.
