# Contratos executáveis: Análise e projetos locais

Este documento define o resultado, os nomes de interfaces propostos e os limites de integração. Não é um patch pronto nem declaração de APIs que já existem. Os tipos novos podem ser adaptados ao estilo do repo, preservando seus campos, significados e aceites.

## 1. Escopo único de leitura

```ts
export type ReadScope =
  | { kind: "project"; projectId: string }
  | { kind: "unassigned" }

export function scopeKey(scope: ReadScope): string {
  return scope.kind === "project"
    ? `project:${encodeURIComponent(scope.projectId)}`
    : "unassigned"
}

export function scopeQuery(scope: ReadScope): Record<string, string> {
  return scope.kind === "project"
    ? { projectId: scope.projectId }
    : { context: "unassigned" }
}
```

Não reservar IDs de projeto como `all`, `legacy` ou `unassigned`. Esses nomes podem ser project.id legítimos. O discriminador está em outro campo. Não interpretar `undefined` como todos os projetos.

### Resolução no servidor

Criar `backend/ci_queue_api/project_context.py` com um contexto resolvido imutável por requisição:

```python
@dataclass(frozen=True)
class ResolvedProject:
    project_id: str
    display_name: str
    registry_revision: int
    entry_revision: int
    repository_path: Optional[Path]
    git_common_dir: Optional[Path]
    config: Optional[ProjectConfig]
    binding_state: str
    archived: bool
```

O estado sem projeto é um tipo/valor separado, não um ResolvedProject com ID vazio. Separar:

- `resolve_scope(query, registry, bootstrap_project_id)` identifica o alvo.
- `resolve_project(project_id, registry)` resolve o cadastro e suas capacidades.
- `require_capability(project, capability)` protege somente o endpoint que precisa dela.

Nenhuma função altera `ApiContext.config` em resposta a uma seleção. O Context do servidor passa a conter registry/state root e a referência de bootstrap, não um projeto ativo mutável.

Compatibilidade de entrada: requisição antiga sem contexto continua ligada ao projeto de `--config`, quando há esse bootstrap. Com nenhum bootstrap, retornar `409 PROJECT_REQUIRED`; não escolher a primeira entrada alfabeticamente. `/api/executions?scope=legacy` sem projectId continua como alias de arquivo não atribuído. A UI nova usa contexto explícito em tudo. `projectId` junto de `context=unassigned` é 400.

**Mudança deliberada de contrato:** detalhe/log/diagnóstico não aceitam mais terminal sem ID dentro de uma consulta explicitamente projectId=P. O bucket usa context=unassigned. Atualizar os testes e a documentação desse antigo bypass; não manter uma fuga de escopo para preservar um comportamento agora substituído.

### Respostas e caches

Respostas de domínio acrescentam `context: {kind, projectId?}`; quando útil, `contextRevision` identifica cadastro/config efetiva. Não mudar campos existentes sem necessidade. O cliente valida a identidade da resposta antes de entregá-la ou guardá-la.

Chave mínima: `[scopeKey, recurso, filtros semânticos, revisão do vínculo]`. Para log, acrescentar jobId/cursor. Um resultado de A nunca pode ser guardado na chave B, ainda que A tenha terminado depois.

`/health`, `/build.json`, `/api/session` e `/api/machine` são globais. Seu cache não muda ao selecionar projeto. `/health` não lê histórico, Git, `du`, catálogos nem arquivos grandes; um repo quebrado não transforma uma bridge viva em offline.

## 2. Registry local

