# Estrutura do Banco de Dados - TrailUp (Supabase)

Atualizado em: 2026-04-13

## 1. Objetivo

Este documento descreve a estrutura atual do banco Supabase do ecossistema TrailUp e como Web, API e Mobile usam esse schema em producao.

Escopo:
- catalogo de tabelas por dominio
- relacionamentos principais
- indexes, constraints e RLS relevantes
- views analiticas
- fluxos de escrita e leitura entre sistemas
- regra atual de `questoes.nota_estabelecida`

Fontes usadas:
- `C:\Users\geisb\Downloads\Banco de dados completo - TrailUp.txt`
- `C:\Users\geisb\Downloads\ApiTraiUp\sql\manual_supabase_migration.sql`
- `20260412_add_nota_estabelecida_to_questoes.sql` (migration Web)
- `20260412_make_nota_estabelecida_optional.sql` (migration Web)
- `20260413_sync_classe_mapa_tema.sql` (migration de classe -> mapa tematico)

### 1.1 Atualizacoes recentes (2026-04-13)

- Job `class_theme_sync` padronizado no backend para manter `classe_mapa_tema` sincronizada.
- Trigger SQL em `classe` enfileira job automaticamente em `personalizacao_jobs`.
- Pipeline de personalizacao multimidia fast-first:
  - persist?ncia inicial de `cards` e `quiz`;
  - midias geradas em segundo plano com status (`pending|completed|failed`) no JSON de `materiais`.
- Artefato de video atualizado para `mp4` no bucket de aluno.

## 2. Leitura rapida (mapa geral)

### 2.1 Arquitetura fim a fim

```mermaid
flowchart LR
  subgraph Web[Web Console Professor]
    W1[CRUD pedagogico]
    W2[Disparo de jobs]
    W3[Edge Functions IA]
  end

  subgraph API[API FastAPI]
    A1[Auth JWT Supabase]
    A2[Worker de personalizacao]
    A3[Telemetria e chat]
  end

  subgraph Mobile[App Mobile Aluno]
    M1[Consumo da trilha]
    M2[Consumo de personalizacao]
    M3[Envio de telemetria]
  end

  subgraph Data[Supabase]
    DB[(Postgres)]
    ST[(Storage Buckets)]
    RT[(Realtime)]
  end

  W1 --> DB
  W2 --> A2
  W3 --> DB
  A1 --> DB
  A2 --> DB
  A2 --> ST
  A3 --> DB
  M1 --> DB
  M2 --> DB
  DB --> RT
  RT --> M2
  M3 --> A3
  M3 -. fallback .-> DB
```

### 2.2 DistribuiÃ§Ã£o de tabelas por dominio (aproximada)

```mermaid
pie showData
  title Distribuicao aproximada de tabelas por dominio
  "Identidade e acesso" : 8
  "Estrutura pedagogica" : 11
  "Progresso academico" : 8
  "Personalizacao" : 9
  "Telemetria" : 4
  "Gamificacao e notificacoes" : 8
  "Infra/runtime" : 5
```

### 2.3 Matriz de responsabilidade por sistema

| Componente | Escreve em tabelas base | Escreve personalizaÃ§Ã£o | Escreve telemetria | Le personalizaÃ§Ã£o | Dispara IA |
|---|---|---|---|---|---|
| Web | Sim | Indireto (via API jobs) | NÃ£o | Parcial (contexto docente) | Sim (Edge Functions) |
| API | NÃ£o (CRUD pedagÃ³gico principal) | Sim | Sim | Sim | Sim |
| Mobile | Sim (progresso do aluno) | Sim (progresso item via API) | Sim | Sim | NÃ£o direto (usa API/edge) |
| Edge Functions | Parcial | NÃ£o | NÃ£o | NÃ£o | Sim |

## 3. Modelo por dominio (com tabelas)

### 3.1 Mapa de dominios

