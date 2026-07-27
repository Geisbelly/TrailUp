# ConteudoPersonalizadoRepository

> God node · 43 connections · `api/app/repositories/conteudo_personalizado.py`

**Community:** [ConteudoPersonalizadoRepository](ConteudoPersonalizadoRepository.md)

## Connections by Relation

### calls
- _process_media_render_target() `EXTRACTED`
- personalizar() `EXTRACTED`
- conversar_com_mentor_personalizacao() `EXTRACTED`
- persist_personalizacao_record() `EXTRACTED`
- backfill_media_render_jobs() `EXTRACTED`
- obter_personalizacao_media_status() `EXTRACTED`
- upsert_progresso_personalizado() `EXTRACTED`
- listar_personalizacoes_por_perfil() `EXTRACTED`
- obter_contexto_personalizacao_docente() `EXTRACTED`
- listar_personalizacoes() `EXTRACTED`
- test_conteudo_personalizado_repository_persists_ai_patch() `EXTRACTED`
- test_conteudo_personalizado_repository_hydrates_materials_public_urls() `EXTRACTED`

### contains
- conteudo_personalizado.py `EXTRACTED`

### imports
- [services/personalizacao.py](services-personalizacao.py.md) `EXTRACTED`
- [v1/personalizacao.py](v1-personalizacao.py.md) `EXTRACTED`
- [test_api.py](test_api.py.md) `EXTRACTED`
- [test_repositories.py](test_repositories.py.md) `EXTRACTED`
- [services/personalizacao_jobs.py](services-personalizacao_jobs.py.md) `EXTRACTED`

### method
- ._hydrate_record() `EXTRACTED`
- ._table_has_column() `EXTRACTED`
- .buscar_por_perfil() `EXTRACTED`
- .buscar_por_id() `EXTRACTED`
- ._hydrate_materiais_urls() `EXTRACTED`
- .atualizar_materiais_e_status() `EXTRACTED`
- .buscar_mais_recente_por_perfil() `EXTRACTED`
- .buscar_por_aluno() `EXTRACTED`
- .buscar_por_ciclo_id() `EXTRACTED`
- ._extract_profile_key_from_record() `EXTRACTED`
- ._normalize_profile_key() `EXTRACTED`
- .__init__() `EXTRACTED`
- ._normalize_json_field() `EXTRACTED`
- ._pick_string() `EXTRACTED`
- .salvar() `EXTRACTED`
- ._ensure_column_cache() `EXTRACTED`
- .existe_por_perfil_source_hash() `EXTRACTED`
- .remover_por_aluno_classe() `EXTRACTED`

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