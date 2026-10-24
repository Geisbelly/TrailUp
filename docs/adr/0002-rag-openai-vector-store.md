# 0002: OpenAI Vector Store para o RAG

- Status: Accepted
- Date: 2026-09-09
- Supersedes: [ADR-0001](0001-rag-vector-store.md)

## Context

O TrailUp já possui extração e normalização de documentos, mas o desenho
anterior exigia operar `pgvector`, gerar embeddings e implementar chunking e
retrieval próprios. O projeto agora possui um Vector Store gerenciado pela
OpenAI (`vs_6aa1e1f21fec8191be34139c235a849e`) para o corpus público do RAG.

## Decision

Usar o OpenAI Vector Store com a ferramenta `file_search` da Responses API como
camada de indexação e retrieval para documentos públicos.

- A OpenAI recebe o arquivo original e gerencia parsing, chunking, embeddings e
  índice vetorial.
- A API mantém a chave somente no backend e consulta o store por `file_search`.
- O Postgres mantém `rag_openai_files`, um catálogo operacional com a fonte
  local, IDs remotos, hash, escopo, atributos e status de indexação.
- O ID fornecido é reservado para `scope = publico`. Documentos de turma ou de
  aluno exigem vector store separado por fronteira de confiança ou uma decisão
  explícita de isolamento; não serão enviados ao corpus público.
- O pipeline local de extração continua útil para validação, metadados e fluxos
  legados, mas não gera embeddings nem é o caminho principal de chunking do RAG.

## Authorization and data flow

1. O backend valida formato, tamanho, MIME type, escopo e autorização da fonte.
2. O backend envia o arquivo à OpenAI Files e o associa ao Vector Store correto.
3. O backend aguarda `status = completed` e registra os IDs/status sem salvar a
   chave ou conteúdo bruto em logs.
4. No chat, o backend escolhe somente vector stores permitidos para a sessão e
   monta filtros de atributos quando aplicável.
5. A resposta é gerada com `file_search`; as citações retornadas pela OpenAI
   permanecem associadas à resposta para auditoria.

Filtros remotos são defesa em profundidade, não substituto da autorização local.
O servidor nunca aceita `vector_store_id`, `scope`, `classe_id` ou `aluno_id`
diretamente do cliente sem derivá-los da sessão e das permissões verificadas.

## Consequences

### Positive

- Menos infraestrutura e código operacional no Postgres.
- Sem custo e manutenção de embeddings próprios.
- Chunking e busca são fornecidos pelo serviço gerenciado.
- O catálogo local preserva deduplicação, auditoria e vínculo com o domínio.

### Negative

- Dependência operacional da OpenAI e dos limites do Vector Store.
- Custos e retenção passam a depender da plataforma OpenAI.
- O banco não consegue fazer joins SQL diretamente com chunks remotos.
- Isolamento de documentos privados precisa de múltiplos stores ou de uma
  política rigorosa de atributos e filtros.

## Migration

- Configurar `OPENAI_API_KEY` apenas no ambiente do backend.
- Configurar `OPENAI_RAG_VECTOR_STORE_ID` com o store público já criado.
- Aplicar a migration `20261024_01_openai_vector_store_registry` (revisão `20261024_01`, reencadeada sobre `20261022_05` ao trazer o #166 para a main).
- Não migrar automaticamente os registros de `rag_chunks` para o store remoto;
  cada fonte deve ser reenviada com hash e registro idempotente.
- Manter `rag_chunks` temporariamente para compatibilidade e removê-lo somente
  após confirmar que não há consumidores do retrieval pgvector.