Arquivo: `<state_root>/state/projects.json`. Lock: `projects.lock`, mesmo padrão de flock e escrita atômica que já existe em dashboard_state. Python é o único writer deste registry neste corte. Nenhum daemon novo.

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "bootstrapProjectId": "dietflow",
  "projects": {
    "dietflow": {
      "id": "dietflow",
      "displayName": "DietFlow",
      "repositoryPath": "/example/dietflow",
      "gitCommonDir": "/example/dietflow/.git",
      "configPath": "/example/dietflow/ci-queue.json",
      "archivedAt": null,
      "revision": 1,
      "createdAt": "2026-09-15T12:00:00Z",
      "updatedAt": "2026-09-15T12:00:00Z"
    }
  }
}
```

`repositoryPath`, `gitCommonDir` e `configPath` podem ser null para uma identidade histórica explicitamente cadastrada sem vínculo. Um novo cadastro normal por pasta exige Git válido; importar uma identidade/config já existente pode preservar histórico mesmo com a pasta indisponível, exibindo essa condição.

### Identidade

- Config vinculada: usar seu `project.id`. Não criar UUID alternativo.
- Identidade selecionada na lista de registros sem cadastro: preservar seu projectId; o usuário confirma esse vínculo. Config fornecida deve declarar exatamente o mesmo ID.
- Pasta nova, sem config e sem identidade histórica selecionada: gerar `proj-` + UUID hex uma vez e persistir.
- `displayName`: não vazio, aparado, até 160 caracteres. É alias local, não identidade.
- Nome duplicado é permitido; o seletor distingue pelo caminho resumido/ID. Não introduzir colisão por nome.
- `gitCommonDir` é localizador para deduplicar worktrees, **não** identidade durável global. O diretório pode mudar de lugar; o projectId não muda.
- Um git-common-dir real já vinculado a outro ID gera conflito explícito, inclusive se o outro cadastro estiver arquivado.
- Mesmo ID em outro clone não cria uma segunda entrada. Nesta versão há um vínculo de repositório por projeto; relocalização é explícita.
- Não ler identidade de usuário do Git nem credenciais. `git config user.name` não identifica projeto nem conta autenticada.

### Persistência e concorrência

Toda mutação recebe `expectedRevision` do registry. Sob lock: reler, validar revisão, aplicar uma única operação, incrementar registry/entry revision e gravar temp+flush+fsync+replace. Permissões 0600 para arquivo; preservar diretórios existentes. Conflito retorna 409 e não aplica parcialmente.

Registry ausente significa primeira execução, não corrupção. Registry ilegível/schema desconhecido significa erro; preservar bytes. Não reconstruir silenciosamente um registry inválido a partir de um único config. Health e build continuam disponíveis; tela mostra erro recuperável de cadastro, sem falsa lista vazia.

GETs não criam projetos nem escrevem registry. Bootstrap acontece na inicialização explícita do servidor com --config, de forma idempotente, antes de servir. Cadastro/edição posterior acontece por POST protegido.

### Bootstrap e zero projetos

- `--config` passa a ser opcional no servidor-fonte. Sem ele, registry vazio é um shell válido.
- Com --config e registry ausente: registrar ID/nome/caminho/config já declarados, preservando ledger/dashboard/history/logs. Não reatribuir tickets.
- Reiniciar com a mesma configuração não duplica cadastro nem troca o alias renomeado, não restaura arquivados e não redefine escolhas de browser.
- Se uma referência anteriormente válida sumiu, manter o cadastro, registrar a indisponibilidade e permitir UI de reparo. Não derrubar o servidor inteiro.
- Config de bootstrap inválida em uma primeira execução: shell inicia com erro explícito de bootstrap e nenhum projeto presumido. Nunca transforma isso em configuração validada.
- `bootstrapProjectId` é ponte de compatibilidade para clientes antigos, não uma seleção global que muda quando alguém usa o dropdown.
- Não atualizar LaunchAgents/instalação nesta entrega. O comando legado que já fornece --config continua aceito.

## 3. Vínculo de pasta e configuração

### Probe local e restrito

`POST /api/project-probe` recebe uma pasta, um configPath opcional ou ambos. Requer os mesmos controles de loopback/Origin/Host/CSRF das ações existentes.

```json
{
  "repositoryPath": "/example/repo",
  "configPath": null,
  "existingProjectId": null
}
```

Normalizar `~` do usuário local e caminhos absolutos; rejeitar NUL/quebras de linha, URL ou caminho vazio. Não expandir comandos/variáveis via shell. Para um subdiretório, devolver o top-level; para linked worktree, devolver seu common-dir. Não procurar em HOME.

Comandos permitidos, argv fixa e `shell=False`, orçamento total de 8s:

```text
git -C <pasta> rev-parse --show-toplevel
git -C <pasta> rev-parse --path-format=absolute --git-common-dir
git -C <pasta> rev-parse --is-bare-repository
```

Executar com ambiente Git de localização saneado (não herdar GIT_DIR/GIT_WORK_TREE/GIT_COMMON_DIR/GIT_INDEX_FILE/objetos alternativos de outra execução), `GIT_OPTIONAL_LOCKS=0` e `GIT_TERMINAL_PROMPT=0`. Não executar hooks, comandos de receitas, fetch, clone, push, credential helper ou descoberta remota. Repositório bare é rejeitado para cadastro por pasta nesta versão.

Config padrão é procurada somente na raiz da pasta observada. Config explícita pode ficar fora do repo. Validar com o leitor existente e exigir coerência do projectId e do caminho Git. Se config.repository.path existe, esse caminho não pode ser ignorado: deve pertencer ao repositório escolhido. Aliases de worktree do mesmo common-dir são reconhecidos, sem criar projetos novos.

O probe devolve somente dados permitidos: caminho normalizado, common-dir, ID/nome declarados se houver, existência/validade do catálogo, nomes de presets, conflitos e assinatura dos arquivos usados. Não enviar argv, ambiente, tokens ou configuração bruta ao browser.

O submit de cadastro repete a validação e compara a assinatura vista no preview. Se config ou vínculo mudou entre conferir e salvar, retorna 409 e pede conferir novamente. Não criar serviço de tokens de aprovação, daemon de descoberta ou banco de probes.

### Config ausente não é config vazia

Pasta sem config pode ser cadastrada e observada. `configPath=null`; catálogo `unlinked`. Não escrever arquivo novo no repo, não alterar a CLI para aceitar receitas vazias e não fabricar `ProjectConfig(presets={})` para fingir configuração validada.

O detalhe de projeto mostra ID copiável e **Vincular configuração de receitas**. A CLI explícita que já recebe projectId/projectName continua sendo uma integração válida; o cadastro do painel não promete descobrir receitas nem submeter testes automaticamente.

### Reparar e desvincular

- `relocate`: mesmo ID, novo caminho validado; pode atualizar configPath, com ID idêntico.
- Se config aponta à pasta antiga, devolver conflito explicado. Usuário pode corrigir esse arquivo fora da UI ou usar `unlink-config` e manter o cadastro de pasta.
- `link-config`: vincula config válida ao ID existente. Não remapeia ID para coincidir.
- `unlink-config`: remove apenas o vínculo da config; mantém pasta, ID, tickets, Meta e registros. Capacidade canônica passa a indisponível, não “nenhum verde”.
- Renomear é só alias. Arquivar/restaurar é só lifecycle do cadastro.
- Relocalização não altera cwd de tickets existentes nem corrige retroativamente jobs que já foram enfileirados.

## 4. Endpoints de lifecycle

Novos endpoints, reutilizando a infraestrutura HTTP atual:

| Método/rota | Entrada | Saída/efeito |
| --- | --- | --- |
| GET /api/projects | sem contexto | registryRevision, bootstrapProjectId, lista persistida resumida e condições de vínculo já conhecidas; sem scan de histórico/Git/du. |
| GET /api/projects?includeObserved=1 | somente ao abrir Gerenciar projetos | acrescenta IDs presentes em registros mas ausentes do registry; uma leitura agregada do histórico, sem escrita nem autoatribuição. |
| POST /api/project-probe | pasta/config/ID existente opcional | preview normalizado e conflitos, sem executar receita. |
| POST /api/projects | action + expectedRevision + dados específicos | registra ou altera uma entrada e retorna registry atualizado. |

Actions: `register`, `rename`, `relocate`, `link-config`, `unlink-config`, `archive`, `restore`. Não aceitar um objeto arbitrário que sobrescreva o registry inteiro.

Para register, a origem de ID é discriminada: `identitySource="config" | "observed" | "new"`. Um ID `observed` deve realmente existir nos registros da raiz; não aceitar string arbitrária disfarçada de descoberta. O usuário vê ID e confirma associação da pasta; isso não é inferência automática do reader.

### Leitura segura e erros

Os novos endpoints de projetos expõem caminhos escolhidos do host. Não herdar automaticamente `Access-Control-Allow-Origin: *` para eles. Aplicar política de mesma origem/loopback e rejeitar Origin externo/Sec-Fetch-Site cross-site. Não liberar CORS amplo ou CSRF para a prévia. A prévia usa proxy de mesma origem para a API candidata, como as mutações existentes.

Códigos: 400 entrada inválida; 403 origem/CSRF/acesso não permitido; 404 ID desconhecido ou ticket fora de escopo; 409 revisão/vínculo divergente; 503 dependência local indisponível/registry ilegível. Acrescentar `code` estável às mensagens pertinentes sem quebrar o campo `error` já consumido.

Erros de path devem ser redigidos para não retornar conteúdo de arquivos ou stack traces. Uma falha na pasta A não deve impedir health, registro de B nem leitura de tickets B.

## 5. Matriz de escopo e capacidades

| Superfície/endpoint | Projeto com config válida | Pasta sem config | Pasta/config quebrada | Arquivado | Sem projeto |
| --- | --- | --- | --- | --- | --- |
| Health/build/sessão/Máquina | global | global | global | global | global |
| Current/Fila/Histórico | por ID | por ID | por ID | histórico consultável | só terminais não atribuídos |
| Job/Log/Diagnóstico | ID e escopo exatos | idem | idem | idem, readonly | somente ticket não atribuído |
| Resultados percentuais | por ID | por ID | por ID | histórico por ID | não agregar origens desconhecidas |
| Worktrees | pasta válida | pasta válida | erro de vínculo/último dado não certificado como atual | não iniciar polling até restaurar | pede projeto |
| Catálogo/Verdes/Duração | receita atual válida | catálogo não vinculado | catálogo indisponível, não vazio | não consultar config/Git até restaurar | não se aplica |
| Meta/Pendências | estado por ID e verificação atual | preservar definição, sem vereditos canônicos | idem | readonly sem recomputação canônica | não se aplica |
| Mutação de Meta/reveal | escopo explícito e capability | Meta requer config; reveal de worktree observada é permitido | capability determina erro específico | não permitido até restaurar | não permitido |
| Projetos/tema | ações de cadastro, tema global | idem | reparo permitido | restaurar | cadastro permitido |

Sem config, Meta armazenada pode ser apresentada em readonly com **Catálogo não vinculado**; não mostrar os requisitos como falsos verdes/pending/recipe-missing, pois não foi possível consultar o catálogo. Pendências podem mostrar os registros por ID, mas a resolução por ancestry/verde só existe com contexto válido. Separar leitura do documento da decoração que depende de config em `dashboard_state.py` e `validation_advisories.py`.

Current/Fila só mostram jobs do projeto ativo. `globalOccupancy` continua verdadeiro quando há outros projetos ocupando o worker. Copiar **Há trabalho de outro projeto na fila global**; não criar link de detalhe que o contexto atual não consegue abrir. Não introduzir dashboard de todas as filas nesta etapa.

Todos os caminhos de detalhe, log slice/export e diagnóstico chamam a mesma regra de escopo antes de abrir bytes. `jobId` continua validado; não aceitar caminhos de log vindos do browser. As regras existentes de tamanho/redação/cobertura permanecem.

## 6. Agregados de Análise

Adicionar `metric=results|duration`; chamadas antigas sem metric podem preservar a resposta antiga para compatibilidade. A UI nova sempre informa metric.

### Resultados

```text
GET /api/analysis?projectId=dietflow&metric=results&from=<ISO>&to=<ISO>
```

A UI não envia preset por checkbox. O backend filtra por projectId, terminal e finishedAt válido, aplica [from,to), agrega toda a população retida e devolve as contagens de todos os presets. Não carrega progress trees, logs, pontos de duração ou cálculos de canonical_green neste caminho.

```ts
type ResultCounts = {
  preset: string
  passed: number
  failed: number
  cancelled: number
  interrupted: number
  total: number
}
type ResultsResponse = {
  schemaVersion: 2
  metric: "results"
  context: { kind: "project"; projectId: string }
  from: string | null
  to: string | null
  presets: ResultCounts[]
  sampleCount: number
}
```

`sampleCount` soma as contagens da população da resposta, não o gráfico selecionado. Uma leitura do histórico por requisição é suficiente. Não fazer quatro scans separados nem uma chamada por preset. Top10 e percentuais são projeções locais da mesma resposta.

Estado terminal inválido/data ilegível continua fora das contagens como no corte existente. Não transformar cancelado sem início em execução iniciada; ele participa da distribuição terminal, mas não da duração. Campos inválidos no payload de contagem não devem se tornar NaN/barra quebrada: falha de validação é erro de dados.

### Duração

```text
GET /api/analysis?projectId=dietflow&metric=duration&preset=smoketest&from=<ISO>&to=<ISO>
```

Manter filtros de receita comparável e validação de duração. Um preset histórico não declarado é rejeitado com mensagem específica aqui, não removido dos Resultados. Nenhuma amostra cross-project. `passRate` legado não é reutilizado para barras; remover seu consumo visual ou mantê-lo apenas como campo compatível, explicitando seu denominador.

## 7. Estado dos filtros e navegação

```ts
type PresetSelection =
  | { mode: "top10" }
  | { mode: "all" }
  | { mode: "custom"; presets: string[] }

