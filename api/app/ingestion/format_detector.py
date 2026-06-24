"""Detecta o tipo e família de um arquivo por extensão e MIME type."""

from __future__ import annotations

import mimetypes
from typing import Any

from app.ingestion.models import FileFamily

# Mapeamentos de MIME type → família
_MIME_TO_FAMILY: dict[str, FileFamily] = {
    # PDF
    "application/pdf": FileFamily.PDF,
    # Word / texto estruturado
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileFamily.TEXT,
    "application/msword": FileFamily.TEXT,
    "application/vnd.oasis.opendocument.text": FileFamily.TEXT,
    "application/rtf": FileFamily.TEXT,
    "text/rtf": FileFamily.TEXT,
    # Apresentações
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": FileFamily.PRESENTATION,
    "application/vnd.ms-powerpoint": FileFamily.PRESENTATION,
    "application/vnd.oasis.opendocument.presentation": FileFamily.PRESENTATION,
    # Planilhas (tratadas como texto)
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": FileFamily.TEXT,
    "application/vnd.ms-excel": FileFamily.TEXT,
    "text/csv": FileFamily.TEXT,
    # Texto plano / Markdown
    "text/plain": FileFamily.TEXT,
    "text/markdown": FileFamily.MARKDOWN,
    "application/json": FileFamily.TEXT,
    "application/xml": FileFamily.TEXT,
    "text/xml": FileFamily.TEXT,
    # Imagens
    "image/png": FileFamily.IMAGE,
    "image/jpeg": FileFamily.IMAGE,
    "image/webp": FileFamily.IMAGE,
    "image/tiff": FileFamily.IMAGE,
    "image/gif": FileFamily.IMAGE,
    "image/bmp": FileFamily.IMAGE,
    # Vídeo
    "video/mp4": FileFamily.VIDEO,
    "video/quicktime": FileFamily.VIDEO,
    "video/x-msvideo": FileFamily.VIDEO,
    "video/webm": FileFamily.VIDEO,
    "video/x-matroska": FileFamily.VIDEO,
    # Áudio
    "audio/mpeg": FileFamily.AUDIO,
    "audio/wav": FileFamily.AUDIO,
    "audio/ogg": FileFamily.AUDIO,
    "audio/aac": FileFamily.AUDIO,
    "audio/flac": FileFamily.AUDIO,
    "audio/x-m4a": FileFamily.AUDIO,
}

# Mapeamentos de extensão → família
_EXT_TO_FAMILY: dict[str, FileFamily] = {
    ".pdf": FileFamily.PDF,
    ".docx": FileFamily.TEXT,
    ".doc": FileFamily.TEXT,
    ".odt": FileFamily.TEXT,
    ".rtf": FileFamily.TEXT,
    ".txt": FileFamily.TEXT,
    ".md": FileFamily.MARKDOWN,
    ".markdown": FileFamily.MARKDOWN,
    ".pptx": FileFamily.PRESENTATION,
    ".ppt": FileFamily.PRESENTATION,
    ".odp": FileFamily.PRESENTATION,
    ".key": FileFamily.PRESENTATION,
    ".png": FileFamily.IMAGE,
    ".jpg": FileFamily.IMAGE,
    ".jpeg": FileFamily.IMAGE,
    ".webp": FileFamily.IMAGE,
    ".tiff": FileFamily.IMAGE,
    ".tif": FileFamily.IMAGE,
    ".gif": FileFamily.IMAGE,
    ".bmp": FileFamily.IMAGE,
    ".mp4": FileFamily.VIDEO,
    ".mov": FileFamily.VIDEO,
    ".avi": FileFamily.VIDEO,
    ".mkv": FileFamily.VIDEO,
    ".webm": FileFamily.VIDEO,
    ".mp3": FileFamily.AUDIO,
    ".wav": FileFamily.AUDIO,
    ".ogg": FileFamily.AUDIO,
    ".aac": FileFamily.AUDIO,
    ".flac": FileFamily.AUDIO,
    ".m4a": FileFamily.AUDIO,
    ".xlsx": FileFamily.TEXT,
    ".xls": FileFamily.TEXT,
    ".csv": FileFamily.TEXT,
    ".json": FileFamily.TEXT,
    ".xml": FileFamily.TEXT,
}


def detect(
    *,
    filename: str | None = None,
    mime_type: str | None = None,
    raw: bytes | None = None,
) -> dict[str, Any]:
    """
    Detecta o formato e a família de um arquivo.

    Retorna:
      {
        "extension": ".pdf",
        "mime_type": "application/pdf",
        "family": FileFamily.PDF,
        "processable": True,
      }
    """
    extension = ""
    if filename:
        idx = filename.rfind(".")
        if idx >= 0:
            extension = filename[idx:].lower()

    # Inferir MIME type a partir da extensão se não fornecido
    resolved_mime = mime_type or ""
    if not resolved_mime and extension:
        guessed, _ = mimetypes.guess_type(f"file{extension}")
        resolved_mime = guessed or ""

    # Família: prioridade MIME type, fallback extensão, fallback magic bytes
    family = _MIME_TO_FAMILY.get(resolved_mime.lower())
    if family is None and extension:
        family = _EXT_TO_FAMILY.get(extension)
    if family is None and raw:
        family = _detect_from_magic(raw)
    if family is None:
        family = FileFamily.UNKNOWN

    # Um arquivo é processável se temos extrator para ele
    processable = family not in (FileFamily.VIDEO, FileFamily.AUDIO, FileFamily.UNKNOWN)

    return {
        "extension": extension,
        "mime_type": resolved_mime or _guess_mime(extension),
        "family": family,
        "processable": processable,
    }


def _guess_mime(extension: str) -> str:
    guessed, _ = mimetypes.guess_type(f"file{extension}")
    return guessed or "application/octet-stream"


def _detect_from_magic(raw: bytes) -> FileFamily | None:
    """Detecção por magic bytes (assinatura binária)."""
    if len(raw) < 4:
        return None
    sig = raw[:8]
    # PDF: %PDF
    if sig[:4] == b"%PDF":
        return FileFamily.PDF
    # ZIP-based (docx, pptx, xlsx, odt…)
    if sig[:4] == b"PK\x03\x04":
        # Verificar se é PPTX ou DOCX pelo conteúdo do ZIP
        import zipfile
        import io
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                names = zf.namelist()
                if any(n.startswith("ppt/") for n in names):
                    return FileFamily.PRESENTATION
                if any(n.startswith("word/") for n in names):
                    return FileFamily.TEXT
        except Exception:
            pass
        return FileFamily.TEXT
    # PNG
    if sig[:8] == b"\x89PNG\r\n\x1a\n":
        return FileFamily.IMAGE
    # JPEG
    if sig[:2] == b"\xff\xd8":
        return FileFamily.IMAGE
    # MP4/MOV (ftyp box)
    if raw[4:8] in (b"ftyp", b"moov", b"mdat"):
        return FileFamily.VIDEO
    # MP3
    if sig[:3] == b"ID3" or sig[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return FileFamily.AUDIO
    return None
