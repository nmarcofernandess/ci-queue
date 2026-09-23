---
id: execution-packs
title: ExecutionPack — lotes duráveis de tickets
summary: Pedido que agrupa receitas em tickets independentes, preserva a intenção do conjunto e permite acompanhar membros e interromper os restantes sem depender da conversa que os solicitou.
status: pending
---

## Intenção

Preservar a proposta de ExecutionPack e a análise de quando seu custo de lifecycle se justifica. O pacote contém PRD, arquitetura candidata, Analyst, handbook e o anexo original rastreado. É uma spec viva de produto, não uma funcionalidade disponível.

## Estado real

**PAUSADO — BACKLOG. IMPLEMENTAÇÃO NÃO AUTORIZADA.** Decisão de Marco em 23/09/2026: conservar a ideia, mas não acrescentar pack nem ship multiprova ao fechamento atual.

O Superflow consultado aceita somente `pending | done`; `pending` expressa não concluído, não uma ordem para executar. Não existe `plan.json` ativo. A manutenção documental está concluída nesta passagem; o produto proposto não foi implementado, testado, mergeado ou instalado por este cadastro.

Baseline: CI Queue `dev@ef057973`; candidata #26 `83dfd5e`, draft. DietFlow `dev@c3885e9`; candidata #1323 `fbe5f4a`, draft. A inspeção não observou a instalação do Mac. Fonte completa e limites em `research/RASTREABILIDADE.md`.

## Rastro

O anexo de 20/09 propunha lote manual durável, seguido opcionalmente de seleção por diff e ship multiprova. A conversa posterior separou sessão, ticket, aggregate, política e lote; corrigiu a confusão entre FIFO, submissão atômica e TOCTOU; e concluiu que não assumir essa feature agora é uma decisão de maturidade de produto.

Recomendação vigente: feedback quente enfileirado e, para uma prova composta necessária, agregador do consumidor com falha propagada. Reaproveitamento independente e cancelamento coletivo continuam benefícios potenciais, não lacunas obrigatórias das Fases 4/5.

## Próximo trabalho

**Nenhuma execução a iniciar.** Não transformar esta spec em dependência de release, instalação, RC115, 121, feedback ou encerramento F4/F5.

Retomar apenas por decisão explícita do operador, sustentada por um caso real que exija membros independentes ou continuidade autônoma do conjunto. Antes de criar plano ativo: reancorar código/PRs/instalação, comparar as alternativas menores e fechar as decisões G01–G12 de `SPEC.md`. Satisfazer uma condição não remove a pausa automaticamente.

## Limites

Sem código, gates, migração de políticas, campos de runtime ou comandos `pack` nesta entrega. Sem merge/deploy/Full/limpeza. Nenhuma promessa de velocidade, zero bugs ou cura do ENOSPC. Fatos novos podem atualizar a análise sem autorizar implementação. `handbook.md` é resumo; este status é autoridade de estado.
