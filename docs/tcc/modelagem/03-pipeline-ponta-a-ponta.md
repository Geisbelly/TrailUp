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

Em volta desse ciclo correm os fluxos que não dependem dele:

```mermaid
flowchart LR
  P9["P9 Progresso e<br/>pontuação"] --> P14["P14 Missões diárias<br/>e da IA"]
  P9 --> P15["P15 Arena e Elo"]
  P9 --> P16["P16 Evento com rank<br/>e duelo"]
  P9 --> P17["P17 Moedas, loja<br/>e fundo da turma"]
  P15 --> P16
  P14 --> P17
  P15 --> P17
  P18["P18 Diagnóstico<br/>do tópico"] --> P4["P4 Estudo"]
  P4 --> P19["P19 Estudo de efetividade<br/>e métricas"]
  P20["P20 Monitor e<br/>marca de deploy"]
  P12["P12 Notificações"]
  P13["P13 Privacidade"]
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
- **Quais perfis (11/11, `20261111_01`, #1107):** a base é gerada para os perfis que algum aluno da turma tem como representativo, pela regra única do vetor (`app_perfis_representativos`). Antes, era o 1º e o 2º de cada aluno, inclusive o 2º com afinidade 0, e nunca o 3º representativo.
- **Antes de chegar ao aluno (10 e 11/11):** o material gerado nasce `pendente` e só aparece ao aluno depois que o professor aprova no console (`personalizacao_decidir`, #1100). Tópico novo nasce em rascunho e só é visto quando o professor publica (#1102). O aviso de material novo sai na aprovação, não no fim da geração.
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
- **Leitura de servidor:** API e microservice não têm sessão de usuário, então pedem o link no mesmo `POST` com a chave de serviço (#974). O `GET` segue sem cabeçalho, e a chave não acompanha o redirecionamento até o R2.
- **Limite atual:** o app 1.0.6, que está na Play Store, não pede link e fica sem a mídia do gateway até a 1.0.7 ser publicada.
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
  API->>DB: conteúdo do tópico, questões e cards
  API->>API: separa o gabarito e o verso dos cards (só as guardas veem)
  API->>LLM: mentor_personalizacao_chat.txt + guia_do_app
  LLM->>M: saída estruturada
  M-->>LLM: reply, destinos, ações
  LLM->>LLM: checar_vazamento_de_gabarito e checar_grounding_chat com o gabarito (fallback se violar)
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
  DB->>DB: exclusão de fonte/arquivo/rag_openai_files → retencao_fila_externa
  W->>DB: reivindica
  W->>R2: apaga objeto
  W->>OAI: apaga arquivo do Vector Store
  CRON->>DB: pesquisa_arquivo_disparar (10 min)
  DB->>EF: pg_net
  EF->>R2: pesquisa/ (cópia anônima, só de quem consentiu)
```

## P14 — Missões: a diária do banco e a sugestão da IA

A missão diária e a sugerida pela IA usam a mesma entidade (`missoes`) e o mesmo avaliador. O critério reaproveita as métricas das conquistas, e a recompensa é uma chave de `eventos_pontuacao`, nunca um número solto.

```mermaid
sequenceDiagram
  autonumber
  participant CRON as pg_cron
  participant DB as Postgres
  participant W as API · missoes_ia_loop
  participant LLM as Modelo
  participant P as Professor
  participant APP as App

  CRON->>DB: 03:00 fn_missao_diaria_gerar (turma × perfil)
  CRON->>DB: 03:05 fn_missao_diaria_enfileirar_texto
  W->>DB: fn_missao_ia_reivindicar
  W->>LLM: reescreve o texto
  W->>DB: fn_missao_diaria_reescrever_texto
  Note over DB,W: qualquer falha deixa o texto de molde no lugar
  P->>DB: rpc missao_ia_pedir (1 a 5, com teto por dia)
  W->>DB: reivindica o pedido e lê fn_missao_ia_contexto
  W->>LLM: propõe missões
  W->>DB: fn_missao_ia_registrar (aplica as regras)
  DB->>DB: missoes.origem = ia, aprovacao = pendente
  P->>DB: aprova ou recusa (fn_missoes_ia_log)
  APP->>DB: lê missoes (RLS: ativa e aprovada)
  APP->>DB: estudo, resposta, evento
  DB->>DB: gatilhos avaliam o critério
  DB->>DB: missao_aluno concluida, paga uma vez
```

