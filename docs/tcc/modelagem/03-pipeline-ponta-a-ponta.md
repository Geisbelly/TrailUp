# 3. Pipeline de ponta a ponta

O ciclo inteiro, do cadastro ao material adaptado e de volta à análise:

```mermaid
flowchart LR
  P1["P1 Cadastro<br/>e perfil BrainHex"] --> P2["P2 Matrícula"]
  P0["P0 Professor<br/>monta a trilha"] --> P3
  P2 --> P3["P3 Geração da<br/>base por perfil"]
  P3 --> P4["P4 Estudo no app<br/>e mídia pelo gateway"]
  P4 --> P5["P5 Telemetria"]
  P5 --> P6["P6 Análise e<br/>grafo adaptativo"]
  P6 --> P7["P7 Adequação por aluno<br/>(ai_patch, tema, aviso)"]
  P7 --> P4
  P6 --> P8["P8 Professor:<br/>intervenções e insights"]
  P8 --> P0
  P4 --> P9["P9 Progresso, nota,<br/>gamificação"]
  P4 --> P10["P10 Chat do Guardião"]
  P0 --> P11["P11 Alteração do professor<br/>vista por aluno"]
  P11 --> P4
```

Cada etapa abaixo traz o diagrama de sequência e onde está no código.

---

## P0 + P3 — O professor salva a trilha e a base por perfil é gerada

```mermaid
sequenceDiagram
  autonumber
  actor Prof as Professor
  participant WEB as Console
  participant DB as Postgres
  participant W as API · personalizacao_jobs_loop
  participant MS as microservice
  participant PDF as BrainHexPDF
  participant GEM as Gemini
  participant R2 as R2

  Prof->>WEB: salva tópico/conteúdo/atividade/questão/card
  WEB->>DB: INSERT/UPDATE (RLS do professor)
  DB->>DB: gatilho fn_enqueue_class_delta_job<br/>funde no job pending da turma (FOR UPDATE)
  Note over DB: sem chamada à API: salvar já é o disparo
  loop a cada ciclo do worker
    W->>DB: reivindica job pending / partial vencido / processing parado
    W->>DB: cria targets: tópico × perfil (7) × mídia
    W->>MS: POST /api/personalizar (assíncrono)
    MS->>GEM: texto por perfil (assinatura editorial)
    MS->>GEM: TTS com a voz do Guardião
    MS->>PDF: POST /api/v1/render-and-store
    PDF->>GEM: deck
    PDF->>R2: HTML da apresentação
    MS->>R2: áudio e arquivos
    MS->>DB: mergePersonalizacaoMateriais → conteudo_personalizado.materiais<br/>(revisao por material)
    W->>GEM: falas do boss (só perfis com batalha, se o source_hash mudou)
    W->>DB: target completed / failed (retry até max) · contadores do job
  end
  DB->>DB: gatilho trg_conteudo_personalizado_novo_material<br/>→ notificacoes_enfileirar_evento
```

- **Deduplicação:** `source_hash` inclui `_PERSONALIZACAO_PIPELINE_VERSION`. Hash igual não gera de novo.
- **Kinds de job:** `class_delta_sync`, `student_enrollment`, `class_theme_sync`, `full_class_sync`, `student_cleanup`, `manual_retry`, `manual_profile_generate`, `manual_profile_generate_all`. Os manuais furam o circuit breaker.
- **Sem cota de TTS:** o alvo vai direto para `failed`. Reprocessar retoma só as partes de áudio que faltam.
- **Fallback:** se o microservice não responder, o `MultiOutputPipeline` em Python gera o material.
- **Código:**
  - `api/app/services/personalizacao_jobs.py`
  - `api/app/services/media_agents.py`
  - `microservice/server.ts`
  - `api/alembic/versions/20260827_03*`

## P1 + P2 — Cadastro, perfil e matrícula

```mermaid
sequenceDiagram
  autonumber
  actor Al as Aluno
  participant APP as App / site
  participant AUTH as Supabase Auth
  participant DB as Postgres

  Al->>APP: cria conta (e-mail ou Google)
  APP->>AUTH: signUp
  AUTH->>DB: auth.users → alunos (mesmo id)
  APP->>Al: portão de consentimento e data de nascimento
  APP->>DB: consentimento_telemetria / _pesquisa / aluno_nascimento
  Al->>APP: responde 32 itens (0–5)
  APP->>APP: 8 eixos → 7 afinidades 0–100
  APP->>DB: aluno_perfil (perfil dominante = maior afinidade)
  Al->>APP: entra na turma
  APP->>DB: INSERT classe_aluno
  DB->>DB: gatilho fn_enqueue_student_enrollment_job<br/>(alvos com perfil dominante, não duplica job ativo)
  Note over DB: falha ao enfileirar não desfaz a matrícula
```

**Regra de idade:** sem data de nascimento, ou com menos de 18 anos, o aluno usa o material-base, que é gerado sem dado dele, mas não tem chat, ciclo adaptativo, TTS nem imagem por IA.

## P4 — Estudo no app e mídia pelo gateway

