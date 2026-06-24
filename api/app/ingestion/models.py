"""Modelos internos unificados do pipeline de ingestão."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class FileFamily(str, Enum):
    TEXT = "text"
    MARKDOWN = "markdown"
    PRESENTATION = "presentation"
    PDF = "pdf"
    VIDEO = "video"
    AUDIO = "audio"
    IMAGE = "image"
    UNKNOWN = "unknown"


class BlockKind(str, Enum):
    HEADING = "heading"
    SUBHEADING = "subheading"
    PARAGRAPH = "paragraph"
    LIST_ITEM = "list_item"
    TABLE = "table"
    QUOTE = "quote"
    CODE_BLOCK = "code_block"
    SLIDE_TITLE = "slide_title"
    SPEAKER_NOTE = "speaker_note"
    TRANSCRIPT_SEGMENT = "transcript_segment"
    IMAGE_CAPTION = "image_caption"
    DIAGRAM_DESCRIPTION = "diagram_description"


@dataclass
class Block:
    block_id: str
    kind: BlockKind
    text: str
    order: int
    source_ref: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "block_id": self.block_id,
            "kind": self.kind.value,
            "text": self.text,
            "order": self.order,
            "source_ref": self.source_ref,
            "metadata": self.metadata,
        }


@dataclass
class NormalizedDocument:
    document_id: str
    family: FileFamily
    language: str
    title: str
    blocks: list[Block] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def plain_text(self, separator: str = "\n") -> str:
        return separator.join(b.text for b in self.blocks if b.text.strip())

    def to_dict(self) -> dict[str, Any]:
        return {
            "document_id": self.document_id,
            "family": self.family.value,
            "language": self.language,
            "title": self.title,
            "blocks": [b.to_dict() for b in self.blocks],
            "metadata": self.metadata,
        }


@dataclass
class Chunk:
    chunk_id: str
    document_id: str
    text: str
    source_refs: list[dict[str, Any]] = field(default_factory=list)
    section: str = ""
    family: str = ""
    block_ids: list[str] = field(default_factory=list)
    order: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "text": self.text,
            "source_refs": self.source_refs,
            "section": self.section,
            "family": self.family,
            "block_ids": self.block_ids,
            "order": self.order,
        }
