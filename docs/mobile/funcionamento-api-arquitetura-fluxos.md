# Funcionamento da API TrailUp: Arquitetura, Fluxos e Responsabilidades

Atualizado em: 2026-04-13

## 1. Objetivo

Este documento descreve como a API TrailUp funciona em producao e como ela se integra com Web, Mobile e Supabase.

Escopo:
- arquitetura tÃ©cnica da API
- responsabilidades por camada e por repositÃ³rio
- fluxos operacionais principais (personalizaÃ§Ã£o, chat, telemetria)
- contratos HTTP relevantes
- dependÃªncias de banco, storage, views e edge functions

## 1.1 Atualizacoes recentes (2026-04-13)

- Pipeline de midias da personalizacao refatorado para DAG com estagios explicitos:
  - `input -> normalize -> generate -> render -> output`.
  - Implementacao central: `app/services/media_pipeline.py`.
- Estrategia fast-first aplicada no runtime:
  - resposta inicial prioriza `cards` e `quiz`;
  - midias (`pdf`, `documento`, `apresentacao`, `audio`, `video`) seguem assincronas.
- Geracao de `video` mudou para `mp4` minimo com `MoviePy + ffmpeg` (`app/services/video.py`).
- Fallback parcial por falha de fonte/midia:
  - personalizacao rapida permanece disponivel;
  - status por artefato em `materiais[*].metadata.status` (`pending|completed|failed`).
- Fluxo `class_theme_sync` consolidado:
  - trigger SQL em `classe` enfileira job em `personalizacao_jobs`;
  - worker popula/atualiza `classe_mapa_tema`.

## 2. Papel da API no ecossistema

```mermaid
flowchart LR
  subgraph WEB[Web Console Professor]
    W1[CRUD pedagogico no Supabase]
    W2[Disparo de jobs /personalizar/jobs/*]
  end

  subgraph API[TrailUp API - FastAPI]
    A1[Auth e autorizacao]
    A2[Worker de personalizacao]
    A3[Chat mentor e progresso]
    A4[Telemetria e analise]
  end

  subgraph MOBILE[Mobile Aluno]
    M1[Le trilha e personalizacao]
    M2[Envia progresso personalizado]
    M3[Envia telemetria em lote]
  end

  subgraph SUPABASE[Supabase]
    DB[(Postgres)]
    ST[(Storage bucket)]
    RT[(Realtime)]
  end

  W1 --> DB
  W2 --> API
  API --> DB
  API --> ST
  M1 --> DB
  DB --> RT
  RT --> M1
  M2 --> API
  M3 --> API
```

Resumo:
- Web controla modelagem pedagÃ³gica e orquestracao de jobs.
- API executa regras de negocio server-side e geraÃ§Ã£o assÃ­nc.
- Mobile consome dados persistidos e envia sinais de uso/progresso.
- Supabase concentra persistencia, storage e realtime.

## 3. Arquitetura tÃ©cnica da API

## 3.1 Camadas

| Camada | Responsabilidade | Arquivos centrais |
|---|---|---|
| API Layer | Rotas HTTP, validaÃ§Ã£o inicial, mapeamento de payload/response | `app/api/router.py`, `app/api/v1/*.py` |
| Auth Layer | JWT Supabase, fallback em `/auth/v1/user`, resoluÃ§Ã£o de identidade e papeis | `app/services/auth.py`, `app/api/deps.py` |
| Service Layer | Orquestracao de personalizaÃ§Ã£o, jobs, telemetria, storage | `app/services/personalizacao.py`, `app/services/personalizacao_jobs.py`, `app/services/analysis_runner.py`, `app/services/storage.py` |
| Agent Layer | Grafo LangGraph para workflows personalizaÃ§Ã£o/anÃ¡lise | `app/agent/graph/builder.py`, `app/agent/graph/routing.py`, `app/agent/graph/nodes/*` |
| Repository Layer | SQL encapsulado por dominio | `app/repositories/*.py` |
| Persistence Layer | Postgres (Supabase) + buckets | tabelas `public.*` e bucket de artefatos |

## 3.1.1 Diagrama por camada

### API Layer

```mermaid
flowchart LR
  C[Cliente Web/Mobile] --> R[Router FastAPI]
  R --> D[Depends e validacao inicial]
  D --> H[Handler v1]
  H --> S[Service Layer]
  S --> H
  H --> RESP[Response Pydantic]
  RESP --> C
```

### Auth Layer