- Trocar o perfil ativo gera na hora a coorte do perfil novo (`trg_alunos_missao_diaria_perfil`). Sem isso, o aluno ficaria sem diária até a madrugada seguinte.
- A missão de guilda soma os membros (`fn_missao_guilda_progresso`): é o único caminho que grava `pendente` e `em_andamento`.

## P15 — Arena: desafio com adversário e Elo

```mermaid
sequenceDiagram
  autonumber
  participant A as Aluno A
  participant B as Aluno B
  participant DB as Postgres
  participant CRON as pg_cron

  A->>DB: rpc arena_desafio_criar (formato, modo, consequência)
  DB->>DB: guilda_desafios aberto · desafio_participantes por equipe
  B->>DB: rpc arena_convite_responder (aceito | recusado)
  A->>DB: rpc arena_responder
  B->>DB: rpc arena_responder
  DB->>DB: fn_arena_placar
  alt todos responderam
    DB->>DB: fn_desafio_encerrar
  else passaram 30 minutos
    CRON->>DB: fn_desafio_varrer_abandonados (5 min)
    DB->>DB: fn_desafio_encerrar
  end
  DB->>DB: resultado = vitoria | empate | sem_adversario
  opt consequência ranqueada, com equipe 2, vitória ou empate
    DB->>DB: ranqueada_elo + ranqueada_elo_partida
  end
  opt consequência diferente de treino
    DB->>DB: eventos_aluno → pontos e moedas
  end
```

- `fn_desafio_encerrar` é o fechamento compartilhado: atende arena, desafio de guilda e varredura. A função é idempotente: desafio já encerrado devolve o resultado guardado.
- `arena_encerrar` saiu da mão do jogador (`20261021_26`): encerrar por conta própria faria o adversário perder sem jogar.
- O desafio cooperativo de guilda usa as mesmas tabelas, sem equipe 2, por `guilda_desafio_responder`. Cada função recusa o tipo da outra.

## P16 — Evento com rank e duelo

```mermaid
sequenceDiagram
  autonumber
  participant P as Professor
  participant DB as Postgres
  participant CRON as pg_cron
  participant A as Aluno

  P->>DB: cria evento em rascunho (janela, peças, missões)
  CRON->>DB: fn_eventos_classe_varrer (1 min)
  DB->>DB: abre o rascunho marcado (fn_evento_classe_abrir_agora)
  A->>DB: rpc evento_classe_inscrever (peça arena)
  A->>DB: rpc evento_sugerir_adversarios (só nomes)
  A->>DB: rpc evento_duelo_criar
  DB->>DB: guilda_desafios com evento_id, consequência evento
  Note over DB: duelo não mexe no Elo, não cobra aposta e fica fora do XP
  CRON->>DB: fim vencido → fn_evento_classe_encerrar_agora
  DB->>DB: fn_evento_classe_apurar
  DB->>DB: eventos_classe_resultado e resultado por guilda
```

Os miolos sem sessão travam a linha e decidem pelo estado. Por isso, um clique do professor e a rotina no mesmo instante não creditam duas vezes.

## P17 — Moedas, loja e fundo da turma

```mermaid
sequenceDiagram
  autonumber
  participant A as Aluno
  participant DB as Postgres
  participant P as Professor

  A->>DB: rpc loja_comprar (preço e estoque da turma)
  DB->>DB: moedas_ledger (débito) · loja_compras ativa
  A->>DB: rpc loja_usar (alvo, chave do cliente)
  DB->>DB: confere limite por situação
  DB->>DB: aplica o efeito (prazo, tempo, dica, segunda chance, formato)
  DB->>DB: loja_uso_log · compra consumida
  opt ainda ativa
    P->>DB: rpc loja_estornar
    DB->>DB: moedas_ledger (crédito) · compra estornada
  end
  P->>DB: rpc fundo_turma_criar
  A->>DB: rpc fundo_turma_contribuir
  DB->>DB: cobra até o que falta · moedas_ledger
  alt meta atingida e benefício dado
    P->>DB: fundo_turma_encerrar (entregue)
  else cancelado
    P->>DB: fundo_turma_encerrar (estorno de todas as doações)
  end
```

