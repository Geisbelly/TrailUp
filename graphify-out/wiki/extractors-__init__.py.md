# extractors/__init__.py

> 18 nodes

## Key Concepts

- **extractors/__init__.py** (11 connections) — `api/app/ingestion/extractors/__init__.py`
- **extractor_factory.py** (10 connections) — `api/app/ingestion/extractor_factory.py`
- **markdown_extractor.py** (9 connections) — `api/app/ingestion/extractors/markdown_extractor.py`
- **docx_extractor.py** (8 connections) — `api/app/ingestion/extractors/docx_extractor.py`
- **extract()** (8 connections) — `api/app/ingestion/extractors/markdown_extractor.py`
- **extract()** (6 connections) — `api/app/ingestion/extractors/docx_extractor.py`
- **extract()** (5 connections) — `api/app/ingestion/extractor_factory.py`
- **_strip_inline_md()** (3 connections) — `api/app/ingestion/extractors/markdown_extractor.py`
- **_empty()** (2 connections) — `api/app/ingestion/extractors/docx_extractor.py`
- **_empty()** (2 connections) — `api/app/ingestion/extractors/markdown_extractor.py`
- **Factory: escolhe o extrator correto com base na família do arquivo.** (1 connections) — `api/app/ingestion/extractor_factory.py`
- **Roteia para o extrator específico e retorna dict com:       - family, title, blo** (1 connections) — `api/app/ingestion/extractor_factory.py`
- **Extratores de conteudo por familia de arquivo.** (1 connections) — `api/app/ingestion/extractors/__init__.py`
- **Extrator de DOCX: python-docx → lista de Block.** (1 connections) — `api/app/ingestion/extractors/docx_extractor.py`
- **Extrai blocos estruturados de um DOCX.      Retorna dict com:       - family, ti** (1 connections) — `api/app/ingestion/extractors/docx_extractor.py`
- **Extrator de Markdown: parse estrutural → lista de Block.** (1 connections) — `api/app/ingestion/extractors/markdown_extractor.py`
- **Extrai blocos estruturados de um arquivo Markdown.** (1 connections) — `api/app/ingestion/extractors/markdown_extractor.py`
- **Remove markdown inline: bold, italic, code, links.** (1 connections) — `api/app/ingestion/extractors/markdown_extractor.py`

## Relationships

- [models.py](models.py.md) (12 shared connections)
- [Block](Block.md) (7 shared connections)
- [pptx_extractor.py](pptx_extractor.py.md) (3 shared connections)
- [pipeline.py](pipeline.py.md) (2 shared connections)

## Source Files

- `api/app/ingestion/extractor_factory.py`
- `api/app/ingestion/extractors/__init__.py`
- `api/app/ingestion/extractors/docx_extractor.py`
- `api/app/ingestion/extractors/markdown_extractor.py`

## Audit Trail

- EXTRACTED: 72 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*