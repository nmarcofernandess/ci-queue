# Handbook — ExecutionPack está no backlog

Leia primeiro [status.md](status.md). **Não há trabalho de implementação liberado.** Esta página evita que a próxima IA transforme uma ideia preservada num blocker da entrega atual.

## O que estamos guardando

Um ExecutionPack seria um pedido durável de várias receitas, cujos membros executariam como tickets normais. Não seria teste, ambiente, cópia da árvore de progresso nem proof pack de evidências. Sua utilidade específica seria lembrar a intenção do conjunto, relacionar resultados e governar os membros ainda não iniciados mesmo sem o chamador.

## Por que não fazer agora

A dor principal foi pagar preparação repetida e depender do agente para escolher o método. Sessão quente + tentativas pela fila + documentação adotada tratam essa dor. O percentual informal de “80%” não é benchmark. Packs não deixam os testes mais rápidos por natureza.

Para A+B+C obrigatórios e sem necessidade de tickets independentes, uma receita do consumidor pode executar os três dentro de um ticket. B falha → C não inicia; cleanup e diagnóstico continuam. Não enfileirar outro job de dentro do ticket e esperar por ele: isso pode bloquear a própria fila.

Também não adotamos um ship multiprova neste corte. Submeter um por vez elimina a corrida de cancelar B depois que o worker o iniciou, mas não elimina estado, retomada, duplicação, H/base/política ou ownership de cancelamento. É outra alternativa com custo, não um pack gratuito.

## Quando reconsiderar

Quando houver necessidade repetida, demonstrada, de resultados/cancelamento/reuso por membro ou de completar o conjunto após a morte do controlador, e a solução por agregador ou submissão normal não atender. Investimento precisa ter ganho estimado e limite de suporte claros. Um diagrama mais bonito não basta.

## Não confundir

- Três enqueues não formam transação nem reserva exclusiva da fila. Ordenação, atomicidade de aceitação e validade de H/base no instante de uso são problemas diferentes.
- Encerrar waiter não cancela trabalho; falha de teste não cancela a fila de outros pedidos.
- Cancelar trabalho próprio é diferente de parar apenas os próximos membros; ticket reaproveitado não vira propriedade do novo chamador.
- `acceptedPresets` continua OR. Não acrescentar requisitos AND silenciosamente nem promover feedback a prova.
- Seleção por diff é política versionada do consumidor, não aprendizado heurístico de cobertura pelo CI Queue.
- Aumentar quantidade de snapshots, polls e arquivos para administrar um lote pode piorar uso de recursos; medir antes de prometer economia.

## Retomada correta

Rever PRD/Analyst contra as fontes novas; escolher entre agregador, sequência no ship ou lote durável; fechar somente os gaps relevantes da SPEC; obter aprovação; então criar `plan.json` e provas test-first. Não tentar tornar o mundo livre de todos os gaps para começar. O mínimo é que nossas garantias específicas não sejam falsas.

A fonte original de 20/09 está preservada integralmente em `research/`, e cada seção tem destino na rastreabilidade. A recomendação original de implementar primeiro foi substituída pela pausa explícita. Não é preciso reabrir F4/F5 nem reescrever os patterns já entregues para manter esta ideia acessível.
