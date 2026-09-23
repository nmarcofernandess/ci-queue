# CI Queue: packs dinâmicos, testes focados e adoção progressiva

**Documento de arquitetura para decisão.** 20/09/2026. Não é implementação, autorização de instalação ou alteração da política do DietFlow.

**Bases consultadas:** CI Queue `dev@97a0eb4b00fbdfbac8909ab43467a288d14aeaff`; DietFlow `dev@180ee2bc4891e0d439e6330dbf81c4be5b36fff2`.

**Legenda:** “Atual” descreve código consultado. “Decisão proposta” descreve a evolução recomendada. Os comandos novos estão identificados como proposta e não devem ser tratados como comandos disponíveis.

## 1. Decisão executiva

Adicionar ao CI Queue um **lote de execução**, chamado aqui de `ExecutionPack`: um pedido durável contendo uma lista de receitas existentes. O lote não é um teste, não tem um comando que executa todos os comandos e não substitui os tickets dos membros.

A experiência pretendida é: **escolher um ou vários comandos, enviar uma vez e acompanhar cada execução separadamente**. A máquina continua trabalhando quando o terminal que enviou o pedido fecha. O usuário não precisa escrever um adapter, um classificador de diff, um emissor de progresso ou um manifesto de dependências para usar isso.

A organização recomendada dos testes é outra camada: **um runner reutilizável por família, seletores de escopo e fixtures do framework**. O CI Queue não precisa conhecer Next.js, banco, paciente, warehouse ou login para funcionar.

```text
SELEÇÃO                  EXECUÇÃO                  AMBIENTE DO TESTE
operador ou política     CI Queue                  projeto / framework

quais receitas?    ->    pack de 1..N receitas ->   runner existente
por qual motivo?         tickets independentes     prepara -> testa -> limpa
aviso ou obrigação?      worker único              fixtures sob demanda
```

Não há receita obrigatória universal. `full`, `smoketest`, `unit` ou `pricing-proof` são nomes particulares dos consumidores. Um pack solicitado somente com `pricing-proof` executa somente essa receita. Isso não altera, por consequência, a política de merge de um consumidor que ainda exige outras provas.

**Primeira entrega recomendada:** packs manuais, duráveis e observáveis, com execução serial e interrupção dos membros restantes em caso de falha. Classificação por diff e integração de múltiplas provas no ship vêm depois, como adesões explícitas. Nenhum cutover do DietFlow é pré-requisito.

## 2. O que já existe e o que falta

| Área | Atual, confirmado no código | Consequência arquitetural |
|---|---|---|
| Comando independente | Catálogo resolve `presets[nome].argv`; CLI executa enqueue de uma receita. [S01][S02] | Não exigir SDK de testes ou adapter para aderir. |
| Worker | `runWorker` adquire um lock, reclama um ticket, chama `runJob` e continua drenando a fila. [S03] | Reusar o executor; pack acrescenta coordenação, não outro runner. |
| Progresso | Nós possuem `id`, `parentId`, kind, status e duração opcional. [S04][S05] | Não modificar TSV para inventar um nó de tipo `pack`. |
| Expansão visual | `ProgressNodeRow` usa `Collapsible` e chama a si próprio para os filhos. [S06] | Já há expansão recursiva dentro de um ticket. |
| Drawer | A superfície atual consulta um job e renderiza sua árvore ou o aviso correspondente. [S07] | Falta agrupamento entre jobs; árvore interna pode ser reaproveitada. |
| Ship genérico | `acceptedPresets` é alternativa entre receitas; valida argv, flags, projeto, cwd e snapshots Git. [S02][S08] | Não reinterpretar uma lista OR como lista AND. |
| Adoção | Há quickstart, HTML offline, contratos, instalação e orientações para AGENTS/skill. [S09] | Evoluir a porta existente, não criar uma segunda documentação de entrada. |
| DietFlow focado | `e2e-impact.ts` seleciona grupos, expande dependências e chama uma sessão do runner E2E existente. [S10][S11] | Existe precedente real de seleção flexível sem copiar setup/teardown. |
| DietFlow Full | `full-local.sh` rejeita narrowing; executa Static, Jest amplo, E2E ativo, FlowUI opcional no script e agregação Care. [S12] | Não chamar execução parcial de “Full custom”. |

**Não existe pack operacional no contrato consultado.** O schema tem tickets e contexto de solicitação, mas não o ciclo de vida proposto para um conjunto de tickets. `requestContext.packageId` é contexto do chamador, não prova de que existe agrupamento executável, atomicidade ou cancelamento coletivo. [S01][S04]

A leitura do código da árvore confirma viabilidade de composição visual, não comprova performance de milhares de nós ou uma interface de packs já pronta. Não houve teste do Vite instalado nesta análise.

## 3. Vocabulário mínimo, sem colisões

| Termo | Significado | Quem possui |
|---|---|---|
| Receita | Um comando executável com a configuração que já existe no catálogo. Pode ter seleção interna legítima. | Consumidor |
| Ticket | Uma execução concreta de uma receita, com resultado, log e artefatos. | CI Queue |
| Pack de execução | Pedido que agrupa 1..N receitas e relaciona suas execuções. Não tem `argv` próprio. | CI Queue |
| Runner de família | Entrada compartilhada que prepara o ambiente, executa testes selecionados e limpa o que possui. | Consumidor / framework |
| Plano de verificação | Decisão sobre o que aquele trabalho exige ou recomenda; pode produzir um pack. | Política do consumidor |
| Proof pack de evidência | Artefatos publicados, como HTML, screenshots e manifest. Não é o lote que os produziu. | Consumidor |