```mermaid
sequenceDiagram
  autonumber
  actor Al as Aluno
  participant APP as App
  participant DB as Postgres
  participant EF as Edge Function storage-redirect
  participant R2 as R2

  Al->>APP: abre o tópico
  APP->>DB: SELECT conteudo_personalizado<br/>(turma × tópico × perfil dominante, RLS)
  APP->>DB: personalizacao_sugestao da turma (ordem aconselhada)<br/>a do tópico vem da API: GET /personalizar/sugestao
  APP->>EF: POST com JWT → link curto assinado (u, exp, sig)
  APP->>EF: GET ?path&u&exp&sig
  EF->>R2: URL pré-assinada
  EF-->>APP: 302
  APP->>R2: baixa áudio/deck → cache local (chave = path)
  Note over APP: revisao no payload do bloco invalida o cache<br/>sem mudar a URL (a retomada depende do path)
  Al->>APP: lê / ouve / passa slides
  APP->>DB: personalizacao_item_progresso (via outbox)
  DB->>DB: gatilho → trailup_recalcular_topico_aluno → topico_aluno
```

- **Exigência do link assinado:** `GATEWAY_EXIGE_LINK_ASSINADO=true` desde 04/11. Link sem assinatura recebe 401.
- **Código:**
  - `mobile/src/context/TrilhaContext.tsx`
  - `mobile/src/utils/linkDoGateway.ts`
  - `frontend/supabase/functions/storage-redirect`

## P5 + P6 — Telemetria, análise e grafo adaptativo

```mermaid
sequenceDiagram
  autonumber
  participant APP as App
  participant API as API · POST /telemetria/lotes
  participant DB as Postgres
  participant W as API · analise_fila_loop
  participant PL as LinearAnalysisPipeline
  participant G as graph_ephemeral (LangGraph)

  loop a cada ~60 s de estudo
    APP->>APP: fecha o lote (dwell/active/idle, toques, scroll, sinais)
    alt API alcançável
      APP->>API: lote
      API->>DB: telemetria_lotes (via=api)
    else rede, timeout, 4xx/5xx
      APP->>DB: INSERT direto (via=direta, fallback_motivo)
    end
  end
  DB->>DB: gatilho telemetria_resolver_entidade → time_metric_entries<br/>gatilho trailup_sync_tempo_da_telemetria → tempo_gasto_min
  DB->>DB: gatilho trg_telemetria_lotes_enfileira_analise
  W->>DB: fn_telemetria_analise_reivindicar
  W->>PL: run(lote)
  PL->>PL: 1 emoção · 2 leitura (WPM por active_sec) · 3 interação<br/>4 desempenho (+ M2) · 5 atenção · 6 decisão
  PL->>G: ainvoke(estado com emoção, atenção, decisão)
  G->>G: supervisor → especialistas → executor
  G->>DB: ia_decision_logs, intervencoes, notificacoes_ia,<br/>aluno_mental_state_history, ai_patch …
  W->>DB: sai da fila (ou fn_telemetria_analise_falhou → nova tentativa)
  APP->>APP: usePersonalizationRefresh: ação casa com<br/>refresh_policy.trigger_actions → pede novo ciclo
```

- **Fechamento da sessão:** é local e imediato (`cicloSessao.ts`). Só o envio do último lote espera a fila.
- **Lote no worker:** chega sem o frame da câmera, porque o lote gravado não guarda rosto. A emoção por imagem (YuNet + FER+) só roda no envio direto pela API.
- **Turma retida pelo estudo:** o grafo roda só emoção, perfil e intervenção.

## P7 — Ciclo de personalização por aluno

```mermaid
sequenceDiagram
  autonumber
  participant APP as App
  participant API as API · POST /personalizar
  participant G as graph_personalizacao
  participant DB as Postgres

  APP->>API: pedido de ciclo (tópico, conteúdo foco)
  API->>API: portão de idade
  API->>DB: contexto: perfil, emoção, memória (5 últimos estados), telemetria
  API->>G: workflow_kind = personalizar
  G->>G: agente_plano_personalizacao
  par
    G->>G: agente_ai_patch
  and
    G->>G: agente_midias_personalizadas
  end
  G->>DB: persist_personalizacao → conteudo_personalizado (plano, ai_patch)
  API-->>APP: plano + ai_patch + status de mídia
```

Nesse fluxo o supervisor é **determinístico**: `compute_personalizacao_next` não consulta modelo.

## P8 — Professor: intervenções e insights

```mermaid
sequenceDiagram
  autonumber
  actor Prof as Professor
  participant WEB as Console
  participant API as API
  participant DB as Postgres

  Note over DB: agente_intervencao grava intervencoes (escopo aluno)<br/>quando 3 dos 5 últimos estados são o mesmo negativo
  Prof->>WEB: aba Insights
  WEB->>DB: SELECT intervencoes (RLS da turma)
  Prof->>WEB: gerar
  WEB->>API: POST /insights/turma/{id}/gerar (≥ 5 min do último)
  API-->>WEB: 202 · gera em segundo plano
  API->>DB: INSERT intervencoes (geracao_id)
  Prof->>WEB: aceitar / ignorar
  WEB->>DB: UPDATE status, motivo_descarte (GRANT só dessas colunas)
```

