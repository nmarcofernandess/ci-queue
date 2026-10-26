---
name: ci-queue
description: Use para dúvidas sobre CI Queue, arquitetura, configuração, escolha entre execução direta e fila, histórico, tickets, worktrees e navegação dos playbooks oficiais.
---

# CI Queue

CI Queue executa receitas do consumidor, serializa recursos, supervisiona
processos e conserva registros. O consumidor possui preparação, testes, outputs
e política de entrega. Leia primeiro [fontes e compatibilidade](../../references/sources.md)
e [arquitetura](../../references/architecture.md).

Classifique o pedido e carregue somente o playbook necessário:

| Pedido | Playbook |
|---|---|
| Adotar/configurar um projeto ou substituir a skill antiga | [adopt](../adopt/SKILL.md) |
| Executar CI solicitado, acompanhar ou diagnosticar uma tentativa | [operate](../operate/SKILL.md) |
| Registrar, consultar ou reconciliar testes não executados | [validations](../validations/SKILL.md) |
| Retrospectiva de fricção/defeito do harness | [harness-retro](../harness-retro/SKILL.md) |

Uma pergunta ou consulta de status é leitura. Pendências são informação do
consumidor: nunca bloqueio, autorização, gatilho de execução ou condição de
merge/ship. A IA pode decidir integrar dentro do pedido vigente; o plugin não
adiciona aprovação, prova ou gate. Preserve os gates existentes do projeto.
Só execute pendências quando o usuário pedir explicitamente no chat. Instalação,
abertura de chat, merge ou leitura do registro não dispara trabalho.

Use as capacidades encontradas nesta sessão, local ou cloud, sem matriz por
provedor. Falta de capacidade, ausência de pedido e adiamento deliberado são
motivos válidos para deixar uma validação pendente e continuar o restante.
