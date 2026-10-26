---
name: ci-queue
description: Use para dúvidas sobre CI Queue, arquitetura, configuração, escolha entre execução direta e fila, histórico, tickets, worktrees e navegação dos playbooks oficiais.
---

# CI Queue

CI Queue executa receitas do consumidor, serializa recursos, supervisiona
processos e conserva registros. O consumidor possui preparação, testes, outputs
e política de entrega.

## Bootstrap de fontes em qualquer superfície

As skills são descobertas pelo catálogo do host. Use os identificadores que ele
retorna; `ci-queue:operate`, por exemplo, é um nome para localizar, não um path.
Uma URI `skill://` não demonstra que o pacote esteja montado no filesystem.

Para documentação, confirme um checkout oficial ou resolva a ref escolhida do
repo `nmarcofernandess/ci-queue` para um SHA. O default observado é `dev`; use
Git/GitHub somente leitura ou a [consulta pública da ref](https://api.github.com/repos/nmarcofernandess/ci-queue/commits/dev).
Os links HTTPS abaixo são localizadores: substitua `dev` pelo SHA resolvido antes
das leituras relacionadas, ou use `https://raw.githubusercontent.com/nmarcofernandess/ci-queue/<SHA>/<path>`.
Paths documentais são relativos à raiz desse repo. Leia-os no checkout verificado
ou por HTTPS, sem pedir arquivos do plugin root a `skills.read`. Se faltar acesso,
informe ref/path e limite a conclusão; continue o trabalho independente.

Leia [fontes e compatibilidade](https://github.com/nmarcofernandess/ci-queue/blob/dev/plugins/ci-queue/references/sources.md)
e [arquitetura](https://github.com/nmarcofernandess/ci-queue/blob/dev/plugins/ci-queue/references/architecture.md).
Referências e helper embarcados também podem ser usados quando uma cópia local
do pacote tiver sido materializada e seu caminho real estiver confirmado.

Classifique o pedido e carregue somente o playbook necessário:

| Pedido | Playbook |
|---|---|
| Adotar/configurar um projeto ou substituir a skill antiga | `ci-queue:adopt` |
| Executar CI solicitado, acompanhar ou diagnosticar uma tentativa | `ci-queue:operate` |
| Registrar, consultar ou reconciliar testes não executados | `ci-queue:validations` |
| Retrospectiva de fricção/defeito do harness | `ci-queue:harness-retro` |

Localize esses nomes no catálogo real (ou pelo nome curto dentro do plugin CI
Queue), e leia a skill com o identificador fornecido pelo host.

Uma pergunta ou consulta de status é leitura. Pendências são informação do
consumidor: nunca bloqueio, autorização, gatilho de execução ou condição de
merge/ship. A IA pode decidir integrar dentro do pedido vigente; o plugin não
adiciona aprovação, prova ou gate. Preserve os gates existentes do projeto.
Só execute pendências quando o usuário pedir explicitamente no chat. Instalação,
abertura de chat, merge ou leitura do registro não dispara trabalho.

Use as capacidades encontradas nesta sessão, local ou cloud, sem matriz por
provedor. Falta de capacidade, ausência de pedido e adiamento deliberado são
motivos válidos para deixar uma validação pendente e continuar o restante.
