"""Extrator de PDF: pypdf → lista de Block."""

from __future__ import annotations

import io
import re
from typing import TYPE_CHECKING

from app.ingestion.models import Block, BlockKind, FileFamily

if TYPE_CHECKING:
    pass


def extract(raw: bytes, *, filename: str = "documento.pdf") -> dict:
    """
    Extrai blocos estruturados de um PDF.

    Retorna dict com:
      - family, title, blocks (list[Block]), metadata
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        return _empty(filename)

    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception:
        return _empty(filename)

    blocks: list[Block] = []
    block_counter = 0
    title = filename.replace(".pdf", "").replace("_", " ").replace("-", " ").title()

    for page_num, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            continue

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in lines:
            block_counter += 1
            kind = _classify_line(line)
            blocks.append(
                Block(
                    block_id=f"p{page_num}_b{block_counter}",
                    kind=kind,
                    text=line,
                    order=block_counter,
                    source_ref={"page": page_num},
                    metadata={},
                )
            )

    # Tenta extrair o título real da primeira página
    if blocks:
        first_heading = next((b for b in blocks if b.kind == BlockKind.HEADING), None)
        if first_heading:
            title = first_heading.text

    return {
        "family": FileFamily.PDF,
        "title": title,
        "blocks": blocks,
        "metadata": {"pages": len(reader.pages), "filename": filename},
    }


def _classify_line(line: str) -> BlockKind:
    """Heurística simples para classificar linhas de PDF."""
    stripped = line.strip()
    if not stripped:
        return BlockKind.PARAGRAPH
    # Linhas curtas em maiúsculas ou com menos de 80 chars e sem ponto final tendem a ser títulos
    if len(stripped) < 80 and not stripped.endswith((".", ",", ";", ":", "?")):
        if stripped.isupper() or (len(stripped) < 50 and re.match(r"^[A-ZÀ-Ú0-9]", stripped)):
            return BlockKind.HEADING
    # Bullet points
    if re.match(r"^[\-\*\•\·\◦\▪\▸\►\→]\s", stripped):
        return BlockKind.LIST_ITEM
    if re.match(r"^\d+[\.\)]\s", stripped):
        return BlockKind.LIST_ITEM
    return BlockKind.PARAGRAPH


def _empty(filename: str) -> dict:
    return {
        "family": FileFamily.PDF,
        "title": filename,
        "blocks": [],
        "metadata": {"filename": filename, "error": "extraction_failed"},
    }
