# Complemento 04 · Aceite obrigatório

Fonte: corpo da entrega de Etapa 1B. Substitui o anexo ausente
`04-ACEITE-E-CENARIOS.md`. Não usar quantidade de screenshots como critério
de conclusão. Demonstrar estes cenários nas suítes existentes e na candidata
integrada.

| ID | Prova exigida |
| --- | --- |
| **AN-01** | Presets com 1.000 e duas execuções produzem barras de 100%, com contagens corretas no detalhe. |
| **AN-02** | Cancelados e interrompidos participam do denominador; total zero não produz barra nem percentual inventado. |
| **AN-03** | Top10 usa totais do projeto/período, inclui todo o histórico válido e desempata deterministicamente. Mais de 200 registros não são truncados. |
| **AN-04** | Marcar dez opções, sem decorrer o intervalo de polling, acrescenta **zero requisições**. Menu permanece aberto. |
| **AN-05** | Nova resposta com ranking diferente durante seleção não move as opções sob o ponteiro. Ao fechar, custom preserva IDs e top10 recalcula. |
| **AN-06** | Custom vazio, Todos, menos de dez opções, preset histórico removido e preset sem dados no período têm comportamentos distintos. |
| **AN-07** | Resultados e Duração preservam seleções independentes. Duração não mistura receitas nem relaxa verde canônico. |
| **PR-01** | Zero projetos permite abrir shell e cadastrar pasta/config; cadastro sobrevive a restart. |
| **PR-02** | Duas worktrees do mesmo repositório não criam dois projetos. Config com ID divergente gera conflito explícito. |
| **PR-03** | Rename, relocalização, vínculo/desvínculo de receitas e archive/restore preservam ID e bytes de tickets/logs/ledger. |
| **PR-04** | Pasta sem config e config ilegível não são confundidas. Histórico continua disponível; capacidades canônicas não recebem vereditos inventados. |
| **SC-01** | Duas abas em A/B recebem dados corretos em chamadas simultâneas. Resposta atrasada de A não aparece em B. |
| **SC-02** | Job, log, export e diagnóstico de A não retornam bytes quando solicitados explicitamente por B. |
| **SC-03** | Meta salva em A não atualiza B; paginação e seleção de Worktrees não atravessam projetos. Draft permanece associado ao ID/revisão originais. |
| **SC-04** | Histórico sem projeto contém somente registros ainda não atribuídos após aplicação do ledger. IDs literais `all` e `legacy` continuam válidos como projetos. |
| **UI-01** | Header, filtros, menus e novo drawer funcionam em 390, 640, 768 e 1440px, claro/escuro, com nomes de 160 caracteres. Sem scroll horizontal da página. |
| **UI-02** | Menu tem scroll local; busca/atalhos não desaparecem; nomes completos são acessíveis; seleção e fechamento funcionam por teclado. |
| **UI-03** | Preservar R1–R3/V1: conteúdo dentro das células, badge na mesma linha, ações respeitando gutter e foco retornando ao trigger. |
| **SE-01** | Novas mutações rejeitam CSRF/Origin/Host inválidos. Probe não executa receita, rede Git ou shell. GET não cadastra projeto. |
| **EV-01** | Há pelo menos um fluxo com **UI e API candidatas reais**, não apenas mocks de HTTP. A prévia não pode usar a API instalada antiga para declarar os endpoints novos funcionais. |

A amostra sintética oficial está em `fixtures/analysis-cases.json`.
O décimo selecionado no ranking de volume é `clinical-readonly`, pelo
desempate. Acrescentar casos isolados de zero, terços, total inconsistente
e contagem inválida. Esses dados são somente fixtures; não substituem
registros da instalação.
