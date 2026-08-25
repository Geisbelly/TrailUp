"""Extratores de conteudo por familia de arquivo."""

from app.ingestion.extractors.docx_extractor import extract as extract_docx
from app.ingestion.extractors.markdown_extractor import extract as extract_markdown
from app.ingestion.extractors.pdf_extractor import extract as extract_pdf
from app.ingestion.extractors.pptx_extractor import extract as extract_pptx
from app.ingestion.extractors.text_extractor import extract as extract_text

__all__ = [
    "extract_docx",
    "extract_markdown",
    "extract_pdf",
    "extract_pptx",
    "extract_text",
]
