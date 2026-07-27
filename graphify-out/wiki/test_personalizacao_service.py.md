# test_personalizacao_service.py

> 63 nodes

## Key Concepts

- **test_personalizacao_service.py** (73 connections) — `api/tests/test_personalizacao_service.py`
- **_normalize_materiais()** (19 connections) — `api/app/services/personalizacao.py`
- **_enqueue_media_render_job_if_needed()** (17 connections) — `api/app/services/personalizacao.py`
- **persist_personalizacao_record()** (17 connections) — `api/app/services/personalizacao.py`
- **backfill_media_render_jobs()** (15 connections) — `api/app/services/personalizacao.py`
- **_build_profile_editorial_context()** (14 connections) — `api/app/services/personalizacao.py`
- **build_personalizacao_steps()** (13 connections) — `api/app/services/personalizacao.py`
- **_fallback_materiais()** (12 connections) — `api/app/services/personalizacao.py`
- **_normalize_profile_label()** (9 connections) — `api/app/services/personalizacao.py`
- **gerar_cards_direto()** (9 connections) — `api/app/services/personalizacao.py`
- **_build_editorial_model()** (8 connections) — `api/app/services/personalizacao.py`
- **_pending_media_formats()** (8 connections) — `api/app/services/personalizacao.py`
- **_apply_media_job_metadata()** (8 connections) — `api/app/services/personalizacao.py`
- **AsyncSession** (7 connections)
- **reconcile_material_links_for_record()** (7 connections) — `api/app/services/personalizacao.py`
- **_build_tema_visual_for_profile()** (6 connections) — `api/app/services/personalizacao.py`
- **_summarize_sources_debug()** (6 connections) — `api/app/services/personalizacao.py`
- **_BackfillSession** (6 connections) — `api/tests/test_personalizacao_service.py`
- **_merge_source_materials()** (5 connections) — `api/app/services/personalizacao.py`
- **_recomendar_formatos()** (5 connections) — `api/app/services/personalizacao.py`
- **_PersistSessionContext** (5 connections) — `api/tests/test_personalizacao_service.py`
- **_BackfillResult** (5 connections) — `api/tests/test_personalizacao_service.py`
- **_formatos_gerados()** (4 connections) — `api/app/services/personalizacao.py`
- **_PersistSessionFactory** (4 connections) — `api/tests/test_personalizacao_service.py`
- **test_persist_personalizacao_record_enqueues_media_job_and_injects_job_id()** (4 connections) — `api/tests/test_personalizacao_service.py`
- *... and 38 more nodes in this community*

## Relationships

- [services/personalizacao.py](services-personalizacao.py.md) (82 shared connections)
- [Settings](Settings.md) (33 shared connections)
- [services/personalizacao_jobs.py](services-personalizacao_jobs.py.md) (7 shared connections)
- [_normalize_personalized_activities](_normalize_personalized_activities.md) (5 shared connections)
- [MateriaisRepository](MateriaisRepository.md) (5 shared connections)
- [AccessRepository](AccessRepository.md) (4 shared connections)
- [v1/personalizacao.py](v1-personalizacao.py.md) (3 shared connections)
- [settings.py](settings.py.md) (3 shared connections)
- [ConteudoPersonalizadoRepository](ConteudoPersonalizadoRepository.md) (3 shared connections)
- [PersonalizacaoJobsRepository](PersonalizacaoJobsRepository.md) (2 shared connections)
- [api.py](api.py.md) (2 shared connections)
- [models.py](models.py.md) (1 shared connections)

## Source Files

- `api/app/services/personalizacao.py`
- `api/tests/test_personalizacao_service.py`

## Audit Trail

- EXTRACTED: 362 (99%)
- INFERRED: 5 (1%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*