# Crítica GPT Sol — prova local, progress e ship

## Verdict

**DEMAND RECODE de seções específicas. Não está bloqueado por falta de evidência.**

O pacote é forte como investigação, mas ainda não é aprovável nem como `gathering-PRD`: ele acerta a história e erra a conclusão arquitetural central. O sistema **executa o happy path** pedido, porém os controllers de ship **não garantem** o DoD “sem progress no Vite, não passa”. O PRD chama essa lacuna de procedimento e declara que nenhum código novo é necessário. Isso é falso.

Build deve permanecer bloqueado até recodificar:

- `PRD.md`: TL;DR, Current Behavior, “Dava com o código atual?”, dívida de código, ativação, Acceptance Criteria e Open Questions.
- `analysis.md`: TL;DR, Backend, Recode Log, Current Terrain, Rules/Invariants, Blueprint Handoff, Grill Verdict e Open Questions.

Veredito final do crítico: **não aprovar o Analyst; exigir recode.**

## Checklist vs Marco

| # | Nota | Cobertura em PRD + analysis | Crítica |
|---|---|---|---|
| 1 | **covered** | `PRD.md:140-159`, `PRD.md:173-208` | As duas frentes têm intent, merge e DoD separados. |
| 2 | **covered** | `PRD.md:150-170` | Distingue corretamente o direct-push `19c491a3f` do PR #1291 e alerta que Jest DietFlow não provou CI Queue/Vite. |
| 3 | **partial** | `PRD.md:213-254` | Comandos e dívida estão listados, mas a conclusão “pack visibilidade + merge não precisa de código” omite a falta de enforcement de progress no ship. |
| 4 | **covered** | `PRD.md:203-211` | Registra explicitamente a passagem de responsabilidade e a segunda omissão. |
| 5 | **covered** | `PRD.md:209-211`, `PRD.md:257-265` | O extra “todo teste DietFlow” e o ratchet que o impede estão claros. |
| 6 | **partial** | `PRD.md:282-315`, `PRD.md:337-355` | Há direção e destinos, mas não ativação completamente executável: falta dizer como selecionar/cadastrar CI Queue no Vite ou declarar que a prova usa o card global enquanto running. |
| 7 | **partial** | `PRD.md:316-355` | Há inventário de arquivos e intenções de mudança. Não há patches, hunks, before/after nem modelo de stages para os scripts não instrumentados. Chamar a seção de “Patches agrupados” não materializa patch algum. |
| 8 | **covered** | `PRD.md:173-190` | Intent e limites do pin estão honestos, inclusive `verified != sandbox`. |
| 9 | **partial** | `PRD.md:191-208` | As provas ausentes do pin aparecem, mas a tabela mistura teste da implementação do pin com ship/Vite do pack posterior. `npm run ship` não testa o runtime pin. |
| 10 | **covered** | `PRD.md:257-279` | Código e procedimento são separados, embora a dívida de enforcement de progress esteja ausente. |
| 11 | **covered** | `PRD.md:124-139`, `PRD.md:389-396` | O DoD dominante aparece de forma inequívoca e separa visibilidade de elegibilidade para merge. |
| 12 | **partial** | `PRD.md:133-135` | Diz “smoketest obrigatório”, mas imediatamente permite “ou full elegível”. Isso não é a ordem literal recebida. |
| 13 | **partial** | `PRD.md:136-139`, `PRD.md:289-295` | Descreve draft → ready, `check`, ship e base/HEAD. Falta admitir que o código atual ainda aceita ticket sem progress e, portanto, não fecha sozinho o pack. |

Resultado: **7 covered, 6 partial, 0 missing.** A coleta é ampla; a síntese ainda mascara dois buracos de código.

## System support / break risk

### O que o sistema realmente suporta hoje

O caminho operacional existe:

- `ci-queue.json:14-26`: `check` usa `["npm","run","check"]`, declara `progress: true` e é o preset aceito pelo ship.
- `src/core/enqueue.ts:70-83`: o enqueue persiste `progress` como `flags.progressEnabled`.
- `src/core/runner.ts:440-468`: o worker liga `LOCAL_CI_PROGRESS_ENABLED=1` a partir da flag persistida.
- `src/core/runner.ts:589-623`: o worker cria um collector por job e executa o argv no cwd do ticket.
- `scripts/ci/check-with-progress.sh:16-36`: o `check` emite Build, Test, Check UI e Browser.
- `src/core/progress.ts:18-20,157-179`: o collector aceita os dois prefixos e persiste sidecar.
- `backend/ci_queue_api/records.py:158-169,227-230,292-319`: a API projeta `progressSummary` e mantém a execução running global mesmo em outro contexto de projeto.
- `ui/src/features/status/status-page.tsx:115-166`: Status renderiza os roots da execução atual.
- `ui/src/features/shared/job-drawer.tsx:144-161,499-519`: o drawer renderiza a aba Progresso.
- `src/ship/ship.ts:202-205,243-280,280-330`: `--no-remote` pula o wait, exige ticket elegível, marca draft como ready e chama merge.
- `src/ship/system-ops.ts:614-631,650-657,736-749`: revalida árvore/HEAD/branch/B0, marca ready e faz PUT de merge com `sha=H`.

