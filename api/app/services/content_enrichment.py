from __future__ import annotations

import re
from typing import Any

from app.core.settings import Settings
from app.services.llm import JsonLLMService

_MAX_BLOCKS = 24
_MAX_SEGMENT_CHARS = 4_000


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _split_sections(value: Any) -> list[str]:
    raw = str(value or "").strip()
    if not raw:
        return []
    sections = [
        re.sub(r"\s+", " ", part).strip(" \t\r\n-*#")
        for part in re.split(r"\n\s*\n|(?=^#{1,4}\s+)", raw, flags=re.MULTILINE)
    ]
    return [section[:_MAX_SEGMENT_CHARS] for section in sections if section]


def _source_segments(context: dict[str, Any]) -> list[dict[str, Any]]:
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    contents = class_content.get("conteudos") if isinstance(class_content.get("conteudos"), list) else []
    activities = class_content.get("atividades") if isinstance(class_content.get("atividades"), list) else []
    sources = context.get("fontes_contexto") if isinstance(context.get("fontes_contexto"), list) else []

    segments: list[dict[str, Any]] = []

    def append(*, source_id: str, title: str, body: Any, kind: str) -> None:
        for order, section in enumerate(_split_sections(body), start=1):
            segments.append(
                {
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
        body=topic.get("descricao") or topic.get("objetivo"),
        kind="topic",
    )
    for item in contents:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") or len(segments) + 1
        append(
            source_id=f"conteudo:{item_id}",
            title=_text(item.get("titulo") or item.get("nome")) or f"Conteúdo {item_id}",
            body=item.get("conteudo") or item.get("descricao"),
            kind="content",
        )
    for item in activities:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id") or len(segments) + 1
        append(
            source_id=f"atividade:{item_id}",
            title=_text(item.get("titulo")) or f"Atividade {item_id}",
            body=item.get("enunciado") or item.get("descricao"),
            kind="activity",
        )
    for item in sources:
        if not isinstance(item, dict):
            continue
        append(
            source_id=_text(item.get("source_id") or f"fonte:{item.get('id') or len(segments) + 1}"),
            title=_text(item.get("titulo") or item.get("nome_arquivo")) or "Fonte complementar",
            body=item.get("texto_extraido") or item.get("texto_base") or item.get("descricao"),
            kind=_text(item.get("tipo")) or "source",
        )

    return segments[:_MAX_BLOCKS]


def _fallback_blocks(context: dict[str, Any], segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    theme = _text(topic.get("nome") or topic.get("titulo")) or "Conteúdo de estudo"
    objective = _text(topic.get("objetivo") or topic.get("descricao"))
    if not segments:
        segments = [
            {
                "source_id": f"topico:{context.get('topico_id') or 0}",
                "source_kind": "topic",
                "source_title": theme,
                "source_order": 1,
                "text": objective or theme,
            }
        ]

    blocks: list[dict[str, Any]] = []
    for index, segment in enumerate(segments, start=1):
        blocks.append(
            {
                "id": f"bloco-{index:02d}",
                "ordem": index,
                "tema": theme,
                "topico": segment["source_title"],
                "objetivos": [objective] if objective else [],
                "conteudo_base": segment["text"],
                "conteudo_aprofundado": segment["text"],
                "conceitos_chave": [],
                "exemplos_contextos": [],
                "ponte_proximo_bloco": "",
                "source_ids": [segment["source_id"]],
            }
        )
    return blocks


def _normalize_blocks(raw: Any, fallback: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidate = raw.get("blocos") if isinstance(raw, dict) else None
    if not isinstance(candidate, list):
        return fallback

    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(candidate[:_MAX_BLOCKS], start=1):
        if not isinstance(item, dict):
            continue
        base = _text(item.get("conteudo_base"))
        expanded = _text(item.get("conteudo_aprofundado"))
        if not base and not expanded:
            continue
        source_ids = [
            _text(value)
            for value in (item.get("source_ids") or [])
            if _text(value)
        ]
        normalized.append(
            {
                "id": _text(item.get("id")) or f"bloco-{index:02d}",
                "ordem": index,
                "tema": _text(item.get("tema")),
                "topico": _text(item.get("topico")) or f"Bloco {index}",
                "objetivos": [_text(value) for value in (item.get("objetivos") or []) if _text(value)],
                "conteudo_base": base or expanded,
                "conteudo_aprofundado": expanded or base,
                "conceitos_chave": [
                    _text(value) for value in (item.get("conceitos_chave") or []) if _text(value)
                ],
                "exemplos_contextos": [
                    _text(value) for value in (item.get("exemplos_contextos") or []) if _text(value)
                ],
                "ponte_proximo_bloco": _text(item.get("ponte_proximo_bloco")),
                "source_ids": source_ids,
            }
        )
    return normalized or fallback


async def enrich_content_blocks(
    *,
    context: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Decompõe e aprofunda o conteúdo uma vez, antes da adaptação BrainHex."""
    segments = _source_segments(context)
    fallback = _fallback_blocks(context, segments)
    class_content = context.get("conteudo_classe") if isinstance(context.get("conteudo_classe"), dict) else {}
    topic = class_content.get("topico") if isinstance(class_content.get("topico"), dict) else {}
    llm = JsonLLMService(settings)
    raw = await llm.ainvoke_json(
        prompt_name="enriquecedor_blocos_conteudo.txt",
        provider="gemini",
        payload={
            "tema": {
                "titulo": _text(topic.get("nome") or topic.get("titulo")),
                "descricao": _text(topic.get("descricao")),
                "objetivo": _text(topic.get("objetivo")),
            },
            "segmentos_origem": segments,
            "regras": {
                "preservar_ordem": True,
                "nao_omitir_segmentos": True,
                "aprofundar_sem_desviar": True,
                "idioma": "pt-BR",
            },
        },
        fallback_factory=lambda: {"blocos": fallback},
    )
    blocks = _normalize_blocks(raw, fallback)
    return {
        "schema_version": "trailup.content-blocks.v1",
        "source_hash": str(context.get("source_hash") or ""),
        "tema": _text(topic.get("nome") or topic.get("titulo")) or "Conteúdo de estudo",
        "blocos": blocks,
        "metadata": {
            "segmentos_origem": len(segments),
            "blocos_gerados": len(blocks),
            "fallback": blocks == fallback,
        },
    }
