# Validação documental

Escopo: leitura, parsing, hashing e consistência do pacote. Nenhum teste de produto, CI, build, Smoke, Full, banco ou deploy. Scripts de coleta/checagem ficaram no scratch do chat e não fazem parte do produto nem da publicação.

- 59 linhas únicas e ordenadas: 58 gates Static + Jest related.
- JSON e JSONL parseados; IDs presentes, runDir e intervalos reconciliados com os tickets.
- Soma dos registros referenciados conferida por linha; nenhuma linha de medição atribuída a dois gates distintos.
- 372 fontes DietFlow resolvidas contra objetos Git e SHA-256; URLs com commits completos. Implementações primárias dos gates têm os mesmos blobs nos quatro SHAs executados e na base observada.
- Links Markdown locais resolvidos e whitespace documental conferido por `git diff --check`.
- Sanitização por revisão dos logs iniciais e recorte estrutural do posterior; busca por padrões de token/JWT, email, home pessoal e URL com credencial. Nenhum valor correspondente permaneceu. Não foram lidos ou copiados arquivos .env, credenciais ou banco de pacientes.
- CI Queue e DietFlow confirmados privados. A API gh ativa tem identidade dietflowoficial e não vê Queue; o conector GitHub já conectado vê Queue privado com push permitido. Não houve troca de conta/credencial. Git SSH usa o remote já existente; autoria Git preservada.
- Workflow Queue na base dev inspecionada: push apenas main; job de PR condicionado a draft=false. Branch documental/draft não executa o check. Nenhuma attestation foi criada e não houve merge.

Os checks confirmam integridade documental, não correção dos 58 detectors, equivalência de cobertura, elegibilidade atual de ship ou teto de 120 s. Links privados foram conferidos por existência dos objetos Git; acesso efetivo do GPT depende de suas permissões nos repositórios. Os hashes do manifesto para arquivos originais são anteriores à sanitização; arquivos publicados têm bytes diferentes por redação/projeção.