| Dominio | Tabelas principais | Finalidade operacional |
|---|---|---|
| Identidade e acesso | `alunos`, `professor`, `perfil`, `aluno_perfil`, `professor_aluno`, `modoOperacao`, `expo_tokens`, `solicitacoes_exclusao` | Identidade acadÃªmica, v?nculos e perfis |
| Estrutura pedagÃ³gica | `materia`, `classe`, `classe_aluno`, `topicos`, `topico_edges`, `conteudos`, `midias`, `cards`, `atividades`, `atividade_conteudos`, `questoes` | Grafo pedagÃ³gico da turma |
| Progresso acadÃªmico | `topico_aluno`, `conteudo_aluno`, `atividade_aluno`, `questao_aluno`, `trilha_checkpoint_navegacao`, `trilha_aluno`, `trilha_modelo`, `eventos_aluno` | Estado de estudo e histÃ³rico |
| PersonalizaÃ§Ã£o | `conteudo_personalizado`, `fontes_personalizacao`, `personalizacao_jobs`, `personalizacao_job_targets`, `personalizacao_item_progresso`, `materiais_gerados`, `iaDescricao`, `ia_decision_logs`, `classe_mapa_tema` | Motor adaptativo persistido |
| Telemetria | `telemetria_sessoes`, `telemetria_lotes`, `telemetria_eventos_app`, `telemetria_time_metric_entries` | Coleta comportamental e anÃ¡lise |
| Gamificacao e notificaÃ§Ãµes | `conquistas`, `conquistas_aluno`, `rank_tipo`, `ranks`, `rank_posicoes`, `notificacoes`, `notificacoes_agendamentos`, `notificacoes_ia`, `notificacoes_pendentes` | Engajamento e comunicaÃ§Ã£o |
| Infra/runtime | `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`, `alembic_version` | Persist?ncia do runtime LangGraph |

## 4. Diagramas ER (visÃ£o simplificada)

### 4.1 ER pedagÃ³gico

```mermaid
erDiagram
  MATERIA ||--o{ CLASSE : possui
  PROFESSOR ||--o{ CLASSE : ministra
  CLASSE ||--o{ TOPICOS : organiza
  TOPICOS ||--o{ CONTEUDOS : contem
  TOPICOS ||--o{ ATIVIDADES : avalia
  ATIVIDADES ||--o{ QUESTOES : gera
  ATIVIDADES ||--o{ ATIVIDADE_CONTEUDOS : vincula
  CONTEUDOS ||--o{ ATIVIDADE_CONTEUDOS : referencia
  CONTEUDOS ||--o{ MIDIAS : anexa
  CONTEUDOS ||--o{ CARDS : sintetiza
  CLASSE ||--o{ CLASSE_ALUNO : matricula
  ALUNOS ||--o{ CLASSE_ALUNO : participa
  TOPICOS ||--o{ TOPICO_EDGES : origem
  TOPICOS ||--o{ TOPICO_EDGES : destino

  QUESTOES {
    bigint id PK
    bigint atividade_id FK
    numeric nota_estabelecida NULL
  }
```

### 4.2 ER de personalizaÃ§Ã£o e jobs

```mermaid
erDiagram
  ALUNOS ||--o{ CONTEUDO_PERSONALIZADO : recebe
  CLASSE ||--o{ CONTEUDO_PERSONALIZADO : contexto
  TOPICOS ||--o{ CONTEUDO_PERSONALIZADO : referencia
  CONTEUDOS ||--o{ CONTEUDO_PERSONALIZADO : foco

  CLASSE ||--o{ PERSONALIZACAO_JOBS : possui
  ALUNOS ||--o{ PERSONALIZACAO_JOBS : alvo_opcional
  PERSONALIZACAO_JOBS ||--o{ PERSONALIZACAO_JOB_TARGETS : detalha

  ALUNOS ||--o{ PERSONALIZACAO_JOB_TARGETS : alvo
  TOPICOS ||--o{ PERSONALIZACAO_JOB_TARGETS : topico
  CONTEUDOS ||--o{ PERSONALIZACAO_JOB_TARGETS : conteudo_opcional

  CONTEUDO_PERSONALIZADO ||--o{ PERSONALIZACAO_ITEM_PROGRESSO : granulariza
  ALUNOS ||--o{ PERSONALIZACAO_ITEM_PROGRESSO : progride

  FONTES_PERSONALIZACAO }o--|| CLASSE : classe
  FONTES_PERSONALIZACAO }o--o| TOPICOS : topico_opcional
  FONTES_PERSONALIZACAO }o--o| CONTEUDOS : conteudo_opcional
  FONTES_PERSONALIZACAO }o--o| ALUNOS : aluno_opcional
  FONTES_PERSONALIZACAO }o--o| PROFESSOR : professor_opcional
```

### 4.3 ER de telemetria

