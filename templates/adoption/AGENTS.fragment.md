## Testes e CI
Leia o [mapa do consumidor](.context/patterns/ci.yaml), resolvido desde a raiz do
repositório, e o owner declarado em `method` (default
`docs/ci/TESTING-METHOD.md`). Adapte esse ponteiro ao procedimento existente;
README, mapa e skill operacional devem apontar ao mesmo owner editável.

Os comandos do projeto permanecem executáveis diretamente. O consumidor escolhe
Queue para agendamento, serialização, logs, histórico e cancelamento quando útil
ou exigido pelo recurso. Feedback só existe com receita real declarada; não
representa prova final. Ao retomar uma execução enfileirada, confira seu ticket
antes de criar outro. Encerre somente os recursos próprios pelo comando do projeto.

Fechamento após tasks/reviews e retenção seguem esse owner consumidor; resultados
ficam no registro escolhido pelo projeto, sem plano concorrente. Referência genérica:
[método CI Queue](https://github.com/nmarcofernandess/ci-queue/blob/main/docs/TESTING-METHOD.md).