DietFlow também tem o caminho local:

- `scripts/ship/ship.ts:363-389`: enfileira smoketest na fila persistente e exige ticket elegível.
- `scripts/ship/ship.ts:805-818`: skipped continua exigindo prova local e promove draft a ready.
- `scripts/ship/ship.ts:577-582`: revalida a base e usa `--match-head-commit`.
- `scripts/ship/remote-verdict.json:1-3`: o verdict atual é `skipped`.

Portanto: **sim, o happy path pode ser executado sem quebrar o sistema e sem Actions.**

### O que está UNPROVEN ou não é garantido

O DoD forte não está codificado:

1. **CI Queue ship não exige progress.** `src/ship/system-ops.ts:239-247` remove `progressEnabled` e `abortOnStaleBase` ao construir as flags da receita aceita. `src/ship/eligibility.ts:83-90` compara apenas fetch/clean/stability/pin/timeout. `src/ship/eligibility.ts:120-155` não verifica `ticket.progress` nem stage significativo. Um `check` canônico, passed, HEAD/base/cwd corretos, porém sem progress, ainda pode ser elegível.
2. **DietFlow ship também não exige progress.** `scripts/ci/queue-ticket-contract.ts:262-283` valida preset/status/git/cwd, mas ignora `flags.progressEnabled` e `progress.nodes`.
3. **DietFlow pode sair da fila.** `scripts/ship/ship.ts:369-375` roda `npm run ci:smoketest` diretamente quando `hasPersistentQueue()` é falso e segue sem ticket. Isso contradiz a formulação absoluta “tem de aparecer no Vite”.
4. **Full substitui smoke no código.** `scripts/ship/ship.ts:335-336` aceita `full` antes de `smoketest`. Logo “smoketest obrigatório” é falso no sistema atual.
5. **Progress em todas as receitas DietFlow é UNPROVEN.** Onze famílias precisam apenas da flag, mas os demais scripts precisam de emissores novos. O PRD não define stage IDs, parentesco, terminação ou comportamento de falha desses emissores.

Conclusão correta: o sistema suporta a operação manual pretendida, mas **não suporta como invariante automática** o contrato escrito no PRD. Isso é dívida de código, não só dívida de teste.

## Over-engineering

O núcleo da ativação não é over-engineered: um enqueue explícito por lane, observar o Vite, completar o preset aceito e usar o ship existente é o caminho mínimo.

Há três excessos laterais:

- Debater um novo `remote-verdict.json` no CI Queue é desnecessário; `--no-remote` já resolve o caso.
- Unificar imediatamente os dois verdict files DietFlow não é requisito deste fecho; basta documentar donos e impedir divergência.
- Registrar runtime do próprio CI Queue só é necessário para provar o **pin**. Não é pré-condição de progress nem de ship. Misturar isso na ativação principal aumenta a cerimônia.

E há uma falsa minimização: instrumentar todos os scripts DietFlow não é “docs + ratchet”. É mudança transversal real em catálogo, emissores e testes. Não pede collector/UI novos, mas também não cabe na palavra `mode`.

## Intention fidelity

O texto **carrega a intenção no nível narrativo**: Vite local, jobs reais, smoketest/check e merge sem Actions aparecem repetidamente. Não houve lavagem completa.

Mas a síntese arquitetural lava o pedido em dois pontos:

1. `analysis.md:14-18` e `analysis.md:250-258` concluem que o código já entrega o pack e que resta principalmente ratchet/emissores/docs. Isso apaga a ausência de enforcement de progress nos dois ships.
2. “Smoketest obrigatório” vira “smoketest ou full elegível”, embora o checklist seja literal.

O resultado é uma narrativa fiel com um handoff infiel: o próximo agente poderia editar docs, inverter o ratchet, observar um job uma vez e declarar vitória, enquanto o ship continuaria aceitando prova silenciosa.

### Strings-safadas / fake Recode / hollow synthesis

