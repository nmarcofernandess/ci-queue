# Operar o registro versionado

Owner vivo do formato e da projeção: `docs/VALIDATION-RECORD.md` na
[fonte oficial selecionada](https://github.com/nmarcofernandess/ci-queue/blob/dev/plugins/ci-queue/references/sources.md). Esta referência ensina somente o helper
embarcado. Não serve para migrar automaticamente um ledger Markdown existente.

O helper é opcional e requer Node >=20 e uma cópia do pacote materializada no
filesystem. Confirme seu caminho real antes de definir `PLUGIN`; uma URI
`skill://` não é evidência de arquivos locais. Sem essa cópia, leia/edite o registro
com as ferramentas de arquivos disponíveis seguindo o contrato vivo do consumidor,
ou informe a capacidade ausente. Não baixe/execute scripts só para consultar.
`PROJECT` é a raiz da worktree consumidora selecionada. Os comandos abaixo se
aplicam somente depois de confirmar `PLUGIN` e o pedido de escrita correspondente.

Na adoção/configuração explicitamente solicitada, edite o catálogo para declarar
`"validationRecord": "docs/ci/validations.json"` e revise o diff. Depois:

```sh
node "$PLUGIN/scripts/validation-record.mjs" init --cwd "$PROJECT"
node "$PLUGIN/scripts/validation-record.mjs" list --cwd "$PROJECT"
```

List distingue `unconfigured`, `missing` e `ready`; erro de leitura/schema retorna
`ok:false`, não vazio válido. Init não sobrescreve arquivo. Status não chama init.

Registrar não executa a receita:

```sh
node "$PLUGIN/scripts/validation-record.mjs" add --cwd "$PROJECT" \
  --preset full --head-sha "$HEAD_SHA" \
  --scope 'catálogo integral, incluindo login real' \
  --reason 'Não solicitado nesta entrega.'
```

`--pr N` é opcional. Cada chamada cria ID independente, mesmo com motivo repetido.
Conserve o resultado e o diff na própria lane. O helper não grava state da Queue.

Depois de execução **pedida pelo usuário**, ou reconciliação explicitamente
pedida com evidência já existente, leia list e a evidência real. Copie ID,
fingerprint e scope do item observado; confira revisão e alcance antes de fechar:

```sh
node "$PLUGIN/scripts/validation-record.mjs" resolve --cwd "$PROJECT" \
  --id "$ID" --expected "$FINGERPRINT" --head-sha "$TESTED_SHA" \
  --scope 'catálogo integral, incluindo login real' \
  --evidence 'ticket 20261026-example; docs/proofs/full.md'
```

O helper recusa fingerprint/escopo divergentes e preserva o arquivo. Essa recusa
limita apenas a edição de fechamento: nenhuma atividade, merge ou ship depende
dela. Nova obrigação usa ID novo; modificação de conteúdo invalida fechamento
anterior na projeção. Não remova os outros motivos porque o preset passou.

O script aceita somente dados e não possui comando de execução. Para executar a
receita solicitada, use o catálogo e localize `ci-queue:operate` pelo catálogo do host.
Ausência de capacidade/pedido e adiamento são motivos válidos. Resíduos de lock
transitório não são ledger nem autorização para matar processo; verifique o dono.