```mermaid
erDiagram
  ALUNOS ||--o{ TELEMETRIA_SESSOES : inicia
  TELEMETRIA_SESSOES ||--o{ TELEMETRIA_LOTES : agrega
  TELEMETRIA_SESSOES ||--o{ TELEMETRIA_EVENTOS_APP : emite
  TELEMETRIA_LOTES ||--o{ TELEMETRIA_TIME_METRIC_ENTRIES : expande

  CLASSE ||--o{ TELEMETRIA_LOTES : contexto
  TOPICOS ||--o{ TELEMETRIA_EVENTOS_APP : contexto_opcional
  CONTEUDOS ||--o{ TELEMETRIA_EVENTOS_APP : contexto_opcional
  ATIVIDADES ||--o{ TELEMETRIA_EVENTOS_APP : contexto_opcional
  QUESTOES ||--o{ TELEMETRIA_EVENTOS_APP : contexto_opcional
```

## 5. Fluxos operacionais (sequencias)

### 5.1 Fluxo de personalizaÃ§Ã£o por alteracao pedagÃ³gica

```mermaid
sequenceDiagram
  participant P as Professor(Web)
  participant S as Supabase DB
  participant A as API
  participant W as Worker Jobs
  participant M as Mobile

  P->>S: CRUD em topicos/conteudos/atividades/questoes
  P->>A: POST /api/v1/personalizar/jobs/class-delta
  A->>S: INSERT personalizacao_jobs
  A->>S: INSERT personalizacao_job_targets
  W->>S: Claim job pendente
  loop cada target aluno x topico
    W->>S: Le contexto + fontes
    alt source_hash igual
      W->>S: status target = skipped
    else source_hash diferente
      W->>S: UPSERT conteudo_personalizado
      W->>S: UPSERT personalizacao_item_progresso
      W->>S: status target = completed
    end
  end
  W->>S: Finaliza job
  M->>S: SELECT conteudo_personalizado
  S-->>M: update via realtime
```

### 5.2 Fluxo de telemetria com fallback

```mermaid
sequenceDiagram
  participant M as Mobile
  participant A as API /telemetria/lotes
  participant S as Supabase DB

  M->>A: POST lote telemetria
  alt API disponivel
    A->>S: upsert sessao + inserir lote/eventos/metrics
    A-->>M: response analysis
  else API indisponivel
    M->>S: upsert telemetria_sessoes
    M->>S: insert telemetria_lotes
    M->>S: upsert telemetria_eventos_app
    M->>S: insert telemetria_time_metric_entries
  end
```

### 5.3 Fluxo de correÃ§Ã£o dissertativa com nota opcional

```mermaid
sequenceDiagram
  participant W as Web
  participant E as Edge Function validate-essay-answer-ai
  participant G as Gemini

  W->>E: payload com/sem notaEstabelecida
  alt notaEstabelecida enviada e valida
    E->>E: usa nota informada como nota_maxima
  else nota ausente/invalida
    E->>E: usa escala padrao 100
  end
  E->>G: prompt + schema json
  G-->>E: avaliacao estruturada
  E-->>W: nota_obtida, nota_maxima, percentual, feedback
```

## 6. Graficos de estado

### 6.1 Estados do job agregado (`personalizacao_jobs.status`)

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

### 6.2 Estados do target (`personalizacao_job_targets.status`)

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

### 6.3 Tabela de transicoes operacionais

| Entidade | Estado | Significado | Proximo estado comum |
|---|---|---|---|
| Job | `pending` | criado, aguardando worker | `processing` |
| Job | `processing` | worker executando targets | `completed`/`partial`/`failed` |
| Job | `partial` | terminou com combinacao de sucesso/falha | `processing` (retry manual) |
| Target | `pending` | aguardando tentativa | `processing` |
| Target | `skipped` | sem regeneracao (hash igual) | final |
| Target | `completed` | regenerado e persistido | final |
| Target | `failed` | excedeu tentativas | final |

## 7. Regra de `nota_estabelecida` (questÃµes)

Campo: `public.questoes.nota_estabelecida numeric(10,2)`

SemÃ¢ntica vigente:
- campo opcional (`NULL` permitido)
- sem `DEFAULT` fixo
- `NULL` representa explicitamente "sem nota definida"

### 7.1 EvoluÃ§Ã£o de migration

| Etapa | Definicao | Efeito |
|---|---|---|
| Migration inicial | `NOT NULL DEFAULT 1` | nota sempre forÃ§ada para 1 quando ausente |
| Migration atual | remove `NOT NULL` + remove `DEFAULT` | nota passa a ser realmente opcional |

