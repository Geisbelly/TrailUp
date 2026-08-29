# Arquitetura do RAG do TrailUp

## Propósito

Este documento define a arquitetura do sistema de Retrieval-Augmented Generation (RAG) do TrailUp. O RAG alimenta respostas do mentor virtual, sugestões de personalização, intervenções psicopedagógicas e notificações personalizadas com base em evidências internas e externas.

## Estado atual

O ecossistema já fecha um ciclo adaptativo:

```
ALUNO → telemetria / emoção / comportamento → IA (LangGraph + LLM) →
→ decisão / recomendação → intervenção → novo sinal do aluno
```

O que já existe na API:
- Pipeline de telemetria (`POST /telemetria/lotes`) e análise adaptativa.
- Mentor virtual (`POST /personalizar/chat`) com contexto do aluno.
- Personalização por perfil BrainHex.
- Fontes do professor em `fontes_personalizacao`.
- `aluno_mental_state_history`, `ai_patch`, `personalizacao_sugestao`.

O que não existe:
- Vector store, embeddings e retrieval semântico.
- Tabela de intervenções e leitura do histórico de estado mental.
- Modelo de comportamento do aluno e camada preditiva antes do LLM.

## Fontes de conhecimento

| Fonte | Origem atual | Como entra no RAG |
|---|---|---|
| Conteúdo do professor | `fontes_personalizacao` | Ingestão → chunking → embedding |
| Telemetria e desempenho | `telemetria_*`, progresso | Resumo/aggregação → embedding de contexto |
| Bases pedagógicas | Documentos carregados | Ingestão → chunking → embedding |
| Bases psicossociais | Documentos carregados | Ingestão → chunking → embedding |
| Evidência científica externa | Artigos, BNCC, benchmarks | Ingestão → chunking → embedding |
| Marketing cognitivo | Documentos carregados | Ingestão → chunking → embedding |

## Componentes

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FONTES DA BASE DE EVIDÊNCIAS                  │
│  Conteúdo do professor · Telemetria · Bases pedagógicas/psicossociais│
│  Evidência científica · Marketing cognitivo                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              CAMADA DE INDEXAÇÃO E ENRIQUECIMENTO                    │
│  • Extração de texto (PDF/DOCX/PPTX/MD/TXT)                         │
│  • Semantic chunking                                                │
│  • Enriquecimento curricular                                        │
│  • Metadados + embeddings + relações                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌─────────┐        ┌─────────┐        ┌─────────────┐
    │ Vector  │        │ Graph   │        │ Document    │
    │ DB      │        │ DB      │        │ Store       │
    │(Postgres│        │(Postgres│        │(R2 /        │
    │pgvector)│        │ tabelas)│        │ Supabase)   │
    └────┬────┘        └────┬────┘        └──────┬──────┘
         │                  │                    │
         └──────────────────┼────────────────────┘
                            ▼
              ┌─────────────────────────┐
              │  LangGraph + LLM (API)  │
              │  ← RAG como contexto    │
              └─────────────────────────┘
```

## Decisões arquiteturais

- **Vector store:** Postgres com extensão `pgvector`. Ver [ADR-0001: Vector store do RAG](../adr/0001-rag-vector-store.md).
- **Fronteira da API:** a API continua sendo apenas IA. Indexação, filas, notificações, progresso bruto e entrega ficam no banco ou em outros serviços.
- **Document store:** materiais brutos permanecem no R2/Supabase Storage; apenas chunks e embeddings ficam no Postgres.
- **Relações:** pré-requisitos e dependências entre conteúdos são modelados em tabelas Postgres (`rag_relacoes`), não em um graph DB separado.

## Modelo de dados

### `rag_chunks`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `fonte_id` | bigint | Referência à fonte original |
| `classe_id` | bigint | Escopo da turma (nullable) |
| `topico_id` | bigint | Escopo do tópico (nullable) |
| `conteudo_id` | bigint | Escopo do conteúdo (nullable) |
| `aluno_id` | uuid | Escopo privado do aluno (nullable) |
| `scope` | text | `publico`, `turma`, `aluno` |
| `texto` | text | Texto do chunk |
| `embedding` | vector(1536) | Vetor de embedding |
| `metadata` | jsonb | Metadados pedagógicos/psicológicos |
| `source_hash` | text | Hash para invalidação |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Última atualização |

### `rag_relacoes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `origem_id` | uuid | Chunk de origem |
| `destino_id` | uuid | Chunk de destino |
| `tipo` | text | `prereq`, `sucessor`, `similar` |

### `intervencoes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK |
| `aluno_id` | uuid | Aluno alvo |
| `tipo` | text | Tipo de intervenção |
| `motivo` | text | Razão da intervenção |
| `contexto` | jsonb | Contexto que gerou a intervenção |
| `acao` | text | Ação sugerida |
| `status` | text | `pending`, `applied`, `dismissed` |
| `created_at` | timestamptz | Criação |
| `resolved_at` | timestamptz | Resolução (nullable) |

## Fluxos

### Ingestão de uma nova fonte

1. Professor ou sistema carrega documento.
2. `app/ingestion/pipeline.py` extrai texto.
3. `semantic_chunker.py` divide em chunks.
4. `content_enrichment.py` enriquece com metadados.
5. Gera embedding para cada chunk.
6. Insere em `rag_chunks` com `source_hash`.
7. Atualiza `rag_relacoes` quando houver pré-requisitos identificados.

### Retrieval no chat do mentor

1. App envia pergunta do aluno.
2. API embeda a pergunta.
3. Busca os `top_k` chunks mais similares filtrados por `classe_id`/`topico_id` e `scope`.
4. Inclui chunks + perfil do aluno + histórico em `rag_context`.
5. LangGraph gera resposta com grounding no corpus.

### Intervenção psicopedagógica

1. Ciclo de análise de telemetria identifica padrão de risco.
2. Nó `agente_intervencao` lê `aluno_mental_state_history` e `intervencoes`.
3. Busca na base psicossocial/pedagógica a melhor ação.
4. Grava `intervencoes` e `notificacoes_ia`.
5. Trigger do banco promove para fila de entrega.

## Casos de uso

1. **Chat inteligente:** respostas do mentor baseadas no conteúdo da turma e no histórico do aluno.
2. **Sugestão de material:** recomendação de próximo conteúdo/formato com base em gaps e estado emocional.
3. **Intervenção:** detecção de risco e ação pedagógica baseada em evidências.
4. **Notificação personalizada:** gatilhos, tom e timing por perfil BrainHex.

## Fronteiras

- A API não implementa CRUD de trilhas, turmas, filas, ranking, notificações nem progresso bruto.
- A API não gera mídia pesada; isso continua no microserviço `ApiBrainHex`.
- A API não entrega push; isso é responsabilidade do banco (`pg_cron` + `pg_net`).

## Riscos

| Risco | Mitigação |
|---|---|
| Custo de embeddings | Deduplicação por `source_hash`; reindexar apenas o que mudou. |
| Latência do retrieval | `top_k` enxuto (5-10); índice HNSW; cache de queries frequentes. |
| Privacidade | RLS por `aluno_id`/`classe_id`; anonimizar dados psicossociais. |
| Qualidade do corpus | Manter enriquecimento curricular antes de indexar; revisar fontes externas. |

## Referências

- [ADR-0001: Vector store do RAG](../adr/0001-rag-vector-store.md)
- [Funcionamento da API e Fluxos](../api/funcionamento-api-arquitetura-fluxos.md)
- [Arquitetura e Funcionamento Geral](../api/arquitetura-funcionamento-geral-sistema.md)
