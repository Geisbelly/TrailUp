"""Extrator de Markdown: parse estrutural → lista de Block."""

from __future__ import annotations

import re

from app.ingestion.models import Block, BlockKind, FileFamily


def extract(raw: bytes, *, filename: str = "documento.md") -> dict:
    """
    Extrai blocos estruturados de um arquivo Markdown.
    """
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        return _empty(filename)

    blocks: list[Block] = []
    block_counter = 0
    title = filename.replace(".md", "").replace("_", " ").replace("-", " ").title()
    first_heading_found = False

    lines = text.splitlines()
    current_code_block: list[str] = []
    in_code_block = False
    code_block_counter = 0

    for line_num, line in enumerate(lines, start=1):
        stripped = line.rstrip()

        # Bloco de código delimitado por ```
        if stripped.startswith("```"):
            if in_code_block:
                # Fecha bloco de código
                if current_code_block:
                    code_block_counter += 1
                    block_counter += 1
                    blocks.append(
                        Block(
                            block_id=f"code_{code_block_counter}",
                            kind=BlockKind.CODE_BLOCK,
                            text="\n".join(current_code_block),
                            order=block_counter,
                            source_ref={"line": line_num},
                            metadata={},
                        )
                    )
                current_code_block = []
                in_code_block = False
            else:
                in_code_block = True
            continue

        if in_code_block:
            current_code_block.append(line)
            continue

        if not stripped:
            continue

        # Headings: # ## ### ...
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            heading_text = heading_match.group(2).strip()
            block_counter += 1
            kind = BlockKind.HEADING if level <= 2 else BlockKind.SUBHEADING
            if not first_heading_found:
                title = heading_text
                first_heading_found = True
            blocks.append(
                Block(
                    block_id=f"h{level}_{block_counter}",
                    kind=kind,
                    text=heading_text,
                    order=block_counter,
                    source_ref={"line": line_num},
                    metadata={"level": level},
                )
            )
            continue

        # Setext headings (underlined with === or ---)
        if line_num < len(lines):
            next_line = lines[line_num].strip() if line_num < len(lines) else ""
            if re.match(r"^=+$", next_line):
                block_counter += 1
                if not first_heading_found:
                    title = stripped
                    first_heading_found = True
                blocks.append(
                    Block(
                        block_id=f"h1_{block_counter}",
                        kind=BlockKind.HEADING,
                        text=stripped,
                        order=block_counter,
                        source_ref={"line": line_num},
                        metadata={"level": 1},
                    )
                )
                continue
            if re.match(r"^-+$", next_line) and len(next_line) >= 2:
                block_counter += 1
                blocks.append(
                    Block(
                        block_id=f"h2_{block_counter}",
                        kind=BlockKind.SUBHEADING,
                        text=stripped,
                        order=block_counter,
                        source_ref={"line": line_num},
                        metadata={"level": 2},
                    )
                )
                continue

        # Ignorar linhas de separador (---, ___, ***)
        if re.match(r"^[-_\*]{3,}$", stripped):
            continue

        # Lista: -, *, +, ou numerada
        if re.match(r"^[\-\*\+]\s", stripped):
            text_clean = re.sub(r"^[\-\*\+]\s+", "", stripped)
            # Remover markdown inline (bold, italic, links)
            text_clean = _strip_inline_md(text_clean)
            block_counter += 1
            blocks.append(
                Block(
                    block_id=f"li_{block_counter}",
                    kind=BlockKind.LIST_ITEM,
                    text=text_clean,
                    order=block_counter,
                    source_ref={"line": line_num},
                    metadata={},
                )
            )
            continue

        if re.match(r"^\d+[\.\)]\s", stripped):
            text_clean = re.sub(r"^\d+[\.\)]\s+", "", stripped)
            text_clean = _strip_inline_md(text_clean)
            block_counter += 1
            blocks.append(
                Block(
                    block_id=f"oli_{block_counter}",
                    kind=BlockKind.LIST_ITEM,
                    text=text_clean,
                    order=block_counter,
                    source_ref={"line": line_num},
                    metadata={"ordered": True},
                )
            )
            continue

        # Blockquote
        if stripped.startswith("> "):
            text_clean = _strip_inline_md(stripped[2:])
            block_counter += 1
            blocks.append(
                Block(
                    block_id=f"bq_{block_counter}",
                    kind=BlockKind.QUOTE,
                    text=text_clean,
                    order=block_counter,
                    source_ref={"line": line_num},
                    metadata={},
                )
            )
            continue

        # Parágrafo normal
        text_clean = _strip_inline_md(stripped)
        if text_clean:
            block_counter += 1
            blocks.append(
                Block(
                    block_id=f"p_{block_counter}",
                    kind=BlockKind.PARAGRAPH,
                    text=text_clean,
                    order=block_counter,
                    source_ref={"line": line_num},
                    metadata={},
                )
            )

    return {
        "family": FileFamily.MARKDOWN,
        "title": title,
        "blocks": blocks,
        "metadata": {"lines": len(lines), "filename": filename},
    }


def _strip_inline_md(text: str) -> str:
    """Remove markdown inline: bold, italic, code, links."""
    # Remove links: [texto](url) → texto
    text = re.sub(r"\[([^\]]+)\]\([^\)]*\)", r"\1", text)
    # Remove imagens: ![alt](url) → alt
    text = re.sub(r"!\[([^\]]*)\]\([^\)]*\)", r"\1", text)
    # Remove bold/italic: ***texto***, **texto**, *texto*, _texto_
    text = re.sub(r"\*{1,3}([^\*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,2}([^_]+)_{1,2}", r"\1", text)
    # Remove inline code: `code`
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.strip()


def _empty(filename: str) -> dict:
    return {
        "family": FileFamily.MARKDOWN,
        "title": filename,
        "blocks": [],
        "metadata": {"filename": filename, "error": "extraction_failed"},
    }
