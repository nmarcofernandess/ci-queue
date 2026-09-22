# Artefatos exatos que faltam — não reexecutar para recriar o passado

## Já obtidos; não solicitar de novo

Os arquivos versionados [queue-ticket](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/queue-ticket.json) e [execution-receipt](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/execution-receipt.json) do Full `20260919075127-addfb8a5` foram efetivamente lidos. Estão extraídos no pacote com fonte pinada. Os tempos dos54gates também foram obtidos. Não é necessário um ZIP dos dois repositórios inteiros para avançar.

## Ainda necessários no Mac

Root observado nos registros: `/Users/marcoantonio/.local/state/local-ci/queue` (reconfirmar antes de ler; não presumir que o root default do produto contém os mesmos dados).

### Full histórico

- `logs/20260919075127-addfb8a5.log`: stdout/stderr original, especialmente sumários Jest, Next build, Playwright, FlowUI e publicação.
- No cwd registrado `/Users/marcoantonio/dietflow-ap17-full-fixes/`: `test-results/results-local-stack-fast.json` e relatórios de outras invocações **que realmente existam naquele run**. Confirmar os nomes no log histórico; nomes atuais não provam o que o runner de19/09 escreveu.
- `artifacts/flowui-ci/` e manifest/relatório de `proof:care-downloads:aggregate` com timestamps/hashes. Localizar pelo stdout, não escolher “o mais recente” da pasta.
- JSON de resultado Jest, **somente se ele foi gerado**; caso contrário, conservar o sumário e marcar a ausência. Não prometer ranking por suíte do que não foi registrado.
- `artifacts/ci/runs/20260919075132-3fe53416-06a/receipt.json` já tem cópia versionada lida; pedir o local apenas para comparar hash/procedência, não como bloqueio obrigatório.

### Smokes e checks recentes

Para cada ID abaixo: `history/<ID>.json`, `logs/<ID>.log` e `artifacts/ci/runs/<executionId>/receipt.json` quando for DF. O executionId deve ser lido do ticket/log; **não derivar do ticketId**.

| ID | Papel |
|---|---|
| `20260915122336-527ad689` | Mac smoke31m09, comparação documental histórica |
| `20260914140623-ae35471d` | Mac smoke43m22, Jest skipped |
| `20260921115955-6e890b30` | Static DF da #1305 |
| `20260921121505-f0a9fe7e` | Smoke DF final da #1305 |
| `20260921115512-ccc7ede4` | Check CQ da #17 |
| `20260921133518-b846929f` | Check CQ da #18 |

Além desses, listar metadados dos **últimos cinco terminais por preset/projeto** em `static`, `smoketest`, `full`, `check` desde19/09. O recorte é limitado para descobrir se existe baseline mais novo; não exportar todo o state, não tocar running/claims e não inferir duração de PR/ID.

### Incidentes

- SIGSEGV: `history/20260919055151-8c2dd256.json`, `logs/20260919055151-8c2dd256.log`, relatório `/Users/marcoantonio/Library/Logs/DiagnosticReports/node-2026-09-19-034108.ips`; extrair assinatura, PID/nascimento, binário/UUID, sinal e instante. Fonte: [125](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/125-full-ap17-fixes/progress.md). Sem esse artefato, causalidade nativa é relato.
- ENOSPC: começar pelo ticket relatado `20260917222022-34ef8b6a` em history/logs. Precisamos de syscall/comando que falhou, path de destino, volume, horário, bytes livres e evidência de ownership. O inventário Q1 não tem esses campos. Se não constarem nos registros, marcar ausentes; **não reproduzir disco cheio**.
- J/K Cursor: receipts `artifacts/ci/runs/20260919100618-3bc8aced-4ae/receipt.json`, `20260919103351-a42ff523-2a7/receipt.json`, logs de Next e métricas já preservadas. A VM antiga pode não existir. Fonte: [diagnóstico](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md). Sua ausência não impede os cortes Static/CQ.
- Cursor15/09: receipts `20260915173444-846cd2dd-b90`, `20260915180516-30769bb9-a42` sob `artifacts/ci/runs/`; `/tmp/cloud-ci/full-clean.log`, quando preservado. Não usar a cópia atual de `/tmp` de outro run.

## Proveniência e recursos — dados novos não reconstituem estado histórico

Em janela sem job pesado, leitura de `ci-queue version --json`, status e `/build.json`, caminhos/manifest da instalação, Node/V8/npm/binários efetivos. Usar allowlist; não exportar `env`, `.env`, tokens ou registros clínicos.

Para próxima amostra: cache paths/hashes/presença por camada (TS, Prisma, Next, Jest, Storybook, browser); configurações efetivas dos workers; seed/migrations/versão de imagem do banco; Colima CPU/memória do perfil ativo; RSS/heap por PID associado, swap e diskfree durante a receita, não só antes/depois. No inventário Q1, informar bytes lógicos e físicos separadamente, metodologia e sobreposição de paths. Não confundir somas lógicas de worktrees com espaço físico recuperável.

## Entrega da coleta

ZIP pequeno com `PROVENIENCIA.md`, índice de amostras, receipts originais permitidos e extratos de logs redigidos com linha/instante; SHA-256 dos arquivos preservados. Informar cobertura/integralidade dos extratos. Não substituir arquivo ausente por JSON feito à mão. Não chamar a extração deste pacote de receipt original.

Não incluir fontes de produto completas, node_modules, .next, banco/dumps, arquivos de pacientes ou logs globais. Não instalar, alterar LaunchAgents, parar serviços, limpar state ou produzir novos tickets para suprir artefatos históricos faltantes.
