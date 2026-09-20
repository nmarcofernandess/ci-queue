# Etapa 3 · Evidência e Verificação da Candidata

## Escopo e Identidade

- **Base de partida:** `origin/dev` em `97a0eb4b00fbdfbac8909ab43467a288d14aeaff`
- **Lane/Worktree isolada:** `/Users/marcoantonio/ci-queue-etapa-3`
- **Branch:** `codex/ci-queue-etapa-3`
- **Revisão Base Auditada (PR #13):** `9e7470a20573cdd66a158d42a247f0a9a84c982c` (tree `2db51c1506fd4908d81b1e04edae5e6bcdb550a9`)
- **Estado do host:** `bootObserved=false`. Nenhuma ativação launchctl real, modificação de `~/Library/LaunchAgents` do usuário, logout/login, reboot ou merge foi realizada.

## Ambiente de Medição e Teste

- **Host:** macOS 26.6.2 build 25G83, Apple M4 (10 logical CPUs), 16 GiB RAM
- **Python:** 3.9.6 (`/usr/bin/python3`)
- **Node runtime canônico:** v24.20.0 (`/Users/marcoantonio/.local/share/dietflow-runtime/node/current/bin/node`)
- **Playwright:** 1.63.0
- **Isolamento:** estado gerado exclusivamente em diretórios temporários (`tempfile.TemporaryDirectory`), sem tocar pastas do operador (`~/.local/state/local-ci/queue`) nem o consumidor DietFlow. Sem purga de caches de página do SO.

---

## Comparativo BASE vs CANDIDATA

Medições executadas via `scripts/bench/ci-queue-read-path.py` com o servidor Python real (`ThreadingHTTPServer`) na porta de loopback efêmera, com 100 amostras warm (após duas preparações) e 30 amostras cold por endpoint, método nearest-rank.

### 1. Endpoints Legados / Compatibilidade Padrão (sem parâmetro `view`)

| Dataset / Endpoint | Base warm p50 | Cand warm p50 | Base warm p95 | Cand warm p95 | Base cold p95 | Cand cold p95 | Payload (Base / Cand) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **D1000H Executions All** | 187.082 ms | **17.725 ms** | 202.016 ms | **18.962 ms** | 349.550 ms | **161.350 ms** | 966,719 B / 966,719 B |
| **D1000H Status All** | 183.814 ms | **158.927 ms** | 204.474 ms | **162.581 ms** | 476.907 ms | **313.980 ms** | 988,609 B / 988,609 B |
| **D1000H Analysis Alpha** | 64.843 ms | **39.580 ms** | 74.203 ms | **44.624 ms** | 206.020 ms | **187.370 ms** | 22,114 B / 22,114 B |
| **D1000H Detail 4096** | 12.065 ms | **12.340 ms** | 12.647 ms | **12.908 ms** | 12.171 ms | **12.460 ms** | 695,241 B / 695,241 B |
| **D3000 Executions All** | 139.536 ms | **15.153 ms** | 154.178 ms | **21.235 ms** | 376.704 ms | **164.690 ms** | 144,007 B / 144,007 B |
| **D3000 Status All** | 138.576 ms | **86.004 ms** | 157.989 ms | **88.827 ms** | 301.570 ms | **246.250 ms** | 147,199 B / 147,199 B |
| **D3000 Analysis Alpha** | 109.387 ms | **51.541 ms** | 165.858 ms | **58.706 ms** | 287.660 ms | **210.670 ms** | 65,317 B / 65,317 B |
| **DLIVE Executions All** | 186.206 ms | **17.432 ms** | 194.764 ms | **19.327 ms** | 325.570 ms | **340.380 ms** | 966,719 B / 966,719 B |
| **DLIVE Status All** | 188.829 ms | **162.047 ms** | 196.051 ms | **174.007 ms** | 331.681 ms | **318.710 ms** | 991,866 B / 991,866 B |
| **D1000 Executions All** | 48.815 ms | **5.763 ms** | 53.508 ms | **6.551 ms** | 98.840 ms | **58.330 ms** | 144,007 B / 144,007 B |
| **D1000 Status All** | 48.504 ms | **30.585 ms** | 51.378 ms | **34.198 ms** | 149.700 ms | **84.310 ms** | 147,199 B / 147,199 B |
| **D100 Executions All** | 10.800 ms | **2.470 ms** | 11.257 ms | **2.641 ms** | 19.990 ms | **10.900 ms** | 144,006 B / 144,006 B |
| **D100 Status All** | 11.223 ms | **8.649 ms** | 13.109 ms | **9.818 ms** | 20.050 ms | **17.700 ms** | 147,199 B / 147,199 B |

### 2. Projeções Otimizadas da Nova UI (`view=live` e `view=summary`)

| Endpoint / Projeção | Base warm p95 | Cand warm p50 | Cand warm p95 | Base Payload | Cand Payload | Redução de Payload |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **D1000H Status (`view=live`)** | 204.474 ms | **7.708 ms** | **8.642 ms** | 988,609 B | **248 B** | **99.97%** |
| **D1000H Executions (`view=summary`)** | 202.016 ms | **12.530 ms** | **13.582 ms** | 966,719 B | **20,848 B** | **97.84%** |
| **D1000H Detail 4096 (preservado)** | 12.647 ms | **13.418 ms** | **14.874 ms** | 695,241 B | **695,241 B** | Preservado (0%) |

---

## Gates Estruturais do Budget-Lock

| Gate | Requisito do Budget-Lock | Observação na Candidata | Veredito |
| --- | --- | --- | :---: |
| **Reabertura de corpos inalterados** | 0 leituras / 0 hashes no quente | 0 corpos lidos e 0 hashes na atualização sem delta (`test_hot_snapshot_opens_zero_bodies_and_delta_opens_one`) | **PASS** |
| **Trabalho por delta de 1 ticket** | Proporcional ao delta (max 1 read/parse) | Apenas 1 corpo lido e parsed (`open.call_count == 1`) | **PASS** |
| **Paginação antes da árvore** | Paginar antes de projetar árvore recursiva | `rows[offset:offset+50]` antes de `progress_summary` em `read_executions` | **PASS** |
| **Payload privado** | `argv`, env, detalhes internos não vazam na lista | `argv` e `progressSummary` ausentes na projeção summary (`test_summary_pages_before_projecting_and_omits_private_or_tree_data`) | **PASS** |
| **Dedup cliente em voo** | No máximo 1 request em voo por chave canônica | `queryStore` deduplica em voo e reutiliza promise ativa (`query-store.test.ts`) | **PASS** |
| **Cancelamento físico de rede** | AbortSignal emitido no último unsubscribe | `entry.controller.abort()` disparado quando `listeners.size === 0` | **PASS** |
| **Limites de memória no cliente** | Cache inativo delimitado | `prune()` remove entradas sem listeners além de `MAX_INACTIVE = 128` | **PASS** |
| **Visibilidade da página** | Não pollar com aba oculta; retomar 1 leitura ao voltar | `document.hidden` suspende `load()` e ouve `visibilitychange` para acordar | **PASS** |
| **Inventário de Worktrees** | Não executar Git/du redundante a cada polling | Cache de 60s em `worktrees.py` keyed por repo, common_dir, base_ref e revision | **PASS** |
| **Instalação Canônica** | Isolada, envelopes owned, KeepAlive/QueueDirectories | Testada com 15 testes em fake HOME; sem tocar launchctl real | **PASS** |

---

## Verificação e Regressões Executadas

O pipeline completo local `npm run check` executou com sucesso (código de saída 0):

- **Build:** `tsc --project tsconfig.json` -> PASSED
- **Test Core:** 17 arquivos, 170 testes unitários Vitest -> PASSED
- **Test Runtime:** 43 testes Node test runner -> 42 PASSED, 1 SKIPPED (segundo Node opcional)
- **Test UI:** 12 arquivos, 77 testes Vitest (inclui regressões A11a–A11d) -> PASSED
- **Test Backend:** 9 arquivos, 116 testes unittest Python (inclui regressões A05–A09, A12) -> PASSED
- **Test Examples:** 6 testes Node test runner -> PASSED
- **Test Release:** 2 testes Node test runner -> PASSED
- **Test Install:** 15 testes Node test runner (inclui regressões A01–A04) -> PASSED
- **Check UI:** eslint (0 erros, 0 avisos) + vite build -> PASSED
- **Browser:** Playwright 45/45 testes em browser real (Chromium) -> PASSED

---

## Resolução do Review Adversarial (A01–A12, V01)

1. **A01 · Ownership de envelopes launchd:** `scripts/install.mjs:validateOwnedCanonical` compara estritamente o SHA-256 do arquivo existente contra os bytes canônicos gerados pelo release, sem tolerar alterações arbitrárias que coincidam em substrings.
2. **A02 · Espera fail-closed no bootout:** `scripts/install.mjs:bootoutService` aguarda com timeout determinístico que o serviço deixe de aparecer em `launchctl list`. Se permanecer ativo ao término da janela, encerra com erro fail-closed.
3. **A03 · Preservação de receipt legado:** `scripts/install.mjs:isActiveInstallation` reconhece instalações que possuam serviços carregados mesmo sem receipt canônico anterior e preserva o receipt existente durante atualizações filesystem-only (`--no-activate`).
4. **A04 · Rollback transacional do instalador:** `scripts/install.mjs:rollbackActiveServices` restaura atomicamente plists anteriores e re-carrega os serviços no caso de falha na gravação do binário lançador ou nos metadados de instalação.
5. **A05 · Retentativa de erro transitório no RecordStore:** `backend/ci_queue_api/record_store.py` marca entradas transitórias com `is_transient=True`, permitindo nova tentativa de leitura e parsing no scan subsequente sem depender de alteração nos metadados do disco.
6. **A06 · Resiliência a exclusão concorrente durante scandir:** `backend/ci_queue_api/record_store.py:_scan` captura `(FileNotFoundError, ProcessLookupError, OSError)` individualmente por arquivo, garantindo que remoções concorrentes de tickets durante a varredura não invalidem o restante dos registros retidos.
7. **A07 · Imutabilidade profunda das rows de snapshot:** `backend/ci_queue_api/record_store.py` envelopa dicionários e listas cacheados em `FrozenDict` e `FrozenList` imutáveis, prevenindo mutações colaterais por rotas downstream e serializando perfeitamente via `json.dumps`.
8. **A08 · Exposição de registros corrompidos em coverage:** `backend/ci_queue_api/records.py` e `history.py` informam `corruptRecords: len(snapshot.errors)` no objeto `coverage`, tornando arquivos não processáveis transparentes para a UI e operadores.
9. **A09 · Propagação de retentativas (hasRetries):** `backend/ci_queue_api/records.py:public_job` inspeciona a árvore de execução completa (`progressSummary["nodes"]`) e preserva `hasRetries` nas projeções summary e live, garantindo o badge correto no frontend.
10. **A10 · Preservação de paginação contínua no histórico:** `ui/src/features/status/status-page.tsx:useExecutionHistory` funde a primeira página atualizada sem truncar páginas 2+ já carregadas pelo usuário (`mergeFirstPage`), mantendo o cursor e protegendo contra formatos inesperados de resposta.
11. **A11 · Ciclo de vida, visibilidade e descarte de respostas obsoletas no QueryStore:** `ui/src/lib/query-store.ts` sincroniza requisições com a visibilidade da página (`document.hidden`), respeita o predicado `pollWhile` em dados terminais, rejeita payloads obsoletos que cheguem após cancelamento/unsubscription e isola configurações sem inscritos.
12. **A12 · Coalescência e limites de inventário de Worktrees:** `backend/ci_queue_api/worktrees.py` implementa single-flight por chave para evitar Git/du redundantes durante misses simultâneos, evicta revisões obsoletas e limita o cache a 64 entradas inativas.
13. **V01 · Homologação, evidências reais e roteiro S6:** O recibo reflete exatamente os SHAs/árvores auditados, 45/45 testes browser reais executados no Chromium, suíte completa de integração `npm run check` verde, e roteiro S6 com todos os parâmetros mandatórios (`--bundle`, `--node`, `--python`, `--command`, `--activate`).

---

## Riscos Residuais e Limitações

1. **Varredura O(N) de metadados:**
   - A cada atualização, o `scandir` da pasta de histórico ainda inspeciona os metadados dos N arquivos `.json`. Para N=1.000 a 3.000, isso consome <10 ms em APFS local, mas permanece O(N).
2. **Bitflip invisível a metadados:**
   - Se um bit for alterado no disco sem modificar tamanho, mtime, ctime ou inode (ex.: corrupção física silenciosa de setor), o snapshot não o detectará no quente sem reabrir o corpo. Esse compromisso foi explicitamente aceito no `budget-lock.json` para permitir zero leituras de corpo no quente.
3. **Cache de Worktrees:**
   - O cache de 60s em `worktrees.py` pode atrasar em até 60 segundos a detecção puramente passiva de arquivos untracked criados fora do CI Queue. Ações interativas e criação de worktree invalidam ou revalidam ao vivo.
4. **Boot pendente (S6 não executado):**
   - O retorno canônico após login real do macOS no ambiente do operador permanece como o único item pendente de validação operacional (`bootObserved=false`).

---

## Roteiro Restante para S6 (Janela do Operador)

Quando o operador autorizar a janela para ativação real e login:

1. **Gerar pacote canônico (bundle):**
   ```bash
   npm run release:bundle
   ```
2. **Pré-inspeção:**
   ```bash
   id -u
   launchctl print "gui/$(id -u)/com.nmarcofernandess.ci-queue.dashboard"
   launchctl print "gui/$(id -u)/com.nmarcofernandess.ci-queue.worker"
   lsof -nP -iTCP:8765 -sTCP:LISTEN
   curl --fail --silent http://127.0.0.1:8765/health
   ```
3. **Ativação canônica via instalador com argumentos completos:**
   ```bash
   node scripts/install.mjs update \
     --bundle releases/ci-queue-0.1.0-*.tar.gz \
     --prefix ~/.local/share/ci-queue \
     --node /Users/marcoantonio/.local/share/dietflow-runtime/node/current/bin/node \
     --python /usr/bin/python3 \
     --command ~/.local/share/ci-queue/current/bin/ci-queue \
     --activate
   ```
4. **Observação de estabilidade (60s):**
   - Verificar que dashboard escuta na 8765 sem loops de crash.
   - Verificar que worker está carregado com `QueueDirectories` e sem `KeepAlive`.
5. **Logout e Login:**
   - Realizar logout da sessão de usuário do macOS e login novamente (ou reboot aprovado).
   - Não executar nenhum comando de inicialização manual (`launchctl bootstrap`, etc.).
   - Observar que o serviço `com.nmarcofernandess.ci-queue.dashboard` subiu automaticamente e responde em `http://127.0.0.1:8765/health`.

