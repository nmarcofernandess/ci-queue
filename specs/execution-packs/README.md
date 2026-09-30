# ExecutionPack — backlog de lotes duráveis

**Decisão atual: não implementar.** A ideia permanece como spec viva, pausada, com análise atualizada; não como instrução operacional antiga nem como requisito para encerrar as Fases 4/5.

## Leitura

| Arquivo | Responsabilidade |
|---|---|
| [status.md](status.md) | Estado e autorização de retomada; fonte Superflow. |
| [handbook.md](handbook.md) | Memória curta: o que é, por que está em backlog e como não reabrir a discussão errada. |
| [PRD.md](PRD.md) | Problema, benefício condicional, escopo e critérios de produto. |
| [research/ANALYST.md](research/ANALYST.md) | Viabilidade, alternativas, fazer/não fazer, riscos e evidência que justificaria investimento. |
| [SPEC.md](SPEC.md) | Fronteiras e contratos candidatos; decisões necessárias antes de qualquer implementação. |
| [research/RASTREABILIDADE.md](research/RASTREABILIDADE.md) | Destino dos 20 tópicos do anexo, mudanças deliberadas e fontes atuais. |
| [Fonte recebida](research/ARQUITETURA-PACKS-CI-QUEUE.fonte-20260920.md) | Documento de 20/09 preservado integralmente, sem ganhar autoridade sobre esta revisão. |

O contrato atual do Superflow aceita apenas `pending | done`. Por isso o frontmatter permanece `pending`; **PAUSADO / BACKLOG** e a ausência de autorização estão no corpo. Não inventar enum `paused`, não marcar `done` por ter documentado a ideia e não criar um `plan.json` com tarefas executáveis enquanto a pausa vigorar.

Não há plano ativo. A sequência de eventual retomada está na SPEC e exige uma nova decisão do operador. Este cadastro não modifica o motor, a fila, o ship, o painel, instalação, testes ou a política do DietFlow.

## Recomendação operacional mantida

Sessão quente resolve preparação repetida; fila serializa tentativas; receita composta do consumidor pode executar A → B → C num ticket e parar após falha sem dispensar cleanup. Nenhuma dessas capacidades exige ExecutionPack.

ExecutionPack só passa a ser candidato a entrega quando **tickets independentes + intenção durável do conjunto** resolverem uma necessidade que esse caminho menor não atende. Nem uma sequência automática no ship é adotada por tabela: ela também traz responsabilidades de retomada, identidade e cancelamento.

A fotografia consultada distingue `dev`, PRs candidatas e instalação não observada. Ver [fontes](research/RASTREABILIDADE.md#fontes-e-procedência). Não assumir que uma PR draft foi mergeada nem que sua versão está instalada.
