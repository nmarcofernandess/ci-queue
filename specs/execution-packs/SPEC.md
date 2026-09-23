# SPEC — ExecutionPack: arquitetura candidata, sem execução autorizada

Estado e autorização pertencem a [status.md](status.md). Esta especificação converte a proposta de 20/09 e a conversa posterior em critérios atuais de decisão. **Não existe plano ativo, comando novo ou migração de runtime nesta entrega.**

## Integração

### 1. Mapa de responsabilidades

```text
POLÍTICA DO CONSUMIDOR → escolhe o necessário e o recomendado
                                |
                   pedido concreto, se aplicável
                                v
EXECUTIONPACK OPCIONAL → intenção durável / membros / parada
                                |
                                v
TICKETS CI QUEUE → admissão / processo / log / resultado
                                |
                                v
RUNNER DO CONSUMIDOR → seleção / fixtures / ambiente / cleanup
```

A sessão quente é recurso do consumidor, não filha conceitual do pack. A árvore de progresso vive em cada ticket. O pack de evidências, por sua vez, é publicação de outputs do consumidor; não é registro de agendamento. `requestContext.packageId` não prova membership nem concede autoridade de cancelamento.

Locais canônicos candidatos, se a entrega for autorizada: contratos em `src/contracts/`, admissão/claims em `src/core/`, CLI em `src/cli.ts`, projeções em `backend/ci_queue_api/`, composições existentes em `ui/src/features/` e testes nas suítes proprietárias. Não colocar runtime importável em `specs/`, copiar predicado de ship ao worker ou introduzir outro daemon.

### 2. Alternativa recomendada no presente

Uma receita agregadora do consumidor executa verificações necessárias em um ticket normal. A falha de B impede C sem criar tickets futuros; finalização e publicação de diagnóstico não são puladas. Componentes são chamados diretamente pelo agregado, não enfileirados na mesma fila para o pai aguardar.

O contrato de ship atual conserva `acceptedPresets` como OR. O agregado aceito representa a prova composta necessária. Seu custo: sem checkpoint específico, a próxima prova do agregado repete as etapas; durante autoria, retestar apenas a falha pelo caminho de feedback.

Essa alternativa não equivale a tornar todos os testes obrigatórios nem a inventar outro Full. Reusar o seletor do consumidor quando já existir; lógica de seleção futura é uma decisão própria, não um efeito colateral deste cadastro.

### 3. Sequência de ship versus lote durável

Uma sequência automática no ship poderia resolver A+B+C e submeter A, depois B, depois C, interrompendo novas submissões na primeira reprovação. Elimina a corrida de cancelar B após o worker iniciá-lo, mas mantém responsabilidades de retomada, seleção congelada, concorrência de controladores e ownership. **Não está adotada neste corte.**

Um pack durável resolveria outra exigência: o pedido completo continua gerenciável sem o processo de ship/chamador. Para isso, a intenção e a regra de admissão precisam estar disponíveis ao executor/reconciliador. Um loop de enqueue no cliente não oferece essa garantia se morrer no meio.

## Contratos

### C01. Identidade, seleção e compatibilidade

Pedido tem ID, contexto de projeto/cwd e membros em ordem explícita. Membro tem ID estável e vínculo inequívoco ao ticket que realmente executou. Congelar receita/argv/flags/artifacts resolvidos no aceite; admitir cada membro usando os controles de runtime vigentes.

Modo diagnóstico não adquire garantia de árvore limpa. Modo de verificação fixa H, tip B0, política/configuração e seleção com sua proveniência; mover a base no meio não permite recapturá-la silenciosamente. Reuso é avaliado fora do worker contra todos os inputs materiais, não pelo nome, timestamp ou quantidade de testes. Um badge focal/custom não concede elegibilidade.

Um formato novo precisa de capability/versionamento que binários anteriores recusem antes de consumirem envelopes desconhecidos. A instalação observada do CLI e do worker importa; conhecer o schema somente no source checkout não basta. Não instalar aliases que façam cliente antigo ignorar requisitos de prova novos.

