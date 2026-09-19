# 0001: Vector store do RAG no Postgres com pgvector

- Status: Accepted
- Date: 2026-08-29

## Context

O TrailUp precisa de uma base de evidências para alimentar o RAG usado pelo mentor virtual, sugestões de personalização, intervenções psicopedagógicas e notificações. Essa base requer um vector store para retrieval semântico de chunks enriquecidos.

Restrições do projeto:
- A API roda no free tier e hiberna; o Postgres não.
- A API deve permanecer como camada de IA; infraestrutura de filas, cron e entrega fica no banco.
- A ingestão e chunking de documentos já existem na API (`app/ingestion/`).
- O ecossistema já usa Supabase (Postgres + Storage + Auth) como plataforma principal.

## Decision

Usar o Postgres do Supabase com a extensão `pgvector` como vector store do RAG.

Modelo de embedding: `text-embedding-3-small` (1536 dimensões) da OpenAI, com fallback para embedding equivalente do Google (`text-embedding-004`) caso necessário.

## Alternatives Considered

### Vector store dedicado externo (Qdrant, Pinecone, Weaviate)

- **Pros:** melhor escalabilidade de retrieval, índices otimizados, suporte a híbrido sparse/dense.
- **Cons:** adiciona novo componente de infraestrutura, novo vendor/custo, sincronização de dados e duplicação de regras de acesso.
- **Rejected because:** o volume inicial de chunks não justifica a complexidade; manter tudo no Postgres simplifica transações, RLS e operação no free tier.

### FAISS/Chroma local em disco/memória

- **Pros:** simples de rodar localmente, sem custo de serviço.
- **Cons:** não é compartilhável entre instâncias da API, perde estado quando o container reinicia, exige sincronização manual com o banco.
- **Rejected because:** a API é stateless e hiberna; o vector store precisa persistir no banco.

## Consequences

### Positive

- Mesmo banco de dados, mesmas transações e mesmas políticas RLS.
- Retrieval disponível mesmo quando a API está hibernando.
- Caminho de implementação curto: reaproveita a ingestão e chunking existentes.
- Sem custo adicional de infraestrutura além do embedding.

### Negative

- Carga extra no Postgres; embeddings ocupam espaço em disco.
- Retrieval muito grande pode exigir upgrade do banco ou migração futura para vector store dedicado.
- Índices vetoriais consomem recursos durante inserts/updates.

### Migration

- Habilitar extensão `vector` no Supabase.
- Criar tabela `rag_chunks` com coluna `embedding vector(1536)`.
- Criar índice HNSW ou IVFFlat para busca por similaridade.
- Implementar invalidação por `source_hash` para regenerar embeddings quando fontes mudarem.

## Traceability

- Arquitetura: [docs/architecture/rag.md](../architecture/rag.md)
- Requisito alinhado: base de evidências para RAG no TrailUp.
- Issues de implementação: a serem criadas no tracker.