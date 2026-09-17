# Runtime por job: diagnóstico, implementação e limite de aceite

Estado: **DRAFT — hardening implementado; isolamento absoluto ainda NÃO aprovado**.
Base investigada: `18f3195e6a44ba98047b7bdb6ab79b96600fa609` de `dev`.
Escopo: somente CI Queue. Nenhuma mudança no DietFlow, no LaunchAgent instalado ou na política de workers do Jest.

## 1. Causa raiz

No código-base, `scripts/install.mjs` constrói `servicePath(nodePath)` e inicia o worker com `ProgramArguments: [nodePath, ..., "worker", ...]`. Esse caminho absoluto fixa o interpretador do **worker**, não o dos descendentes.

A fronteira vulnerável está em `src/core/runner.ts:424–451`: `buildJobEnv()` copia `...process.env`. Em `src/core/runner.ts:475–479`, o executor faz `spawn(parsed.argv[0], parsed.argv.slice(1), {env: buildJobEnv(...)})`, sem selecionar um runtime por projeto. `src/core/worker.ts` chama esse runner após claim/parse; não resolve requisitos Node. `src/core/enqueue.ts` congela argv, flags e identidade, mas não um requisito de runtime.

```text
launchd
  └─ /runtime-A/bin/node ci-queue.mjs worker    ← Node do worker fixo
       └─ spawn(argv[0], argv.slice(1), env)   ← lookup independente
            ├─ node/npm                       ← PATH recebido
            └─ bash -lc / zsh -l / sh -l
                 └─ startup files alteram PATH
                      └─ npm / npx / .bin/jest
                           └─ #!/usr/bin/env node
                                └─ Node encontrado no PATH daquele processo
```

`bash -c` não é isolamento por si só: Bash não interativo ainda pode ler `BASH_ENV`. `zsh -f` ignora arquivos opcionais, mas não elimina a inicialização global de `/etc/zshenv`. npm adiciona `node_modules/.bin` ao PATH de scripts; um `node` local pode sombrear o runtime. `npm exec`/`npx` também executam ferramentas que voltam a resolver interpretadores. `NODE`, `npm_node_execpath` e `npm_execpath` são convenções/metadados, não uma trava do sistema operacional. Um intermediário pode fornecer um novo ambiente ou um executável absoluto.

O relato do consumidor distingue corretamente o Full em Node 24.20.0 do diagnóstico que escapou para 25.6.1. Esta investigação não reexecutou aqueles tickets nem verificou localmente seus crash reports; esses fatos vieram do relato fornecido. Não se conclui nada aqui sobre a causa do SIGSEGV do Jest.

## 2. Modelo implementado

Combinação escolhida: **binding explícito por projeto + preflight + ambiente reconstruído + shims absolutos + guard antes do JavaScript + evidência persistida**.

| Medida | Papel | Limite isoladamente |
| --- | --- | --- |
| Node absoluto no LaunchAgent | Fixa o worker | Não fixa filhos |
| Rejeitar login/interativo | Bloqueia o caso observado antes do spawn | Não interpreta programas de shell arbitrários |
| Reconstruir ambiente | Remove PATH global e controles de startup herdados | Um descendente pode modificá-lo |
| Node absoluto por job | Prova caminho canônico e versão exata | Só fixa a invocação que o utiliza |
| Shims `node/npm/npx/bash/sh/zsh` | Reutilizam seleção sem hooks no consumidor | Caminhos absolutos podem evitar os shims |
| Preload CommonJS | Recusa divergência antes do corpo JS | Pode ser removido por um ambiente novo |
| Receipt e JSONL | Evidência por processo observado; recusa não vira verde com `|| true` | Auditoria não é mediação de exec |
| Mediação de exec pelo SO / ambiente isolado | Caminho para o requisito absoluto | Não foi implementada nesta PR |

Arquivos:

- `src/core/runtime.ts`: contrato local, requisitos do checkout, probe absoluto, reconstrução de ambiente, shims, finalização de evidência.
- `src/core/runtime-guard.ts`: preload autocontido e parser de opções de shell compartilhado com os shims.
- `src/contracts/runtime.ts`: receipt versionado; `schema.ts` o inclui opcionalmente nos tickets existentes.
- `src/core/runner.ts`: chama o preparo antes do preflight Git e usa argv/env preparados; incorpora a evidência e invalida terminal verde quando houve recusa.
- `tests/runtime/isolation.test.mjs`: execução real do runner compilado, sem mocks de `spawn`.

