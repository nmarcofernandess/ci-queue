# Plugin oficial CI Queue

Pedido autorizado: estudar, implementar, revisar e integrar em dev o plugin
skills-only do produto. Fonte inicial: dev `41fadb02bdef92f9d07561716d84071d2b4d121a`.
Lane: `codex/ci-queue-plugin`, worktree `/tmp/ci-queue-plugin`.
Modelo/thinking solicitados: Sol/máximo; não alterar durante a campanha.

## Entendimento observado

- CLI/config/enqueue congelam receitas e identidade; worker serializa e runner
  supervisiona processo, Git e finalização. Worker/runner não importam ship.
- Ship tem elegibilidade própria em `src/ship`; pendências não participam dela.
- `src/core/advisories.ts` grava legado em `state/validation-plan.json` e substitui
  por PR. `validation_advisories.py` pode ocultá-lo por verde posterior.
- Cadastro prefere a principal, mas leitura de catálogo/repositório pode usar
  outra worktree. Esse fallback não serve para a nova fonte de pendências.
- Adoção já tem quickstart, método e templates. O plugin deve encaminhar a esses
  donos vivos, sem reproduzir o manual. Documentação remota deve vir de uma ref
  identificada do repositório oficial; registrar revisão observada.
- DietFlow possui ledger Markdown de validações e backlog/skill próprios de
  harness. São domínios distintos; nenhum deles será editado nesta campanha.
- Manifests atuais conferidos em 26/10/2026: OpenAI portable `plugin.json`,
  adaptador Codex e marketplace `.agents/plugins/marketplace.json` com
  `source.path`; Claude `.claude-plugin` e source relativo à raiz do marketplace.

## Delta mínimo escolhido

1. Pacote autocontido em `plugins/ci-queue`, cinco playbooks, referências vivas,
   manifestos compatíveis, documentação de instalação/atualização e helper de
   registro sem dependências externas. Sem MCP, hooks, scheduler ou serviços.
2. Opt-in `validationRecord` no catálogo aponta para um arquivo JSON versionado
   do consumidor. Helper só modifica a worktree explicitamente selecionada;
   init é explícito. Motivos duplicados podem coexistir. IDs independentes e
   fingerprint da obrigação vinculam fechamento ao escopo/revisão observados.
3. Dashboard projeta esse arquivo da principal cadastrada, sem fallback para
   outra worktree, escrita, execução ou quitação automática. Preservar forma
   pública dos itens e usar erro existente para ausência/inválido/indisponível.
   Legado fica disponível somente enquanto não houver opt-in; migração é
   explícita, sem sincronização. Markdown existente conserva seu owner até
   migração autorizada; não criar fonte paralela.
4. Não alterar gates de ship, processos, locks, formato de ticket ou políticas
   consumidoras. Pendência é informação e não limita a decisão de merge da IA.

## Plano e verificação

- [x] Ler instruções, memória resumida pertinente, código/testes, contratos,
  templates e documentação oficial dos hosts. Preservar checkout principal.
- [x] Implementar pacote e projeção mínima.
- [x] Exercitar registro sem execução, leitura sem escrita, concorrência Git,
  duplicados, fechamento antigo/obrigação nova, ausente/vazio/inválido/principal
  indisponível e independência de elegibilidade. Validar pacote isolado dos
  scripts do repo e manifestos nos hosts disponíveis.
- [x] Revisar candidata e corrigir achados concretos.
- [ ] Produzir check mínimo canônico para dev e integrar via PR/ship se
  credenciais e capacidade permitirem.
- [ ] Registrar recibo real de pacote, testes, Git/PR/merge e limites.

Não executar Full/CI de consumidores, resolver Docker/cloud, instalar bundle
do executor, promover main, publicar em diretórios ou remover skills locais.

## Estado

Autoria/revisão concluídas; checklist capturado antes da integração. Managed worktree da aplicação não
é suportada neste tipo de tarefa; a lane foi criada por `git worktree`, após
fetch de origin/dev. Nenhum processo consumidor ou worker iniciado.

Verificação focal: pacote 7/7; backend novo 9/9; ship/config 39/39; cadastro
existente 27/27 e escopo HTTP 29/29. Os dois últimos exigiram execução fora da
restrição de sockets do sandbox (EPERM no IPC/loopback), sem alteração de código
para contorná-la. Claude validou manifestos e catálogo em modo strict. Codex CLI
0.162.0 registrou/instalou a 0.1.0 e atualizou uma cópia de fixture para 0.1.1 em
perfil temporário, com cinco skills; não instalou no perfil do desktop.

Revisão independente somente leitura corrigiu: retorno de POST Meta perdendo a
fonte principal, catálogo válido sem repository.path e mutação sobre symlink
interno. Cobertura acrescentada; nenhum achado material remanescente. Validação
UTF-8 estrita preserva bytes inválidos. Testes consumidores, Full, cloud, promoção
main e instalação do executor não foram executados nem autorizados por este plano.

Recibos de integração e pacote ficam nos artefatos locais de execução e na PR,
sem reescrever este retrato da autoria a cada transição Git.