Usar `ExecutionPack` internamente evita confundir a nova entidade com os proof packs de evidência já existentes no DietFlow. O publicador de Export Atlas, por exemplo, já usa `ProofPackManifest`, execução de origem e inspeção de snapshots. Não renomear nem reaproveitar esse contrato para agendar jobs. [S13]

**Hierarquia visual não é dependência operacional.** Um teste aparecer debaixo de outro agrupamento não significa que precisa executar aquele teste antes. Reusar uma fixture de paciente não exige executar os asserts da Anamnese.

## 4. Experiência do usuário: quatro degraus, nenhum obrigatório para o anterior

### Degrau 0: continuar usando um comando

O comportamento atual continua disponível:

```bash
# Comando existente. Pressupõe receita cadastrada e máquina preparada.
ci-queue enqueue unit --wait
```

O usuário precisa apenas de um comando real que funcione no seu projeto e de uma receita apontando para ele. Progresso detalhado, packs e políticas não participam desse mínimo.

### Degrau 1: pedir um conjunto uma única vez

```bash
# PROPOSTA de CLI, ainda inexistente.
ci-queue pack run unit pricing-proof accessibility --wait
```

Os nomes são exemplos de receitas de um terceiro projeto. O usuário não dá nome ao conjunto, não escreve JSON para cada execução e não instala outro serviço. O sistema gera o identificador e um título factual. Label opcional não é identidade.

Antes de aceitar o pedido, a CLI confere todas as receitas, mostra o que será executado e rejeita erro de configuração sem iniciar um subconjunto acidental.

### Degrau 2: saber o que foi afetado

Uma função de inspeção pode recomendar receitas a partir de regras simples do projeto. A saída explica os arquivos considerados, regras aplicadas, receitas sugeridas, lacunas e comandos possíveis. Ela não começa testes apenas porque foi consultada.

Quem já tem seletor nativo continua usando-o. Quem não tem não precisa implementar um. Um humano ou agente pode escolher explicitamente as receitas e usar o degrau 1.

### Degrau 3: deixar a política coordenar o ship

Somente após adesão explícita, o ship usa um plano de requisitos em vez de uma única alternativa do catálogo. Ele solicita o pack necessário, aguarda evidências e revalida antes do merge.

**Instalar uma versão nova não migra ninguém automaticamente para este degrau.** O ship atual do DietFlow e seu caminho Cloud/direct permanecem como estão até uma mudança própria do consumidor.

## 5. Pack: enviado inteiro, executado membro por membro

### Decisão proposta

Aceitar o conjunto em uma operação durável e executar com o worker único. Todos os membros ficam visíveis desde a aceitação. Eles não dependem de um agente permanecer em um loop `enqueue -> wait -> enqueue`.

```text
Um pedido aceito
Pack P: [A, B, C]
       |
       +-- A: aguardando
       +-- B: aguardando
       +-- C: aguardando

Worker único
 A -> passed -> B -> failed
                    |
                    +-- C: não iniciado por falha anterior
```

O pack ocupa uma posição lógica na fila; os membros seguem a ordem declarada, sem concorrência entre eles. A versão inicial termina esse bloco antes de passar ao próximo item da fila. Não adicionar prioridades, fairness por projeto ou preempção nesta entrega. Essa escolha permite uma espera longa atrás de um pack grande; a interface deve mostrar seus membros, e o operador pode cancelar o restante.

Os tickets independentes já na fila continuam independentes. Uma falha em P não cancela outro pack nem um pedido avulso. Cleanup inseguro é diferente: a proteção existente da máquina pode impedir qualquer próximo job.

### Registros e atomicidade

O conjunto deve ser publicado por um único registro de entrada de fila, tipado como pack. Esse registro contém o snapshot das receitas e identidades dos membros. Ele é escrito fora da área observada e publicado por renomeação atômica no mesmo filesystem, usando o padrão de escrita do produto.

Não publicar seis arquivos de job e considerar o pack pronto no terceiro. Não criar ticket “pack” fingindo que executou um programa.

Ao selecionar um membro, o worker materializa e persiste seu **ticket normal** antes do subprocesso. A identidade do ticket deve ser determinística a partir do membro ou previamente reservada no registro: recuperar a operação após falha não pode criar uma execução duplicada por perder um cursor.

O registro conserva o pedido imutável: ordem, receitas resolvidas, argv/flags e contexto de origem. O snapshot não substitui a revalidação de admissão de cada membro. Em um pack de verificação pinado, HEAD/base precisam continuar iguais ao alvo antes de cada execução; base movida não pode ser recapturada silenciosamente no meio do lote. Um pack diagnóstico mantém as flags das suas receitas e não ganha garantia de árvore limpa ou de prova material por estar agrupado. O progresso operacional é derivado dos tickets e de decisões explícitas de cancelamento/interrupção. Um cursor persistido pode ajudar, mas não é autoridade superior a um histórico terminal já gravado.

A entrada do pack permanece recuperável enquanto há trabalho pendente. O mesmo mecanismo de ativação precisa observá-la, inclusive após morte do worker; não depender de surgir outro enqueue para acordar um lote abandonado. O layout físico exato deve preservar claims/recovery atuais e ser fechado no Build depois de testes de falha, não por um segundo daemon. Escrita atômica evita publicação parcial; resistência a queda de energia exige também a política de flush/fsync apropriada. Não prometer essa durabilidade apenas porque foi usado rename.

### Estados sem resultados inventados

