from __future__ import annotations

import math
import re
from typing import Any

import httpx

from app.core.settings import Settings

_MAX_BLOCKS = 24
_MAX_SEGMENT_CHARS = 4_000
_MIN_EXPANSION_CHARS = 80
_MIN_EXPANSION_RATIO = 0.15
_SCHEMA_VERSION = "trailup.content-blocks.v2"


class ContentEnrichmentError(RuntimeError):
    """Falha que deve interromper a geração de mídia, nunca produzir fallback raso."""


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _join_fields(*values: tuple[str, Any]) -> str:
    """Combina todos os campos informativos sem descartar os campos secundários."""
    parts: list[str] = []
    seen: set[str] = set()
    for label, value in values:
        normalized = str(value or "").strip()
        signature = _text(normalized).casefold()
        if not normalized or signature in seen:
            continue
        seen.add(signature)
        parts.append(f"{label}:\n{normalized}" if label else normalized)
    return "\n\n".join(parts)


def _chunk_without_truncation(value: str) -> list[str]:
    """Divide um trecho grande em limites naturais sem omitir caracteres."""
    remaining = value.strip()
    chunks: list[str] = []
    while len(remaining) > _MAX_SEGMENT_CHARS:
        boundary = remaining.rfind(" ", 0, _MAX_SEGMENT_CHARS + 1)
        if boundary < (_MAX_SEGMENT_CHARS // 2):
            boundary = _MAX_SEGMENT_CHARS
        chunk = remaining[:boundary].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[boundary:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


def _split_sections(value: Any) -> list[str]:
    raw = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        return []
    sections = [
        part.strip() for part in re.split(r"\n[ \t]*\n|(?=^#{1,4}[ \t]+)", raw, flags=re.MULTILINE) if part.strip()
    ]
    chunks: list[str] = []
    for section in sections:
        chunks.extend(_chunk_without_truncation(section))
    return chunks


def _source_segments(context: dict[str, Any]) -> list[dict[str, Any]]:
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    contents = class_content.get("conteudos") if isinstance(class_content.get("conteudos"), list) else []
    activities = class_content.get("atividades") if isinstance(class_content.get("atividades"), list) else []
    sources = context.get("fontes_contexto") if isinstance(context.get("fontes_contexto"), list) else []

    segments: list[dict[str, Any]] = []

    def append(*, source_id: str, title: str, body: Any, kind: str) -> None:
        sections = _split_sections(body)
        for order, section in enumerate(sections, start=1):
            segments.append(
                {
                    "segment_id": f"segmento-{len(segments) + 1:04d}",
                    "source_id": source_id,
                    "source_kind": kind,
                    "source_title": title or source_id,
                    "source_order": order,
                    "text": section,
                }
            )

    append(
        source_id=f"topico:{context.get('topico_id') or 0}",
        title=_text(topic.get("nome") or topic.get("titulo")) or "Tema",
        body=_join_fields(
            ("Descrição", topic.get("descricao")),
            ("Objetivo", topic.get("objetivo")),
        ),
        kind="topic",
    )
    for item in contents:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") or len(segments) + 1
        append(
            source_id=f"conteudo:{item_id}",
            title=_text(item.get("titulo") or item.get("nome")) or f"Conteúdo {item_id}",
            body=_join_fields(
                ("Conteúdo", item.get("conteudo")),
                ("Texto extraído", item.get("texto_extraido")),
                ("Descrição", item.get("descricao")),
                ("Resumo", item.get("resumo")),
            ),
            kind="content",
        )
    for item in activities:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") or len(segments) + 1
        append(
            source_id=f"atividade:{item_id}",
            title=_text(item.get("titulo")) or f"Atividade {item_id}",
            body=_join_fields(
                ("Enunciado", item.get("enunciado")),
                ("Descrição", item.get("descricao")),
                ("Orientações", item.get("orientacoes")),
            ),
            kind="activity",
        )
    for item in sources:
        if not isinstance(item, dict):
            continue
        source_id = _text(item.get("source_id") or f"fonte:{item.get('id') or len(segments) + 1}")
        append(
            source_id=source_id,
            title=_text(item.get("titulo") or item.get("nome_arquivo")) or "Fonte complementar",
            body=_join_fields(
                ("Texto extraído", item.get("texto_extraido")),
                ("Texto-base", item.get("texto_base")),
                ("Descrição", item.get("descricao")),
            ),
            kind=_text(item.get("tipo")) or "source",
        )

    return segments


def _unique_texts(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _text(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _group_segments(
    context: dict[str, Any],
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Agrupa sequencialmente em no máximo 24 blocos, mantendo todos os segmentos."""
    if not segments:
        raise ContentEnrichmentError("Nenhum texto-base foi encontrado para decompor e aprofundar.")

    group_count = min(_MAX_BLOCKS, len(segments))
    groups: list[list[dict[str, Any]]] = []
    cursor = 0
    for group_index in range(group_count):
        remaining_groups = group_count - group_index
        remaining = segments[cursor:]
        remaining_chars = sum(len(str(item.get("text") or "")) for item in remaining)
        target_chars = max(1, math.ceil(remaining_chars / remaining_groups))
        group: list[dict[str, Any]] = []
        group_chars = 0

        while cursor < len(segments):
            segments_after = len(segments) - (cursor + 1)
            groups_after = remaining_groups - 1
            if group and group_chars >= target_chars:
                break
            if group and segments_after < groups_after:
                break
            segment = segments[cursor]
            group.append(segment)
            group_chars += len(str(segment.get("text") or ""))
            cursor += 1

        groups.append(group)

    if cursor != len(segments) or any(not group for group in groups):
        raise ContentEnrichmentError("Falha interna ao agrupar todos os segmentos de origem.")

    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    theme = _text(topic.get("nome") or topic.get("titulo")) or "Conteúdo de estudo"
    objective = _text(topic.get("objetivo"))

    blocks: list[dict[str, Any]] = []
    for index, group in enumerate(groups, start=1):
        titles = _unique_texts([item.get("source_title") for item in group])
        source_ids = _unique_texts([item.get("source_id") for item in group])
        base_parts: list[str] = []
        for segment in group:
            label = _text(segment.get("source_title"))
            order = int(segment.get("source_order") or 1)
            base_parts.append(f"[{label} — trecho {order}]\n{str(segment.get('text') or '').strip()}")
        blocks.append(
            {
                "id": f"bloco-{index:02d}",
                "ordem": index,
                "tema": theme,
                "topico": " + ".join(titles) or f"Bloco {index}",
                "objetivos": [objective] if objective else [],
                "conteudo_base": "\n\n".join(base_parts),
                "source_ids": source_ids,
                "segment_ids": [str(item["segment_id"]) for item in group],
            }
        )
    return blocks


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return _unique_texts(value)


def _minimum_expanded_length(base: str) -> int:
    return len(base) + max(
        _MIN_EXPANSION_CHARS,
        math.ceil(len(base) * _MIN_EXPANSION_RATIO),
    )


def _validate_enrichment_response(
    *,
    raw: Any,
    base_blocks: list[dict[str, Any]],
    source_hash: str,
) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ContentEnrichmentError("Microserviço retornou enriquecimento fora do formato JSON.")
    if raw.get("schema_version") != _SCHEMA_VERSION:
        raise ContentEnrichmentError("Microserviço retornou versão inválida do enriquecimento.")
    if str(raw.get("source_hash") or "") != source_hash:
        raise ContentEnrichmentError("Microserviço retornou enriquecimento de outra fonte.")
    metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    if metadata.get("fallback") is not False:
        raise ContentEnrichmentError("Microserviço não confirmou enriquecimento real via Gemini.")

    candidates = raw.get("blocos")
    if not isinstance(candidates, list) or len(candidates) != len(base_blocks):
        raise ContentEnrichmentError("Enriquecimento não preservou todos os blocos de conteúdo.")

    by_id: dict[str, dict[str, Any]] = {}
    for item in candidates:
        if not isinstance(item, dict):
            raise ContentEnrichmentError("Enriquecimento contém bloco inválido.")
        item_id = _text(item.get("id"))
        if not item_id or item_id in by_id:
            raise ContentEnrichmentError("Enriquecimento contém bloco sem identidade única.")
        by_id[item_id] = item

    normalized: list[dict[str, Any]] = []
    covered_sources: set[str] = set()
    expected_sources: set[str] = set()
    for index, base_block in enumerate(base_blocks, start=1):
        block_id = str(base_block["id"])
        item = by_id.get(block_id)
        if item is None:
            raise ContentEnrichmentError(f"Enriquecimento omitiu o bloco {block_id}.")

        base = _text(base_block.get("conteudo_base"))
        response_base = _text(item.get("conteudo_base"))
        expanded = _text(item.get("conteudo_aprofundado"))
        conceitos = _normalize_string_list(item.get("conceitos_chave"))
        exemplos = _normalize_string_list(item.get("exemplos_contextos"))
        objetivos = _normalize_string_list(item.get("objetivos"))
        expected_block_sources = set(_normalize_string_list(base_block.get("source_ids")))
        returned_sources = set(_normalize_string_list(item.get("source_ids")))

        if response_base != base:
            raise ContentEnrichmentError(f"Enriquecimento alterou o conteúdo-base do bloco {block_id}.")
        if returned_sources != expected_block_sources:
            raise ContentEnrichmentError(f"Enriquecimento perdeu a rastreabilidade do bloco {block_id}.")
        if expanded.casefold() == base.casefold():
            raise ContentEnrichmentError(f"Enriquecimento raso: o bloco {block_id} apenas repetiu o original.")
        if len(expanded) < _minimum_expanded_length(base):
            raise ContentEnrichmentError(f"Enriquecimento insuficiente no bloco {block_id}: conteúdo não foi ampliado.")
        if len(conceitos) < 2 or not exemplos or not objetivos:
            raise ContentEnrichmentError(
                f"Enriquecimento insuficiente no bloco {block_id}: faltam conceitos, objetivos ou exemplos."
            )

        expected_sources.update(expected_block_sources)
        covered_sources.update(returned_sources)
        normalized.append(
            {
                "id": block_id,
                "ordem": index,
                "tema": _text(item.get("tema")) or str(base_block.get("tema") or ""),
                "topico": _text(item.get("topico")) or str(base_block.get("topico") or f"Bloco {index}"),
                "objetivos": objetivos,
                "conteudo_base": base,
                "conteudo_aprofundado": expanded,
                "conceitos_chave": conceitos,
                "exemplos_contextos": exemplos,
                "ponte_proximo_bloco": _text(item.get("ponte_proximo_bloco")),
                "source_ids": _normalize_string_list(base_block.get("source_ids")),
            }
        )

    if covered_sources != expected_sources:
        raise ContentEnrichmentError("Enriquecimento não cobre todas as fontes usadas na decomposição.")
    return normalized


async def enrich_content_blocks(
    *,
    context: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Decompõe toda a origem e exige aprofundamento remoto antes de qualquer mídia."""
    segments = _source_segments(context)
    base_blocks = _group_segments(context, segments)
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    source_hash = str(context.get("source_hash") or "")
    brainhex_url = str(getattr(settings, "brainhex_api_url", "") or "").strip()
    if not brainhex_url:
        raise ContentEnrichmentError("BRAINHEX_API_URL ausente: não é possível aprofundar o conteúdo.")

    secret = str(getattr(settings, "brainhex_api_secret", "") or "").strip()
    headers = {"x-api-secret": secret} if secret else None
    configured_timeout = int(getattr(settings, "brainhex_api_wait_timeout_sec", 600) or 600)
    timeout_seconds = min(900, max(60, configured_timeout))
    payload = {
        "schema_version": _SCHEMA_VERSION,
        "source_hash": source_hash,
        "tema": {
            "titulo": _text(topic.get("nome") or topic.get("titulo")),
            "descricao": _text(topic.get("descricao")),
            "objetivo": _text(topic.get("objetivo")),
        },
        "blocos_base": base_blocks,
        "regras": {
            "idioma": "pt-BR",
            "preservar_ordem": True,
            "nao_omitir_fontes": True,
            "aprofundar_sem_desviar": True,
            "minimo_conceitos_por_bloco": 2,
            "minimo_exemplos_por_bloco": 1,
        },
    }

    try:
        timeout = httpx.Timeout(timeout_seconds, connect=min(60.0, timeout_seconds))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{brainhex_url.rstrip('/')}/api/enrich-content",
                json=payload,
                headers=headers,
            )
    except Exception as exc:
        raise ContentEnrichmentError("Falha ao conectar ao microserviço para aprofundar o conteúdo.") from exc

    if response.status_code != 200:
        detail = response.text[:500].strip()
        raise ContentEnrichmentError(f"Microserviço recusou o enriquecimento (HTTP {response.status_code}): {detail}")
    try:
        raw = response.json()
    except Exception as exc:
        raise ContentEnrichmentError("Microserviço retornou enriquecimento sem JSON válido.") from exc

    blocks = _validate_enrichment_response(
        raw=raw,
        base_blocks=base_blocks,
        source_hash=source_hash,
    )
    return {
        "schema_version": _SCHEMA_VERSION,
        "source_hash": source_hash,
        "tema": _text(topic.get("nome") or topic.get("titulo")) or "Conteúdo de estudo",
        "blocos": blocks,
        "metadata": {
            "segmentos_origem": len(segments),
            "blocos_gerados": len(blocks),
            "fontes_cobertas": len({source_id for block in base_blocks for source_id in block.get("source_ids") or []}),
            "fallback": False,
            "provider": "brainhex-gemini",
        },
    }
