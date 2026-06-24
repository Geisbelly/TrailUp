# Fluxo Completo do Ecossistema TrailUp

Atualizado em: 2026-04-13

## Indice
- [1. Objetivo](#sec-01)
- [2. Arquitetura de alto nivel](#sec-02)
- [3. Fluxo principal de personalizaÃ§Ã£o por aluno](#sec-03)
- [4. Fluxos de job por tipo](#sec-04)
- [5. Pipeline interno de geraÃ§Ã£o personalizada](#sec-05)
- [6. Tipos de material personalizado](#sec-06)
- [7. Persist?ncia canÃ´nica da personalizaÃ§Ã£o](#sec-07)
- [8. Progresso personalizado por item](#sec-08)
- [9. Telemetria e analÃ­tica](#sec-09)
- [10. Estados de processamento](#sec-10)
- [11. Regra de nota opcional em questÃµes](#sec-11)
- [12. Artefatos de plataforma (SQL e Edge)](#sec-12)
- [13. Tabela de rastreabilidade rapida](#sec-13)
- [14. Referencias de codigo](#sec-14)


<a id="sec-01"></a>
## 1. Objetivo

Este documento explica o fluxo completo do TrailUp, do ponto de vista operacional:
- Web do professor
- API FastAPI
- Supabase (DB, Storage, Realtime)
- App Mobile do aluno
- Edge Functions

TambÃ©m detalha:
- quando a personalizaÃ§Ã£o por aluno e gerada
- quando ela e reaproveitada por `source_hash`
- como o mobile consome e persiste progresso
- como a telemetria entra no pipeline

### 1.1 Atualizacoes recentes (2026-04-13)

- Pipeline multimidia fast-first em producao:
  - fase inicial: `cards` e `quiz`;
  - fase assincrona: `pdf`, `documento`, `apresentacao`, `audio`, `video`.
- `video` passa a ser artefato `mp4` minimo (n?o mais roteiro markdown).
- `conteudo_personalizado.materiais` reflete status por midia em metadata.
- Falha de fonte n?o interrompe entrega rapida: midias podem ficar `pending` ou `failed`.
- Trigger de classe para `class_theme_sync` enfileira jobs automaticos de mapa tematico.

<a id="sec-02"></a>
## 2. Arquitetura de alto nivel

```mermaid
flowchart LR
  subgraph WEB[Web Professor]
    WAuth[Auth e permissao]
    WCrud[CRUD pedagogico]
    WJobs[Disparo de jobs]
    WAI[Edge IA de autoria/correcao]
  end

  subgraph API[API FastAPI]
    AAuth[Validacao JWT]
    ARoutes[Rotas /api/v1]
    AWorker[Worker personalizacao]
    ALLM[Pipeline LLM]
  end

  subgraph SUPA[Supabase]
    DB[(Postgres)]
    ST[(Storage buckets)]
    RT[(Realtime)]
  end

  subgraph MOB[Mobile Aluno]
    MTrilha[TrilhaContext]
    MPers[Consumo personalizado]
    MProg[Progresso personalizado]
    MTelem[Telemetria]
  end

  WAuth --> DB
  WCrud --> DB
  WJobs --> ARoutes
  WAI --> DB

  AAuth --> DB
  ARoutes --> DB
  AWorker --> DB
  AWorker --> ST
  ALLM --> AWorker

  MTrilha --> DB
  MPers --> DB
  DB --> RT
  RT --> MPers
  MProg --> ARoutes
  MTelem --> ARoutes
  MTelem -. fallback .-> DB
```

<a id="sec-03"></a>
## 3. Fluxo principal de personalizaÃ§Ã£o por aluno

### 3.1 Professor altera estrutura e dispara job

```mermaid
sequenceDiagram
  participant P as Professor (Web)
  participant S as Supabase DB
  participant A as API

  P->>S: Atualiza topicos/conteudos/atividades/questoes
  P->>A: POST /api/v1/personalizar/jobs/class-delta
  A->>S: INSERT personalizacao_jobs
  A->>S: INSERT personalizacao_job_targets
```

### 3.2 Worker processa cada target (aluno x tÃ³pico)

```mermaid
sequenceDiagram
  participant W as Worker API
  participant S as Supabase DB
  participant L as LLM stack

  W->>S: Claim job pendente
  loop cada target
    W->>S: Le contexto aluno + conteudos + fontes
    W->>W: Calcula source_hash
    W->>S: Busca ultima personalizacao do aluno/topico
    alt hash igual
      W->>S: target status = skipped
    else hash diferente
      W->>L: Gera plano_personalizacao
      W->>L: Gera ai_patch
      W->>L: Gera materiais personalizados
      W->>S: UPSERT conteudo_personalizado
      W->>S: UPSERT personalizacao_item_progresso (seed)
      W->>S: target status = completed
    end
  end
  W->>S: Atualiza counters e status final do job
```

### 3.3 Mobile consome personalizaÃ§Ã£o persistida

```mermaid
sequenceDiagram
  participant M as Mobile
  participant S as Supabase DB
  participant R as Realtime

  M->>S: SELECT conteudo_personalizado por aluno/classe
  S-->>M: payload personalizado
  M->>M: Normaliza para steps/blocos e salva cache local
  S-->>R: mudanca em conteudo_personalizado
  R-->>M: evento realtime
  M->>S: refresh do payload
```

<a id="sec-04"></a>
## 4. Fluxos de job por tipo

### 4.1 Enrollment (nova matricula)

```mermaid
sequenceDiagram
  participant W as Web
  participant A as API
  participant S as Supabase DB

  W->>S: Insere classe_aluno
  W->>A: POST /jobs/enrollment (aluno_id + classe_id)
  A->>S: Cria job tipo student_enrollment
  A->>S: Cria targets para topicos da classe
```

### 4.2 Class delta (mudanca de conteÃºdo)

```mermaid
sequenceDiagram
  participant W as Web
  participant A as API
  participant S as Supabase DB

  W->>S: Edita topico/conteudo/atividade
  W->>A: POST /jobs/class-delta
  A->>S: Cria job tipo class_delta_sync
  A->>S: Targets para alunos impactados
```

### 4.3 Student cleanup (remocao do aluno)

```mermaid
sequenceDiagram
  participant W as Web
  participant A as API
  participant S as Supabase DB
  participant B as Bucket

  W->>S: Remove classe_aluno
  W->>A: POST /jobs/student-cleanup
  A->>S: Cria job tipo student_cleanup
  A->>S: Remove conteudo_personalizado e progresso do aluno
  A->>S: Remove fontes personalizacao do aluno na classe
  A->>B: delete prefix de artefatos do aluno
```

<a id="sec-05"></a>
## 5. Pipeline interno de geraÃ§Ã£o personalizada

```mermaid
flowchart TD
  I[Estado de entrada: aluno, classe, topico] --> C1[fetch_aluno_context]
  C1 --> C2[buscar conteudos, atividades, questoes, cards]
  C2 --> C3[listar fontes_personalizacao]
  C3 --> C4[hidratar previews/transcricoes]
  C4 --> H[source_hash]

  H --> D{hash mudou?}
  D -- nao --> SKIP[marcar skipped]
  D -- sim --> P[generate_plano_personalizacao]
  P --> AP[generate_ai_patch_personalizacao]
  AP --> M[generate_materiais_personalizados]
  M --> N[_normalize_materiais]
  N --> U[upload_materiais no bucket]
  U --> DB[save conteudo_personalizado]
  DB --> SP[seed personalizacao_item_progresso]
```

<a id="sec-06"></a>
## 6. Tipos de material personalizado

Tipos suportados no motor:
- `pdf`
- `cards`
- `quiz`
- `video`
- `audio`
- `documento`
- `apresentacao`
- `imagem`

```mermaid
mindmap
  root((Materiais Personalizados))
    PDF
      resumo
      secoes
      arquivo_url
    Cards
      frente
      verso
    Quiz
      atividades
      questoes
      pontuacao_maxima
    Documento
      secoes
      arquivo_url
    Apresentacao
      slides
      arquivo_url
    Audio
      roteiro
      arquivo_url
    Video
      roteiro
      metadados
    Imagem
      prompt_imagem
      arquivo_url
```

<a id="sec-07"></a>
## 7. Persist?ncia canÃ´nica da personalizaÃ§Ã£o

Tabela central: `conteudo_personalizado`

Campos mais importantes:
- `aluno_id`
- `classe_id`
- `topico_id`
- `conteudo_id`
- `ciclo_id`
- `plano`
- `materiais`
- `ai_patch`
- `status`
- `source_hash`
- `formato_prioritario`
- `formatos_gerados`

Regra estrutural importante:
- indice unico por `(aluno_id, topico_id)` para estratÃ©gia de upsert.

<a id="sec-08"></a>
## 8. Progresso personalizado por item

Tabela: `personalizacao_item_progresso`

`item_kind` esperado:
- `content`
- `activity`
- `cards`

Fluxo:
1. Worker semeia registros iniciais apos gerar personalizaÃ§Ã£o.
2. Mobile envia progresso via API `/api/v1/personalizar/progresso`.
3. API valida ownership da personalizaÃ§Ã£o e faz upsert do item.

<a id="sec-09"></a>
## 9. Telemetria e analÃ­tica

### 9.1 Ingestao de telemetria

```mermaid
sequenceDiagram
  participant M as Mobile
  participant A as API /telemetria/lotes
  participant S as Supabase

  M->>A: POST lote
  alt API disponivel
    A->>S: upsert telemetria_sessoes
    A->>S: insert telemetria_lotes
    A->>S: upsert telemetria_eventos_app
    A->>S: insert telemetria_time_metric_entries
  else fallback
    M->>S: persiste direto as tabelas de telemetria
  end
```

### 9.2 Views para anÃ¡lise

Principais views:
- `vw_metricas_sessoes_aluno_dia`
- `vw_metricas_engajamento_aluno_classe`
- `vw_metricas_desempenho_aluno_classe`
- `vw_metricas_comportamento_aluno_classe`
- `vw_metricas_chat_aluno_classe`
- `vw_metricas_evolucao_desempenho_aluno_dia`
- `vw_telemetria_tempo_topico_aluno`
- `vw_telemetria_tempo_conteudo_aluno`
- `vw_telemetria_tempo_atividade_aluno`

<a id="sec-10"></a>
## 10. Estados de processamento

### 10.1 Job agregado

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

### 10.2 Target individual

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

<a id="sec-11"></a>
## 11. Regra de nota opcional em questÃµes

Campo: `public.questoes.nota_estabelecida`

SemÃ¢ntica atual:
- opcional (`NULL` permitido)
- sem `DEFAULT`
- `NULL` = sem nota definida

Impacto no fluxo de correÃ§Ã£o dissertativa:
- se nota enviada e valida, IA corrige na escala informada
- se nota ausente/invalida, IA corrige em escala padrÃ£o 100

```mermaid
flowchart TD
  A[notaEstabelecida no request] --> B{valor valido > 0?}
  B -- sim --> C[nota_maxima = nota informada]
  B -- nao --> D[nota_maxima = 100]
```

<a id="sec-12"></a>
## 12. Artefatos de plataforma (SQL e Edge)

### 12.1 Edge Functions usadas
- `generate-content-ai` (Web)
- `validate-essay-answer-ai` (Web)
- `personalize_path` (Mobile)

### 12.2 RPCs usadas no app
- `fn_auth_email_exists`
- `fn_cadastrar_aluno_com_perfis`
- `inscrever_aluno_em_classe`
- `fn_atualizar_aluno_perfil`
- `fn_enviar_contato_sendgrid`

### 12.3 Trigger-functions de automacao relevantes
- `trg_classe_aluno_after_insert`
- `trg_topicos_after_insert`
- `trg_conteudos_after_insert`
- `trg_atividades_after_insert`
- `trg_limpar_dados_aluno_classe`
- `trg_eventos_aluno_after_ins`

<a id="sec-13"></a>
## 13. Tabela de rastreabilidade rapida

| Etapa | Endpoint/acao | Tabelas tocadas |
|---|---|---|
| Mudanca pedagÃ³gica | CRUD Web | `topicos`, `conteudos`, `atividades`, `questoes`, etc |
| Disparo de personalizaÃ§Ã£o | `POST /api/v1/personalizar/jobs/*` | `personalizacao_jobs`, `personalizacao_job_targets` |
| GeraÃ§Ã£o por target | Worker | `conteudo_personalizado`, `personalizacao_item_progresso` |
| Consumo no aluno | SELECT mobile + realtime | `conteudo_personalizado`, `personalizacao_jobs` |
| Progresso personalizado | `POST /api/v1/personalizar/progresso` | `personalizacao_item_progresso` |
| Telemetria | `POST /api/v1/telemetria/lotes` | tabelas `telemetria_*` |

<a id="sec-14"></a>
## 14. Referencias de codigo

Web:
- `src/components/console/trilha/personalizacaoJobsApi.ts`
- `supabase/functions/generate-content-ai/index.ts`
- `supabase/functions/validate-essay-answer-ai/index.ts`

API:
- `app/api/v1/personalizacao.py`
- `app/services/personalizacao_jobs.py`
- `app/services/personalizacao.py`
- `app/repositories/personalizacao_jobs.py`

Mobile:
- `src/context/TrilhaContext.tsx`
- `src/services/personalizacaoApi.ts`
- `src/services/telemetriaApi.ts`


## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.