| Situação | Registro correto |
|---|---|
| Membro realmente executou | Ticket normal com resultado real. |
| Membro não iniciou por falha anterior | Estado do membro `not-run`, motivo `previous-failure`; não fabricar ticket `passed`, nem caso `skipped`. |
| Usuário cancelou | Cancelar o membro ativo pela primitiva existente; impedir novos membros; anteriores continuam intactos. |
| Chamador perdeu conexão ou `--wait` expirou | O pedido durável continua. Timeout de espera não é cancelamento. |
| Worker morreu durante um membro | Reconciliar processo e registrar interrupção pelas regras atuais. Não adotar execução incerta nem repetir automaticamente. |
| Histórico terminal existe, mas houve queda antes de avançar | Reconciliar o membro pelo histórico; não executar novamente. |
| Configuração inválida antes da aceitação | Nenhum membro começa. |

**Default: parar o pack no primeiro membro não aprovado.** Depois de uma interrupção, não executar o restante automaticamente. Uma nova tentativa explícita pode relacionar o pack anterior, sem apagar a história.

Um eventual modo diagnóstico “continuar após falha” só continua após cleanup seguro, mantém o pack vermelho e não altera o que o ship considera elegível. Não é necessário implementá-lo na primeira versão.

### Escopo deliberadamente pequeno

Primeira versão: um projeto, um cwd, uma máquina, uma lista plana e ordem explícita. Sem pack dentro de pack, DAG, dependência entre jobs, serviços persistentes compartilhados ou normalização automática de cobertura. A interface pode ter vários níveis mesmo assim: **pack -> ticket -> nós já existentes do ticket**.

## 6. Separar resultado de execução e elegibilidade de prova

“Terminou verde” e “serve para autorizar este merge” continuam perguntas diferentes.

No comando manual `pack run`, o padrão é executar o que foi solicitado. Não ativar cache/reuso silencioso em nome de uma otimização. Esse padrão também permite packs diagnósticos cujas receitas aceitam working tree suja.

Na integração futura com ship, o **controlador de ship** pode satisfazer requisitos com tickets anteriores que passem seu predicado. Ele registra referências às evidências reaproveitadas e só solicita as execuções faltantes. O worker não importa `src/ship`, não escolhe política de merge e não publica atestação. As alternativas OR são resolvidas pelo controlador antes da execução; o pack executa uma lista concreta e não resolve expressões booleanas.

```text
plano de requisitos
       |
       +-- evidências já elegíveis -> referências preservadas
       |
       +-- execuções faltantes ----> ExecutionPack
                                         |
                                  tickets terminais
                                         |
                              ship revalida o conjunto
```

Um ticket reaproveitado não ganha cópia com um novo verde. Seu ID e proveniência permanecem os originais. O novo pack não se apropria do cancelamento de uma execução que pertence a outro pedido.

Para prova de ship, revalidar cada evidência contra a receita e o alvo esperado, preservando as garantias atuais de identidade, cwd, HEAD, base, flags e tentativa canônica mais recente. Progress não participa. O predicado atual é referência de comportamento; não deve ser copiado para dentro do worker. [S08]

Não reaproveitar automaticamente por “mudou só documentação”, timestamps ou semelhança de nome. Reuso entre HEADs diferentes ou baseado em hash parcial de conteúdo é uma feature separada e fica fora.

**Packs vazios:** não criar uma execução fictícia `passed`. Na seleção manual, zero membros é erro de uso. Na política de ship, uma decisão explícita de que nenhuma prova é exigida pode ser válida; deve aparecer como dispensa justificada pelo consumidor, não teste executado.

## 7. UI: expandir sem transformar o painel em outro produto

### O que podemos reutilizar

A árvore existente é recursiva e já compõe `Collapsible`, `Item`, `StatusIndicator` e duração. [S06] O drawer distingue árvore, declaração ausente e declaração sem emissão. [S07]

### Composição proposta

```text
v Verificação do projeto / Pack P          2/3 execuções concluídas
  > unit                                  passou
  v pricing-e2e                           executando
    > Preparação                          passou
    v Playwright                          executando
      v Preços
        ✓ permite desconto autorizado
        ● rejeita desconto acima do limite
    > Limpeza                             aguardando
  > accessibility                         aguardando
```

O header de pack e as linhas de membros são uma composição sobre os **tickets reais**. Ao abrir um membro, carregar sua árvore existente. O `jobStatus` usado para renderizar os nós é o status daquele ticket, não o do pack.

Não concatenar os TSVs de seis jobs em um sidecar comum. IDs como `static` ou `jest` podem existir em vários tickets. Manter cada árvore no namespace do seu ticket; o agrupamento externo usa IDs de membros. Não inventar tipos `pack` e `ticket` no protocolo de progresso dos testes.

### Regras de custo e legibilidade

- Carregar detalhe de filhos sob demanda. O resumo do pack não precisa buscar todos os logs e todas as árvores a cada polling.
- Respeitar abertura/fechamento escolhido pelo usuário. Default aberto para contexto relevante não deve disputar com o operador a cada atualização.
- Contar execuções no pack, casos dentro da suíte. “2/6 receitas” não se mistura com “87/200 asserts”.
- Resultado e duração vêm da camada correspondente. Ausência de duração não é zero; duração do pack não é soma dos testes, e reuso não é tempo de CPU gasto novamente.
- O pack é agrupamento, não mais um teste nas estatísticas. Execução atual continua mostrando o ticket realmente em curso. Fila/ocupação continuam globais; histórico e contexto continuam por projeto.
- Sem progresso instrumentado: ainda existem membros, tickets, resultado e log. Dentro do membro, preservar o aviso atual. Não esconder o lote nem reprovar o ticket por isso.

