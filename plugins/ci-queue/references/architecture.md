# Arquitetura estável

| Owner | Responsabilidade |
|---|---|
| Consumidor | Receitas/argv, preparação, testes, sessões, outputs, política de entrega e registros Git |
| CLI/config/enqueue | Validar pedido e congelar receita, cwd, flags e identidade no ticket |
| State da máquina | Fila, histórico, logs, progresso, registry e runtime; não é o ledger canônico do consumidor |
| Worker/runner | Claim serializado, supervisão, cancelamento e verificação de ownership; nunca merge |
| Finalização | Publicação pelo hook do consumidor, resultado e cleanup separados, recovery do mesmo ID |
| API/dashboard | Projeções de fatos, histórico e cadastro de projetos; progresso não decide elegibilidade |
| Ship | Controller separado; usa catálogo e prova elegível conforme política já existente |
| Plugin | Playbooks, leitura das fontes vivas e operações pedidas pelo usuário; nenhum processo residente |

O comando do consumidor permanece executável diretamente. Queue adiciona
agendamento e registros quando escolhida; execução direta pode publicar observação
opcional, sem fabricar ticket reutilizável de ship. O mapa do método é navegação,
o catálogo é a autoridade executável. Não infira intenção pelo nome da receita.

`ship.acceptedPresets` é OR; sem prova, o controller usa a primeira receita.
Vários checks obrigatórios exigem agregador real com propagação de falha.
Pendências não são insumo de ship. O plugin não adiciona prova/consentimento de
merge e não modifica os gates já definidos para alterar essa política.

Worker, Node do job e sessão têm identidades distintas; binding é opt-in.
Ownership exige a identidade real do processo, não só PID ou porta aberta.
Término de teste, finalização, outputs e limpeza são fatos separados. Fonte
histórica com cleanup incerto não exige provar uma máquina globalmente limpa.

Pendências novas pertencem ao Git do consumidor. Cada lane registra na própria
worktree, Git leva o diff e a Queue lê a principal cadastrada. Sem sincronizador,
autoexecução ou reconciliação pós-merge. Registro ausente/inválido não muda gates.
O state legado de advisories é preservado para compatibilidade, não é destino
do novo playbook nem fonte paralela depois de uma migração opt-in.

## Ship: capacidade e alcance de uma falha

Teste standalone não exige GitHub. Ship GitHub em `skipped` dispensa Actions,
não PR, acesso de merge ou prova elegível. O genérico já trata falha comum de
atestação como limitação não bloqueante nesse modo; em `wait`, ela bloqueia.
Leia [o contrato](https://github.com/nmarcofernandess/ci-queue/blob/dev/docs/CONTRACTS.md#publicação-opcional-não-é-bloqueio-global)
e o resultado terminal: publicação, prova e merge são fatos separados.
Não criar gate, pedir admin ou ampliar credencial a partir de um aviso opcional.
Preserve cancelamento, gates e restrições reais. Um ship próprio segue seu
contrato, não uma política importada por associação. Pausa de agente não se
torna decisão humana ou requisito permanente ao entrar num PLAN.