Não foram alterados locks, claim, cancelamento, recovery, process-group identity ou o uso de `detached: true`. Um teste cobre deadline passando pelo novo launcher. Isso não substitui a suíte integral de lifecycle.

## 3. Configuração implementada

O arquivo é **`<state-root>/runtimes.json`**, pertencente ao CI Queue, não um campo novo de `ci-queue.json`. A chave em `projects` deve coincidir exatamente com o `projectId` do ticket. O exemplo completo está em `examples/runtime/runtimes.json`.

```json
{
  "schemaVersion": 1,
  "projects": {
    "project-node24": {
      "node": {
        "executable": "/Users/ci/.local/share/runtimes/node/v24.20.0-darwin-arm64/bin/node",
        "version": "24.20.0"
      },
      "npmCli": "/Users/ci/.local/share/runtimes/node/v24.20.0-darwin-arm64/lib/node_modules/npm/bin/npm-cli.js",
      "npxCli": "/Users/ci/.local/share/runtimes/node/v24.20.0-darwin-arm64/lib/node_modules/npm/bin/npx-cli.js",
      "toolPaths": []
    }
  }
}
```

Os caminhos são ilustrativos, não uma afirmação de que essas distribuições estejam instaladas. O segundo binding do exemplo usa Node 22.16.0. O operador instala/verifica runtimes e registra caminhos absolutos; a fila não instala versões nem consulta nvm, Homebrew ou dotfiles. `npmCli`/`npxCli` devem apontar para JavaScript confiável da distribuição registrada; o probe usa o `semver` dessa instalação npm, não dependências do projeto. A versão deve ser exata `x.y.z`. Campos desconhecidos são rejeitados, inclusive uma opção fictícia `isolation: "strict"`.

O consumidor mantém suas receitas e declara requisitos em `.nvmrc`, `.node-version` e/ou `package.json.engines.node`. As restrições encontradas no caminho até a raiz `.git` são intersectadas. Sem `.git`, a busca ascende até a raiz do filesystem. Aliases interativos como `lts/*` não são resolvidos; exigem declaração verificável. Subdiretórios de monorepo têm seus requisitos considerados junto com os ancestrais.

O binding e os requisitos são resolvidos **no claim/preparo**, não no enqueue, e seus hashes são registrados. A receita não é reconsultada. Os controles Git já existentes continuam responsáveis por mudanças de checkout durante o job. A versão do worker pode ser diferente da versão do projeto.

O PATH herdado é descartado, e não tratado como preferência: shims privados → diretório do Node selecionado → diretórios de sistema → `toolPaths` explícitos. Assim, um worker em Node 24 pode executar um projeto em Node 22. PATH efetivo divergente em um processo guardado causa recusa. `environmentPolicy: "reconstructed"` torna essa escolha visível.

São removidos controles herdados como `NODE_OPTIONS`, `NODE_PATH`, `NODE`, variáveis npm de runtime/script-shell, `BASH_ENV`, `ENV`, `ZDOTDIR`, funções exportadas e injeção de loader. Outros valores necessários ao projeto, incluindo credenciais, permanecem herdados; isto **não é um ambiente hermético completo**. npm recebe arquivos pessoais/globais vazios e shell controlado. `.npmrc` do projeto continua sujeito às regras de precedência do npm. Autenticação e ajustes antes dependentes de arquivos pessoais precisam ser revisados na migração.

## 4. Comportamentos de falha

| Situação | Resultado antes do corpo do trabalho afetado |
| --- | --- |
| Projeto declara Node, mas não tem binding | `RUNTIME_NOT_CONFIGURED`; sem fallback |
| Executável/CLI ausente | `RUNTIME_NOT_INSTALLED` |
| Probe impossível | `RUNTIME_PROBE_FAILED` |
| Versão exata diferente | `RUNTIME_VERSION_MISMATCH` |
| Major/range do checkout incompatível | `RUNTIME_REQUIREMENT_MISMATCH` |
| Requisito/registro inválido | `RUNTIME_REQUIREMENT_INVALID` / `RUNTIME_CONFIG_INVALID` |
| Login shell explícito, variantes de flags ou shebang direto | `RUNTIME_LOGIN_SHELL` ou erro de startup; sem spawn do trabalho |
| Login shell aninhado por nome | Shim recusa; evidência persiste mesmo com `|| true` |
| Node diferente com preload herdado | `RUNTIME_PROCESS_MISMATCH`; sai antes do JavaScript do projeto |
| Node correto, PATH efetivo escolheria outro Node | `RUNTIME_PATH_MISMATCH` |
| Metadados Node/npm divergentes | `RUNTIME_ENV_MISMATCH` / `RUNTIME_NPM_MISMATCH` |
| Evidência inválida ou binário alterado ao finalizar | Ticket não termina verde |

