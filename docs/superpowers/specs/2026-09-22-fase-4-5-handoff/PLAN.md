# Feedback pela fila e fechamento F4/F5 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (selected by Marco) or superpowers:executing-plans only when subagents are unavailable. Execute task-by-task; steps use checkbox syntax. Production changes require superpowers:test-driven-development. A single consolidator owns Git and the machine queue.

**Goal:** entregar um caminho curto de feedback E2E enfileirado, com sessão reutilizável, outputs pequenos e método distribuído; completar as provas remanescentes F4/F5 sem criar outro ciclo de infraestrutura.

**Architecture:** CI Queue mantém o executor genérico. O DietFlow possui a sessão e uma receita `e2e-feedback` que utiliza o servidor existente; cada tentativa tem ticket próprio. A única extensão necessária no catálogo genérico é seleção de artifacts por receita. Não existe nova fila, API de serviços ou controlador global do Mac.

**Tech Stack:** TypeScript/Node, shell POSIX, Vitest CQ, Jest DF, Playwright, Python API existente; versões/lockfiles e runtime canônico já adotados. Nenhuma dependência nova é requisito.

**Spec:** [SPEC.md](SPEC.md). Ambos os arquivos moram no CI Queue e governam os dois repositórios. [HANDOFF.md](HANDOFF.md) e `research/` são evidência histórica preservada, não comandos atuais a executar cegamente.

**Status:** plano escrito para review de execução; nenhum código deste plano foi implementado por sua autoria.

## Global Constraints

- Uma fila oficial por máquina; nenhum segundo worker no state do operador.
- Sessão é do consumidor; tentativa é um ticket CI Queue; proof é política do consumidor.
- Feedback aceita WIP, mas não é prova de ship, Full, RC ou módulo concluído.
- Não alterar coverage, retries, timeout de casos, `--grep-invert`, veredito de flaky ou critérios materiais de ship para melhorar números.
- Logs/tickets/ledger/registry existentes e proofs publicados não entram em limpeza.
- O ENOSPC histórico e a localização dos antigos 50 GB não são pré-condições deste corte.
- Nenhum novo banco, daemon, fila, scheduler adaptativo, WebSocket, hook global de shell ou detector de intenção por IA.
- Não importar código/internals DietFlow no runtime distribuído do CI Queue; worker/runner nunca importam `src/ship`.
- Não redesenhar painel/tabelas. A execução aparece nas superfícies de tickets existentes.
- O método precisa funcionar com documentos distribuídos, não apenas num checkout com skills locais.
- Não existe aprovação humana automática, install implícito ou Full ritual.

## Review Focus

1. **Cliente e worker têm ambientes diferentes:** PORT/E2E_BASE_URL do terminal não alcançam automaticamente o ticket; sessão/seleção precisam ser resolvidas do argv persistido. Testes T2/T3.
2. **Saída coincidente com admissão:** stop e início de tentativa disputam a mesma sessão; nunca liberar a posse enquanto outro processo está usando ou matar por PID reciclado. Testes T2/T6.
3. **Verde sem anexos grandes:** resumo/log/receipt devem sobreviver à remoção do scratch; outputs de uma prova anterior e symlinks nunca entram em rotação de feedback. Testes T1/T4.
4. **WIP não pode certificar merge:** feedback fora de acceptedPresets, com argv próprio; custom/focal e presença de receipt não mudam elegibilidade material. Testes T3/T6.
5. **Um teste do protocolo imprime markers falsos:** o self-host não pode tratá-los como progresso real; preservar o filtro existente e provar somente o canal emitido pelo runner consumidor. Testes T6.

## Orquestração e prova

Bases lidas: CQ runtime `ef057973bd1f006f493487f6cc9b96b2b7e741f8`, lane documental originalmente `2f422d2084af92e2d82ccfacd12528c7e02e959e`; DF `dcd7ac2c8410a05d0c9f4fccee303c3d9a8c7ed0`. Reancorar uma vez antes da execução e quando um arquivo proprietário mudar. Não buscar novo dev antes de cada assert.

A publicação documental não depende de merge para ser lida. Não alterar esta pesquisa antiga. Na execução, usar worktrees isoladas via `using-git-worktrees`. O consolidador decide as lanes de código atuais e registra seus SHAs; não tocar a antiga 123/07 ou 123/02 por inferência.

| Owner lógico | Tarefas | Concorrência permitida |
|---|---|---|
| Consolidador | T0, integração e T8 | Único autor de commits/push/PRs e único solicitante de jobs na máquina. |
| CQ genérico | lado CQ de T1, T5 | Pode preparar patch documental enquanto DF trabalha; não rodar outra suíte pesada em paralelo. |
| DF feedback | T2, T3, T4 | Sequencial: compartilham sessão/config/receipt. |
| Revisor/provas | T6 | Depois dos contratos integrados; review fresco por tarefa, não agente elogiando seu próprio diff. |
| Performance/documentação | T7 | Análise de fontes em paralelo; piloto só na fila e sem competir com a sessão de outro dono. |

Cada comportamento novo: teste mínimo → RED pelo motivo correto → implementação mínima → GREEN → suíte proprietária → refactor. Um teste já verde é evidência de comportamento existente, não TDD inventado. Erro de import/setup não basta como RED causal. Começar por CLI/config existentes permite observar a lacuna antes de extrair helpers novos.

