# Settings

> 37 nodes

## Key Concepts

- **Settings** (207 connections) — `api/app/core/settings.py`
- **_invoke_multistage_materiais_por_formato()** (22 connections) — `api/app/services/personalizacao.py`
- **asyncio** (21 connections)
- **_persist_hydrated_sources_into_fontes()** (9 connections) — `api/app/services/personalizacao.py`
- **agente_ai_patch.py** (6 connections) — `api/app/agent/graph/nodes/agente_ai_patch.py`
- **agente_plano_personalizacao.py** (6 connections) — `api/app/agent/graph/nodes/agente_plano_personalizacao.py`
- **persist_personalizacao()** (6 connections) — `api/app/agent/graph/nodes/persist_personalizacao.py`
- **generate_ai_patch_personalizacao()** (6 connections) — `api/app/services/personalizacao.py`
- **_invoke_media_stage_llm()** (5 connections) — `api/app/services/personalizacao.py`
- **agente_ai_patch()** (4 connections) — `api/app/agent/graph/nodes/agente_ai_patch.py`
- **agente_plano_personalizacao()** (4 connections) — `api/app/agent/graph/nodes/agente_plano_personalizacao.py`
- **test_hydrate_source_materials_recovers_storage_path_from_descricao()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_hydrate_source_materials_does_not_use_url_as_fallback_text()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_hydrate_source_materials_uses_storage_preview_text_when_ingestion_fails()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_hydrate_source_materials_keeps_preview_text_with_url_when_context_exists()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_hydrate_source_materials_uses_doc_plain_text_when_chunks_are_empty()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_hydrate_source_materials_collects_relevant_image_media()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_persist_hydrated_sources_updates_fontes_with_extracted_text_and_file_fields()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_persist_hydrated_sources_persists_midias_relevantes_in_metadata_patch()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_generate_materiais_fast_only_marks_media_as_pending()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_generate_materiais_fast_only_media_quality_reject_keeps_pending()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_generate_materiais_slow_only_merges_existing_materials()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_multistage_pipeline_includes_study_stage_before_format_steps()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_multistage_pipeline_reuses_single_study_for_multiple_formats()** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_multistage_pipeline_retries_review_until_ok()** (4 connections) — `api/tests/test_personalizacao_service.py`
- *... and 12 more nodes in this community*

## Relationships

- [services/personalizacao.py](services-personalizacao.py.md) (49 shared connections)
- [test_personalizacao_service.py](test_personalizacao_service.py.md) (33 shared connections)
- [settings.py](settings.py.md) (31 shared connections)
- [UserContext](UserContext.md) (30 shared connections)
- [Evento](Evento.md) (30 shared connections)
- [behavioral_personalization.py](behavioral_personalization.py.md) (16 shared connections)
- [MediaPipelineContext](MediaPipelineContext.md) (14 shared connections)
- [test_graph_nodes.py](test_graph_nodes.py.md) (12 shared connections)
- [main.py](main.py.md) (10 shared connections)
- [media_agents.py](media_agents.py.md) (9 shared connections)
- [SupabaseStorage](SupabaseStorage.md) (6 shared connections)
- [test_api.py](test_api.py.md) (4 shared connections)

## Source Files

- `api/app/agent/graph/nodes/agente_ai_patch.py`
- `api/app/agent/graph/nodes/agente_plano_personalizacao.py`
- `api/app/agent/graph/nodes/persist_personalizacao.py`
- `api/app/core/settings.py`
- `api/app/services/llm.py`
- `api/app/services/personalizacao.py`
- `api/tests/test_personalizacao_service.py`

## Audit Trail

- EXTRACTED: 321 (85%)
- INFERRED: 55 (15%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*