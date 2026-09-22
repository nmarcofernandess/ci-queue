# Sondas da auditoria — alcance estrito

`git-observation-boundary.cjs`: excertos de git/readGitInfo, com chamadas ao processo substituídas por resultados determinísticos. Demonstra que status ilegível se torna string vazia e pode comparar igual a outro ilegível.

`frozen-base-boundary.cjs`: modelo mínimo da ordem/argumento observada em buildJobEnv/runJob. Demonstra que o objeto ainda sem preflight fornece base vazia, enquanto o registro posterior já tem B0.

Ambas se referem ao CQ `24d6a2b4`; o compare até `550409a9` confirma que runner/core não mudaram. **Não são cópias integrais do runner, não executam Git/receita/worker e não demonstram exploração de ship.** São complementos do diagnóstico estático, não testes oficiais de produto.

Para conferir os resultados sintéticos em um diretório com Node disponível:

```bash
node probes/git-observation-boundary.cjs
node probes/frozen-base-boundary.cjs
```

Esses scripts só escrevem seus próprios JSONs em `results/`, dentro deste pacote. Exit 0 confirma a reprodução do comportamento auditado, não a correção nem aprovação do produto. O corte C01 exige testes no owner real com filho e Git temporários.