### Como executar testes do próprio desenvolvimento sem bypass

Todas as invocações de teste no host configurado com fila são argv de um ticket real. O comando abaixo é o envelope padrão de TDD; trocar apenas o array de teste e executar no cwd proprietário:

```bash
# STATE é lido de installation.json na T0; não escolher outra raiz por conveniência.
PROJECT_ID=$(node -e 'const c=require("./ci-queue.json");process.stdout.write(c.project.id)')
PROJECT_NAME=$(node -e 'const c=require("./ci-queue.json");process.stdout.write(c.project.name)')
ci-queue enqueue --recipe feedback-contract-review \
  --project-id "$PROJECT_ID" --project-name "$PROJECT_NAME" \
  --cwd "$PWD" --state "$STATE" --artifacts-json '[]' \
  --flags-json '{"progressEnabled":true}' \
  --argv-json '["npm","exec","--","vitest","run","tests/core/recipe-artifacts.test.ts"]' \
  --wait --json
```

Para Jest, o array é `['npm','test','--','--runTestsByPath',ARQUIVO,'--maxWorkers=1']`, mantendo os scripts/pretest/Node do consumidor. Para testes shell/Node/Python, usar seu comando proprietário no mesmo envelope. Não escrever `CI_QUEUE_JOB_ID` manualmente. Os testes podem criar workers **internos** em states temporários; nunca apontá-los ao state oficial.

Tarefas de código fecham com seus testes e review. A candidata inteira fecha com os comandos de projeto na T8, não um Full por alteração. O `--wait` terminado por timeout não cancela ticket: retomar o mesmo ID antes de reenfileirar.

## Mapa de arquivos

CQ existentes: `src/contracts/schema.ts`, `config.ts`, `src/core/enqueue.ts`, `src/cli.ts`, `docs/CONTRACTS.md`, `docs/CONSUMER-QUICKSTART.md`, `README.md`, `AGENTS.md`, `scripts/release.mjs`, `.context/domains/manifest.yaml`, testes core/release/browser já existentes.

CQ novos: `tests/core/recipe-artifacts.test.ts`, `docs/TESTING-METHOD.md`, `templates/adoption/{AGENTS.fragment.md,ci.yaml,SKILL.md}`, `tests/release/adoption.test.mjs`. Artefatos de fechamento ficam neste diretório da SPEC: `CLOSURE.md` e `evidence/`.

DF novos: `scripts/harness/feedback-session.ts` (modelo/CLI de start/status/stop), `feedback-runtime.ts` (IO/processos), `scripts/ci/e2e-feedback.ts` (tentativa admitida), `scripts/ci/feedback-outputs.ts` (paths/rotação), `docs/ci/FEEDBACK-LOOP.md`, testes proprietários nomeados abaixo.

DF existentes: `scripts/dev-local-stack.sh`, `scripts/harness/local-stack-state.ts`, `scripts/ship/lane-cleanup.ts`, `scripts/e2e-run.sh`, `scripts/e2e-target-profile.ts`, `scripts/ci/{run,queue-client,execution-evidence}.ts`, `scripts/ci/execution-entry-guard.sh`, `scripts/ci/playwright-invocation.sh`, reporter Q2/Q3 e `playwright.config.ts`, `package.json`, `ci-queue.json`, `.gitignore`, `.claude/CLAUDE.md`, mapas `.context` e skill consumidora.

Não criar adapters por teste clínico. Funções novas abaixo são interfaces deste plano; helpers preexistentes mantêm seus nomes/contratos. Se um path tiver sido substituído depois da base, registrar o owner real na T0 e adaptar o mapa uma vez.

---

### Task 0: Fixar a realidade e a prova que falta

**Files:** ler `HANDOFF.md`, SPEC/PLAN, `research/fase-4-pacote/04-PROVAS-E-ACEITE.md`, censo72 e diagnóstico P05/P06. Criar somente `CLOSURE.md` com estado inicial.

**Interfaces:** produz checkpoint dos dois repos e do state oficial; lista de jobs ativos; tabela A1–A10 e C01–C06/V01/P00–P07 com prova atual ou ausência. Não produz fixtures no state real.

- [ ] Registrar `git remote -v`, HEAD/tree, upstream, status e ancestry de dev nos dois repos. Confirmar PR25 e o delta clínico já integrado; não reabrir sua implementação.
- [ ] Ler os AGENTS reais, paths `.context` roteados e contratos de execução. Ler o receipt de instalação apenas em metadados sanitizados: revision, manifest, state, labels. `ci-queue version --json`, `status --json` são leituras; não iniciar worker ocioso.
- [ ] Confirmar em cada lane que as correções C01/C04, dedup P03 e build P04 existem. Se teste existente já as prova, apontá-lo; não reescrever.
- [ ] Copiar para CLOSURE somente a lista de ausências atuais: matriz C03/C06, 14 confirmações, V01/instalado, P05/P06 e P07. Marcar ENOSPC causal ausente como `INCONCLUSIVO_NÃO_BLOQUEANTE` conforme decisão de Marco.
- [ ] Preparar fixtures temporárias de teste sem copiar .env, pacientes, logs completos ou state do operador. Um arquivo de análise histórico ausente não paralisa as tarefas implementáveis.
- [ ] Consolidar o primeiro commit documental com esses metadados. Nenhum Full, prune, instalação ou alteração nas lanes clínicas.