Não prometer “aninhamento infinito”. O componente suporta recursão, mas volume, ciclos e profundidade precisam de defesa no adaptador visual. Limitar/cortar uma árvore malformada deve degradar a observação, nunca inventar resultado. Não há necessidade de virtualizador novo antes de medir o volume real.

## 8. O antes/depois do ship não é o antes/depois do teste

Há dois envelopes com responsabilidades diferentes:

```text
SHIP / FILA                         RUNNER DO CONSUMIDOR

identidade + HEAD/base               ambiente de testes
árvore e configuração                Next / banco / browser
processo + prazo + log               login / fixtures / isolamento
revalidação Git                      assertions reais
merge autorizado                    teardown dos recursos criados
```

O envelope do ship não sabe preparar um paciente com cálculo nem qual schema de teste subir. Repetir essa informação em tags no runtime do CI Queue criaria uma segunda fonte de verdade e colocaria o custo de manutenção em todos os usuários.

**Decisão:** a receita aponta para uma entrada já executável do consumidor. Essa entrada sabe obter o ambiente necessário chamando os donos existentes. Não precisa conter uma cópia literal deles.

“Autocontido” significa **iniciável sozinho através de sua entrada documentada**, não “carrega um Docker Compose, seed, servidor e cleanup próprios em cada arquivo”.

## 9. Pattern principal: runner por família, seleção por escopo, fixtures por necessidade

### Estrutura recomendada, não exigida pelo CI Queue

```text
projeto/
  scripts/test/e2e.*           <- prepara ambiente e chama Playwright
  e2e/fixtures/               <- sessão/dados com setup e teardown
  e2e/calculo/                <- comportamento de Cálculo
  e2e/anamnese/               <- comportamento de Anamnese
  ci-queue.json               <- entradas macro executáveis
```

Um comando de família recebe um arquivo, diretório ou grupo. A mesma entrada pode ser usada em execução focada e ampla. Não é preciso escrever `calculo-with-next-and-db.sh`, `anamnese-with-next-and-db.sh` e suas cópias futuras.

```text
entrada focada: e2e Cálculo
        |
runner E2E compartilhado
        |
        +-- prepara servidor/banco que possui
        +-- runner nativo seleciona specs de Cálculo
        +-- fixtures fornecem sessão/paciente/dados necessários
        +-- assertions de Cálculo
        +-- cleanup dos recursos próprios

Não executa os testes de Anamnese para conseguir criar um paciente.
```

Playwright já possui fixtures compostas e sob demanda, com scopes de teste e worker; oferece também `webServer` e dependências de projetos. A recomendação é usar esses mecanismos quando resolvem o caso, não criar equivalentes dentro do CI Queue. [S14][S15][S16]

Uma fixture que precisa de outra fixture é uma dependência de ambiente/dados. Uma jornada que testa Cálculo depois de Anamnese por motivo de produto é um teste de integração diferente. Não fundir os conceitos.

### Contrato operacional do runner de família

1. Recebe escopo explícito e valida que ele realmente seleciona os arquivos pretendidos.
2. Prepara somente capacidades necessárias; registra ambiente/target e recusa alvo incompatível.
3. Testes não dependem da ordem de execução de arquivos irmãos ou de resíduos de outro job.
4. Mantém setup e teardown sob o mesmo owner. Limpa somente o que criou.
5. Propaga exit code e falhas de preparação/limpeza. Não converte “nenhum teste encontrado” em êxito para um escopo obrigatório.
6. Registra resultados nativos e, quando útil, o escopo executado. Progresso visual é opcional.

No DietFlow, seguir factories/cenários e runners existentes. Não criar dados clínicos sintéticos alternativos nem abrir navegador de uma lane alheia para substituir esses contratos.

## 10. Quando juntar execuções em uma única sessão faz sentido

Minha recomendação anterior de que toda agregação executável seria necessariamente ruim foi ampla demais. **Um runner de família parametrizável é uma composição legítima.** O problema é criar um executor genérico concorrente, duplicar o pai ou esconder as garantias dos filhos.

| Situação | Escolha recomendada |
|---|---|
| Comandos independentes, donos e resultados distintos | Tickets separados no ExecutionPack. |
| Vários arquivos E2E do mesmo ambiente e runner | Uma invocação nativa com seleção explícita, com casos visíveis na árvore e relatório. |
| Regenerador de screenshots e auditoria independente | Receitas separadas; não supor que compartilham lifecycle. |
| Mesmo setup caro repetido, custo já medido | Considerar uma sessão por família no consumidor; não pool genérico de Next no CI Queue. |
| Comando monolítico já funciona e o usuário só quer enfileirá-lo | Aceitar como receita normal. Não exigir refactor. |

Exemplo de destino:

```text
ExecutionPack
  ├── unit-related             ticket 1
  ├── e2e-affected              ticket 2
  │     ├── prepara stack uma vez
  │     ├── Cálculo / casos selecionados
  │     ├── Agenda / casos selecionados
  │     └── cleanup
  └── export-proof-verify       ticket 3
```

Não há combinação de nomes do tipo `full-plus-seis-proofs`. Há uma receita de família com **seleção variável**, mais outras receitas independentes.

**Trade-off explícito:** em uma sessão compartilhada, cada caso pode ter resultado próprio, mas não ganha ticket próprio. A granularidade de cancelamento, histórico e reuso da fila é a da sessão. Não prometer simultaneamente setup único e total independência dos membros sem implementar outra camada de lifecycle.

Portanto, começar com tickets macro separados. Juntar apenas o que já é naturalmente uma família ou cuja economia tenha sido medida. Não coalescer automaticamente duas receitas por ambas terem “e2e” no nome.

