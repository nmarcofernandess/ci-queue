# CI Queue — plugin oficial do projeto

Playbooks de adoção, configuração, operação, dúvidas, diagnóstico, retrospectiva
do harness e registro/reconciliação de validações. Skills-only: não instala MCP,
serviço, hooks, scheduler ou automação. Não fixa modelo nem thinking do chat.
Licença MIT. Fonte: [CI Queue](https://github.com/nmarcofernandess/ci-queue).

## Usar

Selecione o plugin no chat e peça o trabalho. Exemplos:

- “Explique a separação entre worker, runner e ship neste projeto.”
- “Adote CI Queue neste repositório usando os comandos que ele já possui.”
- “Registre que o Full desta revisão não foi solicitado; continue a entrega.”
- “Execute agora estas duas pendências no ambiente disponível nesta sessão.”
- “Diagnostique o ticket X sem reenfileirar.”
- “Registre a fricção recorrente do preparo no backlog do harness.”

Entrada geral: `ci-queue`. Playbooks especializados: `adopt`, `operate`,
`validations` e `harness-retro`. Em Claude Code, por exemplo,
`/ci-queue:operate <pedido>`. No Codex, selecione o plugin e a skill pelo catálogo
que o cliente disponibiliza. O plugin não executa pendências por ser instalado,
invocado para leitura ou ao ocorrer um merge.

## Instalação e atualização

O pacote é autocontido nesta pasta. Os dois marketplaces ficam na **raiz do
repositório**; não são parte do ZIP do plugin. Ambos resolvem o source desde a
raiz do marketplace, apontando para `./plugins/ci-queue`.

Registro e habilitação na CLI local não comprovam disponibilidade na conta ou
no catálogo recebido por uma task de outra superfície. Confira as skills no
destino real antes de declarar a substituição da skill anterior.

Codex, com CLI que ofereça `plugin` (confira `codex plugin --help`):

```sh
codex plugin marketplace add nmarcofernandess/ci-queue --ref dev
codex plugin add ci-queue@ci-queue
codex plugin marketplace upgrade ci-queue
codex plugin add ci-queue@ci-queue
```

Também é possível registrar a raiz de um clone local em vez da URL. Para clientes
com fonte local, atualize os arquivos da fonte e use `plugin add` novamente;
`marketplace upgrade` atualiza somente fontes Git. Para clientes
desktop sem esses subcomandos, abra o repositório com seu marketplace
`.agents/plugins/marketplace.json`, reinicie/atualize o cliente conforme sua
versão e instale pela fonte CI Queue. Confira instalação e skills em um novo
chat. Marketplace descoberto não comprova plugin instalado.

Claude Code:

```sh
claude plugin marketplace add nmarcofernandess/ci-queue#dev
claude plugin install ci-queue@ci-queue
claude plugin marketplace update ci-queue
claude plugin update ci-queue@ci-queue
```

Para experimentar somente a pasta, `claude --plugin-dir /path/to/ci-queue` carrega
o pacote nesta sessão. Para testar o catálogo local, registre a raiz do clone.
Reinicie a sessão quando o cliente exigir. Git/marketplace público não equivale
a aprovação nos diretórios públicos de OpenAI ou Anthropic.

O manifesto portable `plugin.json` é o owner de identidade/versão. Os adaptadores
`.codex-plugin/plugin.json` e `.claude-plugin/plugin.json` preservam compatibilidade
dos hosts e devem conservar nome e SemVer idênticos. Não edite caches. Em uma
release de conteúdo do pacote, incremente os três manifestos; o marketplace não
duplica versão. Atualize a fonte e recarregue/reinstale pelo fluxo do cliente.
Os manifestos usam descrição curta de até 30 caracteres e a categoria exata
`Developer Tools`; são limites de listagem verificados além da validação Claude.
Para rollback, use uma revisão/tag anterior do marketplace e reinstale conforme
o cliente. Nada disso instala ou atualiza o executor CI Queue.

## Substituir a skill anterior

O playbook [adopt](skills/adopt/SKILL.md) usa os templates e o método vivos do
produto. O consumidor mantém uma instrução versionada curta com seu mapa,
procedimento e comandos, apontando para o plugin. Atualize também seu AGENTS
(alvo real de symlink). Verifique um novo chat antes de desativar a skill antiga.
Não apague skill pessoal, backlog ou registro histórico automaticamente.

O plugin lê documentação/patterns na revisão identificada do repo oficial:
[fontes e compatibilidade](references/sources.md). Mudanças normais de docs não
exigem release do plugin. O helper embarcado de
[validações](references/validations.md) requer Node >=20; é opcional, não executa
testes e não converte um Markdown existente sem migração explícita.

## Verificar o pacote

```sh
node --test tests/validation-record.test.mjs
claude plugin validate . --strict
```

Os testes usam somente fixtures temporárias; exercitam status sem escrita,
registro sem executar, duplicados, worktrees Git e fechamento antigo contra
mudança nova. A suíte da Queue exercita a projeção da principal e a separação de
ship. Nenhum teste consumidor Full está embutido. Instalação em cliente real e
carregamento das skills são evidências adicionais, relatadas separadamente.

Contratos de distribuição conferidos em 26/10/2026:
[OpenAI](https://developers.openai.com/plugins/build/plugins),
[Claude marketplace](https://code.claude.com/docs/en/plugins/marketplace-reference),
[Claude manifest](https://code.claude.com/docs/en/plugins-reference),
[Claude atualização](https://code.claude.com/docs/en/plugins/host-marketplace).
[Erros de listagem OpenAI](https://developers.openai.com/plugins/deploy/submission-errors#listing-and-interface-errors).
