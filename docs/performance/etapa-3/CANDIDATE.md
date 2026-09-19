# Etapa 3 · Evidência e Verificação da Candidata

## Escopo e Identidade

- **Base de partida:** `dev` em `5a9268e41e27644362dfd9e5cd4e163813f5e1a1` (tree `67da42f17aac27f046995f952ec49ad578bb9712`)
- **Lane/Worktree isolada:** `/Users/marcoantonio/ci-queue-etapa-3`
- **Branch:** `codex/ci-queue-etapa-3`
- **HEAD verificado:** `2e07e96837306785458e67e1bf611e0f20618cdb` (tree `e4913ccf1d25c5730d331ba6f8d729b57da1410f`)
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
| **Instalação Canônica** | Isolada, envelopes owned, KeepAlive/QueueDirectories | Testada com 11 testes em fake HOME; sem tocar launchctl real | **PASS** |

---

## Verificação e Regressões Executadas

O pipeline completo local `npm run check` executou com sucesso (código de saída 0):

- **Build:** `tsc --project tsconfig.json` -> PASSED
- **Test Core:** 17 arquivos, 170 testes unitários Vitest -> PASSED
- **Test Runtime:** 43 testes Node test runner -> 42 PASSED, 1 SKIPPED (segundo Node opcional)
- **Test UI:** 12 arquivos, 73 testes Vitest -> PASSED
- **Test Backend:** 9 arquivos, 109 testes unittest Python -> PASSED
- **Test Examples:** 6 testes Node test runner -> PASSED
- **Test Release:** 2 testes Node test runner -> PASSED
- **Test Install:** 11 testes Node test runner -> PASSED
- **Check UI:** eslint (0 erros, 0 avisos) + vite build -> PASSED
- **Browser:** Playwright 45/45 testes em browser real (Chromium) -> PASSED

---

## Revisão Adversarial (R-Checklist)

1. **Reabertura e hash no quente:**
   - *Verificação:* O `RecordStore` inspeciona a tupla `(device, inode, size, mtime_ns, ctime_ns, mode)`. Se idêntica à entrada existente em memória, os bytes do arquivo não são abertos nem hasheados. Comprovado por mock de `builtins.open` onde `call_count == 0`.
2. **Corrupção de arquivo e troca de inode:**
   - *Verificação:* Se o arquivo for alterado conservando tamanho e mtime, `ctime_ns` do macOS muda. Se o inode mudar (substituição atômica via rename), o fingerprint muda. Em caso de JSON malformado ou truncado, o store não mantém verde antigo como atual; armazena `error` na entrada, incrementa a geração e omite dos resultados válidos (ou lança `SnapshotError` em modo estrito).
3. **Página antes de projeção:**
   - *Verificação:* Em `backend/ci_queue_api/records.py:read_executions`, a ordenação e o recorte `rows[offset:offset+PAGE_SIZE]` ocorrem sobre os dicionários brutos em memória. A projeção de progresso e sanitização pública só é chamada para as 50 linhas selecionadas.
4. **Isolamento de projetos e ocupação global:**
   - *Verificação:* Em `status_snapshot`, a ocupação global (`running` e `queued`) é calculada na visão global da máquina; projetos A e B não têm ocupação recortada por filtro. Tickets de outro projeto continuam visíveis como `otherProjectOccupancy: true`.
5. **Histórico manual e cursor no cliente:**
   - *Verificação:* `useApiQuery` agora utiliza `queryStore` internamente com `useSyncExternalStore`. A página de Status passa a monitorar `historyRevision`; quando novo registro terminal é gravado, a revisão muda e o painel de histórico invalida sob demanda, evitando fetches redundantes a cada 2 segundos.
6. **Worktrees e inventário:**
   - *Verificação:* `backend/ci_queue_api/worktrees.py` introduziu memoização com chave composta e cópia profunda (`copy.deepcopy`), garantindo que o custo de inspecionar status e git branches não seja disparado a cada ciclo de polling do frontend.
7. **Instalador e envelopes launchd:**
   - *Verificação:* `scripts/install.mjs` diferencia instalação staged (`--no-activate`) da ativação canônica. Os arquivos `.plist` são gravados como envelopes regulares owned com permissões estritas e hashes validados. Rollback automático restaura envelopes anteriores se o bootstrap falhar.

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

1. **Pré-inspeção:**
   ```bash
   id -u
   launchctl print "gui/$(id -u)/com.nmarcofernandess.ci-queue.dashboard"
   launchctl print "gui/$(id -u)/com.nmarcofernandess.ci-queue.worker"
   lsof -nP -iTCP:8765 -sTCP:LISTEN
   curl --fail --silent http://127.0.0.1:8765/health
   ```
2. **Ativação canônica via instalador:**
   ```bash
   node scripts/install.mjs update --prefix ~/.local/share/ci-queue --activate
   ```
3. **Observação de estabilidade (60s):**
   - Verificar que dashboard escuta na 8765 sem loops de crash.
   - Verificar que worker está carregado com `QueueDirectories` e sem `KeepAlive`.
4. **Logout e Login:**
   - Realizar logout da sessão de usuário do macOS e login novamente (ou reboot aprovado).
   - Não executar nenhum comando de inicialização manual (`launchctl bootstrap`, etc.).
   - Observar que o serviço `com.nmarcofernandess.ci-queue.dashboard` subiu automaticamente e responde em `http://127.0.0.1:8765/health`.