- A seção `analysis.md:94-108` de strings é teatro de checklist. Não há copy nova; inventar um toast hipotético para mandá-lo à “morte” não reduz risco.
- Os cinco recodes têm base factual, mas o recode “não falta pipeline; falta enqueue” foi longe demais. Falta também enforcement do próprio DoD no ship.
- `analysis.md:119` usa `coherence_proof` como autocertificação sem testar a invariável decisiva. É síntese oca.
- `analysis.md:89` (“Reuse, don't fork”) é slogan, não decisão demonstrada.
- `analysis.md:30` declara “Ambiguity points: 0” e logo lista quatro perguntas. Isso é fake precisão.

## Contradictions

1. `PRD.md:93` põe Full como prova de ship fora do escopo; `PRD.md:133-135` aceita full elegível. `analysis.md:47` chama Full de non-goal; `analysis.md:220-224` volta a aceitá-lo.
2. O PRD chama smoketest de obrigatório e simultaneamente admite full. Uma das frases tem de morrer.
3. `analysis.md:30` diz zero ambiguidades e mantém quatro Open Questions em `analysis.md:260-264`.
4. A pergunta “cancelar só prova Vite; merge exige passed?” já está resolvida em `PRD.md:124-139`. Não é decisão humana pendente.
5. A pergunta “criar verdict file ou usar `--no-remote`?” também não bloqueia Build: o comando canônico já foi escolhido.
6. O PRD manda “abrir o Vite no projeto CI Queue”, mas o estado descrito tem bootstrap DietFlow. Como `records.py:307-319` expõe running global, a prova pode ocorrer no card global; para histórico filtrado, é preciso cadastrar o projeto pelo Project Manager. O texto não escolhe nem ensina um dos dois.
7. “Código atual já permite o pack completo” contradiz as próprias invariantes de Acceptance, porque nenhum ship verifica progress.

## Must-fix before Build (even after human confirms)

1. **Recodificar código vs procedimento.** Declarar explicitamente:
   - happy path já existe;
   - enforcement “with progress” ainda é dívida de código;
   - teste instalado continua sendo prova de integração/operador, não unit test contra state live.
2. **Decidir o literal do smoketest.**
   - Se smoketest é realmente obrigatório, `full` não pode substituí-lo e isso exige mudança/teste no DietFlow.
   - Se full é substituto aceito por ser superconjunto, pedir decisão explícita ao Marco e parar de usar “smoketest obrigatório”.
3. **Especificar a barreira de progress no ship.** No mínimo:
   - CI Queue rejeita ticket sem `flags.progressEnabled === true`;
   - CI Queue rejeita progress vazio ou só `artifacts`;
   - DietFlow aplica a mesma regra ao ticket material;
   - testes cobrem passed canônico sem progress, artifact-only e progress real.
4. **Resolver o fallback direto DietFlow.** Para este contrato local, ausência da fila persistente deve falhar fechado ou ser explicitamente proibida no caminho Mac. Não pode mergear e depois afirmar que apareceu no Vite.
5. **Entregar patches reais para o DietFlow.** Incluir before/after ou hunks determinísticos para:
   - `ci-queue.json`;
   - ratchet positivo;
   - cada família de script sem emitter, com IDs e estados;
   - `AGENTS.md`;
   - `.context/patterns/ci.yaml`;
   - `.context/patterns/testing.yaml`;
   - docs canônicos.
6. **Separar as provas do pin do extra posterior.**
   - Pin: installed `check`, runtime do projectId CI Queue, npm bound, mismatch 99.0 e realpath.
   - Extra: todas as receitas DietFlow, Vite obrigatório e ship sem Actions.
   - Não vender ship como teste unitário do pin.
7. **Tornar a ativação exata.**
   - Informar se a observação do CI Queue será pelo running global ou por cadastro no Project Manager.
   - Usar `--config`, `--cwd` e `--state` explícitos.
   - Dizer que cancelar fecha apenas a prova visual; o ship ainda exige outro ticket `passed`.
8. **Eliminar as falsas Open Questions.** Manter aberta apenas decisão que muda produto: `full` substitui smoke ou não. As demais são escolhas de implementação já resolvidas pelo pedido/código.
9. **Reescrever o Grill Verdict.** O bloqueio não é “humano ainda não confirmou”. Antes disso, o documento está tecnicamente inconsistente.

## Nice-to-fix

- Tirar a seção de strings, salvo se uma copy real entrar no escopo.
- Substituir `coherence_proof` por uma matriz “invariante → código que impõe → teste”.
- Remover frases performáticas como “Reuse, don't fork” e “estripa”; trocar por critérios verificáveis.
- Separar registro de projeto (`state/projects.json`) de runtime pin (`runtimes.json`) para não sugerir que um habilita o outro.
- Marcar o ticket/screenshot como evidência operacional complementar; ticket id é mais forte que screenshot, mas não prova sozinho que o componente renderizou.

## What the analyst got right

- Separou corretamente `19c491a3f` direct-push do PR #1291.
- Encontrou o ratchet que proíbe o 13º `progress: true`.
- Diferenciou teste em tmp de job na fila instalada.
- Recuperou os comandos corretos e os dois controllers de ship.
- Não confundiu `runtime-probe` com proof de merge.
- Preservou o isolamento dos testes de produto: nenhum unit test deve escrever na fila live do operador.
- Não inventou UI, collector, segundo worker ou cutover DietFlow.
- Registrou com precisão que #10 e #1292 usaram merge manual fora do pack.