```mermaid
flowchart TD
  T[Bearer Token] --> DL{decode local HS256}
  DL -- ok --> CL[claims locais]
  DL -- erro --> FB{fallback Supabase Auth}
  FB -- ok --> CR[claims remotos]
  FB -- erro --> E401[401]
  CL --> ID[resolve_user_identity]
  CR --> ID
  ID --> RL{role e acesso validos?}
  RL -- nao --> E403[403]
  RL -- sim --> UC[UserContext]
  UC --> GD[Guards require_aluno/professor]
```

### Service Layer

```mermaid
flowchart LR
  I[Payload validado] --> SV[Servico de dominio]
  SV --> CTX[Build de contexto/estado]
  CTX --> AG[Agent Layer]
  AG --> NR[Normalizacao de resultado]
  NR --> RP[Repository Layer]
  RP --> OUT[Resposta de negocio]
```

### Agent Layer

```mermaid
flowchart TD
  ST[State inicial] --> SUP[Supervisor]
  SUP --> DEC{workflow_kind}
  DEC -- personalizar --> P1[plano_personalizacao]
  P1 --> P2[ai_patch]
  P2 --> P3[midias_personalizadas]
  P3 --> PP[persist_personalizacao]
  DEC -- analisar --> A1[agente_emocao/perfil/trilha]
  A1 --> A2[agente_conteudo/ui/notificacao]
  A2 --> EX[executor]
  PP --> END[State final]
  EX --> END
```

### Repository Layer

```mermaid
flowchart LR
  SRV[Service Layer] --> REPO[Repositorio especifico]
  REPO --> SQL[SQL parametrizado]
  SQL --> TX[Transacao AsyncSession]
  TX --> DB[(Postgres)]
  DB --> TX
  TX --> MAP[Mapeamento row -> dict/model]
  MAP --> SRV
```

### Persistence Layer

```mermaid
flowchart TB
  subgraph PG[Postgres Supabase]
    T1[conteudo_personalizado]
    T2[personalizacao_jobs e targets]
    T3[telemetria_*]
    V1[views analiticas]
  end

  subgraph ST[Supabase Storage]
    B1[artefatos e uploads]
  end

  API[API] --> PG
  API --> ST
  PG --> RT[Realtime]
  RT --> MOB[Mobile]
  PG --> WEB[Web console]
```

## 3.2 Composicao de rotas

`app/api/router.py` monta:
- `/health`
- `/admin/*`
- `/api/v1/admin/*`
- `/api/v1/emocoes/*`
- `/api/v1/materiais/*`
- `/api/v1/personalizar/*`
- `/api/v1/telemetria/*`

## 3.3 Inicializacao runtime

`app/main.py`:
1. cria `engine` e `session_factory`
2. inicializa checkpointer persistente (personalizaÃ§Ã£o) e efemero
3. compila dois grafos:
- `graph_personalizacao`
- `graph_ephemeral`
4. inicia retention de checkpoints quando habilitado
5. inicia loop de jobs de personalizaÃ§Ã£o quando DB e Postgres

```mermaid
sequenceDiagram
  participant BOOT as FastAPI Lifespan
  participant DB as Postgres
  participant CP as Checkpointer
  participant G as Graph Builder
  participant WK as Jobs Loop

  BOOT->>DB: build_session_factory()
  BOOT->>CP: get_persistent_checkpointer()
  BOOT->>CP: get_ephemeral_checkpointer()
  BOOT->>G: build_graph(... persistent ...)
  BOOT->>G: build_graph(... ephemeral ...)
  alt retention habilitado e backend postgres
    BOOT->>CP: run_checkpoint_retention_once()
    BOOT->>CP: checkpoint_retention_loop()
  end
  alt database_url postgres
    BOOT->>WK: personalizacao_jobs_loop()
  end
```

## 4. Seguranca e autorizaÃ§Ã£o

## 4.1 Fluxo de autenticaÃ§Ã£o

`Authorization: Bearer <token>`:
1. tenta `jwt.decode` local com `SUPABASE_JWT_SECRET`
2. se falhar, tenta resolver token no Supabase Auth (`/auth/v1/user`)
3. resolve identidade em banco (`AccessRepository`)
4. aplica regras de acesso:
- `aluno`
- `professor` + `professor_liberado=true`

```mermaid
flowchart TD
  A[Bearer token] --> B{jwt.decode local ok?}
  B -- Sim --> C[claims locais]
  B -- Nao --> D{fallback /auth/v1/user ok?}
  D -- Sim --> E[claims remotos]
  D -- Nao --> F[401 token invalido]
  C --> G[resolve_user_identity]
  E --> G
  G --> H{papel autorizado?}
  H -- Nao --> I[403]
  H -- Sim --> J[UserContext]
```

## 4.2 Controle por endpoint

