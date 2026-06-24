from __future__ import annotations

import re
from typing import Any, Iterable

_FONTE_START_RE = re.compile(r"\[\s*fonte\s+\d+", flags=re.I)
_SUSPECT_MOJIBAKE_TOKENS = ("Ã", "Â", "â€", "â€™", "â€œ", "â€\x9d")


def repair_mojibake(text: Any) -> str:
    base = str(text or "")
    if not base:
        return ""

    suspicious = sum(base.count(token) for token in _SUSPECT_MOJIBAKE_TOKENS)
    if suspicious < 2:
        return base

    repaired = base
    for source, target in (("latin-1", "utf-8"), ("cp1252", "utf-8")):
        try:
            # Evita perda silenciosa de caracteres (ç/acentos).
            candidate = base.encode(source).decode(target)
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if not candidate:
            continue

        repaired_suspicious = sum(candidate.count(token) for token in _SUSPECT_MOJIBAKE_TOKENS)
        if repaired_suspicious < suspicious and len(candidate) >= int(len(base) * 0.85):
            repaired = candidate
            break

    repaired_suspicious = sum(repaired.count(token) for token in _SUSPECT_MOJIBAKE_TOKENS)
    return repaired if repaired_suspicious < suspicious else base


def strip_source_markers(text: Any) -> str:
    raw = str(text or "")
    if not raw:
        return ""

    out: list[str] = []
    cursor = 0
    while True:
        match = _FONTE_START_RE.search(raw, cursor)
        if not match:
            out.append(raw[cursor:])
            break

        start = match.start()
        out.append(raw[cursor:start])

        depth = 0
        end = start
        found_closing = False
        while end < len(raw):
            char = raw[end]
            if char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    found_closing = True
                    end += 1
                    break
            end += 1

        if not found_closing:
            out.append(raw[start : start + 1])
            cursor = start + 1
            continue

        while end < len(raw) and raw[end] in {" ", "\t", "-", "—", "â€”"}:
            end += 1
        cursor = end

    return "".join(out)