### C02. Publicação do conjunto e recuperação

Validar todo o conjunto antes de publicá-lo. A aceitação durável deve ser indivisível em relação ao worker: um registro envelope ou mecanismo equivalente, fora da área observada durante preparação, publicado com identidade verificável. Não escrever metade dos tickets e anunciar pacote aceito.

Atomic rename não é garantia completa contra perda de energia. Definir separadamente resistência à morte do processo e política de flush/fsync do filesystem. A recuperação precisa reconhecer terminal já publicado, claim e processos vivos sem reexecutar um membro por perder cursor. Resultado incerto não vira passed e não implica repetir comandos com efeitos externos.

Não deixar envelope desconhecido na área que o worker atual varre como ticket. Formato, despertar do serviço e ownership do cursor devem ser fechados juntos. Um pedido com membros pendentes não pode depender de outro enqueue casual para voltar a ser observado após falha do worker. Arquivo malformado não pode causar loop de reinício infinito.

### C03. Ordenação não é TOCTOU

O reader atual ordena tickets por `createdAt` e ID. Três submissões separadas podem intercalar com outra chamada e timestamps iguais não expressam ordem de uma lista. Ordem explícita dos membros é contrato futuro distinto.

Aceitar A+B+C atomicamente não obriga reservar a máquina para o pack inteiro. A proposta original de bloco contíguo está **reaberta, não aprovada**: pode aumentar espera de feedback curto. Antes de implementar, escolher contiguidade ou alternância entre membros, com um exemplo de competição e limite operacional aceito. Não introduzir prioridade/fairness/preempção por consequência.

TOCTOU é usar uma identidade/recurso que mudou depois de conferido. FIFO não congela H/base/servidor. Revalidar imediatamente antes do uso e antes de conceder prova, sem prometer CAS atômico de base remota que o merge não oferece.

### C04. Falha, não execução e cancelamento

| Evento | Semântica exigida em futura entrega |
|---|---|
| A reprova | Impedir admissão de B/C antes do spawn; anotar `not-run/previous-failure` no membro, sem ticket fictício. |
| A terminou e o cursor não avançou | Recuperar o terminal existente, sem nova execução de A. |
| Worker morreu em A | Reconciliar processo/claim; interrompido ou inconclusivo conforme fato. Não repetir A nem continuar B automaticamente. |
| Operador pede parar restantes | Não admitir novos membros; membro ativo segue até seu resultado/cleanup. |
| Operador pede cancelar ativo também | Usar a primitiva de cancelamento do ticket próprio; preservar terminais e confirmar fim/limpeza. |
| Waiter expira ou terminal fecha | Não é cancelamento; pedido aceito continua de acordo com seu contrato de durabilidade. |
| Cleanup inseguro | Proteção global existente pode parar a máquina; isso é diferente de cancelar pedido alheio por falha comum. |
| Prova/ticket reaproveitado de outro pedido | Referência não transfere direito de cancelamento. |
| Falha de API/merge depois dos testes | Preservar provas; não reescrever resultado nem fingir que um merge aplicado não ocorreu. |

A fronteira crítica é worker publicar A vermelho e logo admitir B. Uma consulta periódica do cliente seguida de cancelamento não garante que B nunca começou. A implementação de lote precisa fazer a decisão de continuar participar da própria admissão; a alternativa sem lote é não submeter B antecipadamente.

Falha opcional não pode impedir provas obrigatórias por lote misto. Continuar após falha é outro modo e, se vier a existir, exige cleanup seguro e mantém o conjunto reprovado. Não implementá-lo na primeira versão por conveniência.

### C05. Progresso, API, UI e custo

Composição candidata: pack → ticket → árvore existente. Namespaces dos nós ficam no ticket. Não concatenar TSVs em um sidecar comum, inventar kinds `pack/ticket` no protocolo dos testes ou usar status do pack como status dos casos.

