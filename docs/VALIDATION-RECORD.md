# Registro de validações do consumidor

Pendências são informação. Não bloqueiam nem autorizam merge/ship, não compõem
elegibilidade e não executam testes. O usuário pede a execução em um chat; o
agente escolhe as capacidades disponíveis naquela sessão, local ou cloud.
Ausência de pedido, capacidade ausente e adiamento deliberado são motivos válidos.

## Owner e transporte

O consumidor possui um registro versionado. Cada agente escreve na sua worktree
e Git transporta o diff. A Queue lê a principal cadastrada do projeto, sem buscar
outra worktree se essa fonte falhar. Não há sincronizador com Actions, ledger
canônico oculto no state, autoexecução ou reconciliação pós-merge.

Um consumidor que já possui Markdown ou outro owner continua usando esse arquivo.
O plugin o lê pelo procedimento local. Para adotar a projeção JSON abaixo,
faça migração explícita: escolha um owner, reconcilie itens abertos e fechados,
preserve links/IDs históricos e transforme o registro anterior em ponteiro ou
histórico. Não mantenha duas listas editáveis. Esta mudança não migra o DietFlow.

## Opt-in estruturado v1

No `ci-queue.json` do consumidor, `validationRecord` é um path relativo à raiz
do repositório, por exemplo `docs/ci/validations.json`. Ele é apenas uma fonte
observacional do backend, não controle de execução. Campo/arquivo inválido não
recusa enqueue nem ship. O dashboard mantém a forma pública de `pending` e
`pendingError`; `pendingSource` informa a fonte e estado da leitura.

```json
{
  "kind": "ci-queue-validations",
  "schemaVersion": 1,
  "projectId": "example",
  "requirements": [
    {
      "id": "f066a6da-aab2-4b55-bc28-f0302cda11a0",
      "preset": "full",
      "headSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "scope": "catálogo integral, incluindo login real",
      "reason": "Não solicitado nesta entrega.",
      "createdAt": "2026-10-26T09:00:00Z"
    }
  ]
}
```

`projectId` coincide com `project.id`. ID é único no arquivo (1–128 caracteres
alfanuméricos, ponto, hífen ou underscore); preset segue `[a-z0-9-]`, até 64.
`headSha` é SHA completo lowercase, 40 ou 64 hex. Scope tem 1–2000 caracteres,
reason 1–500, timestamps declaram fuso. `pr` positivo é opcional e não é chave.
O helper só adiciona receitas declaradas; uma receita removida não apaga o item.
Não há argv ou comando executável no registro.

Cada obrigação nova recebe ID novo, inclusive na mesma PR. Motivos duplicados
podem coexistir. Edite apenas sua worktree, revise o diff e resolva conflitos Git
preservando os IDs das duas lanes. Não use um verde de preset para limpar a lista.

## Fechamento explícito

Uma resolução é metadado do item, com `fingerprint`, `headSha` da execução,
`scope`, referência textual `evidence` e `createdAt`. O agente deve ler a evidência
real e conferir o alcance; o arquivo não atesta que um teste aconteceu. Sem
evidência suficiente, conserve a pendência.

Fingerprint é SHA-256 UTF-8 de `JSON.stringify([id,preset,headSha,scope,reason,
createdAt,pr ?? null])`, sem espaços. A projeção reconhece fechamento somente
quando o fingerprint ainda corresponde e o scope da resolução é igual ao item.
Alterar revisão/escopo/motivo depois do fechamento deixa o item pendente. Um
fechamento de outra lane que observou bytes antigos não apaga uma obrigação nova.
Não refaça o fingerprint de uma resolução histórica sem nova reconciliação.

Isso protege identidade informacional, não introduz prova de merge ou validação
burocrática. IDs, fingerprints e erros de leitura nunca são gates. O helper não
executa receitas, publica status, sincroniza ou decide integração.

## Leituras e falhas

| Situação | Projeção |
|---|---|
| Sem opt-in | `unconfigured`; advisories legados permanecem disponíveis |
| Arquivo configurado ausente | `missing`, diagnóstico de ausência; não cria arquivo |
| Arquivo válido, sem abertos | `ready`, lista vazia |
| JSON/schema/path/identidade inválidos | `invalid`, diagnóstico; bytes preservados |
| Principal ou catálogo cadastrado indisponível | `unavailable`; não usa lane alternativa |

O backend usa os localizadores **cadastrados** de repositório/catálogo para essa
leitura, mesmo que outras views possam resolver worktree alternativa. Só uma
nova ação explícita de cadastro, relocação ou vínculo/desvínculo muda essa fonte.
O registry local conserva esses dois paths em `validationSource`; não copia o
registro nem seus itens. Em cadastros antigos, o bootstrap preserva os paths
existentes antes de recuperar os localizadores usados pelas outras views.
Quando o catálogo não declara `repository.path`, a raiz determinística é a
pasta do catálogo cadastrado, como na CLI; não a de um catálogo alternativo.
O record não pode escapar da raiz por path
absoluto, `..` ou symlink. Erros limitam a observabilidade desse registro.

Ao ativar `validationRecord`, a nova projeção não lê nem combina
`state/validation-plan.json`, não consulta verdes para quitar itens e não grava
no consumidor. O legado não é apagado. Migre-o explicitamente se contiver saldo
relevante; o plugin novo não chama o writer legado `advisory upsert`. Projetos
sem opt-in mantêm o contrato legado, inclusive sua projeção histórica por verde.

## Helper do plugin

O pacote contém `scripts/validation-record.mjs`, Node >=20, sem dependências do
repo do produto. Uso e comandos: [referência do pacote](../plugins/ci-queue/references/validations.md).
`init` pertence à adoção/configuração explícita. `list` nunca modifica. As outras
operações alteram somente o arquivo configurado na worktree selecionada. O lock
transitório `<arquivo>.lock` serializa writers da mesma worktree; não cruza Git.
Se uma interrupção deixar esse lock, confira operação/processo e bytes antes de
remover apenas esse lock. Não há reaper ou recuperação automática.
