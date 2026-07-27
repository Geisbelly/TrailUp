# models.py

> 24 nodes

## Key Concepts

- **models.py** (18 connections) — `api/app/ingestion/models.py`
- **FileFamily** (14 connections) — `api/app/ingestion/models.py`
- **document_normalizer.py** (10 connections) — `api/app/ingestion/document_normalizer.py`
- **BlockKind** (10 connections) — `api/app/ingestion/models.py`
- **normalize()** (9 connections) — `api/app/ingestion/document_normalizer.py`
- **pdf_extractor.py** (9 connections) — `api/app/ingestion/extractors/pdf_extractor.py`
- **extract()** (7 connections) — `api/app/ingestion/extractors/pdf_extractor.py`
- **_clean_text()** (4 connections) — `api/app/ingestion/document_normalizer.py`
- **_detect_language()** (4 connections) — `api/app/ingestion/document_normalizer.py`
- **_classify_line()** (4 connections) — `api/app/ingestion/extractors/pdf_extractor.py`
- **_is_noise()** (3 connections) — `api/app/ingestion/document_normalizer.py`
- **Enum** (3 connections)
- **Block** (2 connections)
- **_empty()** (2 connections) — `api/app/ingestion/extractors/pdf_extractor.py`
- **str** (2 connections)
- **Normaliza o resultado bruto dos extratores para um NormalizedDocument. Limpa ruí** (1 connections) — `api/app/ingestion/document_normalizer.py`
- **Recebe a saída de um extractor e retorna NormalizedDocument.** (1 connections) — `api/app/ingestion/document_normalizer.py`
- **Remove espaços extras e caracteres de controle.** (1 connections) — `api/app/ingestion/document_normalizer.py`
- **Verifica se um bloco é ruído (número de página, rodapé, etc.).** (1 connections) — `api/app/ingestion/document_normalizer.py`
- **Detecta idioma com base em stopwords comuns.     Retorna 'pt-BR' ou 'en'.** (1 connections) — `api/app/ingestion/document_normalizer.py`
- **Extrator de PDF: pypdf → lista de Block.** (1 connections) — `api/app/ingestion/extractors/pdf_extractor.py`
- **Extrai blocos estruturados de um PDF.      Retorna dict com:       - family, tit** (1 connections) — `api/app/ingestion/extractors/pdf_extractor.py`
- **Heurística simples para classificar linhas de PDF.** (1 connections) — `api/app/ingestion/extractors/pdf_extractor.py`
- **Modelos internos unificados do pipeline de ingestão.** (1 connections) — `api/app/ingestion/models.py`

## Relationships

- [extractors/__init__.py](extractors-__init__.py.md) (12 shared connections)
- [pipeline.py](pipeline.py.md) (9 shared connections)
- [Block](Block.md) (8 shared connections)
- [pptx_extractor.py](pptx_extractor.py.md) (3 shared connections)
- [format_detector.py](format_detector.py.md) (3 shared connections)
- [semantic_chunker.py](semantic_chunker.py.md) (2 shared connections)
- [test_personalizacao_service.py](test_personalizacao_service.py.md) (1 shared connections)

## Source Files

- `api/app/ingestion/document_normalizer.py`
- `api/app/ingestion/extractors/pdf_extractor.py`
- `api/app/ingestion/models.py`

## Audit Trail

- EXTRACTED: 109 (99%)
- INFERRED: 1 (1%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*