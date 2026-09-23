# Fechamento F4/F5 — entrada da campanha

**Leia [SPEC.md](SPEC.md) e depois [PLAN.md](PLAN.md).** São o contrato e o plano do corte final de lifecycle aprovado para planejamento por Marco. Ambos moram no CI Queue e governam mudanças nos dois repositórios. O checkpoint inicial era documental; a execução candidata e seus limites estão registrados em [CLOSURE.md](CLOSURE.md). Os PRs de código continuam em Draft, sem merge ou instalação.

## O que será entregue

```text
Sessão DietFlow preparada uma vez
                 ↓
Tentativas curtas na fila CI Queue
   RED → editar → GREEN → retestar
                 ↓
Encerramento explícito da sessão
                 ↓
Prova canônica exigida no código final
```

O teste quente NÃO roda diretamente só porque a stack já está ligada. Uma tentativa é um ticket real; `observe` não substitui admissão. A sessão pertence ao consumidor, não ao worker do ticket. O loop não executa reset/seed/build por tentativa.

A distribuição do CI Queue receberá o método genérico e templates de adoção. No DietFlow, o método será configurado nos owners já existentes: README/AGENTS real → `.context` → procedimento/entrada executável. O uso diário não exige reler os arquivos históricos deste diretório.

## Escolhas de simplicidade, deliberadas

- Nenhum segundo motor de fila, prioridade adaptativa, daemon novo ou detector de intenção.
- Sessão foreground com `start/status/stop`; sem TTL automático ou heartbeat de agente. Falha extrema não recebe uma falsa promessa de cleanup universal.
- Nenhuma sidebar Processos ou novo inventário global. A tentativa usa as telas atuais; o estado da sessão é consultado na CLI consumidora.
- Override de artifacts por receita, não um sistema genérico de retenção. Logs/receipts permanecem; feedback conserva diagnóstico limitado, com keep explícito; proofs publicados ficam protegidos.
- Não depende de encontrar os antigos 50 GB. ENOSPC histórico sem prova causal permanece inconclusivo e não bloqueia o caminho novo.
- Sem migração Jest/Vitest, mudança de retries/filtros/coverage ou execução de Full para homologar performance.

Os detalhes e os aceites dessas escolhas estão na SPEC. Este README não define um segundo contrato.

## Estado anterior que continua preservado

[HANDOFF.md](HANDOFF.md) é a fotografia factual recebida, **não foi reescrito** para incorporar decisões posteriores. O mesmo vale para [research/](research/) e sua [proveniência](research/PROVENIENCIA.tsv).

A SPEC inclui uma matriz de destino para todos os C01–C06/V01 e P00–P07. Código já integrado não será reimplementado. C03/C06 e as confirmações do censo terão provas delimitadas; P02 permanece hipótese recusada; P05 tem investigação finita; P07 continua pertencendo ao owner RC115. Aceite humano e janela de instalação não são substituídos por um check verde.

## Como executar depois do review dos documentos

Use Superpowers com TDD e subagentes por owner. Um único consolidador possui Git e submete os testes à fila; subagentes não iniciam processos concorrentes no state real.

1. T0 reancora as duas bases e localiza o state/capabilities existentes, sem exigir incidente perdido nem atualizar instalações.
2. T1–T5 entregam captura por receita, sessão, tentativa enfileirada, outputs e adoção.
3. T6 prova a integração e fecha as regressões F4 relevantes.
4. T7 mede o loop e o piloto P05 sem abrir outra campanha.
5. T8 faz revisão, validação final e entrega os PRs draft. Integração/instalação só nas autorizações e janelas aplicáveis.

As fases futuras terão um recibo único `CLOSURE.md`, não uma coleção de mensagens que Marco precise reconciliar. Nenhum estado desse recibo pode confundir implementado, verificado na candidata, instalado, observado no login e aprovado pelo operador.

## Bases desta autoria

- CI Queue runtime: `ef057973bd1f006f493487f6cc9b96b2b7e741f8`.
- Handoff recebido: `2f422d2084af92e2d82ccfacd12528c7e02e959e`, branch `codex/fase4-5-handoff`, PR #25.
- DietFlow consultado: `dcd7ac2c8410a05d0c9f4fccee303c3d9a8c7ed0`.

Revisões posteriores precisam ser reconciliadas nos owners afetados, não usadas para reiniciar toda a pesquisa. O corte termina pelo aceite da SPEC, sem prometer ausência de manutenção futura e sem exigir outra SPEC para cumprir o método que já definiu.
