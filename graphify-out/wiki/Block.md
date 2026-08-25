# Block

> 10 nodes

## Key Concepts

- **Block** (19 connections) — `api/app/ingestion/models.py`
- **text_extractor.py** (11 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **extract()** (7 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **_from_json()** (4 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **_from_xml()** (4 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **_from_plaintext()** (3 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **_empty()** (2 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **Extrator de texto plano (.txt, .csv, .json, .xml) → lista de Block.** (1 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **Trata JSON como estrutura textual.** (1 connections) — `api/app/ingestion/extractors/text_extractor.py`
- **Remove tags XML e extrai texto.** (1 connections) — `api/app/ingestion/extractors/text_extractor.py`

## Relationships

- [models.py](models.py.md) (8 shared connections)
- [extractors/__init__.py](extractors-__init__.py.md) (7 shared connections)
- [pptx_extractor.py](pptx_extractor.py.md) (3 shared connections)
- [pipeline.py](pipeline.py.md) (1 shared connections)
- [.to_dict](to_dict.md) (1 shared connections)
- [semantic_chunker.py](semantic_chunker.py.md) (1 shared connections)

## Source Files

- `api/app/ingestion/extractors/text_extractor.py`
- `api/app/ingestion/models.py`

## Audit Trail

- EXTRACTED: 53 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*