def clean_extracted_text(
    text: Any,
    *,
    preserve_lines: bool = False,
    max_chars: int | None = None,
) -> str:
    cleaned = repair_mojibake(text)
    if not cleaned:
        return ""

    cleaned = cleaned.replace("\r", "\n")
    cleaned = strip_source_markers(cleaned)
    cleaned = re.sub(r"\s*---+\s*", "\n", cleaned)
    cleaned = re.sub(r"(?m)^\s*#{1,6}\s*", "", cleaned)
    cleaned = re.sub(r"\[(?:nota|observa(?:ç|c|Ã§)(?:ão|ao|Ã£o)):\s*.*?\]", "", cleaned, flags=re.I)
    cleaned = re.sub(r"([^\W\d_])(\d)", r"\1 \2", cleaned)
    cleaned = re.sub(r"(\d)([^\W\d_])", r"\1 \2", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    if preserve_lines:
        lines: list[str] = []
        for raw_line in cleaned.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip(" \t")
            line = re.sub(r"^[-*]\s*", "", line)
            if line:
                lines.append(line)
        cleaned = "\n".join(lines)
    else:
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if max_chars is not None and max_chars > 0 and len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rstrip(" ,;:-")
    return cleaned


def _normalize_for_match(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _suffix_prefix_overlap(left: str, right: str, *, min_overlap: int = 24, max_overlap: int = 220) -> int:
    left_norm = _normalize_for_match(left)
    right_norm = _normalize_for_match(right)
    if not left_norm or not right_norm:
        return 0

    cap = min(len(left_norm), len(right_norm), max_overlap)
    for size in range(cap, min_overlap - 1, -1):
        if left_norm.endswith(right_norm[:size]):
            return size
    return 0


def _looks_incomplete(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return False
    if re.search(r"[.!?…â€¦:;)]$", trimmed):
        return False
    last_token = trimmed.split(" ")[-1]
    return len(last_token) <= 3 or len(trimmed) < 80


def _looks_like_continuation(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return False
    if re.match(r"^\d+\]", trimmed):
        return True
    if trimmed[:1].islower():
        return True
    return trimmed.startswith((")", "]", ",", ";", ":", "-", "—", "â€”"))


def merge_fragmented_sections(
    sections: Iterable[str],
    *,
    min_overlap: int = 24,
    max_items: int | None = None,
) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()

    for section in sections:
        current = re.sub(r"\s+", " ", str(section or "")).strip()
        if not current:
            continue

        if not merged:
            key = _normalize_for_match(current)[:220]
            if key:
                seen.add(key)
            merged.append(current)
            continue

        previous = merged[-1]
        prev_norm = _normalize_for_match(previous)
        curr_norm = _normalize_for_match(current)

        if curr_norm in prev_norm:
            continue
        if prev_norm in curr_norm and len(curr_norm) > len(prev_norm):
            merged[-1] = current
            seen.discard(prev_norm[:220])
            seen.add(curr_norm[:220])
            continue

        overlap = _suffix_prefix_overlap(previous, current, min_overlap=min_overlap)
        if overlap > 0:
            tail = current[overlap:].lstrip()
            if tail:
                merged[-1] = f"{previous} {tail}".strip()
            continue

        if _looks_incomplete(previous) and _looks_like_continuation(current):
            merged[-1] = f"{previous} {current}".strip()
            continue

        key = curr_norm[:220]
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        merged.append(current)

        if max_items is not None and len(merged) >= max_items:
            break

    return merged if max_items is None else merged[:max_items]


def expand_sections(
    raw_sections: Any,
    *,
    max_items: int = 10,
    section_max_chars: int = 360,
    min_chars: int = 12,
) -> list[str]:
    if isinstance(raw_sections, list):
        candidates = [str(item) for item in raw_sections if str(item).strip()]
    elif isinstance(raw_sections, str):
        candidates = [raw_sections]
    else:
        candidates = []

    extracted: list[str] = []
    for raw in candidates:
        prepared = clean_extracted_text(raw, max_chars=12_000, preserve_lines=True)
        if not prepared:
            continue

        parts = [part.strip() for part in re.split(r"\n{2,}", prepared) if part.strip()]
        if len(parts) <= 1:
            parts = [
                part.strip()
                for part in re.split(r"(?<=[.!?;])\s+(?=[A-Z0-9ÁÀÂÃÉÊÍÓÔÕÚÜÇ])", prepared)
                if part.strip()
            ]
        if not parts:
            parts = [prepared]

        for part in parts:
            clean = clean_extracted_text(part, max_chars=section_max_chars, preserve_lines=False)
            if len(clean) < min_chars:
                continue
            extracted.append(clean)

    merged = merge_fragmented_sections(extracted, max_items=max_items * 2)
    deduped: list[str] = []
    seen: set[str] = set()
    for item in merged:
        key = _normalize_for_match(item)[:220]
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= max_items:
            break
    return deduped


def normalize_points(raw_points: Any, *, max_items: int = 4, fallback: str = "Conceito principal do tópico") -> list[str]:
    points = expand_sections(raw_points, max_items=max_items, section_max_chars=180, min_chars=8)
    return points or [fallback]


def normalize_script(raw_text: Any, *, max_chars: int = 1500) -> str:
    base = clean_extracted_text(raw_text, max_chars=max_chars * 2, preserve_lines=True)
    if not base:
        return ""

    sections = expand_sections([base], max_items=6, section_max_chars=240, min_chars=8)
    if not sections:
        return clean_extracted_text(base, max_chars=max_chars, preserve_lines=False)

    merged = merge_fragmented_sections(sections, max_items=6)
    return clean_extracted_text(" ".join(merged), max_chars=max_chars, preserve_lines=False)


def split_text_chunks(
    text: Any,
    *,
    window: int = 1_000,
    overlap: int = 180,
    min_chunk_chars: int = 20,
) -> list[str]:
    cleaned = clean_extracted_text(text, preserve_lines=True)
    if not cleaned:
        return []

    units = [part.strip() for part in re.split(r"\n{2,}", cleaned) if part.strip()]
    if not units:
        units = [part.strip() for part in cleaned.splitlines() if part.strip()]

    chunks: list[str] = []
    current = ""
    for unit in units:
        candidate = f"{current}\n{unit}".strip() if current else unit
        if len(candidate) <= window:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(unit) <= window:
            current = unit
            continue

        step = max(120, window - overlap)
        start = 0
        while start < len(unit):
            end = min(len(unit), start + window)
            if end < len(unit):
                split_at = max(
                    unit.rfind(". ", start + 120, end),
                    unit.rfind("; ", start + 120, end),
                    unit.rfind("\n", start + 120, end),
                )
                if split_at > start:
                    end = split_at + 1
            piece = unit[start:end].strip()
            if piece:
                chunks.append(piece)
            if end >= len(unit):
                break
            start = max(start + 1, end - overlap, start + step)

    if current:
        chunks.append(current)

    merged = merge_fragmented_sections(chunks, max_items=None)

    dedup: list[str] = []
    seen: set[str] = set()
    for chunk in merged:
        normalized = re.sub(r"\s+", " ", chunk).strip()
        if len(normalized) < min_chunk_chars:
            continue
        key = normalized[:180].lower()
        if key in seen:
            continue
        seen.add(key)
        dedup.append(normalized)

    return dedup