- O saldo é a soma do razão `moedas_ledger`, que só recebe acréscimos. Ele nunca é materializado.
- A compra só concede a posse. O efeito sai no uso, com chave para não aplicar duas vezes quando a resposta se perde.
- As configurações resolvem em camadas: atividade, tópico, turma e padrão global. Toda mudança vai para `economia_auditoria`.
- Moldura nova ou imagem trocada vem da aba Molduras (UC53): o console sobe o arquivo direto no bucket público `molduras`, e `admin_moldura_gravar` grava a referência. Sem imagem no banco, vale o desenho do pacote do app.

## P18 — Diagnóstico do tópico

A IA escreve as perguntas. Pedir, guardar, corrigir, decidir o nível e dispensar são do banco.

```mermaid
sequenceDiagram
  autonumber
  participant APP as App
  participant DB as Postgres
  participant W as API · diagnostico_loop
  participant LLM as Modelo

  APP->>DB: rpc diagnostico_pedir (aluno, tópico)
  alt tópico já iniciado ou turma retida
    DB-->>APP: ja_iniciado | retido
  else
    DB->>DB: diagnostico_topico pendente
  end
  W->>DB: fn_diagnostico_reivindicar
  W->>DB: fn_diagnostico_contexto
  W->>LLM: gera as perguntas
  alt modelo respondeu
    W->>DB: fn_diagnostico_registrar (valida)
    DB->>DB: pronto · gabarito em tabela sem policy
  else falhou
    W->>DB: fn_diagnostico_falhou (2^n min, até 120)
    DB->>DB: na terceira falha, sem_ia
  end
  APP->>DB: rpc diagnostico_responder
  DB->>DB: corrige e decide o nível · respondido
  APP->>DB: ou rpc diagnostico_dispensar
```

O diagnóstico é opcional, acontece uma vez por aluno e tópico, e nunca dispara geração de material.

## P19 — Estudo de efetividade e métricas

```mermaid
sequenceDiagram
  autonumber
  participant P as Professor
  participant DB as Postgres
  participant CRON as pg_cron
  participant D as Dona

  P->>DB: rpc estudo_coorte_registrar (braço, baseline, corte, fim)
  DB->>DB: recusa baseline já iniciado
  DB->>DB: gatilho trava os campos quando a data passa
  DB->>DB: alembic_version → marco_produto automático
  P->>DB: registra marco manual da turma
  DB->>DB: vw_estudo_participantes (entrada atribuída e observada)
  CRON->>DB: 06:30 fn_auditoria_metricas_rodar (I01 a I20)
  DB->>DB: metricas_invariante_resultado e amostra
  CRON->>DB: fn_painel_tecnico_avisar_dono (30 min)
  D->>DB: lê o resultado no painel técnico
```

O desenho é prospectivo: a coorte precisa existir antes do estudo começar. A produção tem zero coortes registradas, então o fluxo está pronto e ainda não tem resultado.

## P20 — Monitor e marca de deploy

```mermaid
sequenceDiagram
  autonumber
  participant CRON as pg_cron
  participant DB as Postgres
  participant ALVO as API · console · web do aluno
  participant MAIL as E-mail
  participant D as Dona

  CRON->>DB: fn_monitor_tick (1 min)
  DB->>DB: colhe as respostas em net._http_response
  DB->>DB: aplica no estado de monitor_alvo
  DB->>DB: varre instabilidade, lentidão e degradação
  DB->>ALVO: pg_net: sondas do minuto
  ALVO-->>DB: status e versão (details.imagem)
  DB->>MAIL: monitor_alerta pendente
  opt sonda boa com versão nova, falhas curtas
    DB->>DB: sondas viram ok nulo, motivo deploy
  end
  D->>DB: rpc painel_disponibilidade (app_e_dono)
```

Quem mede a API é o banco, de fora do VPS, então relógio e alerta continuam com a API fora do ar. Se o Supabase cair, nada disso roda. Para esse caso existe a batida externa, ainda não configurada.
