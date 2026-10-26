---
name: adopt
description: Use quando o usuário pedir adotar ou configurar CI Queue em um projeto, migrar a skill antiga para o plugin ou revisar uma integração existente.
---

# Adotar CI Queue

Use o bootstrap da entrada `ci-queue:ci-queue`, localizada pelo catálogo do host.
Leia [fontes](https://github.com/nmarcofernandess/ci-queue/blob/dev/plugins/ci-queue/references/sources.md) na revisão resolvida, as instruções e README do consumidor,
seu mapa CI e procedimento existente. Confirme raiz, branch, HEAD, árvore, remotes
e worktrees antes de editar; preserve WIP e processos alheios.

Use o quickstart, `docs/TESTING-METHOD.md` e `templates/adoption/` da revisão
oficial selecionada. Eles são donos do playbook de adoção: não copie o manual
para o plugin. Adapte os comandos reais do consumidor, sem inventar testes,
receitas de feedback, ship ou preparação de stack. A instalação do plugin não
instala o executor, registra projeto ou habilita execução.

No diff de adoção, atualize explicitamente:

1. `AGENTS.md`, escrevendo no alvo real se for symlink;
2. a skill/instrução operacional **versionada** do consumidor, que passa a ser
   um adaptador curto para o plugin, mapa e procedimento locais;
3. mapa e catálogo, preservando `project.id`, receitas, gates e owner existente.

Mantenha um owner editável de cada procedimento. O plugin fornece o método
genérico; o adaptador versionado conserva comandos e particularidades locais.
Não remova uma skill fora do Git nem a antiga antes de verificar a substituição
em um novo chat. Se não houver acesso, entregue o delta/caminho e declare que
não foi aplicado. O plugin permanece útil para dúvidas sem adoção completa.

Para pendências, localize primeiro o registro já utilizado. Se houver Markdown
ou outro formato, continue nesse owner; não crie um segundo JSON silenciosamente.
A projeção estruturada da Queue exige migração explícita e reconciliada, mantendo
links para o histórico. Novos projetos podem optar pelo
[contrato de registro](https://github.com/nmarcofernandess/ci-queue/blob/dev/docs/VALIDATION-RECORD.md). A adoção/configuração
solicitada autoriza criar arquivo ausente com diff visível; status não autoriza.

Confira máquina, CLI instalada, state e capacidades quando forem necessários ao
pedido. Use fixtures temporárias ou a menor receita autorizada para verificar a
adoção. Não execute Full/CI de projetos cadastrados por terem sido encontrados.
Não mude guard, acceptedPresets ou controlador de ship por causa de pendências.

Entregue diff, caminhos dos owners, revisão documental observada, verificação
feita e qualquer instalação/migração ainda não confirmada.
