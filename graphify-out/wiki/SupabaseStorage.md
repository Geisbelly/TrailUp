# SupabaseStorage

> 28 nodes

## Key Concepts

- **SupabaseStorage** (34 connections) — `api/app/services/storage.py`
- **storage.py** (20 connections) — `api/app/services/storage.py`
- **build_public_storage_url()** (20 connections) — `api/app/services/storage.py`
- **.load_source_preview()** (8 connections) — `api/app/services/storage.py`
- **test_storage_service.py** (8 connections) — `api/tests/test_storage_service.py`
- **_truncate_extracted()** (5 connections) — `api/app/services/storage.py`
- **._headers()** (5 connections) — `api/app/services/storage.py`
- **.download_bytes()** (5 connections) — `api/app/services/storage.py`
- **_extract_text_from_pptx()** (4 connections) — `api/app/services/storage.py`
- **.upload()** (4 connections) — `api/app/services/storage.py`
- **.upload_materiais()** (4 connections) — `api/app/services/storage.py`
- **test_download_bytes_faz_fallback_para_url_publica_sem_service_key()** (4 connections) — `api/tests/test_storage_service.py`
- **test_load_source_preview_preserva_acentos_quando_texto_nao_esta_em_utf8()** (4 connections) — `api/tests/test_storage_service.py`
- **_normalize_bucket_and_path()** (3 connections) — `api/app/services/storage.py`
- **_decode_text_bytes_preserve_ptbr()** (3 connections) — `api/app/services/storage.py`
- **_extract_text_from_pdf()** (3 connections) — `api/app/services/storage.py`
- **_extract_text_from_docx()** (3 connections) — `api/app/services/storage.py`
- **.public_url_for_bucket()** (3 connections) — `api/app/services/storage.py`
- **.list_paths()** (3 connections) — `api/app/services/storage.py`
- **.delete_paths()** (3 connections) — `api/app/services/storage.py`
- **.delete_prefix()** (3 connections) — `api/app/services/storage.py`
- **.__init__()** (2 connections) — `api/app/services/storage.py`
- **.public_url()** (2 connections) — `api/app/services/storage.py`
- **.download_public_bytes()** (2 connections) — `api/app/services/storage.py`
- **Any** (2 connections)
- *... and 3 more nodes in this community*

## Relationships

- [services/personalizacao.py](services-personalizacao.py.md) (9 shared connections)
- [MediaPipelineContext](MediaPipelineContext.md) (7 shared connections)
- [settings.py](settings.py.md) (6 shared connections)
- [Settings](Settings.md) (6 shared connections)
- [v1/personalizacao.py](v1-personalizacao.py.md) (3 shared connections)
- [behavioral_personalization.py](behavioral_personalization.py.md) (3 shared connections)
- [services/personalizacao_jobs.py](services-personalizacao_jobs.py.md) (3 shared connections)
- [pptx_extractor.py](pptx_extractor.py.md) (2 shared connections)
- [media_pipeline.py](media_pipeline.py.md) (2 shared connections)
- [test_api.py](test_api.py.md) (2 shared connections)
- [AccessRepository](AccessRepository.md) (2 shared connections)
- [ConteudoPersonalizadoRepository](ConteudoPersonalizadoRepository.md) (1 shared connections)

## Source Files

- `api/app/services/storage.py`
- `api/tests/test_storage_service.py`

## Audit Trail

- EXTRACTED: 155 (96%)
- INFERRED: 7 (4%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*