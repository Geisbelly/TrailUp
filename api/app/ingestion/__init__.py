"""
Módulo de ingestão de arquivos do TrailUp.

Pipeline:
  arquivo (bytes + mime) → format_detector → extractor_factory → extractor
  → document_normalizer → semantic_chunker → list[Chunk]

Uso rápido:
  from app.ingestion.pipeline import ingest_bytes
  chunks = await ingest_bytes(raw=b"...", mime_type="application/pdf", filename="aula.pdf")
"""

from app.ingestion.models import Block, Chunk, FileFamily, NormalizedDocument
from app.ingestion.pipeline import ingest_bytes, ingest_source

__all__ = [
    "Block",
    "Chunk",
    "FileFamily",
    "NormalizedDocument",
    "ingest_bytes",
    "ingest_source",
]