**Saída:** checkpoint e tabela inicial; os subagentes recebem SPEC + sua tarefa + paths de owners, não cinquenta relatórios a cada iteração.

### Task 1: Captura por receita sem quebrar catálogos existentes

**Files:** CQ `schema.ts`, `config.ts`, `enqueue.ts`, `cli.ts`; novo `tests/core/recipe-artifacts.test.ts`. DF `execution-evidence.ts`, `run.ts`, `queue-client.ts`, `scripts/__tests__/ci-run.test.ts`, `queue-client.test.ts`.

**Interfaces:**

```ts
// CQ ProjectPreset e DF RecipeConfig ganham o campo opcional.
artifacts?: string[]

// Um helper proprietário em cada parser; não importar runtime de outro repo.
resolveRecipeArtifacts(globalPaths: readonly string[] | undefined,
                       recipePaths: readonly string[] | undefined): string[]
// undefined -> global; [] -> nada; lista -> substitui. Validação antes da resolução.
```

- [ ] RED no parser/producer real CQ: global `['old-proofs']`, recipe `artifacts:[]`, buildTicket deve ter lista vazia. O código atual herda global, demonstrando o buraco. Segundo teste: override `['current']` não faz união.

```ts
expect(resolveRecipeArtifacts(['old-proofs'], [])).toEqual([])
expect(resolveRecipeArtifacts(['old-proofs'], ['current'])).toEqual(['current'])
expect(resolveRecipeArtifacts(['old-proofs'], undefined)).toEqual(['old-proofs'])
```

- [ ] Acrescentar no mesmo arquivo fixture Git temporária e testes de integração `parseQueueConfig → buildTicket/enqueue → runJob → artifact snapshot`, com arquivo antigo sentinel que **não** pode ser copiado pelo override. Teste explícito preserva a lista final recebida.
- [ ] Implementar validação de array de paths relativos, sem vazio, absoluto, `..` ou NUL; não aceitar valor inválido como ausência. Resolver com `recipePaths === undefined ? globalPaths ?? [] : recipePaths`, copiando o array.
- [ ] Serializar a lista final uma única vez no ticket. O runner continua lendo ticket.artifacts, sem novo resolver. Não alterar runtime/ship/status por esse campo.
- [ ] DF: atualizar RecipeConfig e o resolver de `run.ts` e `receiptArtifacts` para usar a mesma semântica. O receipt deve refletir a lista efetiva, não a global. Testar o argv/flags terminal e a lista enviada ao adapter.
- [ ] CQ anuncia `recipe-artifacts-v1`; DF só exige a capability ao usar o campo por receita. Binário antigo sem ela recusa esse uso antes de enqueue. Catálogo antigo não ganha exigência nova.
- [ ] GREEN: executar os arquivos novos e os testes existentes de config/enqueue/queue-engine no CQ; `ci-run.test.ts` e `queue-client.test.ts` no DF, pela fila. Registrar os caminhos reais se testes existentes estiverem organizados de outra forma.
- [ ] Revisor compara defaults antigos, `[]`, erro de path e ausência da capability. Consolidador commita apenas os arquivos desta task, separadamente em cada repo.

**Aceite:** config sem override preservada; override não perde receipt nem transporta proofs alheios. Não ativar ainda alterações destrutivas de catálogo consumidor.

### Task 2: Sessão foreground com dono, sem supervisor universal

**Files:** criar `scripts/harness/feedback-session.ts`, `feedback-runtime.ts`, `scripts/harness/__tests__/feedback-session.test.ts`; modificar `scripts/dev-local-stack.sh`, `local-stack-state.ts` somente na integração necessária, `scripts/ship/lane-cleanup.ts`, `package.json`.

**Interfaces produzidas:**

```ts
export type ProcessStamp = { pid: number; pgid: number; startedAt: string }
export type FeedbackSession = {
  schemaVersion: 1; sessionId: string; projectId: string; cwd: string;
  origin: string; state: 'starting'|'ready'|'stopping'|'stopped'|'unavailable';
  owner: ProcessStamp; next: ProcessStamp; coldFingerprint: string;
  startedAt: string; lastAttemptId?: string;
}
export type SessionCheck =
  | { ok: true; session: FeedbackSession }
  | { ok: false; code: 'SESSION_MISSING'|'SESSION_BUSY'|'SESSION_MISMATCH'|
      'SESSION_STALE'|'SESSION_UNAVAILABLE'; message: string }
export function readFeedbackSession(cwd: string): Promise<SessionCheck>
export function validateFeedbackSession(input: {
  cwd: string; projectId: string; sessionId: string;
}): Promise<SessionCheck>
export function startFeedbackSession(input: { cwd: string; port: number }): Promise<number>
export function stopFeedbackSession(input: { cwd: string; sessionId: string }): Promise<number>
```

O arquivo privado da sessão armazena também a lease existente; a interface/JSON público acima omite token. `feedback-runtime.ts` fornece IO de processos para esses métodos; testes usam child HTTP real e substituem apenas o bootstrap Next/Supabase. Não colocar switches de teste no caminho distribuído.

