# SPEC — Feedback pela fila e fechamento operacional das Fases 4/5

Data: 22/09/2026. Estado: **DESIGN_DOCUMENTADO / IMPLEMENTAÇÃO NÃO INICIADA**.

Marco autorizou a produção conjunta desta SPEC e do PLAN após discutir o desenho. Isso não é aprovação de código ainda inexistente, merge, instalação ou do encerramento da Spec 121. Execução prevista: Superpowers, TDD e subagentes por owner. [Plano executável](PLAN.md).

## 1. Resultado e limite do corte

O usuário deve conseguir preparar uma sessão uma vez, editar e retestar um caso **pela fila real**, acompanhar ticket/log/progresso e encerrar a sessão sem repetir reset/seed/build em cada tentativa. A prova final continua sendo outra receita. Um agente novo deve descobrir esse método pelo README → AGENTS → `.context`, sem depender de mensagens antigas.

Este é o corte final planejado de lifecycle da campanha. Não cria outra campanha de infraestrutura, um supervisor universal de processos ou um novo executor. Bugs comprovados neste escopo serão corrigidos no mesmo plano; sugestões não necessárias ao aceite vão para uma lista curta de trade-offs, não para dependências infinitas.

Não prometemos inexistência de bugs futuros nem cura de SIGSEGV/ENOSPC histórico. O desaparecimento dos antigos 50 GB **não bloqueia** implementação ou aceite. Seu diagnóstico fica inconclusivo quando o artefato causal não existe; mede-se o comportamento novo prospectivamente.

### 1.1 Fontes e fotografia

