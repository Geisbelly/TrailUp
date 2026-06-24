"""
Normaliza o resultado bruto dos extratores para um NormalizedDocument.
Limpa ruído, preserva hierarquia e atribui IDs únicos.
"""

from __future__ import annotations

import re
import uuid

from app.ingestion.models import Block, BlockKind, FileFamily, NormalizedDocument

# Tamanho mínimo de texto para ser um bloco válido
_MIN_BLOCK_TEXT = 3
# Padrões de ruído (números de página, rodapés repetidos, etc.)
_NOISE_PATTERNS = [
    re.compile(r"^\d+$"),                          # Só número (página)
    re.compile(r"^pagina \d+$", re.IGNORECASE),
    re.compile(r"^page \d+$", re.IGNORECASE),
    re.compile(r"^confidencial$", re.IGNORECASE),
    re.compile(r"^todos os direitos reservados", re.IGNORECASE),
    re.compile(r"^copyright", re.IGNORECASE),
]


def normalize(extracted: dict, *, document_id: str | None = None) -> NormalizedDocument:
    """
    Recebe a saída de um extractor e retorna NormalizedDocument.
    """
    doc_id = document_id or str(uuid.uuid4())
    family = extracted.get("family", FileFamily.UNKNOWN)
    title = _clean_text(str(extracted.get("title") or "Documento"))
    raw_blocks: list[Block] = extracted.get("blocks", [])
    metadata = dict(extracted.get("metadata") or {})

    cleaned: list[Block] = []
    order = 1
    for block in raw_blocks:
        text = _clean_text(block.text)
        if not text or len(text) < _MIN_BLOCK_TEXT:
            continue
        if _is_noise(text):
            continue
        cleaned.append(
            Block(
                block_id=block.block_id,
                kind=block.kind,
                text=text,
                order=order,
                source_ref=block.source_ref,
                metadata=block.metadata,
            )
        )
        order += 1

    language = _detect_language(cleaned)

    return NormalizedDocument(
        document_id=doc_id,
        family=family,
        language=language,
        title=title,
        blocks=cleaned,
        metadata=metadata,
    )


def _clean_text(text: str) -> str:
    """Remove espaços extras e caracteres de controle."""
    if not text:
        return ""
    # Remove caracteres de controle exceto newline/tab
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    # Normaliza espaços
    text = re.sub(r"[ \t]+", " ", text)
    # Remove espaços no início/fim de cada linha
    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line)
    return text.strip()


def _is_noise(text: str) -> bool:
    """Verifica se um bloco é ruído (número de página, rodapé, etc.)."""
    for pattern in _NOISE_PATTERNS:
        if pattern.match(text.lower()):
            return True
    return False


def _detect_language(blocks: list[Block]) -> str:
    """
    Detecta idioma com base em stopwords comuns.
    Retorna 'pt-BR' ou 'en'.
    """
    sample = " ".join(b.text[:200] for b in blocks[:10]).lower()
    pt_words = {"de", "e", "do", "da", "em", "que", "para", "com", "os", "as", "um", "uma", "no", "na"}
    en_words = {"the", "and", "of", "to", "in", "is", "that", "for", "it", "with", "are", "this"}

    words = set(re.findall(r"\b[a-záàâãéêíóôõúüç]+\b", sample))
    pt_score = len(words & pt_words)
    en_score = len(words & en_words)

    return "pt-BR" if pt_score >= en_score else "en"