- [ ] RED por CLI: start de sessão compatível não pode criar segundo listener; sessionId diferente de outro cwd não pode ser adotado. Depois extrair helpers com testes unitários de validação.
- [ ] Criar fixture de servidor Node loopback que publica `/api/deploy-info` local/local. Guardar PID/pgid/início reais e cwd. Uma segunda fixture no mesmo endpoint, depois de matar a primeira, deve ser recusada como substituição, não aceita pelo HTTP200.
- [ ] Implementar start sobre `acquireLocalStackMutex`/`verifyLocalStackMutex` existentes. Porta entre 1024–65535, somente loopback, cwd normalizado e projeto do catálogo. Stack ausente informa preparação existente; não chama reset/seed/build.
- [ ] Spawn do Next pelo wrapper atual `scripts/e2e-local-env.sh npm run dev -- --port PORT`, com grupo próprio verificado. Preservar preload opt-in e o ambiente que `dev-local-stack.sh` já constrói. Não chamar `dev:local-stack` de dentro de seu substituto e criar recursão.
- [ ] `dev-local-stack.sh` delega ao novo start; `feedback:start/status/stop` são aliases da CLI consumidora. O start fica em foreground. JSON de status nunca imprime env/secret/lease.
- [ ] Implementar fingerprint da lista de inputs frios da SPEC e checagem do listener + `validateServerTarget`. A comparação de inputs quentes fica fora: mudar componente/teste não deve invalidar a sessão.

```ts
// As fixtures retornam paths/handles reais; o helper mora no arquivo de teste.
expect((await validateFeedbackSession({cwd: otherCwd, projectId, sessionId})).ok).toBe(false)
await writeHotComponent(ownerCwd, 'changed')
expect((await validateFeedbackSession({cwd: ownerCwd, projectId, sessionId})).ok).toBe(true)
await changeLockfile(ownerCwd)
expect(await validateFeedbackSession({cwd: ownerCwd, projectId, sessionId}))
  .toMatchObject({ok:false, code:'SESSION_STALE'})
```

`writeHotComponent` grava um arquivo de fixture que não pertence à lista fria; `changeLockfile` altera o package-lock da mesma fixture. Não alterar arquivos da lane do operador para testar.

- [ ] Expor uma concessão curta para tentativas: `claimFeedbackUse(session, ticketId)` cria atomicamente um marcador sob o lock; `releaseFeedbackUse(claim)` confere identidade e remove apenas a própria concessão. `FeedbackUse` tem `{sessionId,ticketId,token,path}`; tokens são privados. O stop usa a mesma exclusão e recusa uso ativo.
- [ ] Testar stop versus claim com barreira determinística; um lado vence, o outro recebe busy. Testar PID reciclado, owner morto com child ainda vivo, erro de inspeção e cleanup sem confirmação. Nunca usar sleeps longos ou `pkill`.
- [ ] Implementar INT/TERM/HUP/EXIT, encerramento do grupo próprio e liberação da lease somente após confirmação. Em erro irrecuperável, estado unavailable e instrução de inspeção; não apagar proteção alheia. Não adicionar TTL automático.
- [ ] `lane:cleanup` recusa worktree com sessão ativa/inconclusiva. Testar que uma worktree sem sessão continua seguindo o caminho existente.
- [ ] GREEN pela fila: `scripts/harness/__tests__/feedback-session.test.ts` e as suítes atuais de local-stack-state/guard e lane-cleanup. Review de posse antes de T3.

**Aceite:** dois starts não viram dois Next; stop só atua na própria sessão; nenhum processo do produto CQ administra Supabase.

### Task 3: Reteste quente como receita oficial, com ticket real

**Files:** criar `scripts/ci/e2e-feedback.ts`, `scripts/ci/__tests__/e2e-feedback.test.ts`; modificar `scripts/e2e-run.sh`, `scripts/ci/execution-evidence.ts`, `queue-client.ts`, `ci-queue.json`, `package.json`.

**Interfaces:**

```ts
export type FeedbackRequest = {
  sessionId: string; project: 'local-stack-fast'|'regression'|'local-stack-realtime-global';
  selectors: string[];
}
export function parseFeedbackArgs(argv: readonly string[]): FeedbackRequest
export function runFeedback(input: {
  cwd: string; request: FeedbackRequest; env: NodeJS.ProcessEnv;
}): Promise<number>
// startExecutionContext recebe argv?: readonly string[] como extensão aditiva;
// se ausente, preserva o catálogo. Receipt custom usa o argv efetivo, sem inventar canonicidade.
```

- [ ] RED real da entrada local: comando público local-stack sem ticket em catálogo queue deve terminar `QUEUE_REQUIRED` antes do runner. Verificar que o marcador sentinel do browser não foi criado. O código atual permite a execução direta.
- [ ] Colocar `dietflow_require_queue_admission "$REPO_ROOT"` no caminho público de execução local-stack, **depois** do modo `--explain` e antes de iniciar browser. Reusar o guard; não enfileirar recursivamente a partir dele. Preservar contextos explicitamente permitidos, não bypass por string `CI=true`.
- [ ] Adicionar no catálogo:

```json
"e2e-feedback": {
  "progress": true,
  "argv": ["npm", "run", "test:e2e:feedback"],
  "artifacts": ["artifacts/ci/queue-current"],
  "note": "Feedback WIP com sessão local existente; sempre pela fila, nunca prova de ship."
}
```

`package.json`: `test:e2e:feedback = tsx scripts/ci/e2e-feedback.ts`. Não modificar acceptedPresets nem defaults do preset e2e. Incluir a nova receita no reconhecimento Q2/Q3 do queue-client.

- [ ] Parser exige `--session ID`, permite `--pw-project` com os três valores acima e preserva seletores/flags restantes. Rejeitar ausência de seleção, override de target/config/porta/output/reporter que contorne o contrato. Não implementar outro parser de grep: deixar Playwright interpretar sua seleção e reusar os helpers Q2/Q3 para variante.
- [ ] Implementar `guard → sessão → claim de uso → receipt → parents progress → Playwright → validação final → release do uso → finish receipt`. Falha do filho preserva exit/sinal. Sessão perdida/input frio modificado ou falha ao liberar uso no fim retorna não-zero e motivo explícito, nunca passed íntegro.
- [ ] Resolver origin da sessão nomeada **no worker**. Sobrescrever PORT/E2E_BASE_URL conflitantes pelo valor da sessão depois de validar o pedido, sem aceitar valores arbitrários do terminal que enfileirou. Somente variáveis necessárias são materializadas; segredos continuam pelo loader local existente.

```ts
const requested = parseFeedbackArgs(['--session','s1','file.spec.ts','--grep','T05'])
expect(requested.selectors).toEqual(['file.spec.ts','--grep','T05'])
// Teste integrado: cliente tem PORT=3999; sessão s1 serve :3020.
// O processo filho real registra E2E_BASE_URL=:3020, e o ticket preserva --session s1.
```

- [ ] Chamar `e2e-run.sh --target local-stack --project PROJECT -- ...selectors` uma única vez. Não passar por `ci:local:e2e`, `proof:module-core` ou pelo roteador `ci:run` de dentro do ticket. Não fazer `--list` adicional no feedback.
- [ ] Publicar roots/parents e env do reporter Q2/Q3 antes do processo. O reporter real publica contagens/retries; não duplicar parser de logs humanos. Gravar sessionId, argv efetivo e perfil no resumo de diagnóstico, sem lease.
- [ ] Teste de ponta: CLI CQ candidata admite dois tickets de feedback com mesmo sessionId; worker temporário executa serialmente, os logs mostram a mesma sessão e nenhum script reset/build foi chamado. A prova interna usa servidor HTTP/Playwright mínimos, não a aplicação clínica.
- [ ] Testar negativa de ship nos dois consumidores com ticket passed da nova receita. Mudar somente runVariant não deve alterar elegibilidade; isso continua observacional.
- [ ] GREEN focal e owner suites do adapter/entrypoints/evidence. Review deve conferir o caminho completo do signal e da seleção, não somente types.

**Aceite:** manter ambiente quente não permite executar o E2E diretamente no host queue; a receita curta não prepara nem encerra a sessão.

### Task 4: Outputs do run atual, retenção curta e proofs intactos

**Files:** criar `scripts/ci/feedback-outputs.ts`, `scripts/ci/__tests__/feedback-outputs.test.ts`; integrar `e2e-feedback.ts`, `playwright.config.ts`, `execution-evidence.ts`, `ci-queue.json`, `.gitignore`.

**Interfaces:**

```ts
export type FeedbackOutputs = { ticketId: string; scratch: string; capture: string; diagnostic: string }
export function createFeedbackOutputs(cwd: string, ticketId: string): FeedbackOutputs
export function finalizeFeedbackOutputs(input: {
  outputs: FeedbackOutputs; outcome: 'passed'|'failed'|'interrupted';
  processesClosed: boolean;
}): Promise<{cleanup:'confirmed'|'uncertain'; diagnostic:'none'|'retained'|'partial'|'not-retained'}>
export function planFeedbackCleanup(cwd: string): Promise<{
  removable: Array<{path:string;bytes:number}>; held: Array<{path:string;reason:string}>;
}>
// feedback:clean é dry-run; --apply revalida imediatamente cada candidato.
// feedback:keep --ticket ID escreve somente o marcador da entrada diagnóstica própria.
```

- [ ] RED: criar sentinel em `docs/proofs`, `test-results` legado, logs da fila e outro ticket; finalizar feedback verde não pode apagá-los/copiar para capture. O scratch novo deve sair quando seus consumidores fecharam.
- [ ] OutputDir próprio por ticket; sobrescrever somente configuração de saída/reporters do modo feedback. Não alterar `testMatch`, `testIgnore`, projetos, retries, deps, workers ou timeout. Rodar teste de resolved config comparando todos esses campos entre modo normal e feedback.
- [ ] Manter log principal no ticket e resumo pequeno em `queue-current`. Conservar diagnostics/performance-measurements.jsonl pelo publisher existente. Trace/HTML de feedback não entram nessa cópia durável mínima.
- [ ] No verde, remover scratch após resumo e confirmação de saída. No vermelho, mover apenas o run atual para diagnostic com manifest terminal. Entrada interrupted/cleanup incerto não pode ser eliminada como sucesso.
- [ ] Implementar rotação de cinco falhas/1 GiB da SPEC, sem daemon. Ordem determinística por fim/ID; somente manifests próprios terminais; keep preserva e informa exceção. Run maior que o teto gera resumo claro de retenção parcial/ausente. Não alterar o resultado do teste para esconder falha de cópia.

