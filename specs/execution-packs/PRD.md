# PRD — ExecutionPack, lote durável de tickets

## Problema

Um operador pode saber de antemão que deseja executar várias receitas independentes e querer delegar esse conjunto: entender o que foi aceito, o que terminou e por que os demais membros não começaram. Tickets individuais preservam execuções, mas não expressam sozinhos a intenção de conjunto, a admissão indivisível ou a regra de parada entre membros.

Isso é diferente de reconstruir Next/banco em cada reteste. O anexo original reúne três problemas que esta revisão separa: organização de pedidos, organização de testes/ambiente e política de prova. As candidatas atuais de feedback tratam o segundo por sessão do consumidor e tentativa enfileirada; não implementam automaticamente o primeiro ou o terceiro. [Fontes S01–S06](research/RASTREABILIDADE.md#fontes-e-procedência).

## Promessa condicional

Se a retomada for aprovada, oferecer um pedido durável e explicável para 1..N receitas existentes, com tickets independentes, sem exigir que o usuário mantenha um agente conduzindo a sequência. Não exigir plugin por teste, SDK clínico, classificador de diff, receita `full` universal ou instrumentação de progresso para aderir.

A necessidade deve superar o caminho menor recomendado: uma receita composta para verificações de um mesmo propósito, ou tickets avulsos quando não há dependência/cancelamento coletivo. A promessa aqui não afirma que todo consumidor precisa de pack.

## Stories de usuário

| ID | Necessidade | Resultado desejado |
|---|---|---|
| U01 | Já escolhi A, B e C independentes; posso fechar a conversa. | Um identificador permite recuperar o pedido e os resultados, sem inventar que somente A foi solicitado. |
| U02 | B falhou; não quero executar C. | Membros futuros são impedidos antes de começar; resultados anteriores ficam intactos. |
| U03 | Preciso interromper apenas o restante, não o processo atual. | A intenção tem significado inequívoco e distinto de cancelar o membro ativo. |
| U04 | Preciso consultar B com sua árvore e log. | O ticket original continua acessível; agrupamento não esconde seus dados nem replica o resultado. |
| U05 | Meu projeto não usa Next, Playwright, Full ou smoke. | Receitas comuns funcionam, sem adoção de conceitos exclusivos do DietFlow. |
| U06 | Só tenho um comando ou uma sessão curta de feedback. | Continuo no fluxo atual; não ganho uma entidade obrigatória, configuração nova ou custo de consulta. |

## Story técnica e responsabilidades

Consumidor define receitas, seleção, preparação, fixtures, prova necessária e publicação de artifacts. CI Queue executa tickets e preserva processo/log/resultado. Um pack, se existir, administra apenas membros e intenções do pedido. O controlador de ship continua dono da elegibilidade e do merge; o worker não importa `src/ship`.

Uma sessão quente pode ser reutilizada por tickets compatíveis, mas não é transferida ao pack. Intercalar outro ticket não deve destruir a sessão por mero agrupamento; conflito de recurso deve ser tratado pelo owner existente. Não inferir compatibilidade por nome, porta aberta ou palavra `e2e`.

## Atual, alternativa menor e desejado

| Questão | Atual/alternativa menor | Ganho adicional que teria de justificar pack |
|---|---|---|
| Terminal pode sair | Ticket já é independente do waiter. | Persistir o conjunto inteiro, incluindo membros ainda não iniciados. |
| A+B+C obrigatórios | Agregador real num ticket, com falha e cleanup corretos. | Tickets/provas individuais e eventual reuso por membro. |
| Reuso de servidor | Sessão do consumidor + tentativas normais. | Nenhum ganho inerente de preparação. |
| Feedback RED/editar/GREEN | A decisão após RED depende do resultado. | Pack não deve antecipar uma correção ainda desconhecida. |
| Escolha de testes | Operador ou seletor proprietário. | Uma política opcional pode produzir um conjunto; não cabe inferir cobertura no motor. |
| Visualização | Ticket e sua árvore. | Resumo entre tickets, sem poluir estatísticas. |

## Escopo candidato

Uma máquina, um projeto, um cwd e lista plana de membros. Membros usam o pipeline de tickets existente. Admissão rejeita configuração inválida sem execução parcial. A primeira entrega, se justificada, não depende de qualquer alteração do ship ou mapa de impacto.

Argumentos variáveis exigem decisão explícita: nomes do catálogo bastam para receitas completas; feedback requer também sessão/seleção. Permitir argumentos já suportados pelo enqueue é uma opção, mas deve conservar personalização, identidade e exclusão de prova. Não publicar que um pack de nomes suporta todo focal quando faltam seus parâmetros.

## Fora de escopo

DAG, nested packs, preempção, fairness adaptativa, segundo worker/daemon, pool universal de ambientes, scheduler de IA, observação que finge ticket, novo collector, sidebar obrigatória, alteração de `full`, migração de frameworks, reuso entre commits e controle de todos os processos do Mac.

Seleção por diff e ship com requisitos AND/OR ficam preservados como possibilidades posteriores, separadas. Não são aceites implícitos da primeira versão nem uma sequência obrigatória de roadmap.

## Critérios de produto para uma futura versão

| ID | Critério verificável |
|---|---|
| A01 | Usuário avulso preserva comando, contrato e custo; nenhuma configuração de pack obrigatória. |
| A02 | Projeto mínimo sem framework específico consegue pedir uma ou várias receitas reais. Zero membros é erro de uso, não teste verde fictício. |
| A03 | Pedido aceito tem identidade e lista completa recuperáveis; dado inválido não inicia subconjunto. |
| A04 | Cada membro iniciado tem exatamente sua identidade de ticket; recuperação após terminal gravado não dispara outra execução por perder um cursor. Execução incerta não recebe promessa de exactly-once de seus efeitos externos. |
| A05 | Falha obrigatória impede admissão dos próximos membros; pedido alheio não é cancelado. O membro não iniciado tem motivo, não ticket passado nem caso skipped inventado. |
| A06 | Parar restantes, cancelar ativo, timeout do waiter e morte do controlador têm resultados distintos e documentados. Cancelamento usa ownership comprovado. |
| A07 | H/base/config/seleção são conferidos segundo o modo de cada membro; contexto inválido não certifica prova. Feedback WIP permanece diagnóstico. |
| A08 | Resumo mostra execuções; detalhe mostra casos do ticket. Counts, duração, retry e ausência conservam seu significado. Pack não aumenta contagem de testes nas análises. |
| A09 | CLI/API/UI antigas e novas têm comportamento compatível ou recusa explícita. Capabilities refletem CLI e worker efetivos, não apenas o binário do chamador. |
| A10 | Payload/resposta e persistência são medidos em quantidade representativa de membros. Nenhum anúncio de aceleração de teste por acrescentar agrupamento. |
| A11 | Gerador, commit de artifacts e verificação do HEAD final continuam separados; logs/proofs não são apagados por finalização do pack. |
| A12 | Manual, template e recuperação funcionam fora do checkout fonte; instalação usa o lifecycle existente, sem copiar ferramentas do consumidor para o produto. |

Esses critérios ainda não foram exercitados por uma implementação de ExecutionPack. São condições da promessa, não testes que esta publicação afirma ter passado.

## Critério para investir, não apenas para conseguir implementar

Reabrir requer caso de uso concreto de membros independentes ou continuidade autônoma, custo recorrente do método menor e evidência do benefício esperado. Comparar número de intervenções/repetições, trabalho evitável e suporte necessário no mesmo tipo de pedido. Percentuais intuitivos, como “80% do benefício veio da sessão”, permanecem hipótese qualitativa, não baseline.

Se um agregador atende bem e a independência não tem valor mensurável, a decisão correta continua sendo não implementar. A própria retenção desta ideia já cumpre a necessidade atual de memória; não cria dívida de produto.
