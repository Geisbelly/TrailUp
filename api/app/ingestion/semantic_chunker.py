"""
Segmentador semântico: agrupa blocos em chunks coerentes por seção/tópico.

Estratégia:
- Headings iniciam uma nova seção (novo chunk)
- Slide titles iniciam um novo chunk
- Chunks de texto são limitados por ~1200 chars para não saturar o contexto do LLM
- Preserva source_refs de todos os blocos que compõem o chunk
"""

from __future__ import annotations

import re
import uuid

from app.ingestion.models import Block, BlockKind, Chunk, NormalizedDocument

_MAX_CHUNK_CHARS = 1200
_MIN_CHUNK_CHARS = 80

# Tipos de bloco que iniciam nova seção
_SECTION_STARTERS = {
    BlockKind.HEADING,
    BlockKind.SUBHEADING,
    BlockKind.SLIDE_TITLE,
}


def chunk(doc: NormalizedDocument, *, max_chars: int = _MAX_CHUNK_CHARS) -> list[Chunk]:
    """
    Segmenta um NormalizedDocument em chunks semânticos.
    """
    if not doc.blocks:
        return []

    chunks: list[Chunk] = []
    current_blocks: list[Block] = []
    current_section = doc.title
    chunk_order = 0

    def _flush() -> None:
        nonlocal chunk_order
        if not current_blocks:
            return
        text_parts: list[str] = []
        source_refs: list[dict] = []
        block_ids: list[str] = []

        for b in current_blocks:
            if b.text.strip():
                # Prefixar headings para preservar hierarquia no chunk
                if b.kind in (BlockKind.HEADING, BlockKind.SLIDE_TITLE):
                    text_parts.append(f"## {b.text}")
                elif b.kind == BlockKind.SUBHEADING:
                    text_parts.append(f"### {b.text}")
                elif b.kind == BlockKind.LIST_ITEM:
                    text_parts.append(f"- {b.text}")
                elif b.kind == BlockKind.SPEAKER_NOTE:
                    text_parts.append(f"[Nota: {b.text}]")
                elif b.kind == BlockKind.QUOTE:
                    text_parts.append(f"> {b.text}")
                else:
                    text_parts.append(b.text)
                source_refs.append(b.source_ref)
                block_ids.append(b.block_id)

        combined = "\n".join(text_parts).strip()
        if not combined or len(combined) < _MIN_CHUNK_CHARS:
            return

        chunks.append(
            Chunk(
                chunk_id=str(uuid.uuid4()),
                document_id=doc.document_id,
                text=combined,
                source_refs=source_refs,
                section=current_section,
                family=doc.family.value,
                block_ids=block_ids,
                order=chunk_order,
            )
        )
        chunk_order += 1

    for block in doc.blocks:
        is_section_starter = block.kind in _SECTION_STARTERS

        # Verificar se chunk atual ficaria grande demais com este bloco
        current_text = " ".join(b.text for b in current_blocks)
        would_exceed = len(current_text) + len(block.text) > max_chars

        if (is_section_starter or would_exceed) and current_blocks:
            _flush()
            current_blocks = []
            # Atualizar seção se é um heading
            if is_section_starter:
                current_section = block.text

        current_blocks.append(block)

    # Flush final
    _flush()

    return chunks


def chunks_to_context_text(chunks: list[Chunk], *, limit: int = 12) -> str:
    """
    Converte uma lista de chunks em texto de contexto para o LLM.
    Retorna string formatada com origem de cada chunk.
    """
    parts: list[str] = []
    for i, chunk in enumerate(chunks[:limit]):
        ref = _format_ref(chunk.source_refs[0] if chunk.source_refs else {})
        section_label = f" ({chunk.section})" if chunk.section else ""
        parts.append(f"[Fonte {i + 1}{section_label}{ref}]\n{chunk.text}")
    return "\n\n---\n\n".join(parts)


def chunks_to_plain_text(chunks: list[Chunk], *, limit: int = 12, max_chars: int = 10_000) -> str:
    """
    Converte chunks em texto corrido sem metadados de fonte.
    Evita poluir payloads persistidos com marcadores "[Fonte ...]".
    """
    seen: set[str] = set()
    parts: list[str] = []
    for chunk in chunks[:limit]:
        text = str(chunk.text or "").strip()
        if not text:
            continue
        key = text[:180].lower()
        if key in seen:
            continue
        seen.add(key)
        parts.append(text)
    merged = "\n\n".join(parts).strip()
    merged = re.sub(r"\n{3,}", "\n\n", merged)
    if max_chars > 0 and len(merged) > max_chars:
        merged = merged[:max_chars].rstrip()
    return merged


def _format_ref(ref: dict) -> str:
    if not ref:
        return ""
    if "slide" in ref:
        return f" — Slide {ref['slide']}"
    if "page" in ref:
        return f" — Página {ref['page']}"
    if "line" in ref:
        return f" — Linha {ref['line']}"
    return ""