- CI Queue runtime: [`ef057973bd1f006f493487f6cc9b96b2b7e741f8`](https://github.com/nmarcofernandess/ci-queue/tree/ef057973bd1f006f493487f6cc9b96b2b7e741f8).
- Lane documental: `codex/fase4-5-handoff`, originalmente `2f422d2084af92e2d82ccfacd12528c7e02e959e`, PR #25 draft.
- DietFlow consultado: [`dcd7ac2c8410a05d0c9f4fccee303c3d9a8c7ed0`](https://github.com/dietflowoficial/Dietflow-app/tree/dcd7ac2c8410a05d0c9f4fccee303c3d9a8c7ed0).
- O DietFlow avançou 73 commits desde `5e2b239f`; o compare inclui o módulo Antropometria, catálogo e reconhecimento da receita no queue-client. Não retomar aquela lane clínica nem supor que seu estado continua WIP.
- [HANDOFF original](HANDOFF.md), [proveniência importada](research/PROVENIENCIA.tsv), [aceite F4](research/fase-4-pacote/04-PROVAS-E-ACEITE.md), [censo nominal](research/fase-4-pacote/02-CENSO-72.tsv), [diagnóstico P05/P06](research/fase-5-pacote/DIAGNOSTICO-RETOMADA-P05-P06-20260922.md). Preservar esses arquivos como fotografias; não reescrever pesquisas antigas para parecerem concluídas.
- Instalação `3f2fb248` é informação do handoff, não observação desta revisão. Nenhum processo, state, teste ou serviço do Mac foi operado nesta autoria documental.

Autoridade: decisão posterior explícita de Marco → código/testes vivos e contrato vigente → esta SPEC para o delta futuro → fotografias históricas. Divergência entre contrato e código deve ser registrada, não resolvida por silêncio.

### 1.2 O que a investigação confirmou

| Fato atual | Fonte primária | Consequência |
|---|---|---|
| Enqueue explícito já persiste argv/cwd/projeto/flags e produz ticket | CQ `src/cli.ts`, `src/core/enqueue.ts` | Não criar outro motor para focal quente. |
| O produtor DF resolve receitas e usa esse enqueue | DF `scripts/ci/run.ts`, `queue-client.ts` | A entrada amigável pertence ao consumidor. |
| `e2e-run.sh --target local-stack` verifica perfil e chama o runner sem reset/build | DF `scripts/e2e-run.sh`, `e2e-target-profile.ts` | Reutilizar, não copiar `e2e-local-stack.sh`. |
| `dev:local-stack` segura o lock durante o servidor | DF `scripts/dev-local-stack.sh`, `local-stack-state.ts` | Preservar exclusão de reset; posse de sessão não equivale a executar todos os testes serialmente. |
| O caminho público quente não chama o guard da fila | DF `scripts/e2e-run.sh`, `execution-entry-guard.sh` | Fechar a entrada suportada; não interceptar todo shell. |
| O env do terminal que enfileira não é um contrato de transporte até o worker | CQ `src/core/enqueue.ts`; DF `queue-client.ts` | Sessão/porta precisam estar na requisição persistida ou ser resolvidas por ID, não depender de `PORT=...` no cliente. |
| As cópias globais são estáticas; não há override por receita no parser CQ | CQ `src/contracts/config.ts`, `src/core/enqueue.ts`; DF `ci-queue.json` | Permitir seleção explícita por receita sem recopiá-las todas em feedback. |
| `queue-current` já preserva receipt/medições do run, substituído no próximo início serial | DF `scripts/ci/execution-evidence.ts` | Reutilizar o publisher existente e esperar sua cópia pela fila antes de remover a origem. |

## 2. Restrições globais

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

## 3. Método público: três operações diferentes

```text
SESSÃO (consumer-owned, longa)
  Supabase já preparado + Next dev do checkout dono
                         │
                         ├── tentativa RED: ticket curto
                         ├── edição, sem ocupar executor
                         └── tentativa GREEN: outro ticket curto
                                      │
                    encerrar sessão / consolidar autoria
                                      │
PROVA CANÔNICA (receita existente, HEAD/base e lifecycle exigidos)
```

Escolha recomendada: sessão externa ao grupo de processos do ticket, com launcher consumidor em foreground e encerramento explícito. Alternativas rejeitadas: CI Queue passar a administrar Supabase/Next; Playwright direto entre chats; manter o servidor como filho órfão de um job curto.

### 3.1 Comandos DietFlow depois da implementação

```bash
# Observar não executa testes nem para recursos.
npm run feedback:status

# Preparação única existente, somente se a stack ainda não está pronta.
# Usar o procedimento de local-stack admitido no host; não resetar automaticamente.
npm run local-stack:inspect -- --port 3020

# Foreground, no checkout dono; informa sessionId e mantém a posse.
npm run feedback:start -- --port 3020

# Outro terminal/chat no MESMO checkout. Submissão continua pelo adapter existente.
npm run ci:queue -- e2e-feedback -- --session SESSION_ID \
  e2e/local/flows/miniapp/antropometria.uso.segment.spec.ts --grep 'T05'

# Encerramento explícito: recusa enquanto uma tentativa conhecida usa a sessão.
npm run feedback:stop -- --session SESSION_ID
```

`SESSION_ID` é o valor devolvido pelo start/status, não literal a copiar. O comando de teste não depende de exportar PORT no shell do enqueue. A porta/origin é resolvida pelo worker a partir da sessão nomeada.

`test:db:up` continua sendo a preparação existente e separada. Esta SPEC não lhe concede concorrência com outra sessão nem muda sua política de admissão. `feedback:start` não chama reset, seed ou build silenciosamente: se faltar stack, informa o comando proprietário e encerra. Depois de preparada, repetir start usa a mesma sessão compatível ou informa seu dono; não inicia outro Next.

A receita versionada `e2e-feedback` chama `npm run test:e2e:feedback`. O argv final contém `--session` e seletores. Flags canônicas de limpeza/fetch/pin/estabilidade não são habilitadas para esse diagnóstico; `progress:true`. A receita **não** entra em `ship.acceptedPresets`.

### 3.2 Reuso e invalidação

- Só teste mudou: executar Playwright novamente. Não reiniciar aplicação.
- Código da aplicação mudou: Next dev recompila; não editar durante a tentativa. Registrar que o resultado é WIP observado, não snapshot hermético.
- Dependências, configuração Next, ambiente relevante ou schema/migrations/seed mudaram: sessão incompatível; explicar qual classe requer restart/repreparação. Não fazer isso automaticamente em um reteste.
- Uma investigação exclusiva de produção continua usando o runtime exigido pela hipótese. Feedback não substitui essa necessidade.
- `next start` já existente pode ser útil quando somente testes mudaram, mas a entrada nova deste corte suporta **Next dev local-stack**. Não criar uma matriz de quatro runtimes de feedback.

### 3.3 Admissão da tentativa

O wrapper exige guard real antes de browser/discovery mutável. Não forjar variáveis de job; não usar `observe` para fingir submissão. O caller público local-stack também recebe essa barreira, respeitando os contextos já permitidos pelo contrato vigente, inclusive GitHub Actions legítimo.

Cloud não vira exceção porque uma conversa diz que era Cloud. O agente confere o host/catálogo/capabilities reais. Host sem caminho admitido não ganha bypass automático: usar executor disponível para a prova necessária e continuar o trabalho documental independente.

## 4. Sessão simples e posse verificável

### 4.1 Estado e ownership

Usar o mutex existente de `local-stack-state.ts`; não criar outro registry de projetos. Publicar um pequeno `feedback-session.json` no diretório do lock, escrito pelo launcher, contendo versão, sessionId, projectId, cwd real, origin loopback, PID/PGID/início do processo próprio, estado e fingerprint de inputs frios. O token do mutex é privado e não vai para ticket/API/log.

Estados observáveis: `starting`, `ready`, `stopping`, `stopped`, `unavailable`. Não afirmar “morto” por falha de inspeção. Uma sessão compatível só é reutilizada quando posse, processo e listener continuam verificáveis. Reusar por `200 OK` ou por nome da branch é proibido.

A checagem combina: lease/generation do mutex, cwd real, PID com início, listener pertencente ao processo/grupo dono e `/api/deploy-info` com Supabase+Postgres locais. Não adicionar campos públicos de filesystem à aplicação. Utilizar `validateServerTarget` e leitura de processos local; os PIDs internos que Next recria podem mudar, desde que permaneçam sob a posse verificada do launcher.

O registro não é uma autorização para matar qualquer PID com o mesmo número. Em posse incerta, recusar reuso e stop destrutivo, imprimindo o diagnóstico e o procedimento existente de inspeção.

### 4.2 Fingerprint e alterações durante tentativa

Fingerprint inclui Node executável/versão, package-lock, next.config, tsconfig, schema Prisma, migrations, configuração Supabase e inputs de env carregados pelo wrapper. Hashes de segredos permanecem somente no registro local protegido; recibos públicos levam classes alteradas, não valores ou hashes correlacionáveis de segredos. Rotas React, tests e conteúdo quente não entram no hash de restart.

Não varrer o repositório inteiro em cada tick. Calcular em start e antes/depois de cada tentativa; usar a lista explícita de inputs existente no perfil consumidor. Arquivo esperado ilegível é estado desconhecido, não igualdade.

A tentativa registra identidade no começo/fim. Queda/substituição do servidor ou mudança de input frio impede declarar o diagnóstico íntegro, mesmo que um caso retornasse exit0. Isso não adiciona um novo significado de verde canônico.

Alteração quente durante uma tentativa não tem watcher próprio. O método pede editar **entre** tentativas. Aceitamos essa confiança operacional em vez de monitorar todos os saves do editor.

### 4.3 Encerramento e abandono

O launcher foreground trata EXIT/INT/TERM/HUP, encerra somente seu grupo Next, confirma saída e libera apenas sua posse. `feedback:stop` usa a mesma operação e recusa empréstimo ativo; não possui `--force` para matar trabalho alheio. `lane:cleanup` recusa retirar o cwd de uma sessão ativa ou inconclusiva.

Um marcador pequeno de uso, sob o mesmo lock, evita a corrida stop versus início de tentativa. Sua aquisição é atômica; contém ticketId e identidade do consumidor. Não é fila: conflito dá diagnóstico imediato. Um marcador de tentativa interrompida só pode ser recuperado depois de confirmar terminal e ausência do processo dono; se não for possível, permanecer inconclusivo.

**Trade-off aceito:** não criar expiração automática, heartbeat por chat ou supervisor que reaparece no login. SIGKILL/queda do host podem deixar resíduo. `feedback:status` e `feedback:stop` tornam a recuperação explícita; não prometemos que uma worktree apagada mata serviços. O reaper existente continua dono do Colima depois que não há uso/lock; não mudar seu comportamento para matar Next ou ignorar terceiros.

Um único local-stack compartilhado significa uma sessão dona por vez. Outras worktrees recebem `SESSION_BUSY/MISMATCH`. Não levantar cópia de banco por lane neste corte.

### 4.4 Visualização

Tickets de feedback aparecem normalmente em fila, execução, histórico e drawer, com recipe, cwd, sessionId no resumo diagnóstico e progresso existente. `feedback:status --json` informa owner, porta, processo, estado, última tentativa e motivo de incompatibilidade.

**Não criar sidebar Processos, scanner global ou API de serviços neste corte.** A inspeção de servidores fica no comando consumidor já roteado pelo pattern. É um trade-off de UI deliberado para não alargar o produto. Não alegar inventário completo de todos os Nodes do Mac.

## 5. Execução, dados e progresso

Cada tentativa usa novo processo Playwright e os fixtures/contextos de autenticação existentes. Servidor quente não significa reaproveitar indiscriminadamente cookies/usuários. A limpeza de dados do teste continua na fixture proprietária. Receitas que resetam/migram/semeiam ou dependem de estado global não são chamadas pela entrada feedback.

A entrada exige seletor explícito de arquivo/pasta/grep e `--session`. Projeto Playwright padrão `local-stack-fast`; mudança para `regression` ou `local-stack-realtime-global` é explícita e conserva o contrato da configuração existente. Não inferir hot-safe pelo nome nem declarar toda a população apta: o wrapper não executa preparação global; o autor continua responsável por escolher um caso compatível.

Usar o mesmo `e2e-run.sh`/`e2e-playwright.sh`, config, condições Node, exclusões e reporters vigentes. Opções operacionais não viram focal. Reporter Q2/Q3 continua proprietário de casos/retries/inventário. No caminho quente, **não rodar uma segunda discovery antes de cada execução**: o `onBegin` real publica a população assim que coletada; não existe um build Next longo antes dele. A preparação antecipada da prova canônica permanece intocada.

Wrapper publica parents antes dos counts: `feedback` → `playwright` → invocação. Validação de sessão é preparação, não caso de teste; erro de sessão não fabrica flaky/retry ou casos skipped. Log e exit do filho são preservados, inclusive sinal. Primeiro setup único tem log próprio; três tentativas produzem três tickets, nunca um ticket passado reusado para disfarçar outra execução.

## 6. Evidência mínima e arquivos descartáveis

### 6.1 Classes, sem nova taxonomia no motor

| Classe | Exemplos | Regra |
|---|---|---|
| Evidência mínima durável | ticket, log da fila, receipt, contagens, medições compactas | Preservar. O veredito não depende de guardar todo HTML/trace. |
| Proof canônico | pack publicado/versionado, arquivos exigidos pelo gate | Seguir seu publisher/leitores. Não limpar neste corte. |
| Diagnóstico de feedback | trace/screenshot/JSON de uma falha | Retenção curta e explícita no consumidor; nunca arquivo antigo copiado como se fosse do run atual. |
| Scratch | outputs temporários intermediários de uma tentativa | Diretório único por tentativa, removido quando os processos e leitores conhecidos terminaram. |
| Cache | `.next`, browsers, dependências, volumes | Não chamar de prova nem limpar globalmente. Reusar conforme compatibilidade; limpeza é explícita e ociosa. |

Não adicionar um engine genérico de TTL/classes ao CI Queue. Ele continua copiando os outputs que o consumidor publica. O consumidor decide o que é evidência e quando seu trabalho terminou.

### 6.2 Extensão pequena do catálogo

Adicionar `presets.<nome>.artifacts?: string[]`:

- ausente: herda a lista global, mantendo compatibilidade;
- `[]`: desabilita captura para essa receita;
- lista: substitui a global, não faz união.

Validar caminhos relativos seguros. O enqueue normal e o adapter DietFlow resolvem **uma vez** a mesma lista e a congelam no ticket. O worker não volta ao catálogo. Capability `recipe-artifacts-v1` só depois de parser/produtor/testes corretos; consumidor recusa usar override com binário incompatível. Enqueue explícito já tem lista final, e não muda seu formato persistido.

Feedback copia somente `artifacts/ci/queue-current`, contendo receipt, resumo da tentativa e medições limitadas. Esse diretório **não contém traces grandes** de feedback. Seu destino por ticket é o publisher existente. Não apagar a origem antes da cópia terminal; ela é renovada no início serial seguinte pelo mecanismo atual.

Static/review/smoketest no DietFlow também passam a publicar somente esse diretório mínimo, pois não devem recapturar pastas antigas de proofs. As receitas de proof/E2E final mantêm a lista anterior até a matriz produtor/leitor demonstrar que um caminho pode ser substituído. Essa preservação compatível é uma decisão, não dívida que impede concluir o feedback.

### 6.3 Retenção concreta do novo feedback

Criar scratch dedicado ao ticket, nunca usar/limpar o `test-results` de uma prova anterior. O config do Playwright aceita override **somente de outputs/reporters** deste modo, sem substituir seleção, fixtures, retries ou timeouts. Não derivar um segundo config de testes.

- Verde comum: remover outputs intermediários depois de produzir resumo/receipt; não criar HTML grande por default.
- Falha: mover os outputs daquele run para `artifacts/ci/feedback-diagnostics/<ticketId>` com manifest local e ticketId. Manter as **cinco falhas mais recentes**, respeitando teto combinado de **1 GiB**, por checkout.
- Antes de descartar diagnósticos fechados antigos, excluir do cálculo as entradas marcadas `keep` pelo comando `feedback:keep --ticket ID`. Keep é decisão explícita de conservação; não converter automaticamente todo erro em keep.
- Um run individual acima do teto conserva resumo/paths e comunica diagnóstico não retido ou parcial; não silenciosamente perder anexos. Não ler/cortar conteúdo de trace como texto.
- A rotação age somente em diretórios produzidos por este modo e com manifest terminal. Não segue symlinks, não cruza filesystem/repositório, não remove tentativa ativa ou com finalização incerta. Pinned/keep pode exceder teto por decisão explícita e é mostrado no status.
- A política é anunciada no erro: ticket/log permanecem; diagnóstico será rotacionado, e o comando keep é informado. Arquivo aberto por ferramenta externa não cria uma concessão implícita: para revisão longa o operador deve usar keep. Não implementar rastreamento universal de leitores humanos.
- Aborto sem finalização não recebe limpeza automática; `feedback:status` mostra o resíduo. `feedback:clean` é dry-run por default e só aplica a diretórios próprios terminais/inativos com `--apply`. Não limpar órfãos desconhecidos pelo nome.

Esses valores são defaults escolhidos nesta SPEC, não medições do Mac. A rotação acontece no fim/início de tentativa, não em novo daemon. Logs da fila não entram no teto. Não impor teto de tempo/disco ao teste clínico para fazer o benchmark parecer melhor.

`.next` e volumes Colima ficam fora da rotação automática. Uma limpeza explícita de cache exige sessão parada e ausência de leitores conhecidos; não é requisito para a prova de ganho. Se o cache de uma única sessão continuar crescendo, registrar a medida; não alegar que esta retenção resolveu aquele fenômeno.

## 7. Pattern distribuído e adoção real

A documentação genérica é do CI Queue. Next/Supabase/DietFlow aparecem apenas num exemplo consumidor claramente identificado; não viram dependência do produto.

Entregar no bundle:

- `docs/TESTING-METHOD.md`: método feedback/prova, ownership, retomada, saída e evidência.
- `templates/adoption/AGENTS.fragment.md`: ponteiro curto abaixo.
- `templates/adoption/ci.yaml`: mapa de adoção com campos não configurados explícitos, sem inventar comandos do consumidor.
- `templates/adoption/SKILL.md`: leitura do mapa e escolha da entrada; não repete formatos de ticket/ship.

Fragmento recomendado:

```md
## Testes e CI
Antes de executar testes, leia `.context/patterns/ci.yaml` e siga o perfil ali
indicado para este host e esta tarefa. Feedback não é prova final: reutilize
somente ambiente compatível e submeta a tentativa pelo executor configurado.
Ao retomar, confira cwd, sessão e ticket existentes antes de iniciar outro.
Não execute o lifecycle de prova a cada edição nem substitua um ticket por
observação posterior. Encerre os recursos próprios pelo comando documentado.
```

O YAML é **navegação para humanos/agentes**, não outro parser de políticas nem espelho do catálogo. `ci-queue.json` permanece autoridade executável de receitas/flags/artifacts. Campo ainda não adotado fica `available:false`, não um shell placeholder executável.

No DietFlow, atualizar o alvo real `.claude/CLAUDE.md`, `.context/patterns/ci.yaml`, `.context/patterns/e2e.yaml`, a skill já existente `.agents/skills/dietflow-ci/SKILL.md` e as entradas atuais de `docs/ci`, `e2e/README.md` e doctor. Um owner de procedimento (`docs/ci/FEEDBACK-LOOP.md`), demais páginas apontam. Exemplos quentes que hoje executam diretamente precisam mostrar a submissão pela fila quando esse é o executor configurado.

README raiz do produto liga ao quickstart; quickstart mostra o fragmento e ensina adaptar o mapa, não manda ler cinquenta specs históricas. O executor lê somente os contratos necessários ao corte. A adoção é demonstrada com consumidor mínimo não DietFlow usando uma receita Node e, separadamente, com o DietFlow real.

## 8. Fechamento F4/F5 sem reabrir o universo

| Frente | Trabalho deste plano | Critério de parada |
|---|---|---|
| F4 C01/C04 já integrados | Regressões relevantes nas suítes atuais | Não reimplementar. |
| F4 C02 + 72 IDs | Recenso apenas das 14 confirmações e ligações pós-merge; manter 72/72 IDs | `CUMPRE`, substituído, OUT ou não comprovado com owner/motivo. Não forçar 72 verdes. |
| F4 C03 | Completar casos faltantes da matriz integrada de Q2/Q3 | Produtor real → worker → API/UI candidata, num ticket temporário, incluindo retry/cap/mismatch/projeto. |
| F4 C06 | Fechar mapa entrypoint/runner/seleção/filesystem e regressões relevantes | Sem migração Jest/Vitest. |
| F4 C05/Q1 | Política prospectiva e inventário limitado de outputs tocados | ENOSPC antigo sem artefato causal fica inconclusivo, **não bloqueante**. |
| F4 V01/instalação | Provas visuais/build existentes, lacunas focais e janela instalada | Ausência de janela fica `OPERADOR_PENDENTE`, não gera implementação nova. |
| F5 P01/P02 | Preservar medições; P02 encerrado como hipótese recusada | Não repetir tentativa de fundir typechecks não equivalentes. |
| F5 P03/P04 | Preservar dedup por perfil e build único; medir custo focal quando possível | Sem crédito de minutos não medidos. |
| F5 P05 | Perfil limitado de `green-progress.test.ts` antes de um tratamento | Até 3 observações comparáveis e 1 tratamento causal; caso inconclusivo documentado, sem bloquear feedback. |
| F5 P06 | Esta entrega: uso quente enfileirado, outputs e prova de reuso | Tempo de espera/setup/teste/publicação e contadores de reset/seed/build separados. |
| F5 P07 | Consumir a prova do RC115 quando seu owner autorizar | Não criar Full concorrente para fechar nossa documentação. |

Fonte da suíte de 143,08 s: ticket `20260922023429-7ffcebb3`, H `11fccd500`, diagnóstico importado. Não é previsão de ganho. Ausência do log bruto não exige reconstruir aquele run: fazer perfil focal atual identificado quando houver janela.

Registro final único: `CLOSURE.md`, neste diretório, com matriz, evidências e disposições. `IMPLEMENTADO`, `VERIFICADO_NA_CANDIDATA`, `OPERADOR_PENDENTE`, `HIPÓTESE_RECUSADA` e `INCONCLUSIVO_NÃO_BLOQUEANTE` não são sinônimos. Não declarar F5 inteira acelerada ou 121 concluída quando restam causas históricas abertas.

## 9. Aceite observável

**A1 — Adoção:** um agente/usuário com apenas README/AGENTS/mapa escolhe feedback e não uma prova pesada para um reteste. Exemplo genérico funciona fora do checkout CQ.

**A2 — Fila:** duas solicitações locais dão tickets distintos, serializados pelo mesmo worker; o teste não aparece apenas por `observe`. Falha de guard impede browser.

**A3 — Sessão:** start uma vez, RED e dois GREEN por tickets, com alteração quente entre eles. Mesmo sessionId; zero reset/seed/next-build nos retestes; stop confirma processos próprios encerrados. Não exigir que todo PID interno Next permaneça igual.

**A4 — Identidade:** worktree errada, listener substituído, perfil remoto, input frio alterado ou sessão sem dono verificável falham antes de usar ambiente incorreto. Erro no final não vira verde íntegro.

**A5 — Saída:** cancelamento interrompe tentativa e libera seu uso, sem destruir a sessão; stop recusa uso conhecido; encerramento normal não deixa filho próprio. Queda irrecuperável é sinalizada, nunca `pkill` por nome.

**A6 — Evidência:** ticket/log/resumo duráveis depois da remoção do scratch; artefatos do job anterior não reaparecem; proof canônico não é tocado; symlink/manifest ausente não autoriza limpeza.

**A7 — Volume:** 10 tentativas sintéticas e 6 falhas demonstram rotação definida, keep e teto; nenhuma dependência de localizar os antigos 50 GB.

**A8 — Observabilidade:** receita feedback visível; contagens/retries/variante/tempos nas superfícies existentes, inclusive terminal. Live não recebe árvore inteira como atalho.

**A9 — Regressões:** C03/C06 e V01 pertinentes completos no alcance registrado; legacy config herda artifacts; explicit `[]` não herda; ship não aceita feedback; worker não importa ship.

**A10 — Comparação:** no mesmo ambiente, medir enqueue→claim, validação da sessão, execução e publicação. O ganho de evitar preparação repetida é demonstrado por trabalho não executado e retestes reais, não por comparar um Full verde com um focal parcial. Não definir meta absoluta sem baseline.

## 10. Encerramento e operações

Produzir código nos dois repos em lanes próprias, testes internos com states temporários e jobs reais no host pela fila oficial. Um consolidador possui Git; subagentes não competem por build/worker/stack.

Primeiro integrar o contrato genérico CQ e sua distribuição candidata; consumidor exige capability somente quando usa override novo. Release/instalação do operador é uma janela explícita ao final, pelo instalador existente. Não trocar a instalação ativa no meio de tentativas clínicas. PR #25 continua documental até decisão de integração; esta autoria não instala nem mergeia.

Depois da aprovação e execução: revisões técnicas, provas focais, check completo CQ e validações do contrato DF pertinentes; PRs draft e receipt único. Não rodar Full para atender uma frase genérica do skill. P07 continua reservado ao RC115. A diferença entre teste focal, suíte do owner e validação final precisa estar explícita no PLAN.

A campanha acaba com o método entregue, evidências e trade-offs publicados. Não precisa de outra SPEC para agendar pendência do operador ou conservar causa histórica inconclusiva.

## 11. Referências técnicas complementares

Estas fontes confirmam capacidades das ferramentas, não o resultado do nosso sistema:

- [Next 15 Fast Refresh](https://nextjs.org/docs/15/architecture/fast-refresh): desenvolvimento tem atualização quente; não torna todo input hot-safe.
- [Playwright webServer](https://playwright.dev/docs/test-webserver): reuso por disponibilidade existe, mas não substitui identidade/coordenação entre worktrees. Não introduzir um segundo dono automático de webServer neste corte.
- [Playwright TestConfig](https://playwright.dev/docs/api/class-testconfig): outputDir é limpo ao iniciar; reporters e preserveOutput são configuráveis. Por isso o feedback usa output próprio, sem tocar o de proofs.
- [Playwright Reporter](https://playwright.dev/docs/api/class-reporter): `onBegin` oferece a população real; não precisamos de dupla coleta no loop já quente.