Resumo lê metadados limitados; detalhe/log só sob demanda. Membros contados como execuções, casos no runner. Membro não iniciado não vira execução nas estatísticas. Duração do pedido, soma das durações dos jobs, espera e CPU são conceitos distintos; ausência é ausência, não zero. Preservar escolha de expansão, acessibilidade e erro de refresh sem multiplicar polls por membro.

Nenhuma sidebar/grafo novo é requisito do conceito. Definir a menor superfície somente depois do caso de uso. O componente recursivo não prova que milhares de membros/casos custam pouco: medir número de reads, payload, requests, regravações e memória. Não deslocar custo para outro processo sem contá-lo.

### C06. Sessão, fixtures e seleção nativa

Reusar runners por família. Seleção de vários specs no mesmo runner/ambiente pode ser uma invocação normal, não vários membros. Fixture de paciente não exige executar assertions de Anamnese para testar Cálculo. Casos não devem depender de resíduos/ordem de irmãos; preparação global incompatível permanece um limite real.

Para feedback, o membro precisa identificar sessão e seleção como o contrato público do consumidor exigir. Não prometer suporte de args se o schema só lista nomes. Não anexar extras duas vezes ao argv efetivo. O pack não pode reiniciar/retomar servidor por conta própria nem assumir uma porta livre como identidade.

Uma investigação RED → interpretação → edição → GREEN não é lista de comandos já conhecidos. Não pré-agendar uma correção nem transformar resultado diagnóstico em prova do HEAD final.

### C07. Artifacts e geração

Continuar usando outputs por receita e publishers do consumidor. Resultado verde não prova que anexos opcionais foram persistidos. Proof obrigatório verifica sua publicação e sua origem no gate proprietário.

Separar preparação de artifacts versionados, review/commit e verificação de H final. Gerador pode sujar árvore por contrato; não reciclá-lo como prova de estabilidade após outro commit. Registro de H anterior permanece histórico, sem promoção silenciosa por “mudou só HTML”. Publicação de pack de evidência é atômica no limite que seu publisher fornece; arquivos parciais não viram proof completo.

Evitar hash autorreferente do commit contendo seu próprio manifest. Reuso por hash parcial de inputs é outra feature, fora daqui. Não apagar logs/tickets/proofs ao encerrar/cancelar um pedido; a retenção existente continua no owner apropriado.

### C08. Políticas por diff e ship multiprova: possibilidade separada

Preservar a ideia de inspeção opcional e explicável: inputs/diff, regras aplicadas, sugestões, lacunas e origem. Inspeção não executa. Ação operacional (`warn/pending/enqueue`) não é obrigação de prova (necessário/recomendado). Paths desconhecidos, deleções, renomes, dependências, fixtures e configuração não podem virar “zero testes necessários”.

Reusar Jest related/E2E-impact quando existirem. Não repetir mapas num segundo DSL obrigatório nem ensinar ao CI Queue o domínio clínico. O exemplo `partial-not-full` não autoriza substituição de Full. Nenhum `core` universal.

Um eventual ship de requisitos combina requisitos por AND e alternativas internas por OR, resolvidos de política versionada e autorizada. Isso exige revisão do formato de config/capabilities e do verificador remoto adotado, não apenas acrescentar um array que o cliente antigo ignore. Reuso de tickets, concorrência de ships, cancelamento e revalidação precisam de contrato próprio. Esta possibilidade **não é requisito da entrega manual de pack**, nem próxima tarefa automática.

## Decisões técnicas

### Escolhas consolidadas desta revisão

1. Manter o fluxo atual e pausar implementação de pack e de ship multiprova.
2. Preservar as ideias do anexo sem reproduzir sua recomendação antiga de entrega imediata.
3. Preferir agregador consumidor quando sua unidade de prova/cancelamento atende ao caso; admitir o custo de repetição parcial que ele não resolve.
4. Se houver benefício futuro, considerar lote manual antes de política automática. Não exigir integração DietFlow para um terceiro projeto usar o básico.
5. Não manter plano pendente disfarçado de backlog: `plan.json` só nasce após retomada explícita.

### Gaps a fechar no desenho e provar na implementação

