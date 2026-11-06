# 0003: RAG como citação opcional nas sugestões de material

- Status: Accepted
- Date: 2026-11-06
- Supersedes: reescopo da #66 em `docs/rag/triagem-corpus.md` (PR #277), exclusivamente quanto a permitir retrieval público para citações nas sugestões
- Tracker: [Issue #66](https://github.com/BitStudioLabs/trail-up/issues/66)

## Context

O motor de sugestões já possui ordem determinística, evidências locais e métricas de efetividade. A issue #66 foi reescopada para não usar RAG em sugestões enquanto não houvesse corpus curado; o usuário aprovou retomar a integração em modo de citação, sem influenciar a ordem. O Vector Store possui arquivos anexados, mas a presença de arquivo não prova que ele pertença ao corpus elegível.

## Decision

O RAG pode anexar referências às evidências locais da sugestão, sem determinar formato, score, posição ou formato inicial. O retrieval usa exclusivamente Vector Store configurado no backend, com filtros obrigatórios `scope=publico` e `corpus=regras-derivadas`. Antes da busca, o backend confere no catálogo local `rag_openai_files` que existe arquivo `completed` com esses mesmos atributos; depois, aceita apenas respostas cujo `file_id` e atributos coincidam exatamente com o catálogo. Só são aceitos resultados com `rd` em `RD-01`–`RD-12` e fontes `DAT-xx` que coincidam com o catálogo local.
A consulta enviada ao provedor contém apenas os identificadores públicos `DAT-xx` das evidências locais. Nunca envia aluno, turma, perfil BrainHex, texto de tópico, telemetria, desempenho ou scores. O backend não devolve texto bruto recuperado; só IDs RD, referências DAT e confiança. A API pode incluir referências em campo opcional da evidência, e o console do professor as mostra.

Ausência de configuração, erro de retrieval ou falta de resultados mantém a sugestão determinística sem citações. A integração já existente de RAG em notificações não muda.

## Consequences

- Arquivos brutos, arquivos sem atributos e arquivos de outros escopos não são usados, mesmo que apareçam no Vector Store.
- O corpus curado precisa estar indexado com os metadados estabelecidos em `docs/rag/regras-derivadas.md`; o screenshot de arquivos anexados não permite validar esses atributos remotamente.
- A resposta da API ganha uma extensão opcional aninhada; clientes antigos ignoram os campos desconhecidos.
- Nenhuma migration de banco é necessária: as referências são guardadas no JSONB de evidências já existente.
- A presença de citação informa proveniência, não prova causalidade nem valida a hipótese da recomendação.

## Alternatives

- Usar o resultado do RAG para reordenar formatos: rejeitado; a decisão aprovada exige ordem determinística inalterada.
- Consultar todos os arquivos do store com apenas `scope=publico`: rejeitado; scope público não garante curadoria/licença apropriada.
- Enviar contexto ou sinais individuais do aluno para buscar evidências: rejeitado por privacidade e desnecessidade.
- Manter RAG só no mentor: substituído por esta exceção estreita e aprovada para citações de regras derivadas.

## Traceability

Aprovação explícita na conversa e comentário na issue #66 em 2026-11-06. Implementação: `api/app/services/openai_rag.py`, `api/app/services/sugestao_ciclo.py`, `api/app/schemas/personalizacao.py` e console do professor. Corpus elegível: `docs/rag/regras-derivadas.md` e `api/app/services/rag_corpus.py`.
