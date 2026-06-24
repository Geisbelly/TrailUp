"""Extrator de texto plano (.txt, .csv, .json, .xml) → lista de Block."""

from __future__ import annotations

import json
import re

from app.ingestion.models import Block, BlockKind, FileFamily


def extract(raw: bytes, *, filename: str = "arquivo.txt") -> dict:
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        return _empty(filename)

    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "txt"

    if ext == "json":
        return _from_json(text, filename)
    if ext in ("xml",):
        return _from_xml(text, filename)

    return _from_plaintext(text, filename)


def _from_plaintext(text: str, filename: str) -> dict:
    blocks: list[Block] = []
    block_counter = 0
    title = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
    first_line = True

    for line_num, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue

        block_counter += 1
        if first_line:
            title = stripped[:80]
            first_line = False
            kind = BlockKind.HEADING
        elif len(stripped) < 80 and not stripped.endswith((".", ",", ";")):
            kind = BlockKind.SUBHEADING
        else:
            kind = BlockKind.PARAGRAPH

        blocks.append(
            Block(
                block_id=f"l{line_num}",
                kind=kind,
                text=stripped,
                order=block_counter,
                source_ref={"line": line_num},
                metadata={},
            )
        )

    return {
        "family": FileFamily.TEXT,
        "title": title,
        "blocks": blocks,
        "metadata": {"filename": filename},
    }


def _from_json(text: str, filename: str) -> dict:
    """Trata JSON como estrutura textual."""
    try:
        data = json.loads(text)
        flat = json.dumps(data, ensure_ascii=False, indent=2)
    except Exception:
        flat = text

    block = Block(
        block_id="json_content",
        kind=BlockKind.CODE_BLOCK,
        text=flat[:8000],
        order=1,
        source_ref={},
        metadata={"format": "json"},
    )
    return {
        "family": FileFamily.TEXT,
        "title": filename,
        "blocks": [block],
        "metadata": {"filename": filename},
    }


def _from_xml(text: str, filename: str) -> dict:
    """Remove tags XML e extrai texto."""
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    block = Block(
        block_id="xml_content",
        kind=BlockKind.PARAGRAPH,
        text=clean[:8000],
        order=1,
        source_ref={},
        metadata={"format": "xml"},
    )
    return {
        "family": FileFamily.TEXT,
        "title": filename,
        "blocks": [block],
        "metadata": {"filename": filename},
    }


def _empty(filename: str) -> dict:
    return {
        "family": FileFamily.TEXT,
        "title": filename,
        "blocks": [],
        "metadata": {"filename": filename, "error": "extraction_failed"},
    }