## 11. O que o DietFlow já oferece para esse pattern

`e2e-impact.ts` já implementa parte dessa organização: catálogo de grupos; seleção por paths ou grupos explícitos; expansão de dependências; deduplicação de specs; relatório; uma chamada ao `e2e-local-stack.sh`. O contrato se chama `partial-not-full`. [S10]

O catálogo observado contém `foundation-auth`, `agenda` e `prescricao`. Isso não é mapa completo do produto. Os testes verificam expansão transitiva e paths materiais sem cobertura; o seletor relata `fallbackFullRequired` e a execução recusa escopo material desconhecido. Não enfileira Full automaticamente. [S10][S11][S17]

O runner E2E já pode criar contexto próprio ou receber o contexto de execução do pai, e distingue ownership do receipt. É um precedente útil para reuso sem duplicação, não autorização para compartilhar stack arbitrariamente entre tickets. [S18]

Comandos existentes de inspeção, na lane preparada, sem iniciar E2E:

```bash
npm run ci:e2e:impact -- --list
npm run ci:e2e:impact -- --base-ref origin/dev --dry-run
```

O segundo lê a referência local. Atualizar refs é uma ação Git separada; o resultado só corresponde à base realmente observada. O dry-run imprime seleção, inclusive lacunas; não equivale a teste passado.

**Não refazer esse seletor dentro do CI Queue.** No piloto, enfileirar sua receita existente quando o operador a escolher. Ampliar grupos/paths/fixtures do DietFlow é trabalho próprio do consumidor. Não trocar `full` por `e2e-impact` na prova material existente.

## 12. Identificação por diff: conveniência opcional, não sistema de tags

### Adoção inicial

Nenhuma metadata de impacto é obrigatória. Nome da receita e comando resolvido já permitem executar. Uma `note` humana pode explicar o propósito; ela não autoriza execução, cache ou merge.

Para quem quer automatizar seleção, oferecer um caminho simples e documentado: **regras por paths que sugerem receitas macro**. Sem anotar cada teste, fixture, serviço ou função do produto.

Exemplo didático de política futura:

| Regra | Paths | Receita | Ação | Obrigatória no ship? |
|---|---|---|---|---|
| preços | `src/pricing/**` | `pricing-proof` | pending | sim |
| interface | `src/ui/**` | `accessibility` | warn | não |
| persistência | `db/**` | `db-contract` | enqueue | sim |

A configuração avançada deve permanecer versionada no projeto. O CI Queue pode avaliar o matching genérico e apresentar o resultado; não precisa saber por que preço exige tal proof. Não embutir regras do DietFlow na distribuição.

### Duas decisões, não uma tag ambígua

- **Ação operacional:** `warn`, `pending` ou `enqueue`.
- **Obrigação de prova:** necessária ou apenas recomendada para a política do trabalho.

“Enfileirar” não significa por si só “autoriza merge”; “pendente” não significa por si só “bloqueia merge”. A interface e o JSON mostram os dois eixos. Obrigação não pode ser removida pela IA só para desbloquear o fluxo. Na aplicação por ship, manter recomendações opcionais fora do lote fail-fast das provas obrigatórias: uma recomendação que falha não pode impedir as provas necessárias de começar. Uma execução opcional pedida pelo operador continua sendo um pedido independente; o seu vermelho não vira verde, apenas não participa do predicado obrigatório.

Inspecionar uma regra `enqueue` não dispara nada. A execução automática ocorre apenas dentro de uma operação autorizada que aplica a política, como um ship explicitamente solicitado. Não criar watcher que inicia testes a cada arquivo salvo.

### Limites que evitam falsa segurança

Mudanças em dependências compartilhadas, configurações de teste, schema, fixtures e runners precisam de regras mais amplas no consumidor. Renomes e deleções não podem simplesmente sumir do diff. **Path não mapeado é “cobertura desconhecida”, não “nada precisa rodar”.** O consumidor escolhe uma receita conservadora ou pede decisão; o genérico não escolhe um inexistente `full`.

Quem já possui Jest relacionado, `e2e-impact` ou outro resolvedor usa essa fonte; não duplica seu mapa no catálogo do CI Queue. Jest possui `--findRelatedTests`, mas isso não descobre quais screenshots de produto precisam ser regenerados. [S19]

Regras simples bastam para a maioria dos primeiros casos. Integração com um resolvedor externo pode vir depois: resultado estruturado, timeout, revisão, escopo e lacunas explícitos. **Não exigir plugin por projeto para a versão básica funcionar.**

## 13. Identidade de seleção dinâmica e cobertura

Uma receita pode legitimamente selecionar um subconjunto sem mudar de nome, desde que seu nome e contrato descrevam essa seleção: `e2e-affected`, por exemplo, não promete E2E completo.

É preciso distinguir:

```text
comando da receita            como o trabalho é iniciado
seleção resolvida             o que esta execução pretende cobrir
resultado observado          o que realmente executou e como terminou
```

Na versão inicial de packs, membros são nomes do catálogo, sem novos overrides arbitrários de argv. Receitas dinâmicas existentes continuam selecionando internamente como hoje.

Quando a seleção passa a vir de fora do comando e pretende satisfazer ship, é necessário acrescentar um contrato explícito: seleção normalizada e sua proveniência ficam pinadas no pedido, e o runner verifica o escopo efetivamente executado. Até esse contrato existir, um argv customizado continua customizado; não recebe permissão de provar uma receita canônica só por estar em um pack.