### 7.2 Diagrama de decisÃ£o (semÃ¢ntica atual)

```mermaid
flowchart TD
  A[Valor recebido para nota_estabelecida] --> B{Campo vazio/nulo?}
  B -- Sim --> C[Persistir NULL]
  B -- Nao --> D{Valor > 0 e numerico?}
  D -- Sim --> E[Arredondar 2 casas e persistir]
  D -- Nao --> F[Erro de validacao no formulario]
```

### 7.3 Exemplo de comportamento de correÃ§Ã£o dissertativa

| CenÃ¡rio | `notaEstabelecida` no request | `nota_maxima` no retorno |
|---|---|---|
| QuestÃ£o com nota definida | `10` | `10` |
| QuestÃ£o sem nota definida | ausente ou `null` | `100` |

## 8. Constraints e indexes crÃ­ticos

### 8.1 Unicidade/deduplicacao

| Chave | Onde | Objetivo |
|---|---|---|
| `uq_conteudo_personalizado_aluno_topico_ativo` | `conteudo_personalizado` | garantir 1 registro ativo por aluno/tÃ³pico |
| `UNIQUE(job_id, aluno_id, topico_id)` | `personalizacao_job_targets` | evitar duplicidade de alvo no mesmo job |
| `uq_personalizacao_item_progresso` | `personalizacao_item_progresso` | evitar item duplicado por aluno/personalizaÃ§Ã£o |
| `uq_telemetria_lotes_sessao_captured_at_flush_reason` | `telemetria_lotes` | dedupe de lote |
| `uq_telemetria_eventos_app(sessao_id, client_event_id)` | `telemetria_eventos_app` | dedupe de evento |

### 8.2 Performance

| Index | Tabela | Consulta acelerada |
|---|---|---|
| `idx_personalizacao_jobs_contexto` | `personalizacao_jobs` | listagem por classe/status/tempo |
| `idx_personalizacao_jobs_aluno` | `personalizacao_jobs` | listagem por aluno/status |
| `idx_personalizacao_job_targets_job_status` | `personalizacao_job_targets` | processamento e monitoramento de targets |
| `idx_conteudo_personalizado_aluno_topico` | `conteudo_personalizado` | busca do payload do tÃ³pico personalizado |
| `idx_telemetria_*` | telemetria | cortes por sessao/contexto/tempo |

### 8.3 Integridade semÃ¢ntica

- checks de percentual (0-100) em tabelas de progresso
- checks de dominio em `telemetria_eventos_app`:
  - `event_group`
  - `chat_role`
  - `trigger_context`
- check de dominio em `ia_decision_logs.source`

## 9. Views analiticas (catalogo com uso)

| View | Tema | Uso principal |
|---|---|---|
| `vw_rank_posicoes_por_classe` | ranking | consolidar pontuaÃ§Ã£o/posição por classe |
| `vw_metricas_sessoes_aluno_dia` | sessoes | volume de estudo por dia |
| `vw_metricas_engajamento_aluno_classe` | engajamento | sinais de uso por aluno/classe |
| `vw_metricas_desempenho_aluno_classe` | desempenho | acertos, progresso e eficiencia |
| `vw_metricas_comportamento_aluno_classe` | comportamento | padrÃ£o de interaÃ§Ã£o e uso |
| `vw_metricas_chat_aluno_classe` | chat | uso e qualidade de interacoes no mentor |
| `vw_metricas_evolucao_desempenho_aluno_dia` | tendencia | serie temporal de desempenho |
| `vw_sequencia_navegacao_aluno` | navegaÃ§Ã£o | trilha percorrida por aluno |
| `vw_ia_decision_logs_resumo` | auditoria IA | resumo de decisÃµes adaptativas |
| `vw_aluno_perfil_segmentos` | perfil | segmento de aluno por afinidade |
| `vw_metricas_turma_geral_classe` | turma | visÃ£o consolidada de classe |
| `vw_metricas_turma_perfil_classe` | turma x perfil | comparacao por segmentos |
| `vw_metricas_distribuicao_turma_classe` | distribuiÃ§Ã£o | faixas de nota/tempo/progresso |
| `vw_telemetria_tempo_topico_aluno` | tempo tÃ³pico | tempo ativo por tÃ³pico |
| `vw_telemetria_tempo_conteudo_aluno` | tempo conteÃºdo | tempo ativo por conteÃºdo |
| `vw_telemetria_tempo_atividade_aluno` | tempo atividade | tempo ativo por atividade |

