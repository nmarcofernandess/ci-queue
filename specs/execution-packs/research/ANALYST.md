# Analyst — vale a pena assumir o lifecycle de ExecutionPack?

Data: 23/09/2026. **Decisão atual: não implementar; manter backlog vivo.** Este arquivo distingue a proposta de 20/09, fatos do código consultado e a decisão posterior do operador. Não é prova de runtime nem aprovação de build.

## Dúvida material

Precisamos de lotes duráveis de tickets ou estamos tentando resolver organização humana e preparação repetida com mais uma entidade? O pack melhora a experiência o suficiente para pagar admissão, recuperação, cancelamento, compatibilidade, UI e suporte adicionais?

## Recon e reuso

| Fato verificado | Implicação, sem exagero |
|---|---|
| `dev` CQ continua `ef057973`; #26 `83dfd5e` está draft. | Não anunciar candidata como instalada/integrada. |
| Worker drena tickets individuais; `listQueuedJobs` ordena por createdAt/ID. | Enqueues separados não têm contrato de lote ou cancelamento de irmãos. |
| Publicação é por ticket; `atomicWriteJson` faz write+rename. | Isso não prova aceitação atômica de N tickets nem garantia de perda de energia. |
| Ship genérico busca uma alternativa e, no miss, enfileira a primeira. | AND de múltiplas provas não existe por reinterpretar acceptedPresets. |
| Quickstart já recomenda agregador para verificações obrigatórias em conjunto. | Há alternativa dentro do contrato existente. |
| Candidata CQ entrega método feedback/prova e templates; candidata DF entrega sessão + receita e2e-feedback. | Boa parte do valor de preparação já tem outra solução; não reabrir como requisito de packs. |
| #1323 foi atualizado para `fbe5f4a` sobre `c3885e9`. | A comparação desta revisão usa esse código/documento, não a candidata antiga `71e77a5`. |

