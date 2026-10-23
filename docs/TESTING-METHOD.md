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
| Feedback | Iterar sobre uma seleção curta enquanto o consumidor declara um ambiente reutilizável e compatível. | Uma execução focal direta ou enfileirada. O resultado ajuda a corrigir a mudança; não prova o escopo final nem autoriza ship. |
| Prova | Validar o critério de entrega do consumidor. | Use a receita de prova real indicada pelo consumidor; quando houver ship, siga seu catálogo de aceites. O método pode preparar outra sessão, executar mais trabalho e gerar evidência própria. |

O mapa explica qual entrada existe e aponta para o procedimento do consumidor.
O catálogo `ci-queue.json` define o argv, as flags, a finalização e as receitas
aceitas por ship. `progress` é observabilidade e não altera elegibilidade. Os
detalhes de formato de ticket e de ship permanecem em
[CONTRACTS](CONTRACTS.md).

A prova de adoção do bundle usa um consumidor Node/Git temporário e um servidor
HTTP fake em loopback. Ela verifica o caminho genérico de ticket e não substitui
o E2E nem a prova final do produto consumidor.

## Fechamento depois da autoria

As instruções do projeto definem a passagem das tasks/reviews para o agente da
integração. O procedimento consumidor deve separar essa fase da autoria e
apontar ao mesmo registro de execução para causas, correções, tickets e
resultados. CI Queue executa receitas e preserva fatos; não cria tasks de plano,
não reinicia métodos de implementação e não autoriza integração ou deploy.

Quando o diagnóstico inicial pedir execução completa, use o **Smoke completo
do consumidor pela Queue**, com uma receita real declarada no catálogo. Smoke
não significa Jest integral. O modo de coletar falhas de gates pertence ao
agregador consumidor: executar os gates restantes, acumular resultados e devolver
exit não zero se houver falha. Não invente uma flag universal do CI Queue nem
deduza esse modo pelo nome da receita. Projeto sem esse caminho deve implementá-lo
antes de anunciá-lo como disponível.

Mantenha preflight, locks, compatibilidade do ambiente e a identidade da candidata
exigidos pelo catálogo, incluindo HEAD/base, árvore e estabilidade. Coleta de
falhas de gates não contorna recusas, cancelamento, pinning ou requisitos de
prova. Leia o ticket terminal antes de repetir; corrija causas e verifique-as
focalmente pelo procedimento consumidor. Com o saldo resolvido, o ship canônico
usa parada no erro e sua elegibilidade normal. Um modo diagnóstico distinto não
é automaticamente uma receita aceita por ship; progress e conjunto de tasks
concluídas continuam sem conceder prova, merge ou deploy.

Retenção do state/ticket e publicação de resumos estão em
[CONTRACTS — Fila, registros e comando](CONTRACTS.md#fila-registros-e-comando).

## Retomar uma tentativa Queue existente

Quando for retomar uma tentativa enfileirada, confira os valores que o mapa nomeia:

- host e caminho absoluto do checkout;
- revisão, protocolo e manifest da distribuição instalada;
- state root que CLI, worker e API compartilham;
- sessão ativa e seu vínculo verificável com cwd, projeto, servidor e inputs
  frios do consumidor;
- ticket existente, incluindo status terminal, antes de reenfileirar.

Use somente a sessão que o procedimento do consumidor reconhece como
compatível. Uma porta que responde sozinha não identifica a worktree nem o
projeto que atende nela. Se a sessão ou ownership não puder ser verificada,
pare o reuso e siga o caminho de recuperação do consumidor; não sinalize
processos por nome nem inicie outro worker no mesmo state.

Se a tentativa foi enfileirada, leia status, log e resumo do ticket retornado.
Uma execução direta é válida para iterar e não cria ticket de Queue. Ao retomar,
inspecione o ticket anterior em vez de criar outro por causa de um waiter
encerrado. O executor e o ciclo de vida da sessão pertencem a owners distintos:
o produto consumidor documenta como preparar, validar e encerrar seus recursos.

## Limite da evidência

Um feedback verde continua sendo apenas o resultado daquela seleção, revisão,
sessão e ambiente. Não o promova a Full, proof clínica, prova de release ou
ship. Quando o critério de entrega exigir prova, use a receita de prova do
consumidor e verifique o terminal e, quando declarados, a publicação e os outputs
no owner consumidor. Cleanup é um fato separado: publicação válida pode concluir
com aviso de limpeza incerta. Error, outputs inválidos, recovery pendente ou fase
failed/interrupted não ganham aprovação por esse aviso. Uma observação no histórico é
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
   adotada, declare seu nome, perfil, sessão, plano de outputs/finalização e o caminho do owner
   documental do consumidor.
3. Resolva os paths de mapa e `method` **desde a raiz do consumidor**, nunca
   relativamente à pasta onde a skill foi copiada. O default do owner é
   `docs/ci/TESTING-METHOD.md`; substitua `method` pelo owner já existente, como
   `docs/ci/FEEDBACK-LOOP.md` no DietFlow. A referência genérica permanece
   [neste repositório](https://github.com/nmarcofernandess/ci-queue/blob/main/docs/TESTING-METHOD.md).
4. Use `SKILL.md` como instrução curta; não duplique nele formatos de ticket,
   ship ou toda a rotina do procedimento.

Mantenha um único owner editável de procedimento no consumidor. README, AGENTS,
mapa, skill e runbooks vizinhos apontam para ele. O bundle genérico sempre deixa
feedback desativado até o consumidor declarar e implementar sua receita.

## Mesmo comando, executor escolhido

O consumidor escolhe execução direta ou Queue. Jest puro barato normalmente roda
direto; recursos compartilhados podem pedir serialização. Não transforme a
existência de um preset em obrigação universal ou preparação de stack. Adoção
standalone não exige ship-bound; as flags de prova pertencem às receitas aceitas
pelo ship, quando esse controller for adotado. `init` conserva sua inferência de
`scripts.check` inequívoco; argv explícito atende os demais casos.

O Node do worker lança a distribuição. Binding Node dos jobs é opt-in por
`projectId`, separado do cadastro e da configuração do app. O ambiente do caller
não é automaticamente o ambiente do worker: a receita carrega os arquivos do
seu checkout no executor efetivo. Escolha o loader compatível com o framework e
versão instalados; detalhes e fontes em [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md#configuração-do-consumidor-no-executor).

Outputs necessários têm owner e plano explícitos; hook terminal é opcional salvo
contrato declarado. Sem outputs, não crie mídia ou diretório de evidência. Cache
útil de dev/build segue o lifecycle do consumidor, não o de um output temporário.
Término do comando e da tentativa atual de finalização libera o executor. Resíduo,
cleanup incerto ou fonte histórica inválida limitam o próprio ID e não exigem
provar um computador limpo antes do próximo comando ou da atualização. Owners
correntes e locks reais conservam sua proteção; não remova registros para forçar
passagem. [CONTRACTS](CONTRACTS.md) governa publicação, replay e manutenção.
