---
name: harness-retro
description: Use quando o usuário pedir retrospectiva ou registro de fricção recorrente do harness, preparo, worktree, ambiente, login, CI, evidência, ship ou documentação.
---

# Retrospectiva do harness

Use o bootstrap da entrada `ci-queue:ci-queue`, localizada pelo catálogo do host.
Leia [fontes](https://github.com/nmarcofernandess/ci-queue/blob/dev/plugins/ci-queue/references/sources.md) na revisão resolvida e procure o backlog/procedimento do
harness já declarado no consumidor. Reutilize sua taxonomia, IDs e fingerprints.
No DietFlow, a skill `dietflow-harness-retro` e o backlog que ela aponta continuam
donos locais; o plugin não os substitui por dados genéricos.

Registre a fricção observada, owner, reprodução mínima, impacto e evidência de
ticket/arquivo/revisão. Procure sintoma, arquivo e fingerprint antes de criar
outro item. Distinga precondição esperada, capacidade ausente, bug do produto,
defeito do executor e fricção do harness. Não lance testes para obter um relato
se o pedido é apenas retrospectiva; use evidência existente ou diga o que falta.

Um teste não executado pertence ao registro de
`ci-queue:validations` pelo catálogo. Um defeito que impediu sua execução pode
também ter item no backlog, ligado por referência. Resolver o defeito não dá
crédito ao teste, e passar um teste não prova que a fricção foi corrigida.

Se não existir backlog, uma retrospectiva solicitada pode propor/criar um owner
versionado simples, com diff visível. Não introduza serviço, scheduler ou segundo
registro de validações. Pedido de relato autoriza registrar; correção de código
segue o escopo efetivo do pedido. Quando autorizada, corrija o menor owner durável
e valide proporcionalmente; marque resultado com evidência, sem culpar pessoas.

Não registre credenciais ou `.env` bruto. Preserve WIP, caches úteis, processos e
recursos alheios. Não mude gates, permissões ou política de entrega para resolver
um relato. Informe o que foi observado, registrado, corrigido e exercitado.