Para reuso de prova dinâmica, o consumidor precisa demonstrar que a identidade inclui os inputs que mudam sua cobertura. Mesmo HEAD/base não basta se uma seleção externa ou env altera o conjunto sem registro. Sem informação suficiente, executar novamente ou recusar reuso, nunca adivinhar equivalência.

O CI Queue não infere relações `covers` pelo nome, tempo de execução ou quantidade de casos. “Full cobre smoke” é uma decisão da política DietFlow. “Este E2E exercita Export” não demonstra que o atlas publicado foi regenerado.

## 14. Regenerar proofs sem destruir a validade do ship

Este é um ponto crítico da evolução desejada. **Gerar artefatos versionados e verificar um HEAD final são fases diferentes.**

```text
código alterado
     |
pack de preparação: gerar proofs necessários
     |
revisar resultados e publicar os artefatos no Git
     |
commit final H + PR publicado
     |
pack de verificação: testes + validadores necessários
     |
ship revalida H/base e integra
```

Geradores podem produzir alterações em arquivos versionados; essas execuções não devem falsificar árvore limpa. A entrada generativa tem esse contrato explícito e não é reaproveitada automaticamente como prova de estabilidade do HEAD final.

Depois de commitar artefatos, o HEAD mudou. O teste feito no HEAD anterior continua como evidência histórica do que realmente executou. Não reescrever seu SHA, promover receipt silenciosamente ou dispensar teste no H novo por “foi só o HTML”.

Dois patterns legítimos:

**Artefato apenas de execução:** logs, traces e screenshots em destino ignorado/state, associados ao ticket. Não precisam mudar o HEAD para serem consultados. Preservar hashes e proveniência conforme o contrato consumidor.

**Artefato publicado no Git:** gerar e revisar antes do commit final; a verificação posterior valida o conteúdo publicado, sua frescura e identidade de origem segundo o contrato do projeto. Apenas constatar que `manifest.json` existe não fecha essa prova.

A regeneração deve nascer em diretório temporário/próprio; publicar somente o conjunto validado para evitar packs mistos após falha. O CI Queue não escreve commits automaticamente. Se a geração falhar, o projeto preserva evidência e não apresenta publicação parcial como completa.

Evitar o ciclo “o manifest precisa conter o hash do commit que contém o próprio manifest”. O consumidor deve usar proveniência de execução e uma identidade de inputs bem definida, excluindo outputs autorreferenciais quando aplicável. Projetos sem esse contrato ainda podem executar e observar geradores; apenas não ganham reuso automático de proof.

A primeira versão do ExecutionPack não precisa resolver hash de fontes do DietFlow. Precisa **não impedir a separação entre preparação e verificação, nem chamar uma de outra**.

## 15. Evolução do ship sem quebrar `acceptedPresets`

### Modo legado

Manter exatamente a interpretação atual: `acceptedPresets` é OR. Uma receita elegível basta; nenhuma encontrada leva ao default atual. Nenhuma atualização de CI Queue acrescenta testes obrigatórios, muda o default do DietFlow ou promove recomendações de Full a gate.

### Modo de plano, futuro e opt-in

O projeto declara requisitos para aquele trabalho. Cada requisito pode aceitar alternativas; os requisitos obrigatórios se combinam por AND. A seleção não vem de uma lista arbitrária enviada por uma IA dizendo “é tudo que precisa”. O ship resolve/revalida a política versionada e a origem da decisão, inclusive o diff usado. Congelar o plano não autoriza ignorar alteração posterior do HEAD ou da base.

Um consumidor pode definir um plano com apenas um proof. Outro pode exigir uma prova base e seis verificações independentes. **Não criar `core` obrigatório no produto.** O plano explica precisamente por que cada item existe.

Na integração com o modo legado, a alternativa já configurada pode ser projetada como um requisito. Para um consumidor mudar para outra política que não exige esse requisito, precisa haver mudança explícita e revisável. `pack run pricing-proof` sozinho não apaga uma regra de ship existente.

O controlador de ship reutiliza evidências elegíveis, pede os membros faltantes ao executor, revalida o conjunto e mantém autoria, identidade, base, remoto opcional e merge pinado. O worker só executa.

**Compatibilidade é requisito de segurança:** um binário antigo não pode ignorar campos novos e fazer ship como antes quando agora existem requisitos adicionais. O modo novo precisa de versão/capability explicitamente exigida e de um formato que clientes antigos recusem, por exemplo uma nova versão do config. Adicionar silenciosamente `requiredProofs` ao schema atual não resolve. [S02]

Essa integração exige ainda atualizar o verificador remoto adotado pelo consumidor, quando existir. Não basta o controller checar vários tickets e o workflow continuar verificando um contrato antigo sem revisão. O formato externo de atestação e as garantias devem ser compatíveis com a política adotada. Sem projeto de assinatura/servidor nesta entrega; registrar o limite de confiança local.

## 16. CLI para humanos e agentes: mais explicação, não mais decisões opacas

Hoje já existem `version --json`, `config --json`, `status`, `history`, `preset-history`, `logs` e `advisory`. [S01] Falta uma projeção curta que junte respostas operacionais; não falta obrigatoriamente um novo motor.

### Interface inicial proposta

```bash
# PROPOSTAS, não disponíveis na revisão consultada.
ci-queue pack run unit pricing-proof --wait
ci-queue pack inspect PACK_ID --json
ci-queue pack cancel PACK_ID
```

Logs continuam por ticket e `status` deve manter sua leitura atual. Não criar outra sintaxe para consultar os mesmos logs.

### Inspeção orientada a decisão, entrega posterior

Uma entrada de inspeção deve responder, em texto e JSON:

```text
Projeto e revisão: loja / H / base B
Executor instalado: revisão e capabilities observadas
Receitas disponíveis: unit, pricing-proof, accessibility
Selecionadas: pricing-proof
Motivo: src/pricing/discount.ts corresponde à regra preços
Não mapeados: src/shared/currency.ts
Ação sugerida: revisar cobertura antes de executar seleção parcial
Execução iniciada: não
```

A IA não precisa reconstruir o sistema por grep para responder uma pergunta operacional simples. O relatório deve apontar o comando aplicável, mas não executar automaticamente, reduzir obrigação ou instalar dependências em nome da conveniência.

Saída JSON deve distinguir fatos, recomendações e limitações; omitir env/secrets. CLI espera eficientemente e não exige polling artesanal do agente. Não há garantia de que todo harness de IA “durma”: o produto garante trabalho independente do chamador e uma forma simples de retomar a observação.

**Runtime não precisa de tags para tudo.** A receita já fornece o comando; o runner/framework conhece fixtures; a política conhece paths; o ticket captura o contexto da execução. Nenhuma dessas quatro responsabilidades exige repetir a lista de dependências das outras.

## 17. Documentação e distribuição que ajudam sem virar condição de entrada

A entrada genérica atual deve ganhar uma progressão simples, não outro portal. [S09]

| Material | Pergunta que resolve | Exigido para usar a fila? |
|---|---|---|
| Quickstart | Tenho um comando que passa/falha; como o enfileiro? | Somente o caminho básico. |
| Guia de packs | Como executar três receitas e ler a falha de uma? | Só para quem usa packs. |
| Boas práticas de testes focados | Como separar seleção, ambiente e assertions? | Não. |
| Guia de política | Como mapear paths, avisar, deixar pendente ou executar? | Não. |
| Referência CLI/contratos | Quais campos, capabilities e garantias existem? | Consulta, não leitura prévia integral. |

O bundle continua contendo o produto e sua documentação estática. Não instala Next, banco, fixture ou SDK nos projetos. Usa o instalador existente. Uma atualização futura confere a capability de packs na release instalada antes de aceitar o primeiro pedido novo; o usuário não coordena versões de sete serviços.

`init` mantém o caminho atual: comando existente -> receita. Pode oferecer exemplos opcionais pequenos, sem sobrescrever scripts, AGENTS ou frameworks silenciosamente. Templates devem funcionar sem CI Queue quando forem scripts de teste e mostrar uma falha real, não `echo PASS`.

O guia de patterns deve ensinar três exemplos: teste unitário independente; E2E focado usando um ambiente compartilhado por sessão; gerador de proof seguido de verificador. Uma instrução operacional de agente aponta para o guia e os comandos do projeto. Não duplicar o contrato completo em AGENTS, skill e README.

No DietFlow, preservar os detalhes operacionais já existentes. Uma “reconciliação” não pode eliminar guardrails e particularidades porque não cabem no manual genérico.

## 18. Fronteiras de implementação e cortes de escopo

### Entrega A: pack mecânico e interface

Receber 1..N receitas, validar, publicar pedido durável, executar no worker único, expor resumo/membros, reutilizar árvores e cancelar com segurança. Sem políticas por diff, merge novo, cache automático, adapters de testes ou novo collector.

Fronteiras candidatas: `src/cli.ts`, contratos de fila, admission/claims/recovery do worker, projeção API e composição de lista/drawer. `runJob`, runtime Node, processo, captura de log e collector continuam donos da execução. Um módulo de pack concentra reconciliação; não espalhar uma segunda lógica de prova.

Não é “só colocar um array”: aceitação durável, recuperação e cancelamento exigem testes. É uma mudança localizada do modelo de fila, não motivo para reescrever o executor.

### Entrega B: adoção e inspeção

Documentação, exemplos opcionais e relatório CLI de fatos/capabilities/receitas. Pilotar packs escolhidos manualmente em um consumidor. DietFlow continua funcionando com comandos existentes.

### Entrega C: seleção e ship opt-in

Somente com o lote estável: regras simples opcionais, ponte para seletores existentes, requisitos múltiplos no ship, prova de identidade de seleção e compatibilidade remota. Migração DietFlow própria, sem alterar seu Full por tabela.

**Não fazer agora:** engine DAG; nested packs; serviço universal de fixtures; registry de capacidades por caso; pool global de Next/Docker; inferência automática de cobertura; reuso entre commits; aprendizado de tempos para scheduler; milhares de receitas; instalação de plugins obrigatórios; botão de merge no dashboard; substituir os proof packs de evidência.

## 19. Critérios que fecham a arquitetura

