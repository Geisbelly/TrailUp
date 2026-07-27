# pipeline.py

> 17 nodes

## Key Concepts

- **pipeline.py** (18 connections) — `api/app/ingestion/pipeline.py`
- **ingest_source()** (12 connections) — `api/app/ingestion/pipeline.py`
- **NormalizedDocument** (11 connections) — `api/app/ingestion/models.py`
- **ingest_bytes()** (10 connections) — `api/app/ingestion/pipeline.py`
- **ingestion/__init__.py** (9 connections) — `api/app/ingestion/__init__.py`
- **Chunk** (8 connections) — `api/app/ingestion/models.py`
- **_resolve_filename()** (8 connections) — `api/app/ingestion/pipeline.py`
- **_pick()** (6 connections) — `api/app/ingestion/pipeline.py`
- **Any** (4 connections)
- **_infer_bucket()** (4 connections) — `api/app/ingestion/pipeline.py`
- **_basename_from_locator()** (3 connections) — `api/app/ingestion/pipeline.py`
- **.plain_text()** (2 connections) — `api/app/ingestion/models.py`
- **_looks_like_filename()** (2 connections) — `api/app/ingestion/pipeline.py`
- **Módulo de ingestão de arquivos do TrailUp.  Pipeline:   arquivo (bytes + mime) →** (1 connections) — `api/app/ingestion/__init__.py`
- **Ponto de entrada do pipeline de ingestão.  Fluxo:   bytes → format_detector → ex** (1 connections) — `api/app/ingestion/pipeline.py`
- **Processa bytes de um arquivo e retorna (NormalizedDocument, list[Chunk]).      A** (1 connections) — `api/app/ingestion/pipeline.py`
- **Processa um registro de fonte (dict de fontes_personalizacao) e retorna chunks.** (1 connections) — `api/app/ingestion/pipeline.py`

## Relationships

- [models.py](models.py.md) (9 shared connections)
- [semantic_chunker.py](semantic_chunker.py.md) (6 shared connections)
- [services/personalizacao.py](services-personalizacao.py.md) (4 shared connections)
- [pptx_extractor.py](pptx_extractor.py.md) (3 shared connections)
- [.to_dict](to_dict.md) (2 shared connections)
- [extractors/__init__.py](extractors-__init__.py.md) (2 shared connections)
- [format_detector.py](format_detector.py.md) (2 shared connections)
- [Block](Block.md) (1 shared connections)

## Source Files

- `api/app/ingestion/__init__.py`
- `api/app/ingestion/models.py`
- `api/app/ingestion/pipeline.py`

## Audit Trail

- EXTRACTED: 100 (99%)
- INFERRED: 1 (1%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*