## 10. RLS e seguran?a

RLS habilitado explicitamente em:
- `conteudo_personalizado`
- `personalizacao_item_progresso`
- `personalizacao_jobs`

Policies presentes no SQL manual:
- `Aluno read own conteudo_personalizado`
- `Aluno read own personalizacao_item_progresso`
- `Aluno read own personalizacao_jobs`

### 10.1 Matriz de acesso resumida

| Tabela | Leitura aluno | Leitura professor | Escrita API worker |
|---|---|---|---|
| `conteudo_personalizado` | prÃ³pria | via endpoint/API de contexto | sim |
| `personalizacao_item_progresso` | prÃ³pria | via endpoint/API de contexto | sim |
| `personalizacao_jobs` | prÃ³pria/v?nculo classe | sim (com permissÃ£o de classe) | sim |

## 11. Fluxos de escrita/leitura entre sistemas

### 11.1 Quadro de comandos por fluxo

| Fluxo | Sistema de origem | OperaÃ§Ã£o | Destino |
|---|---|---|---|
| CriaÃ§Ã£o/edicao pedagÃ³gica | Web | INSERT/UPDATE | tabelas base |
| Disparo de personalizaÃ§Ã£o | Web | POST `/api/v1/personalizar/jobs/*` | API |
| ExecuÃ§Ã£o de personalizaÃ§Ã£o | API worker | UPSERT | `conteudo_personalizado` |
| Seed de progresso personalizado | API worker | UPSERT | `personalizacao_item_progresso` |
| Consumo de personalizaÃ§Ã£o | Mobile | SELECT + realtime | `conteudo_personalizado` |
| Progresso personalizado | Mobile | POST `/api/v1/personalizar/progresso` | API -> DB |
| Telemetria normal | Mobile | POST `/api/v1/telemetria/lotes` | API -> DB |
| Telemetria fallback | Mobile | UPSERT/INSERT direto | tabelas de telemetria |

### 11.2 Swimlane de ownership operacional

```mermaid
flowchart TB
  subgraph L1[Web]
    WCRUD[CRUD pedagogico]
    WJOB[Disparo job]
  end

  subgraph L2[API]
    AJOB[Cria job e targets]
    AWORK[Processa targets]
    AWRITE[Grava personalizacao]
  end

  subgraph L3[Supabase]
    SBASE[(Tabelas base)]
    SPER[(Tabelas de personalizacao)]
    STEL[(Tabelas de telemetria)]
  end

  subgraph L4[Mobile]
    MREAD[Le personalizacao]
    MPROG[Salva progresso]
    MTEL[Envia telemetria]
  end

  WCRUD --> SBASE
  WJOB --> AJOB
  AJOB --> SPER
  AWORK --> AWRITE
  AWRITE --> SPER
  SPER --> MREAD
  MPROG --> AWRITE
  MTEL --> STEL
```

## 12. Checklist de consistencia para evoluÃ§Ã£o de schema

Antes de mudar schema, validar:
1. `src/integrations/supabase/types.ts` (Web)
2. `src/services/personalizacaoApi.ts` e `src/services/telemetriaApi.ts` (Mobile)
3. repositories SQL da API (`app/repositories/*.py`)
4. SQL manual (`sql/manual_supabase_migration.sql`)
5. RLS/policies para tabelas novas de leitura pelo aluno
6. migrações Supabase e semÃ¢ntica de defaults/null

## 13. Estado recomendado para deploy (nota opcional)

No ambiente Supabase alvo, garantir que esta definicao esteja aplicada:

```sql
ALTER TABLE IF EXISTS public.questoes
  ADD COLUMN IF NOT EXISTS nota_estabelecida numeric(10,2);

ALTER TABLE IF EXISTS public.questoes
  ALTER COLUMN nota_estabelecida DROP NOT NULL,
  ALTER COLUMN nota_estabelecida DROP DEFAULT;

COMMENT ON COLUMN public.questoes.nota_estabelecida IS
  'Nota/peso da questao definido pelo professor. Opcional; NULL indica sem nota definida.';
```

Esse estado preserva dados antigos e elimina coercao automatica para `1` em novos registros.

## 14. Edge Functions, RPCs, Functions e Triggers

Esta seÃ§Ã£o consolida os artefatos de plataforma que conectam o schema ao comportamento em runtime.

### 14.1 Edge Functions consumidas

