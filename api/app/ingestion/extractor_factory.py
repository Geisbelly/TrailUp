"""Factory: escolhe o extrator correto com base na família do arquivo."""

from __future__ import annotations

from app.ingestion.models import FileFamily


def extract(
    raw: bytes,
    *,
    family: FileFamily,
    filename: str = "arquivo",
    mime_type: str = "",
) -> dict:
    """
    Roteia para o extrator específico e retorna dict com:
      - family, title, blocks (list[Block]), metadata
    """
    if family == FileFamily.PDF:
        from app.ingestion.extractors.pdf_extractor import extract as _ext
        return _ext(raw, filename=filename)

    if family == FileFamily.PRESENTATION:
        from app.ingestion.extractors.pptx_extractor import extract as _ext
        return _ext(raw, filename=filename)

    if family == FileFamily.TEXT:
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "txt"
        if ext in ("docx", "doc", "odt", "rtf"):
            from app.ingestion.extractors.docx_extractor import extract as _ext
            return _ext(raw, filename=filename)
        from app.ingestion.extractors.text_extractor import extract as _ext
        return _ext(raw, filename=filename)

    if family == FileFamily.MARKDOWN:
        from app.ingestion.extractors.markdown_extractor import extract as _ext
        return _ext(raw, filename=filename)

    # Vídeo e áudio: sem extração de conteúdo (requer Whisper/transcrição externa)
    if family in (FileFamily.VIDEO, FileFamily.AUDIO):
        return {
            "family": family,
            "title": filename,
            "blocks": [],
            "metadata": {
                "filename": filename,
                "note": "transcricao_nao_disponivel",
            },
        }

    # Imagem: sem OCR integrado
    if family == FileFamily.IMAGE:
        return {
            "family": family,
            "title": filename,
            "blocks": [],
            "metadata": {
                "filename": filename,
                "note": "ocr_nao_disponivel",
            },
        }

    return {
        "family": FileFamily.UNKNOWN,
        "title": filename,
        "blocks": [],
        "metadata": {"filename": filename, "note": "familia_desconhecida"},
    }
