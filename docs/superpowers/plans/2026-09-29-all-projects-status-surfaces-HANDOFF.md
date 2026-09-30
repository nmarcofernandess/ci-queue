# Handoff — Todos os projetos nas superfícies de Status

Você é a IA implementadora local do CI Queue. Trabalhe no repositório `nmarcofernandess/ci-queue`, diretamente na branch `dev`.

Sua missão é revisar e depois executar, integralmente e em ordem, estes dois documentos:

- `docs/superpowers/specs/2026-09-29-all-projects-status-surfaces-design.md`
- `docs/superpowers/plans/2026-09-29-all-projects-status-surfaces.md`

A SPEC foi escrita sobre `dev@604afa461d18a8310a09d9336622abfbe48662f2`. Os documentos entraram depois em `dev`. Antes de implementar, registre o SHA realmente acessível e reconcilie qualquer delta ocorrido desde essa base.

## Método obrigatório

Use Superpowers e Agent Spec Driven Delivery.

A ordem é:

1. revisar;
2. corrigir somente contradições documentais encontradas na revisão, se houver;
3. implementar Task 1 em TDD;
4. revisar Task 1;
5. resolver findings Critical e Important;
6. repetir o ciclo para cada task;
7. revisar a candidata inteira;
8. executar a prova final de `dev`;
9. revisar todo o delta `dev -> main`;
10. abrir PR `dev -> main`;
11. revisar o PR;
12. resolver findings;
13. mergear em `main`;
14. produzir o bundle a partir do SHA realmente mergeado em `main`;
15. atualizar a instalação local usando o receipt e os paths reais da máquina;
16. provar a instalação.

Não transforme o plano em uma implementação monolítica. Uma task só começa depois de a anterior ter teste focal verde, commit e review resolvido.

## Fase 0 — review antes de código

Antes de escrever produto:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
```

A branch deve ser `dev`.

Leia integralmente:

- `AGENTS.md`
- `DESIGN.md`
- `.agents/skills/ci-queue-shadcn/SKILL.md`
- `.context/domains/manifest.yaml`
- `.context/patterns/ui-composition.yaml`
- `docs/ui/PRODUCT-CONTRACT.md`
- `docs/ui/COMPOSITION-LEDGER.md`
- a SPEC
- o PLAN
- os arquivos vivos citados por ambos

Faça uma revisão objetiva do plano contra o código atual.

O resultado desta fase deve ser um destes:

```text
READY
base revisada: <sha>
sem blocker entre SPEC/PLAN e código vivo
```

ou uma lista curta de blockers concretos com arquivo, símbolo e correção documental necessária.

Se nomes de arquivos, símbolos ou contratos mudaram desde a base, ajuste SPEC/PLAN primeiro e faça um commit documental pequeno. Não mude a direção aprovada por preferência pessoal.

Se não houver blocker, prossiga automaticamente para implementação. Não peça outro GO.

## Segurança de trabalho direto em dev

Marco autorizou esta entrega diretamente em `dev`. Portanto, não crie feature branch e não use worktree para esta entrega.

Isso não autoriza apagar trabalho alheio.

Antes de cada task:

```bash
git status --short
git rev-parse HEAD
```

Se houver alterações locais não commitadas nos mesmos arquivos da task, não as sobrescreva, não faça `reset --hard`, não use stash destrutivo e não faça checkout que descarte trabalho. Identifique o conflito e pare somente a escrita afetada.

Faça commits pequenos por task. Não acumule uma alteração de milhares de linhas para revisar no final.

## UI shadcn obrigatória

Antes de qualquer JSX, siga `.agents/skills/ci-queue-shadcn/SKILL.md`.

A partir de `ui/`, rode:

```bash
npx shadcn@latest info --json
npx shadcn@latest docs badge
npx shadcn@latest docs item
npx shadcn@latest docs card
npx shadcn@latest docs popover
npx shadcn@latest docs drawer
npx shadcn@latest docs tooltip
```

Registre antes do JSX:

```text
identidade de projeto -> Badge + Tooltip via ProjectChip -> modo de apresentação
resumo lateral -> Card + ItemGroup/Item -> dados agregados -> gap Status já aprovado
seleção de alvo -> SelectionPanel + InputGroup + Button -> projeto local do drawer
detalhe -> DetailDrawer -> estado agregado ou de um projeto
verdes -> RunTable/DataTableFrame -> identidade de projeto preservada
```

Não remonte Radix na feature. Não invente componente paralelo quando existe owner compartilhado.

## Decisões que não estão abertas

### Todos é leitura agregada

`context=all` não é um projeto.

Não crie:

- Meta global;
- catálogo global;
- verde global sem projeto;
- `candidateSha` global;
- mutation de Meta em Todos;
- inferência de projeto.

O backend agrega projeções de projetos ativos. Cada verde continua sendo validado contra a receita atual do projeto dono.

### Browser sem N+1

A UI não faz uma request por projeto a cada polling.

Os recursos agregados usam uma request cada:

```text
GET /api/dashboard-state?context=all
GET /api/preset-history?context=all
GET /api/remote-slots?context=all
```

Se a implementação começa a mapear `projects.map(fetch...)` no browser, está errada.

### Um único ProjectChip

`ui/src/features/shared/project-chip.tsx` continua dono do chip.

Implemente somente:

```ts
type ProjectChipMode = "inline" | "compact-context"
```

`inline` conserva o comportamento atual.

`compact-context` existe somente para previews dos cards laterais Metas e Pendências em Todos. O chip fica em linha própria acima do título do item. Não tente enfiá-lo na mesma linha estreita. Não reduza fonte para fazê-lo caber.

Não crie `ProjectChipSmall`, `SidebarProjectChip`, `MetaProjectBadge` ou equivalente.

`ProjectChip` não recebe `className`.

O lint deve rejeitar:

- uso sem `mode`;
- `mode` dinâmico;
- `className` em `ProjectChip`.

Atualize o pattern em `.context` para dizer onde cada modo é usado.

### Seleção local no drawer

Em Todos, abrir Metas ou Pendências não muda o filtro global do header.

Extraia a composição pesquisável de projetos do `ProjectSwitcher` para um owner apresentacional compartilhado baseado em `SelectionPanel`.

O `ProjectSwitcher` continua sendo o adapter que altera `ReadScope`.

O drawer usa a mesma composição para um alvo local:

```ts
type ProjectTarget =
  | { kind: "all" }
  | { kind: "project"; projectId: string }
