# Settings

> God node · 207 connections · `api/app/core/settings.py`

**Community:** [Settings](Settings.md)

## Connections by Relation

### calls
- _context() `EXTRACTED`
- test_linear_analysis_orchestrator_runs_all_stages_and_enriches_state() `EXTRACTED`
- test_behavioral_personalization_fallback_builds_item_first_battle_and_legacy_mirror() `EXTRACTED`
- test_behavioral_personalization_keeps_reading_timer_and_battle_timing_separate() `EXTRACTED`
- test_behavioral_personalization_softens_timers_and_disables_content_battle_for_anxious() `EXTRACTED`
- test_agente_geracao_midia_generates_materials_when_enabled() `EXTRACTED`
- test_agente_midias_personalizadas_propagates_media_state() `EXTRACTED`
- settings() `EXTRACTED`
- test_authenticate_keeps_student_access_for_dual_role_with_unreleased_professor() `EXTRACTED`
- test_authenticate_rejects_professor_without_release() `EXTRACTED`
- test_authenticate_rejects_user_without_platform_role() `EXTRACTED`
- test_authenticate_resolves_aluno_role() `EXTRACTED`
- test_authenticate_resolves_dual_role_user_without_losing_student_access() `EXTRACTED`
- test_require_admin_accepts_valid_basic_credentials() `EXTRACTED`
- test_require_admin_rejects_invalid_basic_credentials() `EXTRACTED`
- test_behavioral_personalization_uses_neutral_when_there_is_no_evidence() `EXTRACTED`
- test_agente_boss_visual_keeps_contract_and_sets_avatar_when_generated() `EXTRACTED`
- test_agente_perfil_falls_back_without_openai() `EXTRACTED`
- test_multi_output_context_uses_brainhex_profile_prefix() `EXTRACTED`
- test_multi_output_split_new_formats() `EXTRACTED`

### contains
- [settings.py](settings.py.md) `EXTRACTED`

### imports
- [services/personalizacao.py](services-personalizacao.py.md) `EXTRACTED`
- [test_personalizacao_service.py](test_personalizacao_service.py.md) `EXTRACTED`
- linear_analysis_pipeline.py `EXTRACTED`
- [behavioral_personalization.py](behavioral_personalization.py.md) `EXTRACTED`
- [test_graph_nodes.py](test_graph_nodes.py.md) `EXTRACTED`
- test_auth.py `EXTRACTED`
- deps.py `EXTRACTED`
- [media_pipeline.py](media_pipeline.py.md) `EXTRACTED`
- [main.py](main.py.md) `EXTRACTED`
- [media_agents.py](media_agents.py.md) `EXTRACTED`
- storage.py `EXTRACTED`
- test_media_pipeline.py `EXTRACTED`
- [services/classe_mapa_tema.py](services-classe_mapa_tema.py.md) `EXTRACTED`
- llm.py `EXTRACTED`
- boss_image.py `EXTRACTED`
- test_linear_analysis_pipeline.py `EXTRACTED`
- conftest.py `EXTRACTED`
- auth.py `EXTRACTED`
- test_brainhex_generation.py `EXTRACTED`
- builder.py `EXTRACTED`

### inherits
- BaseSettings `EXTRACTED`

### method
- ._check_production_safety() `EXTRACTED`
- .active_model_default() `EXTRACTED`
- .active_model_supervisor() `EXTRACTED`

### references
- generate_materiais_personalizados() `EXTRACTED`
- _hydrate_source_materials_content() `EXTRACTED`
- _invoke_multistage_materiais_por_formato() `EXTRACTED`
- _enqueue_media_render_job_if_needed() `EXTRACTED`
- persist_personalizacao_record() `EXTRACTED`
- _invoke_multimodal_materiais() `EXTRACTED`
- build_personalizacao_state() `EXTRACTED`
- create_app() `EXTRACTED`
- build_behavioral_personalization() `EXTRACTED`
- fetch_personalizacao_context() `EXTRACTED`
- _build_fonte_enrichment_payload() `EXTRACTED`
- get_settings() `EXTRACTED`
- build_graph() `EXTRACTED`
- agente_geracao_midia() `EXTRACTED`
- get_current_user() `EXTRACTED`
- require_admin() `EXTRACTED`
- gerar_classe_mapa_tema() `EXTRACTED`
- disparar_brainhex_async() `EXTRACTED`
- agente_perfil() `EXTRACTED`
- gerar_imagem_slide() `EXTRACTED`

### uses
- JsonLLMService `INFERRED`
- [SupabaseStorage](SupabaseStorage.md) `INFERRED`
- [UserContext](UserContext.md) `INFERRED`
- AuthService `INFERRED`
- FakeSession `INFERRED`
- [MediaPipelineContext](MediaPipelineContext.md) `INFERRED`
- MultiOutputPipeline `INFERRED`
- MediaPipeline `INFERRED`
- AdminContext `INFERRED`
- MarkdownPipeline `INFERRED`
- SlidesPipeline `INFERRED`
- GeminiBossImageAdapter `INFERRED`
- PerformanceStageResult `INFERRED`
- _DummyPipeline `INFERRED`
- EmotionStageResult `INFERRED`
- AudioPipeline `INFERRED`
- FakeGraph `INFERRED`
- _BrokenPipeline `INFERRED`
- AttentionStageResult `INFERRED`
- InteractionStageResult `INFERRED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*