| Edge Function | Consumidor | Papel |
|---|---|---|
| `generate-content-ai` | Web | Gera sugestÃµes de trilha/conteÃºdo/cards/atividades para autoria docente |
| `validate-essay-answer-ai` | Web | Corrige questÃµes dissertativas com IA |
| `personalize_path` | Mobile | Retorna topologia da trilha para renderizacao de nodes/edges |

### 14.2 RPCs consumidas no ecossistema

| RPC | Camada consumidora | Finalidade |
|---|---|---|
| `fn_auth_email_exists` | Web | ValidaÃ§Ã£o de email no cadastro |
| `fn_cadastrar_aluno_com_perfis` | Web | Onboarding de aluno + perfis BrainHex |
| `inscrever_aluno_em_classe` | Web | Matricula de aluno na classe |
| `fn_atualizar_aluno_perfil` | Mobile | AtualizaÃ§Ã£o de dados/perfil do aluno |
| `fn_enviar_contato_sendgrid` | Mobile | Acionamento de contato por email |
| `fn_trilha_by_classe` | Banco (identificada no dump) | Consulta de trilha por classe/aluno |

### 14.3 Functions/trigger-functions SQL identificadas

| Nome | Papel operacional |
|---|---|
| `prevent_topico_cycle` | Evita ciclos no grafo de tÃ³picos (`topico_edges`) |
| `provisionar_estrutura_aluno_classe` | Semeia progresso inicial (`topico_aluno`, `conteudo_aluno`, `atividade_aluno`) |
| `rls_auto_enable` | Habilita RLS automaticamente para novas tabelas em `public` |
| `set_trilha_checkpoint_navegacao_updated_at` | Mantem `updated_at` do checkpoint de navegaÃ§Ã£o |
| `set_updated_at_timestamp` | Helper generico para `updated_at` |
| `update_updated_at_column` | Helper generico para `updated_at` |
| `trg_alunos_after_insert` | Cria v?nculos em `professor_aluno` apos novo aluno |
| `trg_professor_after_insert` | Cria v?nculos em `professor_aluno` apos novo professor |
| `trg_classe_aluno_after_insert` | Dispara provisionamento da estrutura do aluno na classe |
| `trg_topicos_after_insert` | Semeia `topico_aluno` para matriculados |
| `trg_conteudos_after_insert` | Semeia `conteudo_aluno` para matriculados |
| `trg_atividades_after_insert` | Semeia `atividade_aluno` para matriculados |
| `trg_limpar_dados_aluno_classe` | Limpa progresso ao remover matricula do aluno |
| `trg_eventos_aluno_after_ins` | Recalcula ranking e emite notificaÃ§Ãµes/conquistas |

### 14.4 Diagrama das automacoes por trigger

```mermaid
flowchart TB
  I1[INSERT classe_aluno] --> T1[trg_classe_aluno_after_insert]
  T1 --> F1[provisionar_estrutura_aluno_classe]
  F1 --> O1[topico_aluno]
  F1 --> O2[conteudo_aluno]
  F1 --> O3[atividade_aluno]

  I2[INSERT topicos] --> T2[trg_topicos_after_insert] --> O1
  I3[INSERT conteudos] --> T3[trg_conteudos_after_insert] --> O2
  I4[INSERT atividades] --> T4[trg_atividades_after_insert] --> O3

  I5[INSERT alunos] --> T5[trg_alunos_after_insert] --> O4[professor_aluno]
  I6[INSERT professor] --> T6[trg_professor_after_insert] --> O4

  D1[DELETE classe_aluno] --> T7[trg_limpar_dados_aluno_classe]
  T7 --> O1
  T7 --> O2
  T7 --> O3
  T7 --> O5[questao_aluno]

  I7[INSERT eventos_aluno] --> T8[trg_eventos_aluno_after_ins]
  T8 --> O6[rank_posicoes]
  T8 --> O7[conquistas_aluno]
  T8 --> O8[notificacoes]
```

### 14.5 ObservaÃ§Ãµes de governan?a

- Parte das rotinas SQL foi identificada no dump de banco e no contrato de consumo do codigo cliente.
- O dump utilizado contem os nomes/corpos de varias routines, mas pode nÃ£o refletir 100% dos `CREATE FUNCTION/CREATE TRIGGER` originais de migração.
- Para auditoria completa de DDL de routines, manter como fonte primÃ¡ria o histÃ³rico de migrações SQL do ambiente Supabase.


## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.