```

Meta em alvo de projeto reutiliza o editor atual. POST sempre leva o `projectId` escolhido.

Pendências continuam somente leitura. O alvo local apenas filtra.

### Últimos verdes em Todos

Habilite Últimos verdes para `project` e `all`. `unassigned` continua desabilitado.

Preserve `projectId` e `projectName` nas rows.

A identidade de merge Máquina + Git é namespaced pelo projeto.

Agrupamento Por commit usa:

```text
projectId + headSha
```

Nunca agrupe o mesmo SHA de dois projetos como um commit único.

Uma falha em um projeto não esconde verdes válidos dos demais.

## TDD e review

Para cada Task do PLAN:

1. escreva o teste que demonstra o comportamento;
2. rode e confirme que falha pela razão esperada;
3. implemente o mínimo necessário;
4. rode o teste focal;
5. rode lint/build quando a task toca UI;
6. faça commit;
7. passe o delta a um reviewer fresco;
8. corrija Critical e Important;
9. rode novamente o teste dono da correção;
10. só então avance.

Não faça refactor lateral sem relação com a SPEC.

Se um arquivo ficou grande demais para receber a nova responsabilidade, use os splits previstos no PLAN. Não faça uma reorganização geral do repo.

## Lint é contrato

Não desabilite regra para fazer a feature passar.

Se o lint acusa uma composição inválida, corrija o owner ou o consumidor correto.

`tests/ui/ui-policy.test.ts` deve provar as regras novas com o ESLint real instalado.

## Prova da candidata em dev

Depois da última task e do review whole-branch:

```bash
npm run check
git status --short
git rev-parse HEAD
```

Só considere `dev` candidata se o check passar e a working tree estiver limpa.

Registre esse SHA como `DEV_RELEASE_SHA`.

## Promoção dev para main

`main` estava atrás de `dev` quando o plano foi escrito. Portanto, o PR `dev -> main` pode conter trabalho anterior além desta feature.

Antes do PR:

```bash
git fetch origin
git rev-parse origin/main
git rev-parse origin/dev
git log --oneline --left-right origin/main...origin/dev
git diff --stat origin/main...origin/dev
```

Revise todo esse delta.

Não esconda trabalho antigo num PR descrito como se fosse apenas esta feature. Não cherry-picke uma versão parcial para contornar review.

Se todo o delta estiver apto:

1. abra PR `dev -> main`;
2. descreva o delta completo;
3. inclua SPEC, PLAN, `DEV_RELEASE_SHA` e provas;
4. faça review independente;
5. corrija Critical e Important em `dev`;
6. repita a prova final se o head mudar;
7. mergeie o PR;
8. registre o SHA realmente mergeado como `MAIN_RELEASE_SHA`.

Marco já autorizou a promoção e o merge quando os gates deste plano estiverem satisfeitos. Não peça novo GO apenas para apertar o botão de merge.

## Release e instalação local

Produza a release somente a partir de `MAIN_RELEASE_SHA`.

```bash
git switch main
git pull --ff-only
git rev-parse HEAD
```

Leia a instalação existente em `~/.local/share/ci-queue/installation.json`. Use os paths reais. Não invente prefix, state, config, Node, Python ou command path.

Confirme fila quieta e ownership conforme `docs/INSTALL.md`.

Produza:

```bash
npm run release:bundle
```

Use o diretório realmente gerado.

Verifique:

```bash
node scripts/release.mjs verify --bundle releases/ci-queue-<versão>-<revisão>
```

O manifest deve apontar para `MAIN_RELEASE_SHA`.

Atualize com `scripts/install.mjs update --activate` usando os valores reais do receipt.

Depois prove:

```bash
ci-queue version --json
ci-queue status --state "<state-real>" --json
curl --fail --silent --show-error http://127.0.0.1:8765/health
curl --fail --silent --show-error http://127.0.0.1:8765/build.json
launchctl list | grep 'com.nmarcofernandess.ci-queue'
```

Confirme que `/build.json` e `installation.json` apontam para `MAIN_RELEASE_SHA`.

Execute o menor preset real e autorizado do CI Queue como prova instalada. Fixture isolada não substitui essa prova.

## Relato durante a execução

Atualize Marco somente nos limites de task ou quando houver blocker real.

Formato útil:

```text
Task N concluída
commit: <sha>
teste focal: PASS
review: sem Critical/Important
próxima: Task N+1
```

Não despeje log bruto nem narre cada comando.

## Relatório final obrigatório

Entregue:

```text
SPEC:
PLAN:
DEV_RELEASE_SHA:
PR:
MAIN_RELEASE_SHA:
bundle:
manifest revision:
installation revision:
checks:
installed proof ticket:
findings remanescentes:
```

Se alguma etapa não puder ser provada, marque-a como não provada. Não transforme ausência de evidência em sucesso.
