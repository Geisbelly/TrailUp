# Inventário completo do sistema TrailUp (04/11/2026)

Complemento do [dossiê do sistema](./sistema-para-a-monografia-2026-11-04.md). Lá estão a síntese e o que pode ser afirmado. Aqui está **cada peça** do sistema, extraída de forma automática da fonte: docstrings e nomes do código, listagem de arquivos e contagens do banco de produção (só leitura). A escolha do que entra não foi manual, então nada ficou de fora por julgamento.

Base: `main` do Lab em `58331902` e banco `xrebtkmdewolzmpsdwgh`, ambos em 04/11/2026. Na descrição de cada módulo, o texto vem da docstring do arquivo. Quando não há docstring, aparecem os nomes públicos que o arquivo define.

## O que esta varredura acrescentou ao dossiê

1. **Desenho experimental pronto no banco** (`docs/superpowers/specs/2026-11-01-cohort-e-baseline-design.md`, migrations `20261102_02/03/05`):
   - a coorte é a **turma**, com uma data de corte;
   - o baseline tem pelo menos 7 dias antes do corte;
   - há turma de comparação, o que permite **diferença-em-diferenças**;
   - o registro é **prospectivo e travado** por gatilho: escolher a janela depois de ver o dado fica impossível;
   - a análise é por **intenção de tratar**: aluno pareado sem uso conta como zero;
   - durante o estudo, a personalização fica **retida** na turma de comparação, e o grafo só mede.
   - Em produção, `estudo_coorte` tem 0 linhas: nenhuma coorte foi registrada.
2. **Perguntas de pesquisa já operacionalizadas** (`docs/tcc/09`):
   - PR1: tempo ativo por tópico;
   - PR2: conclusão e acerto;
   - PR3: perfil × formato, por RPC com **intervalo de Wilson a 95%**, supressão abaixo de n mínimo e duas leituras de perfil (dominante e por afinidade, com n efetivo de Kish);
   - PR4: UX e retenção.
3. **Análise BrainHex v3** (`docs/analises/issue-1-adaptacao-evidencias.md`):
   - a confiança do perfil **não é estimada** (`null`);
   - o Spearman foi corrigido;
   - houve releitura de Tondello (2018), Oliveira (2022), van Sonderen (2013), Santos (2022) e das diretrizes ITC (2017);
   - o desenho "perfil probabilístico" (prior do quiz mais evidência do uso) foi revisto, porque os pesos não estão calibrados.
4. **O conteúdo também decide o formato** (`demanda_formato.py`):
   - cada conteúdo é classificado em visual, escrito, sonoro e prático, como essencial, ajuda ou indiferente;
   - o que é essencial vem antes da preferência do perfil.
5. **Métrica de efetividade da própria sugestão** (`sugestao_metrica.py`):
   - mede se a sugestão foi seguida e se o desempenho foi melhor quando seguida;
   - mede se as revisões melhoraram o resultado;
   - mede o *churn*, quanto o sistema muda de opinião.
6. **Auditoria das métricas** (`2026-10-28-metricas-ponta-a-ponta-design.md`):
   - em 28/10, nenhum KPI do console media o que o rótulo dizia (exemplo: tempo de uso inflado em até 81×);
   - a correção trocou "funcionar" por **invariantes que passam ou falham**: 40 amostras e 120 resultados em `metricas_invariante_*`, conferidos todo dia por `pg_cron`;
   - número sabidamente errado não aparece no console.
7. **Duas implementações de RAG**:
   - ADR-0001: pgvector no Postgres. A tabela `rag_chunks` com `vector(1536)` existe e a extensão `vector 0.8.0` está instalada;
   - ADR-0002, a vigente: Vector Store da OpenAI;
   - há também um pipeline de ingestão local (`app/ingestion/`: extratores PDF/DOCX/PPTX/MD/TXT e um *semantic chunker*) usado nas fontes do professor;
   - todas as tabelas de RAG estão vazias.
8. **Guardrails das saídas do modelo** (`guardrails.py`):
   - ordem sequencial da trilha;
   - tópicos existentes;
   - evidência de domínio;
   - *grounding* do chat do mentor, com uma segunda chamada que julga se a resposta se apoia no contexto (`mentor_grounding_check.txt`);
   - `gerar_validado`, que repete a chamada quando a saída falha nessas checagens.
9. **Formatos de saída além dos três principais**:
   - vídeo MP4 (`video.py`, moviepy), PPTX, DOCX e PDF de slides;
   - imagem do professor **reilustrada por perfil** (`profileImageRestyle.ts`);
   - diagramas ASCII do modelo convertidos em fluxograma (`flowDiagram.ts`, `laneDiagram.ts`);
   - deck HTML com quiz interativo, grafo de conhecimento e sintetizador de áudio temático (BrainHexPDF).
