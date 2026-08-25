"""
Ponto de entrada do pipeline de ingestão.

Fluxo:
  bytes → format_detector → extractor_factory → document_normalizer → semantic_chunker → chunks
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from app.ingestion import document_normalizer, extractor_factory, format_detector, semantic_chunker
from app.ingestion.models import Chunk, NormalizedDocument


async def ingest_bytes(
    raw: bytes,
    *,
    mime_type: str | None = None,
    filename: str | None = None,
    document_id: str | None = None,
    max_chunk_chars: int = 1200,
) -> tuple[NormalizedDocument, list[Chunk]]:
    """
    Processa bytes de um arquivo e retorna (NormalizedDocument, list[Chunk]).

    Args:
        raw: bytes do arquivo
        mime_type: MIME type opcional (melhora detecção)
        filename: nome do arquivo (usado para detecção e metadados)
        document_id: ID explícito; se None, gerado automaticamente
        max_chunk_chars: tamanho máximo de cada chunk em caracteres
    """
    fname = filename or "arquivo"
    detection = format_detector.detect(
        filename=fname,
        mime_type=mime_type,
        raw=raw,
    )

    extracted = extractor_factory.extract(
        raw,
        family=detection["family"],
        filename=fname,
        mime_type=detection["mime_type"],
    )

    doc_id = document_id or str(uuid.uuid4())
    doc = document_normalizer.normalize(extracted, document_id=doc_id)
    chunks = semantic_chunker.chunk(doc, max_chars=max_chunk_chars)

    return doc, chunks


async def ingest_source(
    source: dict[str, Any],
    *,
    storage_downloader: Any = None,
    max_chunk_chars: int = 1200,
) -> tuple[NormalizedDocument | None, list[Chunk]]:
    """
    Processa um registro de fonte (dict de fontes_personalizacao) e retorna chunks.

    Args:
        source: dict com keys: texto_extraido, storage_path, url, mime_type, nome_arquivo, etc.
        storage_downloader: instância de SupabaseStorage ou None
        max_chunk_chars: tamanho máximo do chunk
    """
    # 1. Tenta usar texto já extraído (evita download redundante)
    texto_extraido = _pick(source.get("texto_extraido"), source.get("texto_base"), source.get("descricao"))
    filename = _resolve_filename(source)
    mime_type = _pick(source.get("mime_type"), source.get("arquivo_mime")) or ""
    doc_id = _pick(source.get("source_id"), source.get("id")) or str(uuid.uuid4())

    # Se temos texto extraído suficiente, não precisamos baixar o arquivo
    if texto_extraido and len(texto_extraido.strip()) >= 120:
        raw = texto_extraido.encode("utf-8")
        # Tratar como plain text para aproveitar a extração estrutural básica
        effective_mime = "text/plain"
        doc, chunks = await ingest_bytes(
            raw,
            mime_type=effective_mime,
            filename=filename if filename.endswith((".txt", ".md")) else f"{filename}.txt",
            document_id=str(doc_id),
            max_chunk_chars=max_chunk_chars,
        )
        # Preservar source_refs originais nos chunks
        for chunk in chunks:
            chunk.source_refs = [{"source_id": str(doc_id)}]
        return doc, chunks

    # 2. Tenta baixar o arquivo do storage
    if storage_downloader is None:
        return None, []

    storage_path = _pick(source.get("storage_path"))
    url = _pick(source.get("url"), source.get("arquivo_url"))
    bucket = _pick(source.get("bucket")) or _infer_bucket(source, storage_path)

    raw_bytes: bytes | None = None
    if storage_path and bucket:
        try:
            raw_bytes = await storage_downloader.download_bytes(bucket=bucket, path=storage_path)
        except Exception:
            raw_bytes = None

    if raw_bytes is None and url:
        try:
            raw_bytes = await storage_downloader.download_public_bytes(url)
        except Exception:
            raw_bytes = None

    if not raw_bytes:
        return None, []

    doc, chunks = await ingest_bytes(
        raw_bytes,
        mime_type=mime_type,
        filename=filename,
        document_id=str(doc_id),
        max_chunk_chars=max_chunk_chars,
    )
    # Preservar source_ref original nos chunks
    for chunk in chunks:
        for ref in chunk.source_refs:
            ref["source_id"] = str(doc_id)
    return doc, chunks


def _pick(*values: Any) -> str | None:
    for v in values:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _resolve_filename(source: dict[str, Any]) -> str:
    explicit_name = _pick(source.get("nome_arquivo"))
    explicit_title = _pick(source.get("titulo"))
    storage_path = _pick(source.get("storage_path"))
    url = _pick(source.get("url"), source.get("arquivo_url"))
    locator_name = _basename_from_locator(storage_path) or _basename_from_locator(url)

    if explicit_name and _looks_like_filename(explicit_name):
        return explicit_name
    if explicit_name and locator_name and _looks_like_filename(locator_name):
        return locator_name
    if explicit_title and _looks_like_filename(explicit_title):
        return explicit_title
    if explicit_title and locator_name and _looks_like_filename(locator_name):
        return locator_name
    if explicit_name:
        return explicit_name
    if explicit_title:
        return explicit_title
    if locator_name:
        return locator_name
    return "fonte"


def _basename_from_locator(value: str | None) -> str | None:
    locator = _pick(value)
    if not locator:
        return None
    normalized = locator.split("?", maxsplit=1)[0].split("#", maxsplit=1)[0]
    normalized = normalized.replace("\\", "/").rstrip("/")
    if not normalized:
        return None
    return normalized.rsplit("/", maxsplit=1)[-1] or None


def _looks_like_filename(value: str) -> bool:
    return bool(re.search(r"\.[a-z0-9]{2,8}$", value.strip(), flags=re.IGNORECASE))


def _infer_bucket(source: dict[str, Any], storage_path: str | None) -> str:
    origem = _pick(source.get("origem")) or ""
    source_id = _pick(source.get("source_id")) or ""
    normalized_origem = origem.strip().lower()
    normalized_source_id = source_id.strip().lower()
    if normalized_origem in {
        "sync_conteudo",
        "sync_midia",
        "conteudo_payload",
        "conteudo_metadata",
        "conteudo_file",
        "midia",
    }:
        return "conteudos"
    if normalized_source_id.startswith("conteudo:") or normalized_source_id.startswith("midia:"):
        return "conteudos"
    if normalized_origem in {"upload", "fonte", "fonte_personalizacao"}:
        return "conteudo_aluno"
    if storage_path and storage_path.startswith("conteudos/"):
        return "conteudos"
    return "conteudo_aluno"
