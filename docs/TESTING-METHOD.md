# Método de feedback e prova

Este documento é o owner genérico para escolher e adotar a forma de teste de um
consumidor. Ele não declara comandos do projeto consumidor. O
[quickstart](CONSUMER-QUICKSTART.md) apresenta a instalação e integração; o
[contrato](CONTRACTS.md) define catálogo, ticket e ship.

## Escolha a entrada

Leia o README e as instruções do consumidor, depois abra o mapa indicado por
eles. Use feedback somente quando o mapa declarar `feedback.available: true`,
uma receita nomeada que exista em `ci-queue.json`, e um procedimento do
consumidor. Se o valor for `false`, não há comando de feedback a executar:
defina uma receita real antes de ativar esse caminho. Não crie um shell
placeholder, não deduza o framework pelo nome do repositório e não copie uma
receita de outro consumidor.

| Entrada | Quando usar | O que significa |
|---|---|---|
| Feedback | Iterar sobre uma seleção curta enquanto o consumidor declara um ambiente reutilizável e compatível. | Uma tentativa enfileirada e focal. O resultado ajuda a corrigir a mudança; não prova o escopo final nem autoriza ship. |
| Prova | Validar o critério de entrega do consumidor. | Use a receita de prova real indicada pelo consumidor e aceita pelo catálogo de ship. O método pode preparar outra sessão, executar mais trabalho e gerar evidência própria. |

O mapa explica qual entrada existe e aponta para o procedimento do consumidor.
O catálogo `ci-queue.json` define o argv, as flags, os artifacts e as receitas
aceitas por ship. `progress` é observabilidade e não altera elegibilidade. Os
detalhes de formato de ticket e de ship permanecem em
[CONTRACTS](CONTRACTS.md).

A prova de adoção do bundle usa um consumidor Node/Git temporário e um servidor
HTTP fake em loopback. Ela verifica o caminho genérico de ticket e não substitui
o E2E nem a prova final do produto consumidor.

## Retomar feedback com identidade verificada

Antes de iniciar ou reutilizar uma sessão, confira os valores que o mapa nomeia:

- host e caminho absoluto do checkout;
- revisão e manifest da CLI/worker instalados;
- state root que CLI, worker e API compartilham;
- sessão ativa e seu vínculo verificável com cwd, projeto, servidor e inputs
  frios do consumidor;
- ticket existente, incluindo status terminal, antes de reenfileirar.

Use somente a sessão que o procedimento do consumidor reconhece como
compatível. Uma porta que responde sozinha não identifica a worktree nem o
projeto que atende nela. Se a sessão ou ownership não puder ser verificada,
pare o reuso e siga o caminho de recuperação do consumidor; não sinalize
processos por nome nem inicie outro worker no mesmo state.

Submeta cada tentativa pelo executor configurado. Leia o status, log e resumo do
ticket retornado. Um enqueue que apenas foi observado ou uma execução direta no
terminal não substitui o ticket. Ao retomar, inspecione o ticket anterior em
vez de criar outro por causa de um waiter encerrado. O executor e o ciclo de
vida da sessão pertencem a owners distintos: o produto consumidor documenta
como preparar, validar e encerrar seus recursos.

## Limite da evidência

Um feedback verde continua sendo apenas o resultado daquela seleção, revisão,
sessão e ambiente. Não o promova a Full, proof clínica, prova de release ou
ship. Quando o critério de entrega exigir prova, use a receita de prova do
consumidor e verifique seu ticket e artifacts. Uma observação no histórico é
metadado de execução, não ticket nem prova de ship.

## Adote os templates

Copie os três arquivos de [`templates/adoption`](../templates/adoption/):
o [template de mapa](../templates/adoption/ci.yaml),
o [fragmento de instrução](../templates/adoption/AGENTS.fragment.md) e a
[skill curta](../templates/adoption/SKILL.md).

1. Coloque o texto de `AGENTS.fragment.md` nas instruções locais, apontando para
   a skill editável do consumidor.
2. Copie `ci.yaml` para o mapa indicado pelas instruções do consumidor. Preserve
   `feedback.available: false` até que exista uma receita real. Quando estiver
   adotada, declare seu nome, perfil, sessão, artifacts e o caminho do owner
   documental do consumidor.
3. Use `SKILL.md` como instrução curta; não duplique nele formatos de ticket,
   ship ou toda a rotina do procedimento.

Mantenha um único owner editável de procedimento no consumidor. README, AGENTS,
mapa, skill e runbooks vizinhos apontam para ele. O bundle genérico sempre deixa
feedback desativado até o consumidor declarar e implementar sua receita.
