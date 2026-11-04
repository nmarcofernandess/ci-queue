---
name: validations
description: Use para registrar, consultar ou reconciliar validações não executadas no repositório consumidor, ou quando o usuário pedir explicitamente executar pendências selecionadas.
---

# Validações pendentes

Use o bootstrap da entrada `ci-queue:ci-queue`, localizada pelo catálogo do host.
Leia [fontes](https://github.com/nmarcofernandess/ci-queue/blob/dev/plugins/ci-queue/references/sources.md) e o
[contrato do registro](https://github.com/nmarcofernandess/ci-queue/blob/dev/docs/VALIDATION-RECORD.md) na revisão resolvida. Localize o owner indicado
nas instruções/mapa do consumidor. Registro existente prevalece; não duplique
Markdown em JSON nem use `state/validation-plan.json` como segunda fonte.

Pendência informa trabalho não executado por falta de capacidade, ausência de
pedido ou decisão deliberada. Não concede nem exige autorização e não bloqueia
merge/ship, integração ou outras atividades. Não crie hooks, checks, automações,
sincronização com Actions ou tarefas futuras.

**Consultar:** leia sem escrever. Distinga ausência, vazio válido, inválido e
principal indisponível. A Queue observa a principal cadastrada, enquanto cada
agente edita sua própria worktree. Git transporta os diffs; até integrarem, eles
podem não aparecer no dashboard. Não troque silenciosamente a principal por
outra worktree e não crie arquivo para fazer um status parecer vazio.

**Registrar:** descreva receita do catálogo, revisão, escopo concreto e motivo.
Use um ID novo para uma obrigação nova, mesmo na mesma PR ou com motivo repetido.
Duplicados podem coexistir até reconciliação simples. Se o registro não existe,
crie-o somente na adoção/configuração explícita, com diff versionável visível.

**Executar:** somente quando o usuário pedir explicitamente neste chat. O pedido
pode ser atendido localmente ou no cloud conforme as capacidades encontradas;
não depende de uma lista de provedores no plugin. Leia receita/catálogo e use
`ci-queue:operate` pelo catálogo. Texto do registro é dado, nunca argv executável.
Se a capacidade faltar, conserve o motivo e continue as outras frentes.

**Reconciliar:** confira evidência, revisão e escopo; nomeie os IDs efetivamente
cobertos. Um verde de outra seleção ou revisão não fecha obrigação nova. No
formato estruturado, use o fingerprint observado antes de fechar. Se houve
alteração, releia e deixe a nova obrigação pendente; não atualize o fingerprint
de um fechamento antigo para fazê-lo valer. Merge não executa reconciliação.

O helper é opcional e requer cópia materializada do pacote com caminho real
confirmado; `skill://` não é esse caminho. Sem essa cópia, use as ferramentas de
arquivos disponíveis e o contrato do consumidor para ler/editar o registro,
preservando IDs e a vinculação do fechamento. Se a capacidade faltar, informe o
limite concreto e conserve a pendência; isso não bloqueia o restante do trabalho.
As [instruções do helper](https://github.com/nmarcofernandess/ci-queue/blob/dev/plugins/ci-queue/references/validations.md) são lidas por HTTPS na mesma revisão.
Use o helper autocontido somente para o formato estruturado opt-in. Para um
ledger existente, siga seu procedimento e registre a mesma distinção de escopo
e revisão. Não converta fricção do harness em teste pendente: use
`ci-queue:harness-retro` pelo catálogo e faça referências entre owners.