10. **O app também roda na web, em tela larga** (`mobile/src/components/web/`, cerca de 30 componentes de desktop).
11. **Recursos de integridade acadêmica:**
    - print bloqueado enquanto o aluno responde (`useBloqueioDeCaptura`, #139);
    - vigia de presença;
    - atualização obrigatória por versão mínima;
    - tentativas de atividade registradas no servidor.
12. **Missões sugeridas por IA ao professor** (`missoes_ia.py`, #151):
    - o banco aplica as regras: teto por dia, métrica do catálogo, sem link nem e-mail;
    - guarda só contagens, nunca o texto.
13. **Integração LTI 1.3:** só levantamento (`docs/architecture/lti-1.3.md`, #146), **nada implementado**.

## Depois da varredura (até 12/11/2026)

As tabelas abaixo continuam sendo o retrato de 04/11. Esta seção registra só as peças que mudaram o que o inventário descreve, sem reextrair tudo.

- **Banco em 08/11** (revisão `20261108_02`): 189 tabelas, 705 funções, 149 gatilhos, 292 políticas e 21 rotinas `pg_cron`.
- **O guia não entrega a resposta (#1059):**
  - `app/services/contexto_chat_materia.py` monta o contexto do chat com as questões (enunciado e alternativas, sem marcar a certa), as questões do quiz gerado e a frente dos cards;
  - `montar_gabarito_protegido` junta as respostas aceitas e o verso dos cards, e `gabarito_na_resposta` procura a resposta inteira (12 caracteres ou mais) ou um trecho de 8 palavras;
  - `app/agent/graph/guardrails.py` ganhou `checar_vazamento_de_gabarito`, que roda antes de `checar_grounding_chat`, e o juiz (`mentor_grounding_check.txt`) recebe o gabarito;
  - `buscar_questoes_com_gabarito_topico` (`app/repositories/conteudo_classe.py`) lê o gabarito só para as guardas.
- **Dissertativa sem revelar a resposta (#1060):** `validate-essay-answer-ai/protecaoDaResposta.ts` troca o comentário e os pontos que repetiriam a resposta esperada. A nota fica como veio, e o texto do próprio aluno não conta como vazamento.
- **Questão corrigida no banco (#1064, #1065):**
  - a migration `20261108_01` reescreve `questao_responder` (a v2 corrige, pontua e grava; a anterior não era chamada por ninguém), cria `questao_revelar_gabarito` e tira o EXECUTE de `fn_questao_confere` do cliente, que servia de oráculo;
  - a dissertativa lê a resposta esperada no servidor (`questao_correcao_ia_contexto`, só `service_role`), em vez de recebê-la do app;
  - no app, `mobile/src/services/questaoNoBanco.ts` (com `questaoNoBanco.core.ts`) responde pelas RPCs, e `QuestionActivity` não lê mais o gabarito da questão da turma;
  - a coluna ainda fica aberta para o app instalado, e fechá-la é a fase 3 (`docs/analises/2026-11-08-gabarito-fora-do-app-do-aluno.md`).
- **Push (#1066, #1067):** a migration `20261108_02` lê os recibos da Expo e desativa o token do Expo Go. `mobile/app.config.js` liga `android.googleServicesFile` ao Firebase no build.

### De 09 a 12/11/2026

- **Banco em 12/11** (revisão `20261111_05`): 192 tabelas, 27 views, 734 funções, 152 gatilhos, 311 políticas e 23 rotinas `pg_cron`. Edge Functions publicadas: 7.
- **Texto rico (spec A, #1072, #1074, #1075):**
  - `20261108_03` cria `formato_texto` (`texto` | `rico`) em `questoes`, `atividades` e `cards`, e `fn_questao_posicao_rica` confere a múltipla rica pela posição;
  - no app, `mobile/src/components/textoRico/` (`TextoRico`, `Formula`, `BlocoDeCodigo`), com MathJax 4 em SVG;
  - no console, `frontend/src/components/textoRico/` (`CampoTextoRico`, com prévia).
- **Respostas em código, numérica e expressão (spec B, #1083 a #1096):**
  - `20261110_02` cria os tipos, `questoes.config_resposta`, `questao_gabarito.criterios`, `questao_conferencia_contexto` e `questao_registrar_correcao_servidor` (as duas só `service_role`), e `fn_questao_corrigida_por_ia`;
  - Edge Function nova `questao-conferir-resposta` (mathjs 15.2.0);
  - `validate-essay-answer-ai` ganhou o prompt de código (`promptDeCodigo.ts`);
  - o console lê o gabarito de `questao_gabarito` (#1081).
- **Notas e cronômetro:** `20261110_03` deixa na fila de correção só o que o professor corrige (#1087); `20261110_05` tira o tempo das questões e pausa ao sair da atividade (#1089).
- **Arena (#1091):** `20261110_06` corrige o desafio pelo banco e só sorteia questão que o banco corrige na hora. A evidência é o duelo inteiro rodando sobre as 50 funções da arena copiadas de produção (`api/tests/fixtures/arena_prod_20261110.sql`).
- **Saúde dos clientes (#1092):** `20261110_07` grava a falha que o app já trata, com a mensagem do Supabase, em `cliente_erro`.
- **Trilha da IA (#1093, #1095, #1097, #1098, #1113):**
  - a `generate-content-ai` faz um pedido por tópico, pula para o modelo reserva no 503 e lê os anexos (`anexosDaTrilha.ts`);
  - `20261110_08` cria `trilha_rascunho`, uma linha por turma;
  - no console, `arquivosParaIa.ts`, `figurasDaTrilha.ts` e `pdfNoNavegador.ts`.
- **Aprovação do material personalizado (#1100, #1101):** `20261110_09` acrescenta `aprovacao`, `aprovacao_por`, `aprovacao_em`, `aprovacao_motivo` e `conteudo_versao` a `conteudo_personalizado`, com o gatilho `trg_conteudo_personalizado_aprovacao`, a RPC `personalizacao_decidir` e as policies RESTRICTIVE `conteudo_personalizado_aprovado_sel` e `cards_personalizados_aprovado_sel`.
- **Visibilidade do tópico (#1102, #1104):** `20261110_10` cria `topicos.publicacao` (`rascunho` | `publicado` | `agendado`) e `publicar_em`; `20261110_11` põe os portões nas funções `SECURITY DEFINER` que leem material.
- **Diversidade de perfis (#1105 a #1118):**
  - API: `app/services/perfil_vetor.py` (#1106) e o cronômetro e o boss ponderados (#1109);
  - `20261111_01`: `app_vetor_perfil`, `app_perfis_representativos` e `app_perfil_dominante`;
  - `20261111_02`: mistura de material, com a chave `mistura_material`, o progresso por perfis representativos e `personalizacao_exposicao`;
  - `20261111_03`: `classe_diversidade_perfis` (console, `frontend/src/components/console/dashboard/diversidade.ts`);
  - `20261111_04`: `notificacoes_peso_perfil` com `perfil_peso_modo`;
  - `20261111_05`: `aluno_perfil_observado` e `fn_perfil_observado_recalcular`, com a rotina `trailup_perfil_observado` às 06:20 UTC;
  - app: `mobile/src/utils/rotaDeMaterial.ts`, `bossFalasPorVetor.ts` e `chavesDoCacheDaRota.ts`.
- **Microservice (#1108):** a assinatura do perfil abre com uma cena curta do próprio exemplo, no lugar da ambientação mística, e há uma barreira de fidelidade ao conteúdo.

---

## 1. API (`api/app`): todos os módulos

Colunas: arquivo, linhas, descrição.

| Arquivo | Linhas | Descrição |
|---|---|---|
| `app/adapters/base_emocao.py` | 14 | define: `EmocaoAdapter` |
| `app/adapters/mock_emocao.py` | 46 | define: `MockEmocaoAdapter` |
| `app/agent/graph/builder.py` | 80 | define: `build_graph` |
| `app/agent/graph/checkpointer.py` | 53 | define: `get_checkpointer`, `get_persistent_checkpointer`, `get_ephemeral_checkpointer`, `close_checkpointer` |
| `app/agent/graph/guardrails.py` | 202 | define: `GuardrailViolation`, `checar_ordem_sequencial`, `checar_topicos_existem`, `checar_evidencia_dominio`, `gerar_validado`, `checar_grounding_chat` |
| `app/agent/graph/nodes/agente_ai_patch.py` | 11 | define: `agente_ai_patch` |
| `app/agent/graph/nodes/agente_conteudo.py` | 46 | define: `agente_conteudo` |
| `app/agent/graph/nodes/agente_cronometro.py` | 26 | A IA desliga o cronometro das atividades de um aluno (#136, fase 4). |
| `app/agent/graph/nodes/agente_emocao.py` | 33 | define: `agente_emocao` |
| `app/agent/graph/nodes/agente_geracao_midia.py` | 45 | define: `agente_geracao_midia` |
| `app/agent/graph/nodes/agente_intervencao.py` | 207 | Intervencao sugerida ao professor quando um alerta de estudo se repete (#64). |
| `app/agent/graph/nodes/agente_midias_personalizadas.py` | 34 | define: `agente_midias_personalizadas` |
| `app/agent/graph/nodes/agente_notificacao.py` | 377 | Notificação push personalizada por aluno e por perfil BrainHex, com RAG (#66). |
| `app/agent/graph/nodes/agente_perfil.py` | 72 | define: `agente_perfil` |
| `app/agent/graph/nodes/agente_plano_personalizacao.py` | 11 | define: `agente_plano_personalizacao` |
| `app/agent/graph/nodes/agente_texto.py` | 53 | define: `agente_texto` |
| `app/agent/graph/nodes/agente_trilha.py` | 96 | define: `agente_trilha` |
| `app/agent/graph/nodes/agente_ui.py` | 73 | define: `agente_ui` |
| `app/agent/graph/nodes/executor.py` | 260 | define: `aviso_da_intervencao`, `executor` |
| `app/agent/graph/nodes/persist_personalizacao.py` | 18 | define: `persist_personalizacao` |
| `app/agent/graph/nodes/supervisor.py` | 64 | define: `escolha_do_modelo`, `supervisor` |
| `app/agent/graph/routing.py` | 225 | define: `compute_supervisor_next`, `compute_personalizacao_next`, `build_state_summary`, `route_from_state` |
| `app/agent/graph/state.py` | 85 | define: `TrailUpState` |
| `app/api/admin.py` | 594 | define: `admin_professores_page` |
| `app/api/deps.py` | 116 | define: `AdminContext`, `get_settings`, `get_session`, `get_current_user`, `require_admin`, `require_aluno`, `require_professor`, `ensure_professor_access` |
| `app/api/economia_admin.py` | 141 | Auditoria da economia no painel admin da API. |
| `app/api/health.py` | 50 | define: `healthcheck` |
| `app/api/molduras_admin.py` | 273 | Molduras no painel admin da API: o dev liga, desliga e reprecifica, e escolhe o que cada ação dá. |
| `app/api/router.py` | 30 | (sem docstring) |
| `app/api/v1/admin.py` | 119 | define: `atualizar_liberacao_professor`, `atualizar_acesso_aluno_professor`, `backfill_media_render_admin` |
| `app/api/v1/emocoes.py` | 94 | define: `analisar`, `analisar_stream` |
| `app/api/v1/escriba.py` | 42 | Escriba: conversa do professor com a IA sobre as turmas dele. |
| `app/api/v1/insights.py` | 112 | Insights da turma (aba Insights do console do professor). |
| `app/api/v1/materiais.py` | 51 | define: `listar_materiais` |
| `app/api/v1/personalizacao.py` | 3191 | define: `personalizar`, `conversar_com_mentor_personalizacao`, `upload_fontes_personalizacao`, `upsert_progresso_personalizado`, `listar_personalizacoes_por_perfil`, `regenerar_documento_personalizacao`, `regenerar_slide_personalizacao`, `obter_adequacao_grupo` |
| `app/api/v1/telemetria.py` | 408 | define: `registrar_lote_telemetria` |
| `app/core/build_info.py` | 9 | Revisão informada pelo deploy, sem inferir pelo checkout ou versão do pipeline. |
| `app/core/settings.py` | 338 | define: `Settings`, `get_settings` |
| `app/core/tracing.py` | 65 | Trava do tracing LangSmith (#195). |
| `app/db/migrations.py` | 116 | define: `normalize_database_url_for_alembic`, `trava_de_migracao`, `declara_leitura_e_escrita`, `upgrade_database_to_head` |
| `app/db/session.py` | 98 | define: `DatabaseUnavailableError`, `execute_with_database_retry`, `build_engine`, `build_session_factory`, `ping_database`, `session_dependency` |
| `app/ingestion/document_normalizer.py` | 103 | Normaliza o resultado bruto dos extratores para um NormalizedDocument. Limpa ruído, preserva hierarquia e atribui IDs únicos. |
| `app/ingestion/extractor_factory.py` | 68 | Factory: escolhe o extrator correto com base na família do arquivo. |
| `app/ingestion/extractors/docx_extractor.py` | 149 | Extrator de DOCX: python-docx → lista de Block. |
| `app/ingestion/extractors/markdown_extractor.py` | 214 | Extrator de Markdown: parse estrutural → lista de Block. |
| `app/ingestion/extractors/pdf_extractor.py` | 94 | Extrator de PDF: pypdf → lista de Block. |
| `app/ingestion/extractors/pptx_extractor.py` | 303 | Extrator de PPTX: python-pptx com fallback XML. |
| `app/ingestion/extractors/text_extractor.py` | 117 | Extrator de texto plano (.txt, .csv, .json, .xml) → lista de Block. |
| `app/ingestion/format_detector.py` | 186 | Detecta o tipo e família de um arquivo por extensão e MIME type. |
| `app/ingestion/models.py` | 100 | Modelos internos unificados do pipeline de ingestão. |
| `app/ingestion/pipeline.py` | 198 | Ponto de entrada do pipeline de ingestão. |
| `app/ingestion/semantic_chunker.py` | 152 | Segmentador semântico: agrupa blocos em chunks coerentes por seção/tópico. |
| `app/main.py` | 177 | define: `create_app` |
| `app/repositories/access.py` | 316 | define: `AccessRepository` |
| `app/repositories/aluno_topico_dominio.py` | 67 | define: `AlunoTopicoDominioRepository` |
| `app/repositories/artefatos_personalizados.py` | 546 | define: `ArtefatosPersonalizadosRepository` |
| `app/repositories/classe_mapa_tema.py` | 192 | define: `ClasseMapaTemaRepository` |
| `app/repositories/conteudo_classe.py` | 455 | define: `ConteudoClasseRepository` |
| `app/repositories/conteudo_personalizado.py` | 1195 | define: `ConteudoPersonalizadoRepository` |
| `app/repositories/context.py` | 478 | define: `ContextRepository` |
| `app/repositories/estado_atencao.py` | 65 | define: `EstadoAtencaoRepository`, `estado_da_atencao` |
| `app/repositories/estudo.py` | 48 | define: `EstudoRepository` |
| `app/repositories/evento.py` | 86 | define: `EventoRepository` |
| `app/repositories/fontes_personalizacao.py` | 798 | define: `FontesContextLimitExceeded`, `FontesPersonalizacaoRepository` |
| `app/repositories/ia_decision_logs.py` | 103 | define: `IADecisionLogRepository` |
| `app/repositories/ia_descricao.py` | 144 | define: `IADescricaoRepository` |
| `app/repositories/intervencao.py` | 89 | define: `IntervencaoRepository` |
| `app/repositories/materiais.py` | 628 | define: `MateriaisRepository` |
| `app/repositories/mental_state.py` | 86 | define: `MentalStateHistoryRepository` |
| `app/repositories/notificacao.py` | 77 | define: `NotificacaoRepository` |
| `app/repositories/perfil.py` | 106 | define: `PerfilRepository` |
| `app/repositories/personalizacao_blocos.py` | 112 | define: `PersonalizacaoBlocosRepository` |
| `app/repositories/personalizacao_jobs.py` | 1407 | define: `PersonalizacaoJobsRepository` |
| `app/repositories/personalizacao_progresso.py` | 449 | define: `PersonalizacaoProgressoRepository` |
| `app/repositories/professor.py` | 25 | define: `ProfessorRepository` |
| `app/repositories/rag_openai_files.py` | 82 | Catalogo local do que esta no Vector Store da OpenAI (`rag_openai_files`). |
| `app/repositories/sugestao_material.py` | 431 | Persistência da sugestão de material por aluno + log append-only. |
| `app/repositories/telemetria.py` | 680 | define: `TelemetriaRepository` |
| `app/repositories/tentativas.py` | 97 | Leitura das tentativas e escrita do cronometro pela IA (#136, fase 4). |
| `app/repositories/trilha.py` | 58 | define: `TrilhaRepository` |
| `app/schemas/alteracao_professor.py` | 19 | define: `DecisaoDoAluno`, `AlteracaoProfessorSaida` |
| `app/schemas/api.py` | 118 | define: `AnalisarPayload`, `AnalisarResponse`, `MaterialGeradoResponse`, `MateriaisAlunoResponse`, `AdminAlunoResumo`, `AdminProfessorResumo`, `AdminDashboardData`, `AdminProfessorLiberacaoRequest` |
| `app/schemas/common.py` | 31 | define: `Evento`, `DesempenhoSummary` |
| `app/schemas/conteudo_adaptado.py` | 10 | define: `ConteudoAdaptado` |
| `app/schemas/emocao_result.py` | 9 | define: `EmocaoResult` |
| `app/schemas/escriba.py` | 31 | define: `MensagemEscriba`, `PerguntaEscriba`, `EscribaSaida`, `RespostaEscriba` |
| `app/schemas/ia_patch.py` | 203 | define: `IACamelModel`, `IAMentalStateSnapshot`, `IAFeatureDescriptor`, `IATimerConfig`, `IABattleTiming`, `IAEnemyPalette`, `IAEnemyVisualSpec`, `IAEnemySpec` |
| `app/schemas/insights.py` | 40 | define: `InsightGerado`, `InsightsTurmaSaida`, `InsightsGeracaoResponse` |
| `app/schemas/intervencao.py` | 28 | define: `IntervencaoSugestao`, `IntervencaoPayload` |
| `app/schemas/memoria_aluno.py` | 21 | define: `DominioTopico`, `MentalStateRecorrente`, `MemoriaAluno` |
| `app/schemas/mentor_chat.py` | 13 | define: `MentorChatLLMResult`, `GroundingJudgment` |
| `app/schemas/missoes_ia.py` | 18 | define: `PropostaDeMissao`, `MissoesIaSaida` |
| `app/schemas/notificacao.py` | 13 | define: `NotificacaoPayload` |
| `app/schemas/perfil.py` | 14 | define: `PerfilScore`, `PerfilUpdate` |
| `app/schemas/personalizacao.py` | 534 | define: `DesignTokensCores`, `DesignTokensTipografia`, `DesignTokens`, `PerfilBrainHexPayload`, `PersonalizarPayload`, `PersonalizacaoStep`, `PersonalizacaoItemProgressoPayload`, `PersonalizacaoItemProgressoResponse` |
| `app/schemas/supervisor_decision.py` | 6 | define: `SupervisorDecision` |
| `app/schemas/telemetria.py` | 246 | define: `TelemetriaSignalPayload`, `TelemetriaTouchSamplePayload`, `TelemetriaTimeMetricEntryPayload`, `TelemetriaTimeMetricsPayload`, `TelemetriaCameraFramePayload`, `TelemetriaCameraPayload`, `TelemetriaAppEventPayload`, `TelemetriaClientePayload` |
| `app/schemas/texto_gerado.py` | 8 | define: `TextoGerado` |
| `app/schemas/trilha_config.py` | 10 | define: `TrilhaConfig` |
| `app/schemas/ui_config.py` | 15 | define: `UIConfig` |
| `app/services/alteracao_professor.py` | 208 | Worker da análise de alteração do professor (`20261101_12`). |
| `app/services/analise_fila.py` | 308 | Worker da fila de análise de lote de telemetria (F3, Task 2). |
| `app/services/analysis_runner.py` | 285 | define: `build_analysis_graph_config`, `build_analysis_response`, `run_analysis` |
| `app/services/audio.py` | 103 | define: `gerar_mp3_gtts`, `gerar_mp3_gemini_tts` |
| `app/services/auth.py` | 239 | define: `UserContext`, `AuthService` |
| `app/services/behavioral_personalization.py` | 798 | define: `build_behavioral_personalization` |
| `app/services/boss_falas.py` | 495 | Falas do boss geradas em lote: uma chamada ao modelo por tópico × perfil BrainHex. |
| `app/services/checkpoint_retention.py` | 138 | define: `CheckpointCleanupResult`, `cleanup_persisted_checkpoints`, `run_checkpoint_retention_once`, `checkpoint_retention_loop` |
| `app/services/classe_mapa_tema.py` | 285 | define: `gerar_classe_mapa_tema` |
| `app/services/content_enrichment.py` | 1322 | define: `reset_openai_enrichment_circuit`, `openai_estimated_spend_usd`, `reset_openai_spend_guard`, `reset_gemini_enrichment_circuit`, `ContentEnrichmentError`, `derive_base_blocks_and_topic`, `enrich_base_blocks`, `enrich_content_blocks` |
| `app/services/demanda_formato.py` | 458 | O formato que cada conteúdo pede para ser entendido: uma análise por tópico, no worker. |
| `app/services/docx.py` | 21 | define: `gerar_docx` |
| `app/services/emotion_vision.py` | 313 | Analise de emocao a partir do frame da camera, com modelo LOCAL. |
| `app/services/escriba.py` | 333 | Escriba: o assistente de IA do professor no console. |
| `app/services/estado_de_estudo.py` | 54 | Estado de estudo do ciclo: o que entra em `aluno_mental_state_history` (DAT-45). |
| `app/services/evidencias_pedagogicas.py` | 122 | Catálogo das regras que o motor de sugestão usa, com a evidência de cada uma (#66). |
| `app/services/gemini_chaves.py` | 200 | Pool unico de chaves do Gemini para a API inteira. |
| `app/services/gemini_http.py` | 109 | Chamadas HTTP diretas ao Gemini (generativelanguage.googleapis.com). |
| `app/services/graph_invocation.py` | 155 | define: `ainvoke_personalizacao_graph` |
| `app/services/group_analysis.py` | 254 | Adequacao de grupo: analisa a distribuicao de perfis BrainHex por classe. |
| `app/services/guia_do_app.py` | 48 | O que os Guardiões sabem sobre o app do aluno, e para onde podem levá-lo. |
| `app/services/insights_turma.py` | 412 | Insights da turma: sinteses que a IA escreve para o professor (aba Insights). |
| `app/services/linear_analysis_pipeline.py` | 963 | Pipeline linear de analise adaptativa. |
| `app/services/llm.py` | 328 | define: `reset_gemini_llm_circuit`, `load_prompt`, `extract_json`, `StructuredOutputError`, `MenorSemOpenAIError`, `JsonLLMService` |
| `app/services/m2_features.py` | 148 | Monta os overrides das features M2 a partir do banco (issue #215). |
| `app/services/m2_inference.py` | 199 | Gate M2: inferência local dos modelos de knowledge tracing (issue #215). |
| `app/services/material_revisao.py` | 40 | Contador de revisao por material. |
| `app/services/media_agents.py` | 937 | define: `gerar_audio_gemini_tts`, `gerar_roteiro_video_llm`, `brainhex_contract_ready`, `disparar_brainhex_async`, `gerar_capitulo_bloco_brainhex`, `gerar_audio_parte_brainhex`, `gerar_apresentacao_parte_brainhex`, `regenerar_capitulo_brainhex` |
| `app/services/media_contract.py` | 24 | Contrato de versão entre a API orquestradora e o gerador de mídias. |
| `app/services/media_generation_jobs.py` | 481 | define: `criar_ciclo_media_generation`, `MediaGenerationTargetError`, `processar_target_enriquecimento`, `processar_target_capitulo`, `fase_a_completa`, `criar_targets_fase_b`, `processar_target_audio`, `processar_target_apresentacao` |
| `app/services/media_pipeline.py` | 502 | define: `MediaPipelineContext`, `MediaPipeline`, `MarkdownPipeline`, `SlidesPipeline`, `AudioPipeline`, `MultiOutputPipeline` |
| `app/services/memoria_aluno.py` | 91 | define: `ler_memoria`, `atualizar_memoria` |
| `app/services/missao_diaria_texto.py` | 342 | Fase 6: reescreve o texto da missão diária por coorte, com Gemini, sem tocar no que ela mede. |
| `app/services/missoes_ia.py` | 181 | Worker das missões sugeridas pela IA (`20261102_20`, #151). |
| `app/services/modo_restrito.py` | 76 | Modo restrito do aluno (#195): o que a API deixa fazer sem consentimento. |
| `app/services/openai_rag.py` | 277 | Integração do TrailUp com o OpenAI Vector Store. |
| `app/services/pdf.py` | 252 | define: `render_pdf_html`, `gerar_pdf` |
| `app/services/personalizacao.py` | 6968 | define: `normalizar_arco_narrativo`, `build_personalizacao_steps`, `fetch_personalizacao_context`, `gerar_cards_direto`, `generate_plano_personalizacao`, `generate_ai_patch_personalizacao`, `generate_materiais_personalizados`, `reconcile_material_links_for_record` |
| `app/services/personalizacao_jobs.py` | 3207 | define: `inicio_do_adiamento`, `marcar_adiamento`, `enqueue_personalizacao_job`, `get_job_detail`, `derivar_personalizacao_do_base`, `process_personalizacao_job_once`, `personalizacao_jobs_loop` |
| `app/services/pptx.py` | 165 | define: `gerar_pptx` |
| `app/services/pseudonimizacao.py` | 146 | Pseudonimizacao do que vai aos provedores de IA (#195, LGPD art. 46). |
| `app/services/r2_storage.py` | 114 | Escrita e remocao de objetos no Cloudflare R2 SEM credencial do R2 na API (#76). |
| `app/services/rag_observabilidade.py` | 193 | Observabilidade do RAG (#67): o que a busca no Vector Store fez, sem texto do aluno. |
| `app/services/retencao_externa.py` | 346 | Worker da fila externa de retencao (#195, `20261024_03`). |
| `app/services/roteamento_ia.py` | 189 | IA do TrailUp so para adultos confirmados (#195). |
| `app/services/slides_pdf.py` | 165 | define: `gerar_pdf_slides` |
| `app/services/state_builder.py` | 129 | define: `build_initial_state` |
| `app/services/storage.py` | 669 | define: `build_public_storage_url`, `build_material_url`, `material_url_de_leitura`, `objeto_do_storage`, `SupabaseStorage` |
| `app/services/sugestao_ciclo.py` | 432 | Amarra o motor de sugestão ao banco: cria, revisa e registra cada decisão. |
| `app/services/sugestao_material.py` | 819 | Motor determinístico de sugestão de material por aluno. |
| `app/services/sugestao_metrica.py` | 330 | Efetividade das sugestões de material (fase 3). |
| `app/services/sugestao_sinais.py` | 255 | Traduz telemetria em sinais por formato, no formato que o motor espera. |
| `app/services/telemetria_eventos_legados.py` | 116 | Eventos legados (`eventos_aluno`) derivados dos sinais de um lote de telemetria. |
| `app/services/tentativas_atividade.py` | 157 | Tentativas de atividade e cronometro, do lado da IA (#136, fase 4). |
| `app/services/text_cleanup.py` | 346 | define: `repair_mojibake`, `strip_source_markers`, `clean_extracted_text`, `merge_fragmented_sections`, `expand_sections`, `normalize_points`, `normalize_script`, `split_text_chunks` |
| `app/services/uso_do_modelo.py` | 40 | Uso do modelo devolvido pelo microservice, para o custo por artefato do painel técnico (#21). |
| `app/services/video.py` | 206 | define: `gerar_video_mp4` |

**Prompts** (27, em `api/app/agent/prompts/`):
`alteracao_professor`, `boss_falas`, `classe_mapa_tema`, `conteudo_adaptado`, `demanda_formato`, `enriquecedor_blocos_conteudo`, `escriba`, `gerador_conteudo`, `guia_do_app_aluno`, `insights_turma`, `intervencao`, `lumi_conhecimento`, `materiais_personalizados`, `mentor_grounding_check`, `mentor_personalizacao_chat`, `missao_diaria_texto`, `missoes_ia`, `notificacao_personalizada`, `notificacao`, `perfil_brainhex`, `personalizacao_comportamental`, `pipeline_midia_etapas`, `planejador_conteudo`, `supervisor`, `texto_personalizado`, `trilha_config`, `ui_adaptativa`.

**Workers em laço no processo da API** (`app/main.py`), 6:
- limpeza de checkpoints do LangGraph;
- fila de personalização;
- remoção de arquivos externos (retenção);
- fila de análise de telemetria;
- análise de alteração do professor;
- missões sugeridas pela IA.

---

## 2. Microservice e BrainHexPDF: arquivos de código

**Endpoints do microservice:**
- `POST /api/personalizar`
- `POST /api/v1/archive`
- `POST /api/v1/generate/block`, `/generate/part-audio`, `/generate/part-presentation`
- `POST /api/v1/regenerate/chapter`, `/regenerate/slide`, `/regenerate/document`
- `GET /api/health`

O BrainHexPDF expõe `POST /api/v1/render-and-store`.

Colunas: arquivo, linhas, primeiro comentário do arquivo.

| Arquivo | Linhas | Primeiro comentário |
|---|---|---|
| `brainhexpdf/server.ts` |     3338 |  Default 3002 - NAO usar 3000 (porta do microservice/api-brainhex no mesmo |
| `brainhexpdf/src/App.tsx` |      258 |  * TrailUp BrainHex - Gerador de Slides e PDFs Temáticos Personalizados |
| `brainhexpdf/src/components/BrainHexAvatars.tsx` |      509 |  |
| `brainhexpdf/src/components/BrainHexGuideModal.tsx` |      237 |  |
| `brainhexpdf/src/components/ContentVisualRepresentation.tsx` |      434 |   // Derive visual concept pillars from slide content or title |
| `brainhexpdf/src/components/DeckEditorModal.tsx` |      725 |     // Ensure at least one option remains correct |
| `brainhexpdf/src/components/GeneratorModal.tsx` |     1493 |   // Tabs: 'batch-all' \| 'single' \| 'keys-config' |
| `brainhexpdf/src/components/InteractiveQuiz.tsx` |      456 |   // Sync state when slideId or initialState changes |
| `brainhexpdf/src/components/InteractiveVisualRenderer.tsx` |      471 |  |
| `brainhexpdf/src/components/KnowledgeGraphModal.tsx` |       54 |  |
| `brainhexpdf/src/components/MagicalParticleCanvas.tsx` |      501 |   // Resolve active theme palette |
| `brainhexpdf/src/components/MicroserviceDocsModal.tsx` |      731 |   // Live Tester State |
| `brainhexpdf/src/components/Navbar.tsx` |      285 |  |
| `brainhexpdf/src/components/PdfExportModal.tsx` |      341 |   // Generate High-Res PDF using jsPDF + html2canvas |
| `brainhexpdf/src/components/PresenterModal.tsx` |      308 |  |
| `brainhexpdf/src/components/SlideViewer.tsx` |     2391 |   // Visual archetype defined strictly by the deck's content and BrainHex profile |
| `brainhexpdf/src/components/SmartConceptVisualizer.tsx` |      141 |   // Extract key concept phrases from paragraphs |
| `brainhexpdf/src/components/SupabaseModal.tsx` |      475 |         // ignore |
| `brainhexpdf/src/components/ThematicDecorations.tsx` |     1238 |  * Full-bleed atmospheric vector backdrop scenes matching the rich Slidesgo reference images: |
| `brainhexpdf/src/components/TrailUpThematicGraphics.tsx` |      408 |  * The official TrailUp 3D multifaceted astral crystal gem |
| `brainhexpdf/src/components/UniqueInteractiveCard.tsx` |      930 |   // Local interaction state |
| `brainhexpdf/src/components/VisualKnowledgeGraph.tsx` |      846 |   // Graph Data |
| `brainhexpdf/src/context/DeckInteractionContext.tsx` |      519 |   // Actions |
| `brainhexpdf/src/data/brainHexProfiles.ts` |      385 |  |
| `brainhexpdf/src/data/personaBlueprintConfigs.ts` |      396 |  |
| `brainhexpdf/src/data/presetDecks.ts` |      773 |  Excelente: Autoexplicativo e sem margem para erro |
| `brainhexpdf/src/main.tsx` |       10 |  |
| `brainhexpdf/src/security/checkSupabaseSecretGuard.ts` |       21 |  SUPABASE_SERVICE_ROLE_KEY ignora RLS e o endpoint /api/v1/render-and-store |
| `brainhexpdf/src/services/materialsPersistence.ts` |      380 |   /** Chamadas ao modelo que geraram (ou tentaram gerar) esta parte (#775). */ |
| `brainhexpdf/src/services/r2Upload.ts` |       80 |  Upload do deck para o Cloudflare R2, pela URL que o Supabase assina (#76). |
| `brainhexpdf/src/services/renderAndStoreValidation.ts` |       40 |  Nao usa union discriminada por "ok" de proposito: este tsconfig nao ativa |
| `brainhexpdf/src/services/storageReadUrl.ts` |       40 |  URL de leitura de um objeto recem-enviado ao Supabase Storage. |
| `brainhexpdf/src/types.ts` |      571 |   // AI-Generated Unique Thematic Visual Elements |
| `brainhexpdf/src/utils/audioSynth.ts` |      402 |  * Real-time Web Audio Synthesizer for TrailUp Medieval BrainHex Themes |
| `brainhexpdf/src/utils/brainHexBorderStyles.ts` |      113 |  * Returns the CSS class name for the active BrainHex profile's decorative border |
| `brainhexpdf/src/utils/capitalizeProfile.ts` |        8 |  O microservice do trailup manda targetProfile em minusculo |
| `brainhexpdf/src/utils/deckExportUtils.ts` |     1967 |  Deck HTML do aluno (o arquivo que o /api/v1/render-and-store sobe para o |
| `brainhexpdf/src/utils/deckProfileIdentity.ts` |      166 |  Identidade visual de cada perfil BrainHex no deck HTML: emblema, guia, |
| `brainhexpdf/src/utils/deckStyles.ts` |      545 |  Folha de estilo do deck HTML do aluno. Sem Tailwind em tempo de execucao: |
| `brainhexpdf/src/utils/deckTheme.ts` |      235 |  Tokens de cor do deck HTML, por perfil BrainHex e por modo (claro/escuro). |
| `brainhexpdf/src/utils/fallbackDeckGenerator.ts` |      599 |  * Intelligent content extractor to pull real paragraphs, keywords, concepts and code |
| `brainhexpdf/src/utils/finalReflectionSlide.ts` |       33 |  * Runs after pagination, before generateInteractiveHtml. The final slide's |
| `brainhexpdf/src/utils/geminiInlineImageMimes.ts` |       27 |  Mimes de IMAGEM que a API do Gemini aceita como inlineData multimodal. |
| `brainhexpdf/src/utils/imageGenerationErrors.ts` |       23 |  Sinaliza uma falha de geracao de imagem que NAO vai se resolver tentando |
| `brainhexpdf/src/utils/interactiveElementGenerator.ts` |      464 |  * Extracts key sentences, terms and actionable items from slide text |
| `brainhexpdf/src/utils/knowledgeGraphBuilder.ts` |      281 |  * Extracts and synthesizes a high-fidelity Knowledge Graph from a DeckData structure, |
| `brainhexpdf/src/utils/profileCoverCopy.ts` |       50 |  Vocabulario tematico por perfil BrainHex pro badge da capa e do slide |
| `brainhexpdf/src/utils/quizSanitize.ts` |      140 |  Rede de seguranca pos-geracao: mesmo com maxLength no schema Gemini e |
| `brainhexpdf/src/utils/reflectionCheckpoints.ts` |       65 |  * Inserts a 'reflection_checkpoint' slide after every `intervalSlides` |
| `brainhexpdf/src/utils/slideBatchPlanner.ts` |      300 |  Como dividir a geracao do deck em chamadas que CABEM na resposta do modelo. |
| `brainhexpdf/src/utils/slideIllustrations.ts` |      468 |  generateInteractiveHtml (deckExportUtils.ts) nunca inclui referenceImageHtml |
| `brainhexpdf/src/utils/slidePagination.ts` |      308 |  Orcamento GROSSEIRO por slide. Quem garante que o slide cabe na tela e' o |
| `brainhexpdf/src/utils/slideTextBudget.ts` |       95 |  Orcamento de texto dos campos livres do slide. |
| `brainhexpdf/src/utils/slidesSalvage.ts` |      144 |  Recupera os slides COMPLETOS de uma resposta que veio cortada. |
| `brainhexpdf/src/utils/usoDoModelo.ts` |      115 |  Tokens gastos por uma geração, para o custo por artefato do painel técnico (#21). |
| `brainhexpdf/src/utils/visualReferenceAnalyzer.ts` |      490 |  * Intelligent Visual Reference Analyzer & Customizer |
| `microservice/src/App.tsx` |     1009 |     // Salvar estado original |
| `microservice/src/constants/brainHex.ts` |      107 |   /** Segundo guardião — só o Socializador tem hoje. Presença deste campo é o gatilho |
| `microservice/src/constants/generationStorage.ts` |       26 |  * Caminho de Storage versionado pela generation_key. |
| `microservice/src/constants/guardianVoices.ts` |       56 |  * Direção canônica das vozes dos Guardiões. |
| `microservice/src/constants/pipelineVersions.ts` |       50 |  * Contrato público entre a ApiTraiUp e este microserviço. |
| `microservice/src/constants/presentationThemes.ts` |      270 |  |
| `microservice/src/lib/boundedConcurrency.ts` |       65 |  * Executa itens com concorrência limitada e devolve os resultados na mesma |
| `microservice/src/lib/concurrencyGate.ts` |       45 |  Semáforo in-process: garante que no máximo `limit` tarefas registradas via |
| `microservice/src/lib/dedupedTimeoutRunner.ts` |       63 |  Deduplica execucoes concorrentes por chave e aplica um timeout duro por |
| `microservice/src/lib/logger.ts` |      132 |  Structured logger zero-dep. Pretty em dev, JSON em prod. |
| `microservice/src/lib/materialsMerge.ts` |      107 |  Lógica pura de merge de conteudo_personalizado.materiais. |
| `microservice/src/lib/pptxImageContext.ts` |       90 |  De qual slide veio cada imagem do .pptx - e, portanto, qual texto e o |
| `microservice/src/lib/pptxSlideOrder.ts` |       72 |  PowerPoint nao renomeia slideN.xml ao reordenar slides na interface — a |
| `microservice/src/lib/rateLimit.ts` |       66 |  Rate limiter sliding-window in-process. Por chave (tipicamente IP). |
| `microservice/src/lib/serialQueue.ts` |       39 |  Fila serial por chave (in-process). Garante que callbacks enfileirados |
| `microservice/src/lib/textSanitize.ts` |       23 |  Sanitiza texto para o subconjunto Latin-1 (U+0000-U+00FF) suportado pelas |
| `microservice/src/lib/usoDoModelo.ts` |      101 |  Tokens gastos por uma geração, para o custo por artefato do painel técnico (#21). |
| `microservice/src/lib/utils.ts` |        6 |  |
| `microservice/src/lib/validators.ts` |      510 |  Validação de payloads de entrada da API. |
| `microservice/src/lib/wav.ts` |       53 |  Adiciona header RIFF/WAVE de 44 bytes em frente a um buffer PCM cru. |
| `microservice/src/main.tsx` |       10 |  |
| `microservice/src/services/brainHexPdfClient.ts` |      218 |  Cliente HTTP do motor de apresentacao (BrainHexPDF, servico externo). Gera |
| `microservice/src/services/contentGenerationService.ts` |      723 |  gpt-5.4-mini tem tier de 10 RPM / 50 RPD — inviável como contingência real. |
| `microservice/src/services/geminiService.ts` |     2704 |  * Fórmula em texto corrido, nunca LaTeX (#652). O mobile converte LaTeX na |
| `microservice/src/services/mediaResume.ts` |      328 |  Retomada da geracao de midias (#652): nova tentativa NAO regera tudo. |
| `microservice/src/services/r2Upload.ts` |      116 |  Escrita e leitura de material no Cloudflare R2 SEM credencial do R2 aqui (#76). |
| `microservice/src/services/supabaseService.ts` |      589 |  * Escape hatch só para testes: injeta um client fake, ignorando process.env. |
| `microservice/src/services/ttsRecovery.ts` |      327 |  Recuperação do TTS do Guardião (#652). |
| `microservice/src/types/index.ts` |      129 |  * Representação atômica de qualquer dado de entrada (texto, slide, transcrição). |
| `microservice/src/utils/asciiDiagram.ts` |       81 |  Ponto de entrada dos diagramas: varre os blocos de codigo do markdown e troca |
| `microservice/src/utils/audioDuration.ts` |       27 |  Formatos fixos do pipeline de audio (Mp3Encoder(1, 24000, 128) e |
| `microservice/src/utils/audioFailure.ts` |       66 |  Por que o audio de um material nao saiu. |
| `microservice/src/utils/audioImageCues.ts` |       37 |  * Estima a minutagem de inicio de cada secao proporcionalmente ao tamanho |
| `microservice/src/utils/audioJunction.ts` |      459 |  Junção de blocos do áudio (#652): o que vai para o TTS sai daqui, não da |
| `microservice/src/utils/audioSecondRound.ts` |      132 |  Segunda rodada só nas partes de áudio que falharam (#777, opção 1). |
| `microservice/src/utils/diagramTheme.ts` |      134 |  Base compartilhada pelos desenhadores de diagrama (flowDiagram, laneDiagram): |
| `microservice/src/utils/flowDiagram.ts` |      284 |  Converte os "diagramas" em arte ASCII que o Gemini escreve dentro de blocos |
| `microservice/src/utils/imageTextGraph.ts` |      233 |  Grafo de relacionamento entre IMAGEM, TEXTO e TEMA. |
| `microservice/src/utils/laneDiagram.ts` |      275 |  Segundo formato de "diagrama" que o Gemini escreve em arte ASCII: um quadro |
| `microservice/src/utils/markdownImages.ts` |      171 |   /** Nome do arquivo de origem - sinal fraco de assunto, mas util. */ |
| `microservice/src/utils/profileImageRestyle.ts` |      194 |  Camada 2 da adaptacao da imagem ao perfil: reilustrar a imagem do professor |

---

## 3. App do aluno (`mobile/src`)

**Tamanho por área:**
- `app` 42;
- `components` 172;
- `utils` 136;
- `services` 67;
- `hooks` 34;
- `models` 19;
- `context` 14;
- `interfaces` 13;
- `constants` 10;
- `assets` 299.

**Telas (`expo-router`):**
- Entrada: login, recuperação de senha.
- Abas: Trilha (mapa e tópico), Ranking (lista e detalhe), Social, Notificações (caixa e detalhe), Perfil.
- Telas do Perfil (20):
  - aparência, biblioteca de conquistas, coleta de dados, excluir conta, feedback;
  - informações do app e da versão, lembrete diário, loja, métricas de estilo;
  - modo foco, molduras, notificações, relatório dos dados, resetar senha;
  - configurações, estudo.

**Componentes por grupo:**
- **IA:** fala do boss, vitória sobre o boss, painel e cabeçalho da batalha, painel do mentor, sobreposição flutuante, cronômetro.
- **Trilha:** árvore, mapa em mosaico, lista simples, selos de alteração do professor e de "comece por aqui", nó bloqueado, partes do tópico.
- **Social:** arena (ranqueada), desafio, guilda e chat da guilda, chat privado, perfil público, convites.
- **Loja:** vitrine, fundo da turma, usar item na atividade.
- **Mochila:** itens pessoais.
- **Missões:** missões do dia e rastreador.
- **Eventos:** evento da turma e rank do evento.
- **Ranking:** pódio e "minha posição".
- **Consentimento:** data de nascimento, autorização do responsável.
- **Leitores nativos:** PDF, DOCX, PPTX.
- **Funcionais:** áudio, vídeo, barras de progresso, meta de XP.
- **Web em tela larga:** cerca de 30 componentes de desktop.

**Telemetria no aparelho** (`context/metricas/`): acumulador do lote, rotação do lote, ciclo e fim de sessão. A fila local fica em `services/telemetriaOutbox.ts`, com envio direto ao Supabase quando a API falha (`telemetriaFallback.ts`).

**Permissões** (`app.json`):
- Android: câmera, notificações, reinício.
- iOS: câmera.
- Plugins: câmera, notificações, áudio, vídeo, PDF, navegador.

---

## 4. Console do professor (`frontend/src/components/console`)

| Aba | Componentes e regras |
|---|---|
| Visão geral (`dashboard`) | KPIs principais e secundários, evolução, insights (cartões gerados por IA), abandono por etapa e por perfil, inatividade por perfil, risco de reprovação, "precisam de atenção", distribuição de notas, fila e gargalos da personalização |
| Recomendações | recomendações da IA, missões sugeridas |
| Trilhas | gerenciador de tópicos, formulário e gaveta do tópico, upload e prévia de arquivo, gerar trilha com IA, escolha do visual do boss, falas do boss, dificuldade e formato da questão, gerenciador de turma |
| Missões | formulário, critério, aprovação, painel de missões diárias |
| Conquistas | formulário, critério, aparência |
| Notas | fila de correção, painel de correção |
| Eventos | formulário, durante o evento, resultado |
| Economia | regras da economia, fundo da turma |
| Turmas | formulário, matrículas, **importar lista CSV**, duplicar, excluir, **termos do responsável** |
| Personalizações | visão por perfil e conteúdo, arco narrativo, sugestão de material, status de geração, *fallback* direto ao Supabase |
| Rankings · Rank de batalhas · Guildas | — |
| Meus dados | foto, conta em números, exclusão da conta |
| Aprovações · Painel técnico | só para a dona; o painel técnico mostra custo por artefato e avisa a dona |
| (todas) | Lumi (escriba), sino de notificações do professor |

Bibliotecas do console (`frontend/src/lib`): cliente da API, cadastro em uma etapa, data de nascimento, link assinado do gateway, prazo de atividade, presença da turma, nota de questão, política de upload, entre outras.

---

## 5. Banco de dados (produção)

| Item | Quantidade |
|---|---|
| Tabelas | 171 |
| Views | 27 |
| Funções | 612 (105 de gatilho) |
| Gatilhos | 144 |
| Políticas de RLS | 286 |
| Rotinas `pg_cron` | 16 |

Extensões: `pg_cron 1.6.4`, `pg_net 0.20.0`, `vector 0.8.0`, `supabase_vault`, `pgcrypto`, `http`, `pg_stat_statements`, `uuid-ossp`.

**Tabelas por domínio**, com o número de linhas em 04/11:

- **Usuários, turmas e cadastro** (21): `alembic_version` 1, `aluno_cadastro_concluido` 4, `aluno_introducao` 0, `aluno_nascimento` 1, `alunos` 7, `app_config` 61, `classe` 4, `classe_aluno` 6, `classe_aluno_saidas` 0, `classe_arco_narrativo` 0, `classe_mapa_tema` 4, `classe_perfil_summary` 3, `marco_produto` 46, `materia` 5, `materiais_gerados` 92, `modoOperacao` 4, `plataforma_dev` 0, `professor` 6, `professor_aluno` 31, `professor_intervencoes_passo` 0, `professor_notificacoes` 12
- **Trilha, conteúdo e avaliação** (27): `atividade_aluno` 1, `atividade_aprovacao` 0, `atividade_conteudos` 1, `atividade_prazo_aluno` 0, `atividade_tempo_aluno` 0, `atividade_tentativa` 0, `atividade_tentativas` 0, `atividades` 1, `cards` 0, `cards_personalizados` 46, `conteudo_aluno` 28, `conteudo_demanda_formato` 2, `conteudo_personalizado` 17, `conteudos` 15, `iaDescricao` 6, `midias` 0, `questao_aluno` 2, `questao_gabarito` 1, `questao_gabarito_revelado` 0, `topico_aluno` 14, `topico_aluno_conclusao` 5, `topico_edges` 0, `topicos` 8, `trilha_aluno` 3, `trilha_checkpoint_navegacao` 1, `trilha_modelo` 0, `questoes` 1
- **Personalização e IA** (26): `alteracao_aluno` 0, `alteracao_professor` 0, `aluno_estado_atencao` 1, `aluno_mental_state_history` 2, `aluno_topico_dominio` 3, `boss_falas` 4, `checkpoint_blobs` 1684, `checkpoint_migrations` 10, `checkpoint_writes` 2000, `checkpoints` 399, `fontes_personalizacao` 2, `ia_decision_logs` 35, `intervencoes` 1, `missoes_ia_execucoes` 0, `missoes_ia_log` 12, `missoes_ia_pedidos` 3, `personalizacao_blocos_gerados` 24, `personalizacao_item_progresso` 71, `personalizacao_job_targets` 91, `personalizacao_jobs` 99, `personalizacao_percurso` 6, `personalizacao_sugestao` 1, `personalizacao_sugestao_log` 2, `rag_chunks` 0, `rag_openai_files` 0, `rag_relacoes` 0
- **BrainHex** (3): `aluno_perfil` 31, `aluno_perfil_medida` 0, `perfil` 7
- **Telemetria, tempo e métricas** (15): `aluno_atividade_diaria` 315, `aluno_cronometro` 0, `aluno_sessoes_app` 844, `estudo_coorte` 0, `estudo_intervalos` 56, `estudo_sessoes` 414, `metricas_catalogo` 29, `metricas_invariante_amostra` 40, `metricas_invariante_resultado` 120, `telemetria_agregado_turma_dia` 0, `telemetria_analise_fila` 0, `telemetria_eventos_app` 1013, `telemetria_lotes` 184, `telemetria_sessoes` 113, `telemetria_time_metric_entries` 584
- **Gamificação e economia** (50): `bag_itens` 6, `conquistas` 38, `conquistas_aluno` 12, `conquistas_criterio_log` 0, `desafio_participantes` 0, `economia_auditoria` 0, `economia_config_escopo` 0, `economia_meta` 0, `evento_inscricoes` 0, `eventos_aluno` 685, `eventos_classe` 0, `eventos_classe_missoes` 0, `eventos_classe_resultado` 0, `eventos_classe_resultado_guilda` 0, `eventos_pontuacao` 24, `eventos_pontuacao_classe` 0, `fundos_turma` 0, `fundos_turma_contribuicao` 0, `guilda_config_turma` 0, `guilda_convites` 0, `guilda_desafio_questoes` 0, `guilda_desafio_respostas` 0, `guilda_desafios` 0, `guilda_evento_snapshot` 0, `guilda_membros` 0, `guilda_mensagens` 0, `guildas` 0, `loja_compras` 1, `loja_config_classe` 0, `loja_dica_liberada` 0, `loja_dotacao` 0, `loja_formato_escolhido` 0, `loja_itens` 5, `loja_limite_uso` 0, `loja_preco_classe` 0, `loja_uso_log` 0, `missao_aluno` 20, `missoes` 201, `moedas_ledger` 11, `moldura_acao_aluno` 0, `moldura_aluno` 0, `molduras` 40, `molduras_acoes` 10, `rank_podio_congelado` 0, `rank_posicao_anterior` 1, `rank_tipo` 6, `ranks` 1, `ranqueada_elo` 0, `ranqueada_elo_partida` 0, `xp_faixa` 10
- **Social** (3): `chat_leitura` 2, `social_mensagens` 2, `social_relacionamentos` 3
- **Notificações** (13): `aluno_modo_foco` 0, `expo_tokens` 3, `notificacoes` 431, `notificacoes_agendamentos` 15, `notificacoes_config` 36, `notificacoes_ia` 7, `notificacoes_material_pronto` 1, `notificacoes_modelos_texto` 14, `notificacoes_pendentes` 384, `notificacoes_push_envios` 38, `notificacoes_silenciadas` 0, `notificacoes_silenciamento_log` 0, `notificacoes_textos_perfil` 28
- **Privacidade, consentimento e retenção** (13): `consentimento_pesquisa` 1, `consentimento_responsavel` 0, `consentimento_telemetria` 24, `contato_envios` 1, `contato_publico_envios` 0, `exclusao_conta_professor` 0, `pesquisa_anonimizacao` 0, `pesquisa_arquivo` 1310, `retencao_avisos_inatividade` 0, `retencao_execucoes` 8, `retencao_fila_externa` 0, `retencao_politica` 113, `solicitacoes_exclusao` 1

**Views (27):** `vw_aluno_classe_detalhado`, `vw_aluno_classe_resumo`, `vw_aluno_perfil_segmentos`, `vw_aluno_usuario`, `vw_alunos_pesquisa_elegiveis`, `vw_creditos_concedidos`, `vw_estudo_participantes`, `vw_ia_decision_logs_resumo`, `vw_material_storage_paths`, `vw_metricas_chat_aluno_classe`, `vw_metricas_comportamento_aluno_classe`, `vw_metricas_desempenho_aluno_classe`, `vw_metricas_disponibilidade`, `vw_metricas_distribuicao_turma_classe`, `vw_metricas_engajamento_aluno_classe`, `vw_metricas_evolucao_desempenho_aluno_dia`, `vw_metricas_sessoes_aluno_dia`, `vw_metricas_turma_geral_classe`, `vw_metricas_turma_perfil_classe`, `vw_portoes_do_aluno`, `vw_rank_posicoes_por_classe`, `vw_rank_posicoes_por_classe_todas`, `vw_ranks_info_por_classe`, `vw_sequencia_navegacao_aluno`, `vw_telemetria_tempo_atividade_aluno`, `vw_telemetria_tempo_conteudo_aluno`, `vw_telemetria_tempo_topico_aluno`.

**Funções que os clientes chamam (RPC), por domínio** (sem as do pgvector):

- **Autorização (helpers):**
  - `app_alunos_do_professor`, `app_classes_do_aluno`, `app_classes_do_professor`, `app_classes_retidas_do_aluno`, `app_colegas_de_turma`, `app_minhas_classes`, `app_pode_ver_aluno`;
  - `app_classe_da_atividade` / `_da_questao` / `_do_conteudo` / `_do_topico`;
  - `app_e_dono`, `app_e_dev`, `trailup_e_professor`, `trailup_pode_ler_arquivo`, `trailup_pode_ler_conteudo_professor`.
- **Cadastro e consentimento:**
  - `fn_cadastrar_aluno_com_perfis`, `concluir_cadastro_aluno`, `registrar_conclusao_cadastro`, `meu_cadastro_concluido`, `cadastro_perfis_integros`, `fn_atualizar_aluno_perfil`;
  - `aluno_registrar_data_nascimento`, `aluno_meu_consentimento`, `aluno_minha_finalidade_permitida`, `aluno_registrar_consentimento_pesquisa`;
  - `consentimento_pesquisa_versao_vigente`, `consentimento_responsavel_versao_vigente`, `responsavel_registrar_no_aparelho`;
  - `professor_registrar_termo_papel`, `professor_termos_da_turma`.
- **Trilha, atividades e questões:**
  - `atividade_iniciar_tentativa`, `atividade_responder_tentativa`, `atividade_situacao_tentativas`, `avaliar_entrega`, `questao_responder`, `questao_gabarito_do_aluno`;
  - `fn_questao_*` (14 funções de correção);
  - `aluno_definir_cronometro`;
  - `duplicar_classe`, `duplicar_topico`, `duplicar_atividade`, `excluir_classe`, `inscrever_aluno_em_classe`.
- **Progresso e tempo:**
  - `trailup_recalcular_topico_aluno`, `trailup_recalcular_classe_aluno`, `trailup_recalcular_nota_classe_aluno`, `trailup_progresso_percurso`;
  - `trailup_registrar_sessao_estudo`, `trailup_registrar_intervalo_estudo`, `trailup_registrar_tempo_estudo`;
  - `trailup_tempo_telemetria_min` (v1, v2), `trailup_tempo_presenca_min`, `trailup_tempo_sessao_min`, `trailup_resumo_presenca`;
  - `registrar_presenca_da_turma`, `registrar_credito_da_turma`.
- **Métricas e pesquisa:**
  - `metricas_engajamento_turma`, `metricas_engajamento_coortes_turma`, `metricas_estudo_coortes`, `metricas_perfil_formato`;
  - `estudo_coorte_registrar`, `estudo_coorte_remover`, `marco_produto_registrar`;
  - `professor_risco_reprovacao_turma`, `trailup_risco_evasao`, `trailup_faixa_risco`;
  - `professor_notas_da_turma`, `notas_fila`, `personalizacao_kpis_operacionais`, `painel_tecnico`.
- **Gamificação:**
  - XP: `aluno_faixa_xp`, `fn_faixa_xp`.
  - Conquistas: `conquistas_da_turma`, `conquista_da_turma_salvar`/`_alternar`.
  - Molduras: `moldura_comprar`, `moldura_equipar`, `moldura_registrar_acao`, `molduras_catalogo`.
  - Loja: `loja_*` (10), `bag_*` (5).
  - Economia: `economia_*` (11).
  - Fundo da turma: `fundo_turma_*` (3).
  - Missões: `missoes_diarias_resumo`, `missao_ia_pedir`, `missao_ia_limites`.
  - Eventos: `evento_classe_*` (6).
  - Arena: `arena_*` (6), `desafio_responder`.
  - Guildas: `guilda_*` (20).
  - Ranking: `fn_rank_*`, `app_rank_*`, `app_elo_inicial`, `app_ranqueada_piso_pontos`.
- **Social:** `social_*` (14), `chat_marcar_lido`, `chat_nao_lidas`.
- **Notificações:** `notificacoes_*` (19). Entre elas: login, heartbeat, rotinas, modo foco, silenciar tipo e guia.
- **Alterações do professor:** `alteracao_decidir`, `alteracao_marcar_vista`.
- **Contato:** `fn_enviar_contato`, `fn_enviar_contato_publico`, mais `fn_enviar_contato_sendgrid` (resto de um provedor antigo).

**Rotinas `pg_cron` (16):**

| Rotina | Agenda (UTC) |
|---|---|
| `trailup_auditoria_metricas` | 06:30 |
| `trailup_desafio_varredura` | a cada 5 min |
| `trailup_eventos_classe_varredura` | a cada minuto |
| `trailup_expurgo_medidas_perfil` | 03:17 |
| `trailup_missao_diaria` | 03:00 |
| `trailup_missao_diaria_texto` | 03:05 |
| `trailup_notas_com_prazo` | de hora em hora |
| `trailup_notificacoes_rank` | a cada 10 min |
| `trailup_notificacoes_recalcular_rotinas` | 09:00 |
| `trailup_painel_tecnico_avisar_dono` | a cada 30 min |
| `trailup_pesquisa_arquivo` | a cada 10 min |
| `trailup_retencao` | 03:23 |
| `trailup_retencao_avisos` | a cada 30 min |
| `trailup_retencao_ia_decision_logs` | 03:41 |
| `trailup-notificacoes-conciliar-push` | a cada 5 min |
| `trailup-notificacoes-varrer` | a cada 5 min |

**Edge Functions (6):**

| Função | Papel |
|---|---|
| `generate-content-ai` | gera a trilha e o conteúdo pelo console, com `gemini-3.6-flash` |
| `validate-essay-answer-ai` | corrige a redação; só maiores de 18 |
| `storage-redirect` | gateway de leitura com link assinado |
| `storage-upload-url` | URL de envio para o R2 |
| `pesquisa-arquivar` | copia o dado de pesquisa para o R2 |
| `personalize_path` | chamada pelo app, mas **o código dela não está no repositório** (schema não versionado) |

---

## 6. Documentação, processo e infraestrutura

**Documentos:** 287 arquivos em `docs/`.
- Especificações de design (`superpowers/`): 84.
- Mobile: 47.
- Segundo cérebro: 25.
- API: 24.
- TCC: 22.
- Sprint: 17.
- Análises: 16.
- Frontend: 15.
- Microservice: 10.
- RAG: 8.
- Ecossistema: 7.
- Arquitetura: 5.
- LGPD: 3.
- ADR: 2.

As 46 especificações de design (`docs/superpowers/specs/`) registram cada funcionalidade antes de ela ser feita, de 26/07 a 04/11/2026. Para a metodologia, elas mostram um desenvolvimento orientado por especificação, com decisão e justificativa escritas. As que interessam à monografia:
- paleta BrainHex e psicologia das cores;
- base por perfil sem dado de aluno;
- memória do aluno;
- guardrails de saída estruturada;
- sugestão de material por aluno;
- notificações pelo banco;
- gateway R2;
- perfil BrainHex probabilístico (revisto);
- métricas de ponta a ponta;
- coorte e baseline;
- sugestão com evidência;
- perfil × formato (PR3).

**ADRs:** 0001, pgvector (substituída), e 0002, OpenAI Vector Store (aceita).

**Scripts:**
- e-mail pelo Apps Script;
- cópia do Storage para o R2;
- testes ponta a ponta do cadastro e da economia;
- memória de cálculo de custos;
- recoloração dos guardiões;
- auditoria de funções `SECURITY DEFINER`;
- verificação de implantação;
- checagem de encoding.

**Infraestrutura no repositório:** ciclo de vida do R2 (`infra/r2/`), `docker-compose.yml` (API, microservice e frontend) e um Dockerfile por serviço.

**Issues por rótulo (todas):**

| Grupo | Contagens |
|---|---|
| Tipo | enhancement 68, bug 26, épico 4, documentation 4 |
| Área | api 61, mobile 37, frontend 19, gamificação 17, banco 13, métricas 13, tcc 13, segurança 10, web 10, rag 7, infra 7, auth 6, lgpd 2 |
| Prioridade | P0 2, P1 23, P2 37, P3 14 |
