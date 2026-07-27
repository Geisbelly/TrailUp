# test_api.py

> 51 nodes

## Key Concepts

- **test_api.py** (65 connections) — `api/tests/test_api.py`
- **FakeSession** (25 connections) — `api/tests/conftest.py`
- **AnalisarResponse** (19 connections) — `api/app/schemas/api.py`
- **override_session()** (18 connections) — `api/tests/conftest.py`
- **conftest.py** (15 connections) — `api/tests/conftest.py`
- **FakeGraph** (8 connections) — `api/tests/conftest.py`
- **_telemetria_payload()** (8 connections) — `api/tests/test_api.py`
- **fixture** (5 connections)
- **test_stream_route_emits_sse_events()** (5 connections) — `api/tests/test_api.py`
- **test_telemetria_route_accepts_null_signal_meta()** (5 connections) — `api/tests/test_api.py`
- **test_telemetria_route_persists_sanitized_batch_and_runs_analysis()** (5 connections) — `api/tests/test_api.py`
- **test_telemetria_route_dedupes_existing_batch()** (5 connections) — `api/tests/test_api.py`
- **test_telemetria_route_ignores_legacy_event_log_failures()** (5 connections) — `api/tests/test_api.py`
- **settings()** (4 connections) — `api/tests/conftest.py`
- **app()** (4 connections) — `api/tests/conftest.py`
- **test_analisar_route_returns_graph_result()** (4 connections) — `api/tests/test_api.py`
- **test_upload_fontes_route_accepts_professor_file_and_link()** (4 connections) — `api/tests/test_api.py`
- **test_personalizacao_por_perfil_route_groups_seven_brainhex_profiles()** (4 connections) — `api/tests/test_api.py`
- **test_normalize_eventos_legados_prefixes_entity_references()** (4 connections) — `api/tests/test_api.py`
- **test_telemetria_route_returns_partial_success_when_analysis_fails()** (4 connections) — `api/tests/test_api.py`
- **aluno_user()** (3 connections) — `api/tests/conftest.py`
- **professor_user()** (3 connections) — `api/tests/conftest.py`
- **test_admin_page_and_posts_manage_professors()** (3 connections) — `api/tests/test_api.py`
- **test_admin_page_returns_503_when_schema_is_missing()** (3 connections) — `api/tests/test_api.py`
- **test_admin_post_returns_503_when_schema_is_missing()** (3 connections) — `api/tests/test_api.py`
- *... and 26 more nodes in this community*

## Relationships

- [UserContext](UserContext.md) (14 shared connections)
- [EventoRepository](EventoRepository.md) (8 shared connections)
- [api.py](api.py.md) (8 shared connections)
- [v1/telemetria.py](v1-telemetria.py.md) (5 shared connections)
- [Settings](Settings.md) (4 shared connections)
- [settings.py](settings.py.md) (3 shared connections)
- [main.py](main.py.md) (3 shared connections)
- [TelemetriaRepository](TelemetriaRepository.md) (3 shared connections)
- [AccessRepository](AccessRepository.md) (2 shared connections)
- [ConteudoClasseRepository](ConteudoClasseRepository.md) (2 shared connections)
- [FontesPersonalizacaoRepository](FontesPersonalizacaoRepository.md) (2 shared connections)
- [SupabaseStorage](SupabaseStorage.md) (2 shared connections)

## Source Files

- `api/app/api/v1/__init__.py`
- `api/app/schemas/api.py`
- `api/tests/conftest.py`
- `api/tests/test_api.py`

## Audit Trail

- EXTRACTED: 229 (84%)
- INFERRED: 44 (16%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*