| Grupo | Usuario permitido | Regra complementar |
|---|---|---|
| `/api/v1/personalizar` (POST) | aluno | precisa informar `topico_id` ou `conteudo_id` |
| `/api/v1/personalizar/progresso` | aluno | so atualiza progresso do prÃ³prio `personalizacao_id` |
| `/api/v1/personalizar/chat` | aluno | chat sem entrega de gabarito |
| `/api/v1/personalizar/jobs/*` | professor | professor precisa ser dono da classe |
| `/api/v1/personalizar/contexto/{aluno_id}` | professor | precisa ter acesso ao aluno |
| `/api/v1/materiais/{aluno_id}` | aluno/professor | aluno ve o prÃ³prio; professor com acesso |
| `/api/v1/telemetria/lotes` | aluno | sessao e lote gravados por aluno autenticado |
| `/api/v1/admin/*` e `/admin/*` | basic auth admin | usuario/senha de admin panel |

## 5. Contratos HTTP principais

## 5.1 PersonalizaÃ§Ã£o

| Endpoint | Metodo | Finalidade |
|---|---|---|
| `/api/v1/personalizar` | POST | gera personalizaÃ§Ã£o imediata para aluno |
| `/api/v1/personalizar/{aluno_id}` | GET | lista personalizaÃ§Ãµes persistidas |
| `/api/v1/personalizar/progresso` | POST | upsert de progresso por item personalizado |
| `/api/v1/personalizar/chat` | POST | chat de mentor contextual |
| `/api/v1/personalizar/fontes` | POST multipart | upload/link de fontes de personalizaÃ§Ã£o |
| `/api/v1/personalizar/contexto/{aluno_id}` | GET | visÃ£o docente (contexto + personalizaÃ§Ã£o + progresso) |

## 5.2 Jobs assÃ­nc de personalizaÃ§Ã£o

| Endpoint | Metodo | Kind interno |
|---|---|---|
| `/api/v1/personalizar/jobs/enrollment` | POST | `student_enrollment` |
| `/api/v1/personalizar/jobs/class-delta` | POST | `class_delta_sync` |
| `/api/v1/personalizar/jobs/student-cleanup` | POST | `student_cleanup` |
| `/api/v1/personalizar/jobs/full-sync` | POST | `full_class_sync` |
| `/api/v1/personalizar/jobs` | GET | listagem com filtros |
| `/api/v1/personalizar/jobs/{job_id}` | GET | detalhe + targets |

## 5.3 Telemetria e anÃ¡lise

| Endpoint | Metodo | Finalidade |
|---|---|---|
| `/api/v1/telemetria/lotes` | POST | ingestao de lote de sinais e eventos app |
| `/api/v1/emocoes/analisar` | POST | anÃ¡lise pontual |
| `/api/v1/emocoes/analisar-stream` | POST | streaming SSE de anÃ¡lise |

## 6. Fluxo de personalizaÃ§Ã£o (motor principal)

## 6.1 Fontes de dados para montar estado

`build_personalizacao_state` combina:
- contexto do aluno (`ContextRepository`)
- estrutura da classe/tÃ³pico/conteÃºdo (`ConteudoClasseRepository`)
- fontes estruturadas (`fontes_personalizacao`)
- snapshot do cliente e materiais de origem enviados no payload
- sinais tÃ³pico: `cards`, `atividades`, `questoes`

No final, gera `source_hash` (sha256) para deduplicacao.

## 6.2 Fluxo on-demand (`POST /api/v1/personalizar`)

```mermaid
sequenceDiagram
  participant MOB as Mobile (aluno)
  participant API as /personalizar
  participant SRV as build_personalizacao_state
  participant G as graph_personalizacao
  participant DB as conteudo_personalizado

  MOB->>API: POST /api/v1/personalizar
  API->>SRV: montar estado + source_hash
  API->>G: ainvoke(state)
  G->>DB: persist_personalizacao
  API->>DB: fallback buscar_por_ciclo_id
  API-->>MOB: PersonalizacaoResponse
```

## 6.3 Fluxo assÃ­nc por jobs

```mermaid
sequenceDiagram
  participant WEB as Web Console
  participant API as Jobs API
  participant DB as personalizacao_jobs
  participant WK as Worker Loop
  participant G as graph_personalizacao

  WEB->>API: POST /jobs/class-delta
  API->>DB: cria job + targets
  loop polling
    WK->>DB: claim_next_job
    loop cada target aluno x topico
      WK->>WK: build_personalizacao_state
      WK->>DB: ler ultimo conteudo_personalizado
      alt source_hash igual
        WK->>DB: target status = skipped
      else source_hash diferente
        WK->>G: ainvoke(state)
        WK->>DB: upsert conteudo_personalizado
        WK->>DB: seed personalizacao_item_progresso
        WK->>DB: target status = completed
      end
    end
    WK->>DB: refresh counters + finalize status
  end
```