```ts
expect((await planFeedbackCleanup(cwd)).held)
  .toEqual(expect.arrayContaining([expect.objectContaining({reason:'kept'})]))
// Sete falhas fechadas sem keep: somente as cinco recentes cabem na população retida.
// Symlink para docs/proofs e manifest ausente: held, nunca removível.
```

- [ ] Escrever teste com seis falhas pequenas, um keep, run oversized e erro de rename/copy. Ler os logs/receipts após cleanup e verificar hashes dos sentinels. Diretórios malformados/inativos sem prova continuam held.
- [ ] Aplicar override mínimo em `static`, `review`, `smoketest` e feedback para `queue-current`. Preservar a captura existente de receitas de proof/E2E final. Criar matriz pequena receita → output corrente → publisher/leitor → retenção, sem reclassificar todos os arquivos do Mac.
- [ ] Não varrer/deletar `.next`, browsers, node_modules, `/tmp` global ou Docker. `feedback:clean --apply` alcança apenas entradas próprias admitidas; cwd com sessão/tentativa inconclusiva impede operação.
- [ ] GREEN pela fila, depois teste real do snapshot de artifact no worker temporário e remoção da origem. A cópia do receipt precisa continuar legível do destino do ticket.

**Aceite:** dez tentativas não recapturam proofs antigos; logs e proofs sobrevivem; a política limita diagnósticos novos sem exigir ENOSPC reproduzido.

### Task 5: Entregar o pattern no produto e adotar no DietFlow

**Files:** CQ README/AGENTS/quickstart/CONTRACTS e novos `docs/TESTING-METHOD.md`, `templates/adoption/{AGENTS.fragment.md,ci.yaml,SKILL.md}`, `tests/release/adoption.test.mjs`; revisar `scripts/release.mjs`. DF `.claude/CLAUDE.md`, `.context/patterns/ci.yaml`, `.context/patterns/e2e.yaml`, `.agents/skills/dietflow-ci/SKILL.md`, `docs/ci/FEEDBACK-LOOP.md`, `e2e/README.md`, `docs/harness/HARNESS-WORKTREE-ENV-PROOF.md`, `scripts/harness/doctor-local.sh`.

**Interfaces:** documentos não viram novo runtime parser. Os nomes de receitas continuam no catálogo. A fragment e o YAML são templates de adoção, não configuração ativa fictícia.

- [ ] RED de distribuição: bundle temporário sem checkout fonte precisa conter o manual e os três templates. O teste lê/verifica manifest real, não somente existência na árvore de origem.
- [ ] Criar template concreto e seguro:

```yaml
schema: ci-method-v1
runtime_contract: ci-queue.json
method: docs/ci/TESTING-METHOD.md
feedback:
  available: false
  reason: Defina uma receita real do consumidor antes de ativar este perfil.
proof:
  authority: ship.acceptedPresets no catálogo
resume:
  inspect: [host, cwd, installed_revision, state_root, session, ticket]
```

O guia explica trocar `available:false` apenas depois de uma receita real e apontar `method` ao arquivo consumidor criado. Não colocar shell placeholder nem inferir framework do nome do repo.

- [ ] Publicar a fragment exata da SPEC e skill curta: ler mapa, escolher feedback/proof, conferir sessão/ticket, não reinventar lifecycle. README oferece o caminho em um bloco, quickstart inclui exemplo de adoção e aponta contratos detalhados.
- [ ] DF adapta o mapa existente com nomes reais `feedback:start/status/stop`, `ci:queue -- e2e-feedback`, perfil local e policy de artifacts; `.claude/CLAUDE.md` recebe somente o ponteiro/lei curta. Demais docs removem exemplos que ensinam bypass como caminho normal no host configurado queue.
- [ ] Preservar usos legítimos de leitura, --explain e perfis externos existentes. Não apagar história nem reescrever todas as specs antigas; marcar snapshots históricos como contexto quando necessário.
- [ ] Teste mínimo não DietFlow: projeto Node Git temporário com receita `review`, fila temporária e servidor fake; seguir somente o Quickstart/mapa e produzir um ticket, sem importar arquivos DF. Documentar claramente que o exemplo não é o E2E clínico.
- [ ] Exercício de descoberta do método com revisor sem transcript: fornecer README+AGENTS; pedir o comando para retestar sem build e a distinção de prova. Registrar se encontrou o caminho, sem nota subjetiva de “pareceu intuitivo”.
- [ ] GREEN: test:release/adoption e scripts consumidores de doctor/docs. Conferir links e exemplos no bundle, não atualizar install real.

**Aceite:** duas páginas e um ponteiro conduzem ao comando certo; nenhuma dependência em 53 arquivos de pesquisa para uso diário.

### Task 6: Fechar C03/C06/V01 e provar o ciclo completo

