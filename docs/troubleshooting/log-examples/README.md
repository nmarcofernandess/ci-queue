# Exemplos de logs

Esta pasta guarda recortes sanitizados de logs reais observados enquanto o CI
Queue acompanhava receitas do DietFlow. Ela existe para investigação, contexto
e onboarding de quem opera ou integra a ferramenta.

Também guarda o `CI-QUEUE-VERDADE.tsv`: o inventário reconciliado das decisões,
contratos, defeitos, evidências e exclusões que encerraram a convergência da
Spec 121 em 15/09/2026. Ele é histórico de decisão compartilhável; a fonte
operacional atual continua sendo os contratos e o código deste repositório.

Os arquivos não são fixtures, testes, contratos de saída ou prova do estado
atual de uma máquina. Um recorte mostra apenas o sintoma registrado; não prova
a causa raiz nem autoriza uma correção automática.

## Como usar

1. Localize o sinal que se parece com o problema atual.
2. Consulte o registro, diagnóstico e contexto do ticket real antes de concluir
   que é o mesmo caso.
3. Preserve os logs completos no state root da instalação; não os copie para
   este repositório sem curadoria.

Os exemplos substituem IDs de processo, caminhos locais, nomes de worktree e
arquivos efêmeros por marcadores como `<pid>`, `<checkout>` e `<tmp>`. Nunca
adicione tokens, credenciais, dados pessoais, caminhos pessoais completos ou
o conteúdo bruto de uma execução.

| Arquivo | Sinal observado | O que ele ajuda a investigar |
| --- | --- | --- |
| `jest-worker-sigsegv.log` | worker Jest terminou com `SIGSEGV` | falha do processo, não um assertion failure comum |
| `storage-enospc.log` | `ENOSPC` ao gravar build ou artefato | espaço esgotado e limpeza/capacidade do executor |
| `supervisor-lost.log` | job marcado como `interrupted` | perda de supervisão, distinta de falha do teste |
| `CI-QUEUE-VERDADE.tsv` | decisões e evidências da convergência | contexto para investigação e planejamento, sem substituir o código atual |