Fontes e SHAs integrais em [RASTREABILIDADE](RASTREABILIDADE.md#fontes-e-procedência). Não observei state/instalação do Mac, testes ou ganho temporal; dados nas descrições dos PRs são relatos desses PRs.

## O que foi afinado na conversa

1. O primeiro desenho era um lote mecânico, com futuras políticas e ship.
2. A sessão persistente foi reconhecida como principal redução da preparação repetida. Não confirmou “80%” numericamente.
3. Para autorias independentes já decididas, ensinar o agente a enfileirar os pedidos pode bastar. Um RED ainda exige interpretação/edição antes do GREEN.
4. A hipótese “ship despeja três tickets e cancela os próximos se um falhar” revelou uma corrida: o worker pode iniciar B antes do polling do ship notar A vermelho.
5. Submeter progressivamente pelo ship remove essa corrida de pré-enqueue, mas acrescenta retomada, identidade, trabalho compartilhado e cancelamento. Não é execução durável completa por si só.
6. A alternativa menor é agregador proprietário num ticket, quando resultados/tickets independentes não são um requisito real.
7. O operador decidiu preservar a ideia pausada. Não implementar é uma escolha consciente de prontidão do produto, não abandono ou legado descartado.

## Alternativas e custo incremental

| Alternativa | Benefício | Custo/limite aceito | Escolha atual |
|---|---|---|---|
| Avulsos + boa conduta | Usa fila e tickets já existentes; pode submeter vários independentes sem esperar. | Sem intenção durável de conjunto, fail-fast coletivo ou cancelamento de irmãos. | Válida para trabalho independente. |
| Agregado do consumidor | Um ticket, resultado conjunto, C não inicia após B falhar; usa lifecycle existente. | Menor independência de reuso/cancelamento; próxima prova pode repetir A. | Preferida para uma prova composta. |
| Ship sequencial multiprova | Cada requisito pode referenciar evidência própria e submeter só faltantes. | Controlador precisa sobreviver ou ser retomado; ownership, política e idempotência adicionais. | Não adotada agora. |
| Pack durável no executor | Intenção do conjunto sobrevive ao chamador; membros e decisões observáveis. | Novo lifecycle no limite de fila/recovery/API, mais armazenamento e compatibilidade. | Backlog condicionado ao caso real. |

Agregado não resolve todo problema e não deve ser um Full universal. Porém ter uma alternativa menos flexível, com contrato pequeno e comportamento compreensível, pode ser melhor produto do que oferecer flexibilidade cujo suporte exige especialistas.

## Por que faria

Quando o operador precisa repetidamente delegar um conjunto antes de desaparecer, acompanhar cada membro independentemente, impedir membros futuros após falha e retomar sem reconstruir IDs pela conversa. Também quando a independência de evidências evita trabalho substancial e comprovado que o agregado repete sem necessidade.

O ganho deve ser formulado em intervenções evitadas, erro operacional reduzido ou trabalho repetido poupado. A quantidade de ferramentas modernas citadas, o número de recursões da UI ou o rótulo production-ready não são métricas de valor.

## Por que não fazer agora

A dor principal discutida era repetir preparação e perder coordenação da fila no reteste. A candidata de feedback trata isso sem pack. Não há neste material medição de uma carga recorrente que justifique mover a operação de conjuntos para o worker. Uma fila serial com sessão compatível não precisa de reserva de bloco para conservar o servidor.

Também não precisamos substituir requisitos fixos por um motor de política dinâmica. O ship atual tem um contrato pequeno; ampliar de OR para AND/OR, obter reuso por requisito e distribuir cancelamento é escopo novo. A equipe está fechando F4/F5, e esse ganho opcional não deve impedir integração, instalação ou aceite daquele trabalho.

## Quando valeria a pena reabrir

Um caso concreto precisa demonstrar pelo menos uma necessidade não atendida pelo caminho menor: continuidade autônoma de todo o pedido, resultados independentes com consequência operacional, cancelamento seletivo recorrente ou economia de reuso de prova devidamente identificada. Comparar a mesma classe de operação usando o método atual. Não impor requisito artificial de muitos usuários; um usuário com uma necessidade importante pode bastar, desde que o benefício e a limitação sejam demonstráveis.

Além do benefício, escolher uma garantia de execução limitada e custeável. Aceitar retomada manual do ship pode tornar desnecessária durabilidade de lote. Aceitar um ticket agregado pode dispensar membership. A cada concessão, perguntar qual parte do mecanismo deixa de ser necessária, em vez de manter tudo “para o futuro”.

## Gaps aceitáveis e inaceitáveis

Aceitáveis, se explícitos: fila serial e espera atrás de trabalho longo; ausência de auto-seleção por diff; ausência de DAG; reuso de servidor conservador; falha/incerteza diagnosticada em vez de recuperação mágica; sem promessa de exactly-once de efeitos externos ou base remota atomicamente bloqueada.

Inaceitáveis para a promessa de pack: subset aceito como conjunto completo; B começando depois de parada que prometia preveni-lo; ticket de outra operação cancelado; claim/terminal existente reexecutado silenciosamente; campos novos ignorados pelo worker antigo; estado de pack usado como prova sem conferir tickets; UI duplicando jobs em estatísticas; stale selection/base aceita como atual; teste sem casos produzido como aprovação; falha de publicação apagando evidência.

A matriz G01–G12 da SPEC converte esses riscos em decisões e testes futuros. “Livre de gaps” significa cobrir essas garantias materiais, não tentar controlar todas as ações de usuário e todo processo do sistema.

## Gaps adicionais preservados do anexo

- Layout de storage/wakeup para envelopes e recovery não pode ficar para depois do código de CLI.
- Drafts/candidatas/install são fatos diferentes; negociar versão efetiva do executor.
- Order do pack e fairness global precisam de escolha, não herança acidental dos timestamps.
- Membro de feedback precisa de sessão/seletores; versão só com nomes não atende tudo.
- Recomendações opcionais separadas de provas obrigatórias; falhar uma não reescreve política.
- Geração de proofs muda arquivos; commit final e verificação seguem em fases distintas.
- Predicados de prova não são copiados para o worker; tags de UI não expressam cobertura.
- Custos de fila, polling, snapshots e disco continuam medidos, mesmo que o teste seja rápido.

## Parecer e disposição

**Manter pausado.** O próximo trabalho permitido é somente conservar a análise diante de fato novo. Não criar uma implementação de pack “mínima” só para provar que seria fácil; primeiro provar que o recurso melhora uma operação real que a alternativa menor não atende.

Não foi solicitado nem executado experimento, código, Full, PR funcional, instalação ou limpeza. A publicação deste pacote é entrega documental e não promove a SPEC a pronta para execução.