| Cenário | Resultado obrigatório |
|---|---|
| Usuário antigo com uma receita | Mesmo comando, mesmos contratos, nenhum arquivo obrigatório novo. |
| Terceiro projeto sem `full` ou `smoke` | Funciona normalmente. |
| Pack com um proof | Só aquele membro executa. |
| Pack com seis receitas | Um envio, seis membros visíveis, execução serial. |
| A falha; B e C ainda não começaram | Pack para; B/C não ganham resultado de execução fictício. |
| A falha; outro projeto está na fila | Outro pedido permanece intacto, salvo proteção global por cleanup inseguro. |
| Terminal fecha | Pack aceito permanece durável. |
| Worker cai após gravar resultado de A | Recuperação não repete A. |
| Worker cai durante B | Reconciliação real, sem adoção ou retry silencioso. |
| Receita sem progress | Resultado/log funcionam; aviso atual, nenhum gate novo. |
| Mesmo ID de progress em dois tickets | Árvores permanecem separadas, sem colisão. |
| Base muda antes do segundo membro de verificação | Não misturar evidências de bases diferentes; interromper/replanejar explicitamente. |
| Recomendação opcional falha | Não reclassificar o ticket; não bloquear provas obrigatórias por efeito de um lote misto. |
| E2E Cálculo usa fixture compartilhada | Não precisa executar asserts de Anamnese para preparar dados. |
| Duas famílias precisam de ambientes diferentes | Cada runner possui seu lifecycle. O CI Queue não injeta fixture por adivinhação. |
| Grupo E2E vazio indevidamente | Runner recusa a falsa aprovação segundo seu contrato de escopo. |
| Path material sem regra | Lacuna explícita; não declarar cobertura completa. |
| Gerador muda arquivo versionado | Preparação seguida de commit; não reciclar prova de H antigo no H novo. |
| Ship legado | OR/default e exceções existentes permanecem. |
| Ship novo em cliente antigo | Recusa por incompatibilidade, nunca ignora requisitos. |

## 20. Conclusão

**O produto deve exigir somente um comando real para executar.** Um pack organiza pedidos existentes; um runner de família organiza ambiente e escopo; uma política opcional decide quando pedir cada coisa.

A flexibilidade que interessa não depende de criar um `full` universal nem de copiar scripts-pai. Ela vem de manter a seleção separada do lifecycle e de aproveitar os mecanismos nativos do projeto.

**Recomendação final:** pack durável de tickets macro, interface recursiva reaproveitada, runners de família no consumidor e seleção opcional. Começar manual e explicável; automatizar quando o mapa do projeto justificar. Não deslocar a complexidade do DietFlow para todos os usuários do CI Queue.

---

## Fontes e limites da análise

Leitura remota de código e testes; nenhuma execução de suíte, instalação, fila live, alteração de repositório ou PR nesta passagem. A arquitetura futura não é comprovada pelo código atual. Os pontos de extensão e o suporte recursivo interno foram confirmados por leitura; precisam de testes de implementação e inspeção visual quando construídos.

- **[S01]** [CI Queue: CLI e capabilities](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/src/cli.ts), funções `usage` e `runCli`.
- **[S02]** [CI Queue: parser de catálogo e ship](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/src/contracts/config.ts), `readPresets`, `readShip`, `parseQueueConfig`.
- **[S03]** [CI Queue: worker](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/src/core/worker.ts), `runWorker` e reconciliação.
- **[S04]** [CI Queue: schema](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/src/contracts/schema.ts), `QueueTicket`, `RequestContext`, `ProgressNode`, `ShipConfig`.
- **[S05]** [CI Queue: collector e TSV](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/src/core/progress.ts), `parseProgressLine` e `ProgressCollector`.
- **[S06]** [CI Queue: árvore recursiva](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/ui/src/features/shared/progress-tree.tsx), `ProgressNodeRow` e `ProgressTree`.
- **[S07]** [CI Queue: drawer de job](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/ui/src/features/shared/job-drawer.tsx), `ProgressPanel`.
- **[S08]** [CI Queue: elegibilidade](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/src/ship/eligibility.ts), `evaluateForRecipe` e `findEligibleTicket`.
- **[S09]** [CI Queue: quickstart atual](https://github.com/nmarcofernandess/ci-queue/blob/97a0eb4b00fbdfbac8909ab43467a288d14aeaff/docs/CONSUMER-QUICKSTART.md).
- **[S10]** [DietFlow: seleção E2E por impacto](https://github.com/dietflowoficial/Dietflow-app/blob/180ee2bc4891e0d439e6330dbf81c4be5b36fff2/scripts/ci/e2e-impact.ts), `selectImpactGroups` e `runImpactMain`.
- **[S11]** [DietFlow: grupos e regras atuais](https://github.com/dietflowoficial/Dietflow-app/blob/180ee2bc4891e0d439e6330dbf81c4be5b36fff2/e2e/impact-groups.json).
- **[S12]** [DietFlow: Full](https://github.com/dietflowoficial/Dietflow-app/blob/180ee2bc4891e0d439e6330dbf81c4be5b36fff2/scripts/ci/full-local.sh).
- **[S13]** [DietFlow: publicação de proof pack Export](https://github.com/dietflowoficial/Dietflow-app/blob/180ee2bc4891e0d439e6330dbf81c4be5b36fff2/scripts/proof/publish-export-atlas-proof-pack.ts).
- **[S14]** [Playwright: fixtures](https://playwright.dev/docs/test-fixtures). Consulta em 20/09/2026; capacidades gerais, não mudança prescrita no DietFlow.
- **[S15]** [Playwright: webServer](https://playwright.dev/docs/test-webserver). Consulta em 20/09/2026.
- **[S16]** [Playwright: dependências de projetos](https://playwright.dev/docs/test-projects). Consulta em 20/09/2026.
- **[S17]** [DietFlow: testes da seleção de impacto](https://github.com/dietflowoficial/Dietflow-app/blob/180ee2bc4891e0d439e6330dbf81c4be5b36fff2/scripts/ci/__tests__/e2e-impact.test.ts).
- **[S18]** [DietFlow: runner E2E e contexto herdado](https://github.com/dietflowoficial/Dietflow-app/blob/180ee2bc4891e0d439e6330dbf81c4be5b36fff2/scripts/ci/e2e-local-stack.sh), `start_e2e_execution_context` e ownership do receipt.
- **[S19]** [Jest: CLI](https://jestjs.io/docs/cli), opção `--findRelatedTests`. Consulta em 20/09/2026.