Preflight falho termina o ticket sem iniciar a receita. O guard usa exit 78 no processo recusado. Uma recusa registrada é persistente para o veredito: `|| true` não a apaga. A finalização não é transacional: etapas já executadas não são desfeitas; o runner lê recusas ao término do processo raiz, não por um monitor de exec síncrono.

Compatibilidade: jobs sem requisito Node que já escolhem um **Node absoluto** continuam utilizáveis, com `bindingSource: "explicit-node-command"`; não se busca outro Node no PATH. Essa compatibilidade pressupõe a distribuição Node/npm completa. Jobs nativos legados sem binding/requisito permanecem `unconfigured`, explicitamente sem garantia Node. Projetos com requisito declarado não usam essa exceção. Não considerar histórico antigo ou jobs `unconfigured` certificados por esta mudança.

## 5. Evidência e Dashboard

No log do ticket, a linha `[runtime]` mostra seleção e escopo de cobertura. O objeto `runtime` em `history/<ticket>.json` contém:

```text
capability: node-runtime-guard-v1
coverage: guarded-node-processes        # NÃO é complete-descendant-coverage
state: prepared | verified | rejected | preflight-only | unconfigured
bindingSource: project-registry | explicit-node-command
node: executable canônico + versão exata + SHA-256
requirements: fontes + ranges + hashes
registrySha256
evidencePath: sidecar JSONL privado
observations: PID, PPID, instante, execPath, versão, entry, status, motivo
```

`preflight-only` significa que nenhum Node com guard foi observado; não inventa uma etapa de aplicação. `verified` significa que as observações recebidas concordaram, **não** que todo descendente foi observado. Eventos não guardam argumentos, ambiente ou credenciais. O hash do binário é calculado no preparo e ao finalizar, não em cada processo.

```bash
ci-queue history --project PROJECT_ID --json
ci-queue logs TICKET_ID
```

Ou leia diretamente `history/TICKET_ID.json` e seu campo `runtime`. No Dashboard atual, use o log do ticket para ver a seleção. **Esta PR não adiciona card/campo visual dedicado nem validou a projeção JSON do backend**. O JSON autoritativo é o receipt no disco/CLI; não inferir cobertura por um badge verde do Dashboard. Os sidecars ficam sob `<state-root>/runtime/` e são retidos para investigação; retenção/limpeza automática ainda não foi implementada.

## 6. Testes executados e pendências

O ambiente desta investigação foi Linux com Node **22.16.0**, não o Mac do operador. Foi materializado o núcleo necessário do runner a partir de blobs GitHub conferidos contra os hashes de `dev`. Não foi um checkout integral. A compilação usou o tsconfig original sobre esse subconjunto, com TypeScript global e `@types/node` 25.1.0 disponíveis no ambiente.

Primeiro, três testes falharam contra o runner original: login shell executava, versão incompatível passava e não havia receipt de runtime. A implementação passou esses testes; outros ciclos vermelho/verde cobriram shebang de login, flags zsh, ausência honesta de observações, compatibilidade de Node absoluto e campos desconhecidos.

Resultado final local: **41 testes; 40 passaram; 1 foi pulado**. Um dos testes que passa é um **contraexemplo documentado**, não uma prova de isolamento. Testes reais cobrem npm test, npm exec/npx offline, shebang, intermediário Node, PATH concorrente, Node local em `.bin`, erro engolido pelo shell, versões/requisitos incompatíveis, receipts, dois bindings com executáveis distintos e deadline/grupo de processos. O segundo executável real da matriz local é uma cópia do mesmo Node 22; não é uma simulação enganosa de Node 24/25.

O teste de duas majors reais só executa com `CI_QUEUE_TEST_SECOND_NODE` apontando para outra distribuição Node/npm instalada. Ele exige majors distintas e valida ambos os bindings na mesma fila. Para repetir em checkout completo:

