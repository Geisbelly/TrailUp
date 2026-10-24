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

O que ainda falta:
- Expor um fluxo administrativo para cadastrar documentos públicos no Vector Store.
- Tabela de intervenções e leitura do histórico de estado mental.
- Modelo de comportamento do aluno e camada preditiva antes do LLM.

Já existe a integração operacional do chat com retrieval via `file_search` e o
serviço backend para indexar arquivos públicos de forma explícita.

## Fontes de conhecimento

| Fonte | Origem atual | Como entra no RAG |
|---|---|---|
| Conteúdo do professor | `fontes_personalizacao` | Validação → upload → `file_search` |
| Telemetria e desempenho | `telemetria_*`, progresso | Resumo local → contexto da sessão |
| Bases pedagógicas | Documentos carregados | Validação → upload → `file_search` |
| Bases psicossociais | Documentos carregados | Validação → upload → `file_search` |
| Evidência científica externa | Artigos, BNCC, benchmarks | Validação → upload → `file_search` |
| Marketing cognitivo | Documentos carregados | Validação → upload → `file_search` |

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
│  • Validação e metadados                                            │
│  • Enriquecimento curricular                                        │
│  • Validação + metadados + registro de IDs remotos                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌─────────┐        ┌─────────┐        ┌─────────────┐
    │ OpenAI  │        │ Postgres│        │ Document    │
    │ Vector  │        │ catálogo│        │ Store       │
    │ Store   │        │/relações│        │ (R2 /       │
    │file_search│      │         │        │ Supabase)   │
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

- **Vector store:** OpenAI Vector Store com `file_search`. Ver [ADR-0002: OpenAI Vector Store para o RAG](../adr/0002-rag-openai-vector-store.md).
- **Catálogo local:** `rag_openai_files` guarda IDs, hashes, status, escopo e atributos; não guarda embeddings.
- **Fronteira da API:** a API continua sendo apenas IA e a única camada autorizada a chamar a OpenAI.
- **Document store:** o arquivo pode permanecer no R2/Supabase para o domínio, enquanto uma cópia indexável é enviada à OpenAI.
- **Relações:** pré-requisitos e dependências entre conteúdos são modelados em tabelas Postgres (`rag_relacoes`), não em um graph DB separado.

## Modelo de dados

### `rag_openai_files`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK local |
| `fonte_id` | bigint | Referência à fonte original |
| `vector_store_id` | text | ID do Vector Store remoto |
| `openai_file_id` | text | ID do arquivo na OpenAI |
| `openai_vector_store_file_id` | text | ID do vínculo/indexação remoto |
| `scope` | text | `publico`, `turma`, `aluno` |
| `classe_id` / `aluno_id` | bigint/uuid | Escopo local autorizado |
| `source_hash` | text | Hash para deduplicação |
| `attributes` | jsonb | Atributos enviados para filtros |
| `status` | text | Estado da indexação remota |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Última atualização |

### `rag_relacoes` (legado durante a migração)

| Coluna | Tipo | Descrição |
|---|---|---|
| `origem_id` | uuid | Chunk de origem |
| `destino_id` | uuid | Chunk de destino |
| `tipo` | text | `prereq`, `sucessor`, `similar` |

`rag_chunks` e `rag_relacoes` permanecem somente para compatibilidade com a
migração anterior. O caminho novo não grava chunks locais; relações que ainda
dependam de `rag_chunks` devem ser migradas antes da remoção desse schema.

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
2. `app/ingestion/pipeline.py` valida e, quando necessário, extrai metadados/texto.
3. `content_enrichment.py` enriquece metadados sem produzir embeddings locais.
4. Envia o arquivo à OpenAI Files e ao Vector Store autorizado; o serviço faz chunking e embeddings.
5. Aguarda a indexação e registra `openai_file_id`, vínculo remoto e status em `rag_openai_files`.
6. Atualiza relações locais quando houver pré-requisitos identificados.

### Retrieval no chat do mentor

1. App envia pergunta do aluno.
2. API verifica a sessão e deriva o corpus permitido.
3. LangGraph chama a Responses API com `file_search` e filtros remotos aplicáveis.
4. Inclui os resultados citados + perfil do aluno + histórico em `rag_context`.
5. O modelo gera resposta com grounding no corpus.

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
| Custo de indexação | Deduplicação por `source_hash`; reindexar apenas o que mudou. |
| Latência do retrieval | Limitar resultados e usar o store correto; observar chamadas da Responses API. |
| Privacidade | Autorização local antes da chamada; stores separados para fronteiras privadas. |
| Qualidade do corpus | Manter enriquecimento curricular antes de indexar; revisar fontes externas. |

## Referências

- [ADR-0001: Vector store do RAG](../adr/0001-rag-vector-store.md)
- [Funcionamento da API e Fluxos](../api/funcionamento-api-arquitetura-fluxos.md)
- [Arquitetura e Funcionamento Geral](../api/arquitetura-funcionamento-geral-sistema.md)