**Files:** CQ `tests/browser/progress-timing-integrated.spec.ts`, `tests/browser/c03.playwright.config.ts`, `tests/core/progress-pipeline.test.ts`, testes de tabela já existentes; DF testes de discovery/invocation/feedback e `jest-scope.ts` somente para gatilhos dos novos arquivos. Criar resultados em `evidence/feedback/` desta campanha e atualizar CLOSURE.

**Interfaces:** fixture real producer→ticket→worker→API→UI; mecanismos de captura/inspeção existentes. DO NOT inventar linhas TSV manualmente como substituto do reporter produtor real.

- [ ] Mapear cada item de `research/fase-4-pacote/04-PROVAS-E-ACEITE.md` C03/C06 ao teste atual. O que já está coberto é apenas rerodado quando pertinente; novas lacunas recebem RED antes de patch.
- [ ] Executar servidor fixture foreground uma vez e três tickets curtos: falha causal, alteração servida e sucesso, mudança somente no teste e sucesso. Capturar sessionId/identity, requests, tickets, logs e counts. Confirmar ausência de reset/seed/build entre tentativas.
- [ ] Na mesma infraestrutura temporária, conferir sete casos, repeatEach, retry, duas invocações, mismatch7→2, falha antes de start, cap1001 com retry omitido, e filtroB durante execuçãoA. Testes sintéticos de 1001 eventos não exigem 1001 browsers; separar custo de protocolo da prova de navegação real.
- [ ] Verificar pending/active/terminal, duração zero, variante e árvore no drawer e projeção bounded na faixa. Capturas precisam identificar build/SHA; HTTP mock é complementar, não a prova integrada.
- [ ] Confirmar worker CQ sozinho supervisiona os testes. O servidor da sessão não fica dentro do PGID do ticket. Cancelar um ticket da fixture preserva sessão; parar sessão ocupada recusa; PID reciclado não é sinalizado.
- [ ] Testar o guard pelo comando público com fake browser sentinel e contexto sem ticket. Não testar somente uma string em AGENTS.
- [ ] C06: ligar testes dos novos `.sh`/config/fixtures ao selector existente. Demonstrar diff somente do wrapper selecionando o teste que o invoca; não transformar todo `.sh` em Jest completo.
- [ ] V01: usar a tabela já mergeada, sem implementação concorrente. Conferir scroll início/meio/fim, nome+olho, teclado, flaky no indicador, erro de refresh com duas páginas. Capturar claro/escuro e larguras 640/820/1440/1600; zoom nativo 200% só pode ser chamado de tal quando observado no navegador, não DPR substituto.
- [ ] Reconciliar os 14 IDs do censo contra a candidata, mantendo 72 IDs únicos. Cada veredito aponta comportamento/teste/receipt ou ausência. Não transformar OUT/substituído em falha a implementar.
- [ ] C02 atualiza estado 121 apenas nos cortes comprovados; M03/ENOSPC históricos não fecham por essa suíte. Não apagar metas antigas; registrar disposições.

**Aceite:** A1–A9 cobertos com provenance, e o restante explicitamente `OPERADOR_PENDENTE` ou inconclusivo autorizado. Um receipt antigo não comprova instalação nova.

### Task 7: Medição finita P05/P06, sem nova campanha de tentativas

**Files:** DF `scripts/harness/__tests__/green-progress.test.ts`, `scripts/harness/green-progress.ts` somente se um defeito causal for demonstrado; ferramentas/relatórios sob `docs/ci` e `evidence/performance/` desta campanha. Reutilizar `scripts/ci/performance-measurement.ts`; sem novo formato de spans.

**Interfaces:** tabela de observações comparáveis: H/tree, host/runtime, receita/argv/seleção, cache, workers, resultado, setup/teste/publicação, recursos conhecidos e limitações.

- [ ] Preservar a amostra histórica 143,08/150,95 s como pista. Ler o teste atual e enumerar seus subprocessos Git, setup, chamadas executeGreenProgress e cleanup. Não substituir Git real por mocks para reduzir o custo.
- [ ] Enfileirar um perfil focal da suíte inteira, com mesmas flags/runtime e fixtures próprias. Usar medição por caso/setup/subprocesso de teste, sem expor dados reais. No máximo três observações baseline; falha de ambiente não vira amostra verde. Não alterar workers e Node ao mesmo tempo.
- [ ] Se um custo redundante equivalente for demonstrado, escolher **um** tratamento mínimo no owner e escrever RED comportamental: por exemplo, operação Git repetida com inputs idênticos dentro de uma leitura deve produzir o mesmo veredito e preservar falhas. Não implementar cache se depender de repo mutável sem invalidação provada.
- [ ] Se a evidência não discriminar causa ou mostrar custo necessário, registrar `INCONCLUSIVO_NÃO_BLOQUEANTE` ou `CUSTO_NECESSÁRIO`. Não pedir outra SPEC, migrar framework ou seguir tentando combinações de heap/flags.
- [ ] Reusar as tentativas de T6 para medir envelope de fila sem disputa, validação da sessão, tempo de runner, publicação e bytes. Se houver fila ocupada, separar espera; não reduzir frequência/coverage para cumprir um número.
- [ ] P06 compara três retestes quentes com seu primeiro preparo e descreve quais operações foram evitadas. Não apresentar next-dev como prova equivalente ao Full next-start. Aproveitar uma prova canônica necessária do módulo/RC para medir preparação, sem ordenar prova extra só para o gráfico.
- [ ] Conferir P03/P04 com contadores de invocações e, havendo amostras compatíveis, tempo. Sem par comparável, fechar alteração funcional sem atribuir minutos fictícios.
- [ ] Publicar tabela antes/depois, n/amplitude, efeitos de disco dos novos outputs e trade-offs. Não somar spans pai+filho. Nenhum item espera o arquivo perdido de 50 GB.

