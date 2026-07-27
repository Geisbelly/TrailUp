# pptx_extractor.py

> 19 nodes

## Key Concepts

- **pptx_extractor.py** (18 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **extract()** (11 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **_extract_with_xml_fallback()** (7 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **test_ingestion_pptx.py** (7 connections) — `api/tests/test_ingestion_pptx.py`
- **_extract_with_python_pptx()** (5 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **_shape_text_lines()** (4 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **Any** (4 connections)
- **_extract_notes_text()** (4 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **_read_xml_texts()** (4 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **_join_lines()** (4 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **ZipFile** (3 connections)
- **_sorted_pptx_xml_names()** (3 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **_dedupe_preserve_order()** (3 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **test_pptx_extractor_extracts_title_body_and_notes()** (3 connections) — `api/tests/test_ingestion_pptx.py`
- **_normalize_title()** (2 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **_build_sample_pptx()** (2 connections) — `api/tests/test_ingestion_pptx.py`
- **test_resolve_filename_uses_storage_extension_when_only_title_exists()** (2 connections) — `api/tests/test_ingestion_pptx.py`
- **Extrator de PPTX: python-pptx com fallback XML.** (1 connections) — `api/app/ingestion/extractors/pptx_extractor.py`
- **Extrai blocos estruturados de um PPTX.      Retorna dict com:       - family, ti** (1 connections) — `api/app/ingestion/extractors/pptx_extractor.py`

## Relationships

- [extractors/__init__.py](extractors-__init__.py.md) (3 shared connections)
- [models.py](models.py.md) (3 shared connections)
- [Block](Block.md) (3 shared connections)
- [pipeline.py](pipeline.py.md) (3 shared connections)
- [SupabaseStorage](SupabaseStorage.md) (2 shared connections)

## Source Files

- `api/app/ingestion/extractors/pptx_extractor.py`
- `api/tests/test_ingestion_pptx.py`

## Audit Trail

- EXTRACTED: 88 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*