## 6.4 Estados de job e target

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> processing
  processing --> completed
  processing --> partial
  processing --> failed
  partial --> processing
  completed --> [*]
  failed --> [*]
```

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> processing
  processing --> completed
  processing --> skipped
  processing --> pending: retry
  processing --> failed
  completed --> [*]
  skipped --> [*]
  failed --> [*]
```

## 6.5 Tipos de job e uso esperado

| Kind | Quando usar | Efeito |
|---|---|---|
| `student_enrollment` | entrada de aluno em classe | gera trilha personalizada inicial |
| `class_delta_sync` | mudanca de conteÃºdo/tÃ³pico/atividade | recalcula afetados na classe |
| `full_class_sync` | reconciliacao ampla | recalcula todos aluno x tÃ³pico |
| `student_cleanup` | remocao de aluno / limpeza | remove personalizaÃ§Ã£o, progresso, fontes e artefatos |
| `manual_retry` | recuperacao operacional | reprocessa itens com falha |

## 7. Tipos de personalizaÃ§Ã£o e como sÃ£o gerados

O plano pode recomendar multiplos formatos; normalizaÃ§Ã£o aceita:
- `pdf`
- `cards`
- `quiz`
- `video`
- `audio`
- `documento`
- `apresentacao`
- `imagem`

Pipeline funcional:
1. `generate_plano_personalizacao`: estratÃ©gia e formato prioritario.
2. `generate_ai_patch_personalizacao`: ajustes comportamentais e UI.
3. `generate_materiais_personalizados`: payload final de materiais e artefatos.
4. `persist_personalizacao_record`: grava `conteudo_personalizado`.
5. `build_personalizacao_steps`: deriva passos para `personalizacao_item_progresso`.

## 8. Fluxo de chat mentor e progresso

## 8.1 Chat mentor (`/api/v1/personalizar/chat`)

- usa contexto do aluno + Ãºltima personalizaÃ§Ã£o do tÃ³pico/conteÃºdo
- aplica guardrails anti-gabarito
- tenta resposta LLM (`mentor_personalizacao_chat.txt`)
- fallback deterministico quando necessario
- auditoria de decisÃ£o em `ia_decision_logs`

## 8.2 Progresso personalizado (`/api/v1/personalizar/progresso`)

- upsert por chave unica `(aluno_id, personalizacao_id, item_key)`
- atualiza status, percentual, tempo e pontuaÃ§Ã£o
- em conclusÃ£o com ganho real de score, publica evento em `eventos_aluno`

## 9. Fluxo de telemetria

`POST /api/v1/telemetria/lotes`:
1. sanitiza payload (nÃ£o persiste frame base64 bruto no payload final)
2. normaliza sinais para eventos legados
3. upsert de `telemetria_sessoes`
4. insert idempotente de `telemetria_lotes`
5. insert de eventos app e mÃ©tricas de tempo
6. executa `run_analysis` e anexa resumo no lote

```mermaid
sequenceDiagram
  participant MOB as Mobile
  participant API as /telemetria/lotes
  participant DB as Supabase
  participant AN as run_analysis

  MOB->>API: lote de sinais + eventos + camera
  API->>DB: upsert telemetria_sessoes
  API->>DB: insert telemetria_lotes
  API->>DB: insert telemetria_eventos_app
  API->>DB: insert telemetria_time_metric_entries
  API->>AN: run_analysis(...)
  AN-->>API: ciclo_id + acoes + erros
  API->>DB: update analysis_ciclo_id
  API-->>MOB: TelemetriaLoteResponse
```

ObservaÃ§Ã£o:
- no Mobile existe fallback para gravacao direta no Supabase quando API indisponÃ­vel.

## 10. Banco de dados usado pela API

## 10.1 Tabelas de runtime mais sensiveis

| Dominio | Tabelas |
|---|---|
| PersonalizaÃ§Ã£o | `conteudo_personalizado`, `fontes_personalizacao`, `personalizacao_jobs`, `personalizacao_job_targets`, `personalizacao_item_progresso`, `materiais_gerados`, `ia_decision_logs` |
| Telemetria | `telemetria_sessoes`, `telemetria_lotes`, `telemetria_eventos_app`, `telemetria_time_metric_entries` |
| AnÃ¡lise/progresso | `eventos_aluno`, `atividade_aluno`, `questao_aluno`, `topico_aluno`, `conteudo_aluno` |
| Infra LangGraph | `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations` |