Sem modelo disponível, nada é gravado. Não existe insight "de reserva".

## P9 — Progresso, nota e gamificação (só banco)

```mermaid
flowchart LR
  CA[conteudo_aluno] --> T1{{trailup_recalcular_topico_aluno}}
  AA[atividade_aluno] --> T1
  PIP[personalizacao_item_progresso] --> T1
  T1 --> TA[topico_aluno<br/>percentual, status]
  AT[atividade_tentativas] --> N{{recalcular nota}}
  N --> AA
  N --> NC[nota da matrícula<br/>maior entre nota e nota_anterior]
  AA --> EV[eventos_aluno<br/>XP e pontos]
  EV --> RK[vw_rank_posicoes_por_classe]
  EV --> MO[missao_aluno · conquistas_aluno<br/>moedas_ledger]
  CRON1((pg_cron 03:00)) --> MD[missão diária]
  CRON2((pg_cron 1 min)) --> EVC[eventos_classe<br/>abre/encerra e apura]
```

- **Quem grava o progresso:** nenhum cliente escreve `percentual_concluido` nem `status` em `topico_aluno`.
- **Denominador:** é o material personalizado. Enquanto ele não existir, vale o material do professor.

## P10 — Chat do Guardião

```mermaid
sequenceDiagram
  autonumber
  actor Al as Aluno
  participant APP as App
  participant API as API · POST /personalizar/chat
  participant LLM as LLMService
  participant M as Gemini (ou OpenAI + file_search com RAG)
  participant DB as Postgres

  Al->>APP: mensagem
  APP->>API: mensagem + histórico (6) + escopo
  API->>API: portão de idade (403 para menor)
  API->>DB: conteúdo do tópico, atividades, questões (sem gabarito)
  API->>LLM: mentor_personalizacao_chat.txt + guia_do_app
  LLM->>M: saída estruturada
  M-->>LLM: reply, destinos, ações
  LLM->>LLM: guardrail checar_grounding_chat (fallback se violar)
  API->>DB: ia_decision_logs (conversa cifrada em repouso)
  API-->>APP: reply em seções + destinos válidos do app
```

## P11 — O professor muda algo que um aluno já viu

```mermaid
sequenceDiagram
  autonumber
  actor Prof as Professor
  participant DB as Postgres
  participant W as API · alteracao_professor_loop
  participant M as Gemini

  Prof->>DB: UPDATE conteúdo / atividade / gabarito
  DB->>DB: gatilho (só se quem salva é o dono da turma)<br/>→ alteracao_professor (pendente_analise)
  alt gabarito corrigido
    DB->>DB: recorrige, a nota só sobe
  end
  W->>DB: reivindica pendente
  W->>M: cosmético × relevante, por aluno, precisa revisar?
  alt modelo disponível
    W->>DB: analisada · alteracao_aluno · notificacoes_ia
  else sem modelo
    Note over DB: continua pendente_analise:<br/>o professor decide (alteracao_decidir)
  end
```

## P12 — Notificações (motor no banco)

```mermaid
sequenceDiagram
  autonumber
  participant G as Grafo / gatilhos de evento
  participant DB as Postgres
  participant CRON as pg_cron
  participant APP as App
  participant EXPO as Expo Push

  G->>DB: notificacoes_ia (sugerida)
  DB->>DB: trg_notificacoes_ia_promover → notificacoes_pendentes<br/>(gatilho horario | login | tempo_uso | fim_foco)
  CRON->>DB: notificacoes_varrer (5 min)
  APP->>DB: rpc notificacoes_registrar_login / _heartbeat
  DB->>DB: entrega → notificacoes (caixa de entrada)
  DB->>EXPO: pg_net (respeita silêncio e modo foco)
  CRON->>DB: notificacoes_conciliar_push (5 min)
  Note over APP: lembrete diário = notificação local,<br/>dispara com o app fechado
```

## P13 — Privacidade: retenção, exclusão e arquivo da pesquisa

```mermaid
sequenceDiagram
  autonumber
  participant CRON as pg_cron
  participant DB as Postgres
  participant W as API · retencao_externa_loop
  participant EF as Edge Function pesquisa-arquivar
  participant R2 as R2
  participant OAI as OpenAI

  CRON->>DB: trailup_retencao (03:23): redige telemetria bruta, apaga por política
  CRON->>DB: retencao_avisos_email (30 min) · aviso por push (#937)
  DB->>DB: exclusão de fonte/arquivo/rag_openai_files → retencao_externa
  W->>DB: reivindica
  W->>R2: apaga objeto
  W->>OAI: apaga arquivo do Vector Store
  CRON->>DB: pesquisa_arquivo_disparar (10 min)
  DB->>EF: pg_net
  EF->>R2: pesquisa/ (cópia anônima, só de quem consentiu)
```