```bash
npm run test:runtime
CI_QUEUE_TEST_SECOND_NODE=/absolute/second-node/bin/node node --test tests/runtime/*.test.mjs
```

Pendentes: suíte original completa (`npm run check`), matriz real 24.20.0/25.6.1 ou outra dupla de majors no macOS, zsh real, ativação/background/recuperação do LaunchAgent, empacotamento e revisão independente. Nenhum check de CI remoto foi marcado como verde por esta investigação.

## 7. Limite real e próximo gate de aceite

Este teste reproduziu uma execução fora da proteção:

```bash
bash -c '/usr/bin/env -i /absolute/other-node -e "/* trabalho */"'
```

O shell inicial é admitido, mas o descendente remove o preload e ignora os shims usando caminho absoluto. O código do outro Node executa e não aparece como recusa. O teste `documented boundary: env -i plus an absolute executable bypasses a user-space preload` fixa esse fato. Portanto **a frase “jamais trocar silenciosamente de runtime” não está satisfeita por esta PR**.

Outras fronteiras: intérpretes nativos que criam ambientes novos; remoção/substituição de `NODE_OPTIONS`; preload introduzido por um descendente antes do guard; chamada absoluta de shell aninhado; arquivos globais obrigatórios do zsh; binários trocados durante o job; descendentes que escapam do grupo; falsificação/remoção de sidecar por processo com o mesmo UID. O hash pós-job detecta algumas alterações, mas não previne seus efeitos anteriores. O estado é gravável pelo mesmo usuário e não é uma fronteira adversarial.

Para o requisito absoluto, é preciso um executor com **mediação de exec antes da execução**, política de executáveis autorizados herdada por toda a árvore e estado protegido dos jobs, ou um ambiente isolado com política equivalente. Apenas colocar numa VM não basta se o job ainda puder instalar/executar qualquer runtime. No macOS, Endpoint Security oferece evento de autorização de exec, mas envolve entitlement, autorização/instalação e desenho de política; não é uma troca de PATH nem uma dependência trivial do worker. Essa arquitetura não foi implementada nem provada aqui. Recusar classes não suportadas antes do trabalho é preferível a certificar cobertura inexistente.

## 8. Migração proposta — não executar esta DRAFT em produção

1. Resolver o gate acima ou aprovar explicitamente um escopo de hardening não absoluto. Manter a PR draft até essa decisão e provas de plataforma.
2. Inventariar projetos por ID e requisitos; registrar binários/CLIs absolutos com versões exatas, antes de habilitar o novo worker. Não copiar o Node do LaunchAgent como default de todos.
3. Preparar uma release verificada, drenar a fila e desativar o LaunchAgent antigo antes do cutover. Não editar um serviço em execução nem permitir workers de versões distintas no mesmo state root.
4. Instalar o registro atomicamente com permissões restritas, preservar state root/histórico e subir apenas o worker da release nova. A versão do Node do worker continua uma escolha separada.
5. Executar probes canários por projeto e exigir receipt com `node-runtime-guard-v1`, caminho, versão e observações esperadas. Testar também a rejeição de login e runtime incompatível. Um `passed` antigo, sem esse campo, não é prova.
6. Revisar autenticação, ferramentas auxiliares em `toolPaths`, scripts antes dependentes de dotfiles e retenção de sidecars. Não adicionar hacks de PATH nos scripts consumidores.
7. Só então executar o Full canônico e os testes de lifecycle no Mac. Rollback exige nova janela drenada: o worker antigo **ignora runtimes.json**, portanto não pode consumir tickets presumidos protegidos. Esta PR não adiciona negociação de capacidade no enqueue nem bump do schema; esse é outro gate de rollout.

## Fontes primárias

- [Node: lookup de child_process e ambiente de spawn](https://nodejs.org/api/child_process.html).
- [Bash: startup files e BASH_ENV](https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html).
- [zsh: arquivos de inicialização e /etc/zshenv](https://zsh.sourceforge.io/Doc/Release/Files.html).
- [npm: ambiente dos scripts e node_modules/.bin](https://docs.npmjs.com/cli/v10/commands/npm-run-script/).
- [Node: NODE_OPTIONS e ordem de --require](https://nodejs.org/api/cli.html).
- [Apple: ES_EVENT_TYPE_AUTH_EXEC](https://developer.apple.com/documentation/endpointsecurity/es_event_type_auth_exec).
- [Apple: entitlement Endpoint Security](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.endpoint-security.client).