Não se exige eliminar todos os problemas do CI Queue. Exige-se decidir e testar as garantias que o recurso novo venderia. Antes de iniciar, G01 precisa justificar o investimento e G02–G12 precisam ter decisões e critérios fechados; suas provas de runtime pertencem à implementação e ao aceite futuros, não são pré-requisito impossível de código ainda inexistente. Na captura atual, **nenhum gap abaixo é declarado validado por uma implementação de packs**.

| ID | Decisão/prova necessária | O que impede |
|---|---|---|
| G01 | Caso real de conjunto durável/independência; comparação com agregador/avulsos. | Construir feature sem benefício adicional. |
| G02 | Aceitação indivisível, resposta perdida e idempotência de submissão explícita. | Metade de lote ou duplicação ao retentar. |
| G03 | Identidade de membro/ticket, terminal antes do cursor, crash com efeito externo. | Reexecução silenciosa/verde fabricado. |
| G04 | Wake/recovery em instalação real e formato recusado por worker antigo. | Lote abandonado ou restart loop. |
| G05 | Barreira de admissão fail-fast e corrida com cancelamento/claim. | B iniciar depois da decisão de parar em A. |
| G06 | Cancelamento por ownership, intenção stop-restantes versus cancelar-ativo. | Matar execução compartilhada/alheia ou esconder efeitos parciais. |
| G07 | Snapshot H/B0/cwd/receita/seleção e política de reuso. | Prova misturada ou TOCTOU tratado como FIFO. |
| G08 | Política de ordenação/intercalação e efeito em feedback curto. | Reservar a máquina inadvertidamente. |
| G09 | Parâmetros dos membros e compatibilidade com sessões já existentes. | Pack sem capacidade que a interface anuncia. |
| G10 | Projeção limitada, estatística sem double-count, limites de bytes/requests. | Reintroduzir lentidão do painel. |
| G11 | Ownership de artifacts e geração/commit/verificação separados. | Perda de proof ou reuso no HEAD errado. |
| G12 | Prova fim-a-fim, adoção mínima, rollback/versionamento e documentação. | Modelo que só funciona no checkout do autor. |

Gaps de política avançada só precisam ser fechados se aquela extensão for autorizada. Não usar problemas históricos de SIGSEGV/ENOSPC, adaptatividade de workers ou gráficos para manter um backlog infinitamente bloqueado.

## Verificação

Depois de uma futura aprovação, usar as suítes proprietárias do CI Queue e consumidor mínimo temporário; jobs reais no host seguem a fila oficial. Não um Full clínico ritual. A matriz deve cobrir A01–A12 do PRD e estas fronteiras: aceitação antes/depois de publicação; crash antes/depois de ticket/terminal; cancelamento concorrente ao claim; fila com outro projeto; processo ainda vivo durante recovery; catálogo/base movidos; zero members; dois ships referenciando uma prova; remotes/retomada incompatíveis.

Testes de reexecução precisam observar eventos reais de processo/arquivo, não apenas mocks que afirmem ter cancelado. Em UI, demonstrar o mesmo pedido com uma falha e membros não iniciados; a árvore de cada ticket e seu retry seguem íntegros. Marcar fontes incompletas e limites de ambiente. Publicar receipt identificado de candidata, nunca converter simulação de launchctl em boot real.

### Sequência candidata de retomada — não é plano ativo

R0: operador reabre pelo caso de uso e pela comparação econômica. R1: reancorar as fontes e escolher alternativa menor ou pack. R2: fechar G01–G12 pertinentes, revisar PRD/SPEC e compatibilidade. R3: criar `plan.json` de tasks verificáveis, com TDD e donos, somente após autorização. R4: implementar um recorte mínimo, provar faults/cancelamento/volume e adoção. R5: review e janela operacional próprias. Seleção por diff/ship multiprova não entram automaticamente nessa sequência.

Se a conclusão em R1 for “agregador continua suficiente”, atualizar Analyst/status e manter pausado. Isso é um resultado válido, não uma falha a contornar criando outra entidade.