type AnalysisViewState = {
  metric: "results" | "duration"
  period: "all" | "week" | "month" | "quarter"
  resultSelection: PresetSelection
  durationPreset: string | null
}
```

URL: `projectId=P` ou `context=unassigned`; `analysisMetric`, `analysisPeriod`, `analysisMode`; em custom, repetir `analysisPreset=<nome>`; `durationPreset=<nome>` é independente. Serializar arrays com URLSearchParams.append, não com vírgula. Um nome literal `all` é um preset real, não sentinela. Custom vazio mantém analysisMode=custom sem itens.

Migração de URL antiga: um único analysisPreset sem analysisMode vira custom de um item em Resultados e pode preencher Duração se declarado. Não converter URL antiga em top10 silenciosamente. Parâmetros desconhecidos não mudam o escopo; projectId explícito inválido produz erro, nunca fallback para outro projeto.

Prioridade inicial: URL explícita > preferência válida dessa aba > último projeto local válido > bootstrap > escolha de projeto. Não criar seleção aleatória com vários cadastros. Para a Análise: URL > estado salvo daquele projectId > default top10/results/all.

LocalStorage pode registrar o último projeto para uma nova sessão, mas um storage event de outra aba não troca o projeto da aba aberta. Cada aba mantém seu contexto e pode estar em projeto diferente.

### Evitar flashes e contaminação

- Uma `ProjectProvider` leve resolve URL/cadastro e fornece Scope; não é um novo framework de consultas.
- `ProjectScopeBoundary key={scopeKey + contextRevision}` remonta estados que não suportam mudança de chave. A sessão/tema/Máquina ficam fora dessa fronteira.
- Worktrees recebe projectId diretamente, sem GET dashboard-state só para descobri-lo. Reidratar busca/seleção daquele projeto no mount; não gravar seleção de A na chave B.
- Paginação de Histórico reinicia cursor/snapshot ao trocar scope. Respostas de páginas antigas não são concatenadas à lista nova. Preservar estado por projeto quando retornar, com revalidação coerente.
- Drawer aberto fecha ao trocar contexto; qualquer requisição restante mantém o scope capturado e seu resultado não vai para a nova página.
- Mutações capturam projectId, entryRevision e revisão do documento **ao iniciar**, inclusive Meta/reveal. A resposta de save A só invalida/cacheia A, jamais B.
- Rascunhos não podem ser gravados noutro projeto. Preservar draft em memória por projectId ao trocar contexto; ao voltar, reabrir explicitamente o draft e conservar a revisão original. Uma mudança remota mantém conflito 409. Não salvar automaticamente ao navegar. Se o mecanismo existente já impede troca por draft sujo, preservá-lo; não substituir um guard funcional por descarte.
- Não persistir tokens CSRF no estado de projeto. Formulários de lifecycle usam revisão do registry; Meta continua usando sua própria revisão.

## 8. Composições e limites visuais

### Proprietários

| Componente | Responsabilidade |
| --- | --- |
| ProjectProvider / ProjectScopeBoundary | Contexto, restauração e fronteira por aba; sem estilo e sem worker. |
| ProjectSwitcher | Trigger no header; lista exclusiva de projetos, arquivo sem projeto e acesso a gerenciamento. |
| ProjectManagerDrawer | CRUD local e condições de vínculo; compõe DetailDrawer/FactsTable/Field/Empty/AlertDialog já instalados. |
| PresetMultiSelect | Checkboxes, busca, modos top10/all/custom e snapshot transitório do menu. |
| SelectionPanel | Uma composição de Popover + header + ScrollArea + footer para os dois seletores pesquisáveis; não decide domínio. |
| FilterSelect | Select simples e limitado para período, resultado/origem/agrupamento e preset único de Duração; API pequena. |
| LocalEnvironmentMenu | SidebarFooter + DropdownMenu + ThemeProvider; usa health global e não inventa usuário. |
| results-model.ts | Normalização, ranking e projeção de seleção; funções puras. |

Não duplicar EntityIdentity/DetailDrawer/FactsTable/DataTableFrame. Não introduzir um segundo conjunto de ícones/cores. Popover com Checkboxes não é Select dentro de Popover; filtros simples continuam Select direto.

### Orçamento decidido para controles

- Header: título/trigger do menu à esquerda; ProjectSwitcher à direita, `min-width:0`, label flexível, ícone/chevron não encolhem. Cresce com o nome até **24rem**, respeitando no máximo metade do espaço útil do header. Em viewport até 639px, máximo **45vw**. Ellipsis só no label; nome completo acessível por foco/tooltip. Não reduzir fonte para caber.
- Toolbar: FilterSelect curto até **14rem**, preset único até **22rem**; sempre max-width:100% e min-width:0. Em estreita, usar quebra de linhas na ordem modo → período → presets.
- Popovers pesquisáveis: largura-alvo **22rem**, limitada a `viewport - 2rem`; lista com altura máxima **20rem**, além do limite de espaço realmente disponível do Radix. Header de busca e atalhos permanecem visíveis; somente opções rolam.
- SelectContent simples: `position="popper"`, `align="start"`, altura máxima **20rem** ou espaço disponível, o menor. Menu não ganha largura pelo nome mais longo além do limite. Opções podem quebrar; trigger trunca. Não aplicar height de item fake para cortar nomes.
- ProjectSwitcher usa alinhamento end; filtros de toolbar usam start. `collisionPadding` de 16px para overlays novos. Sem z-index manual.
- Tema/Bridge: um SidebarMenuButton de rodapé. Texto “Ambiente local” + status curto. Menu com estado global readonly e RadioGroup de Claro/Escuro/Sistema. Sem avatar, logout, GitHub conectado ou configurações desabilitadas.
- Resultados: Card/Chart limitados como antes, altura 18rem, largura mínima por categoria quando necessário, scroll local. Tabela recebe orçamento de colunas semânticas preservando conteúdo e foco; não herdar seis colunas iguais para nomes longos.

Estes números são decisões deste produto e ficam no proprietário executável. DESIGN explica os papéis e aponta ao código; não copiar escala em cinco fontes de verdade. Aceite verifica contenção, alinhamento, legibilidade, teclado e fonte inteira acessível, não um teste separado para cada pixel.

## 9. Lint e regressões

Manter a política ESLint atual. Tipos das APIs de domínio passam a exigir Scope; não deixar todos os projectId opcionais e depender de boa vontade. Não exportar funções públicas unscoped para recursos de projeto. Uma pequena regra `no-restricted-imports` só se necessária para impedir features de importarem um transporte interno que contorne o client scoped.

Não criar AST walker que proíba cada className ou gere allowlist por ícone. Não criar novo workflow nem outro script de gate se `test:ui`, `test:backend`, `test:browser`, `check:ui` e `check` já cobrem o pacote. Acrescentar testes de fronteira e comportamento nesses caminhos.

## 10. Documentos permanentes

Reconciliar `AGENTS.md`, `DESIGN.md`, os dois mapas .context existentes, skill de shadcn, `docs/CONTRACTS.md`, `docs/ui/PRODUCT-CONTRACT.md`, `docs/ui/COMPOSITION-LEDGER.md`, `docs/INSTALL.md` (somente compatibilidade/operação futura do novo código), README e roadmap.

Adicionar `.context/patterns/project-scope.yaml` somente como mapa curto de invariantes e proprietários. Contrato detalhado permanente fica em `docs/CONTRACTS.md` e `docs/ui/PRODUCT-CONTRACT.md`; o plano de campanha permanece registro temporal. Marcar cláusulas antigas de Select simples de Preset, quatro contagens no eixo e footer de três botões como explicitamente substituídas por este pedido. Não tratar contradição documental como licença para implementar ambas as versões.
