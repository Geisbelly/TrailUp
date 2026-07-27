# MateriaisRepository

> God node · 43 connections · `api/app/repositories/materiais.py`

**Community:** [MateriaisRepository](MateriaisRepository.md)

## Connections by Relation

### calls
- generate_materiais_personalizados() `EXTRACTED`
- _process_media_render_target() `EXTRACTED`
- _enqueue_media_render_job_if_needed() `EXTRACTED`
- persist_personalizacao_record() `EXTRACTED`
- executor() `EXTRACTED`
- backfill_media_render_jobs() `EXTRACTED`
- obter_personalizacao_media_status() `EXTRACTED`
- agente_geracao_midia() `EXTRACTED`
- listar_materiais() `EXTRACTED`
- reconcile_material_links_for_record() `EXTRACTED`
- test_materiais_repository_saves_and_reads_materials() `EXTRACTED`
- test_materiais_repository_builds_public_url_from_storage_path() `EXTRACTED`

### contains
- repositories/materiais.py `EXTRACTED`

### imports
- [services/personalizacao.py](services-personalizacao.py.md) `EXTRACTED`
- [v1/personalizacao.py](v1-personalizacao.py.md) `EXTRACTED`
- [test_api.py](test_api.py.md) `EXTRACTED`
- [test_repositories.py](test_repositories.py.md) `EXTRACTED`
- [services/personalizacao_jobs.py](services-personalizacao_jobs.py.md) `EXTRACTED`
- executor.py `EXTRACTED`
- v1/materiais.py `EXTRACTED`
- agente_geracao_midia.py `EXTRACTED`

### method
- ._resolve_asset_fields() `EXTRACTED`
- ._supports_metadata() `EXTRACTED`
- ._supports_personalizacao_id() `EXTRACTED`
- .buscar_por_conteudo() `EXTRACTED`
- .listar_por_aluno() `EXTRACTED`
- .listar_por_personalizacao() `EXTRACTED`
- .patch_materiais_media() `EXTRACTED`
- ._supports_storage_path() `EXTRACTED`
- ._normalize_json_field() `EXTRACTED`
- .salvar() `EXTRACTED`
- ._column_exists() `EXTRACTED`
- .__init__() `EXTRACTED`
- ._pick_string() `EXTRACTED`
- .resolver_ids_por_tipo_recente() `EXTRACTED`
- .vincular_personalizacao() `EXTRACTED`

### references
- _apply_media_job_metadata() `EXTRACTED`

### uses
- RecordingSession `INFERRED`
- MappingResult `INFERRED`
- ScalarResult `INFERRED`
- MappingRows `INFERRED`
- DummyResult `INFERRED`
- FakeRow `INFERRED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*