from __future__ import annotations

import io

import pytest

from app.ingestion.extractors.pptx_extractor import extract as extract_pptx
from app.ingestion.pipeline import _resolve_filename


def _build_sample_pptx() -> bytes:
    pptx = pytest.importorskip("pptx")

    prs = pptx.Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Introducao ao SPD"

    body = slide.placeholders[1].text_frame
    body.clear()
    body.text = "Objetivo da aula"
    paragraph = body.add_paragraph()
    paragraph.text = "Conceitos fundamentais"

    notes = slide.notes_slide.notes_text_frame
    notes.text = "Notas do professor para revisao."

    output = io.BytesIO()
    prs.save(output)
    return output.getvalue()


def test_pptx_extractor_extracts_title_body_and_notes() -> None:
    raw = _build_sample_pptx()

    result = extract_pptx(raw, filename="aula_demo.pptx")
    blocks = result.get("blocks") or []
    texts = [block.text for block in blocks]
    kinds = [str(block.kind) for block in blocks]

    assert result["family"].value == "presentation"
    assert result["title"] == "Introducao ao SPD"
    assert any("Objetivo da aula" in text for text in texts)
    assert any("Conceitos fundamentais" in text for text in texts)
    assert any("Notas do professor para revisao." in text for text in texts)
    assert any(kind.endswith("SLIDE_TITLE") for kind in kinds)
    assert any(kind.endswith("SPEAKER_NOTE") for kind in kinds)


def test_resolve_filename_uses_storage_extension_when_only_title_exists() -> None:
    source = {
        "titulo": "Aula 1 - Introducao",
        "storage_path": "abc/114/1776024640723_SPD-Aula-01-introducao.pptx",
    }

    resolved = _resolve_filename(source)

    assert resolved.endswith(".pptx")
    assert resolved == "1776024640723_SPD-Aula-01-introducao.pptx"
