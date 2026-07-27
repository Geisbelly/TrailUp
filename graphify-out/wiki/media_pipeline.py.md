# media_pipeline.py

> 22 nodes

## Key Concepts

- **media_pipeline.py** (25 connections) — `api/app/services/media_pipeline.py`
- **text_cleanup.py** (14 connections) — `api/app/services/text_cleanup.py`
- **clean_extracted_text()** (11 connections) — `api/app/services/text_cleanup.py`
- **expand_sections()** (11 connections) — `api/app/services/text_cleanup.py`
- **.normalize()** (9 connections) — `api/app/services/media_pipeline.py`
- **merge_fragmented_sections()** (8 connections) — `api/app/services/text_cleanup.py`
- **normalize_script()** (8 connections) — `api/app/services/text_cleanup.py`
- **Any** (7 connections)
- **split_text_chunks()** (6 connections) — `api/app/services/text_cleanup.py`
- **gerar_pdf_slides()** (5 connections) — `api/app/services/slides_pdf.py`
- **_merge_tema_visual()** (4 connections) — `api/app/services/media_pipeline.py`
- **slides_pdf.py** (4 connections) — `api/app/services/slides_pdf.py`
- **_accent_from_tema()** (4 connections) — `api/app/services/slides_pdf.py`
- **_normalize_for_match()** (4 connections) — `api/app/services/text_cleanup.py`
- **repair_mojibake()** (3 connections) — `api/app/services/text_cleanup.py`
- **strip_source_markers()** (3 connections) — `api/app/services/text_cleanup.py`
- **_suffix_prefix_overlap()** (3 connections) — `api/app/services/text_cleanup.py`
- **normalize_points()** (3 connections) — `api/app/services/text_cleanup.py`
- **_hex_to_color()** (2 connections) — `api/app/services/slides_pdf.py`
- **Any** (2 connections)
- **_looks_incomplete()** (2 connections) — `api/app/services/text_cleanup.py`
- **_looks_like_continuation()** (2 connections) — `api/app/services/text_cleanup.py`

## Relationships

- [MediaPipelineContext](MediaPipelineContext.md) (17 shared connections)
- [services/personalizacao.py](services-personalizacao.py.md) (7 shared connections)
- [media_agents.py](media_agents.py.md) (4 shared connections)
- [SupabaseStorage](SupabaseStorage.md) (2 shared connections)
- [settings.py](settings.py.md) (1 shared connections)
- [Settings](Settings.md) (1 shared connections)
- [TelemetriaRepository](TelemetriaRepository.md) (1 shared connections)
- [test_personalizacao_service.py](test_personalizacao_service.py.md) (1 shared connections)

## Source Files

- `api/app/services/media_pipeline.py`
- `api/app/services/slides_pdf.py`
- `api/app/services/text_cleanup.py`

## Audit Trail

- EXTRACTED: 140 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*