**Aceite:** método mais barato demonstrado no ciclo de uso e diagnóstico causal honesto. A ausência de cura de SIGSEGV não reabre lifecycle nem impede a entrega pronta.

### Task 8: Revisão final, integração e janela operacional

**Files:** `CLOSURE.md`, índice de evidências, README desta campanha; docs de consumidor/runtime tocados. Nenhum novo subsistema.

**Interfaces:** recibo final separa código, suíte, release, instalação, boot e decisão humana. Subagentes entregam patches/evidências; consolidador conduz Git.

- [ ] Revisor fresco lê SPEC/PLAN e o diff completo dos dois repos. Testar regressões por fronteira, não por número de testes. Corrigir somente achados do escopo; não introduzir prioridades, novo monitor ou ExecutionPacks.
- [ ] Executar o comando de projeto do CQ **pela fila oficial**, `ci-queue enqueue check --wait`, no HEAD final limpo. A suíte contém fixtures isoladas. Falhas/skips são listados, não omitidos.
- [ ] DF: executar as suítes proprietárias e Jest de projeto pelo harness admitido uma vez na candidata consolidada quando exigido pela validação vigente; mais smoke exact-HEAD/base para integração. Não repetir Jest global em cada RED. `Full`/E2E clínico amplo pertence exclusivamente ao owner RC115 e não é imposto por uma frase genérica do skill.
- [ ] Se a janela de validação global não estiver disponível, registrar `VALIDAÇÃO_FINAL_PENDENTE` e parar antes de ready/merge. Não declarar a suíte completa com base em focais. Isso não impede preparar docs, patches e evidências independentes.
- [ ] Publicar PRs de código draft, CQ antes do consumidor que exige capability. Manter PR25 como artefato de planejamento; não marcar ready/merge por consequência desta autoria. Na execução, integração em dev segue revisão e autorização vigentes, nunca stage/main/PROD.
- [ ] Construir/verificar bundle candidato pelos scripts existentes e testar em prefixo/state/HOME temporários. O teste instalado não reutiliza o checkout como distribuição. Nenhum Vite permanente nem segundo worker oficial.
- [ ] Na janela explicitamente autorizada, operador/execução local usa `docs/INSTALL.md`: bundle **diretório** real, prefix/state/config atuais, node/python/launcher absolutos e `--activate`. Não usar glob `.tar.gz`, default que cria outra fila ou versão sem manifest. Preservar receipt anterior e rollback documentado.
- [ ] Após cutover, conferir versão/capabilities, CLI/worker/API/build correspondentes e um único listener. Login real fica registrado por quem o observou; abrir browser ou bootstrap manual não equivale a boot. Sem janela, `OPERADOR_PENDENTE` é resultado válido e não exige nova implementação.
- [ ] Registrar aceitação do método e visual pelo Marco, não pelo modelo. Sessão de feedback de prova deve ser encerrada, arquivos temporários próprios reconciliados e logs/proofs preservados.
- [ ] Fechar CLOSURE com A1–A10 e todos os C/P: feito, hipótese recusada, disposição inconclusiva autorizada, operador pendente ou bloqueador real. P07 apenas referencia o futuro receipt do RC115 quando existir; a campanha de lifecycle não fabrica esse selo.

**Condição de término:** método publicado/adotado, caminho enfileirado demonstrado, retenção limitada testada, regressões da candidata verdes no alcance exigido e pendências externas separadas. Nenhuma tarefa termina com “agora criar outra SPEC para o fluxo funcionar”.

## Matriz de rastreabilidade

| SPEC | Tasks |
|---|---|
| Método e guard A1/A2 | T3, T5, T6 |
| Sessão/identidade/stop A3–A5 | T2, T3, T6 |
| Captura/retention A6/A7 | T1, T4, T6 |
| Progresso e compatibilidade A8/A9 | T1, T3, T6 |
| C03/C06/V01/72 IDs | T0, T6, T8 |
| P05/P06 e comparação A10 | T7 |
| P03/P04 e P02 recusada preservados | T0, T7 |
| Instalação/boot e P07 externo | T8 |
| Método genérico sem internals DF | T1, T5, T8 |

## Handoff ao executor

Comece pela T0 e pela primeira tarefa de comportamento ainda não implementada. Use subagentes frescos por owner com review independente, mas serialização de testes/stack e Git pelo consolidador. Heartbeat, watchers e rondas automáticas não fazem parte da entrega.

Retorno mínimo por tarefa: SHA/cwd, teste RED e razão, GREEN e suíte proprietária, arquivos alterados, ticket(s), limites e próxima dependência. Retorno final: links dos PRs, CLOSURE e evidências. Sem elogio de completude no lugar de prova e sem exigir que Marco reorganize uma coleção de relatos contraditórios.