## 10.2 Views analiticas versionadas

No SQL versionado (`sql/manual_supabase_migration.sql`) existem views como:
- `vw_rank_posicoes_por_classe`
- `vw_metricas_sessoes_aluno_dia`
- `vw_metricas_engajamento_aluno_classe`
- `vw_metricas_desempenho_aluno_classe`
- `vw_metricas_comportamento_aluno_classe`
- `vw_metricas_chat_aluno_classe`
- `vw_metricas_evolucao_desempenho_aluno_dia`
- `vw_sequencia_navegacao_aluno`
- `vw_ia_decision_logs_resumo`
- `vw_telemetria_tempo_topico_aluno`
- `vw_telemetria_tempo_conteudo_aluno`
- `vw_telemetria_tempo_atividade_aluno`

## 10.3 Functions e triggers

Nos artefatos SQL versionados nos repositÃ³rios analisados:
- ha `CREATE FUNCTION`/`CREATE TRIGGER` custom versionado para `eventos_aluno` (ver `sql/20260417_05_eventos_aluno_trigger_iud.sql`).

Se houver functions/triggers adicionais no projeto Supabase hospedado, eles nÃ£o estÃ£o representados nesses artefatos locais e devem ser exportados para versionamento.

## 11. IntegraÃ§Ãµes com Edge Functions (Web)

Edge Functions no repo Web:
- `supabase/functions/generate-content-ai`
- `supabase/functions/validate-essay-answer-ai`

Papel:
- nÃ£o substituem o worker da API
- complementam o fluxo docente (geraÃ§Ã£o assistida e correÃ§Ã£o dissertativa)

Regra de nota da dissertativa:
- com `notaEstabelecida`, usa nota informada
- sem `notaEstabelecida`, escala padrÃ£o 0-100 (`nota_maxima = 100`)

## 12. Matriz de responsabilidades por repositÃ³rio

| RepositÃ³rio | Responsabilidade primÃ¡ria | Relacao com a API |
|---|---|---|
| Web (`brainhex-navigator`) | Console do professor e disparo de jobs | cliente de `/api/v1/personalizar/jobs/*`, contexto docente e edge functions |
| API (`ApiTraiUp`) | LÃ³gica central server-side e worker assÃ­nc | fonte de verdade dos fluxos de personalizaÃ§Ã£o/chat/telemetria |
| Mobile (`trailup-app-dsm-2502`) | ExperiÃªncia do aluno e envio de sinais | consome personalizaÃ§Ã£o, envia progresso/chat/telemetria |

## 13. ConfiguraÃ§Ã£o operacional critica

| Variavel | Uso |
|---|---|
| `DATABASE_URL` | conexÃ£o principal para repositÃ³rios SQL |
| `LANGGRAPH_DB_URL` | backend de checkpoint quando aplicavel |
| `SUPABASE_URL` | base URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | acesso server-side a Auth/Storage |
| `SUPABASE_JWT_SECRET` | validaÃ§Ã£o local de bearer token |
| `LLM_PROVIDER` | seletor `openai` ou `gemini` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | credenciais do provedor LLM |
| `PERSONALIZACAO_JOB_CONCURRENCY` | paralelismo do worker |
| `PERSONALIZACAO_JOB_POLL_SEC` | intervalo de polling |
| `PERSONALIZACAO_JOB_MAX_RETRIES` | retries por target |
| `CHECKPOINT_RETENTION_*` | politica de limpeza de checkpoint |

## 14. OperaÃ§Ã£o, saude e diagnostico

`GET /health` informa:
- ambiente
- status DB
- backend dos checkpointers (personalizaÃ§Ã£o e ephemeral)
- parametros de retention
- status do worker de jobs

Checklist rapido de incidente:
1. validar `/health`
2. inspecionar fila em `personalizacao_jobs` e `personalizacao_job_targets`
3. conferir `last_error` e contadores (`processed_targets`, `error_count`)
4. validar acesso storage/bucket para artefatos
5. testar token de aluno/professor e ownership da classe

## 15. Referencias de codigo

- `app/main.py`
- `app/api/router.py`
- `app/api/deps.py`
- `app/api/v1/personalizacao.py`
- `app/api/v1/telemetria.py`
- `app/api/v1/emocoes.py`
- `app/services/auth.py`
- `app/services/personalizacao.py`
- `app/services/personalizacao_jobs.py`
- `app/repositories/personalizacao_jobs.py`
- `sql/manual_supabase_migration.sql`

