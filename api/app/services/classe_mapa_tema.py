from __future__ import annotations

import hashlib
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.repositories.classe_mapa_tema import ClasseMapaTemaRepository
from app.services.llm import JsonLLMService

_PROMPT_NAME = "classe_mapa_tema.txt"

_DEFAULT_PALETTE: dict[str, str] = {
    "skyTop": "#171611",
    "skyBottom": "#4b4030",
    "sea": "#233544",
    "seaDeep": "#0c141b",
    "route": "#c99f58",
    "routeGlow": "#eedbb0",
    "countryLocked": "#5e5b53",
    "countryOpen": "#6d624b",
    "countryDone": "#557763",
    "countryCurrent": "#c48834",
    "borderLocked": "#9b907b",
    "borderOpen": "#ead9b2",
    "borderDone": "#d2efd9",
    "borderCurrent": "#fff0c4",
    "marker": "#f5ecd8",
    "markerText": "#2b2117",
    "textPrimary": "#f6ebd8",
    "textSecondary": "#deceb1",
    "panelBg": "rgba(34,27,20,0.84)",
    "panelBorder": "rgba(216,182,121,0.34)",
}

_EMBLEMS = [
    "compass-rose",
    "shield-outline",
    "castle",
    "book-open-page-variant",
    "chip",
    "leaf",
    "sword-cross",
]

_BIOMES = [
    "vales de aprendizado",
    "ilhas de estudo",
    "fronteiras de pratica",
    "planicies de revisao",
    "mares de conceitos",
]


def _as_text(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def _short_text(value: Any, limit: int) -> str:
    text = re.sub(r"\s+", " ", _as_text(value)).strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _slugify(value: str, fallback: str = "classe-tema") -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", _as_text(value).lower()).strip("-")
    return normalized[:48] or fallback


def _stable_pick(seed: str, options: list[str]) -> str:
    if not options:
        return ""
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    index = int(digest[:8], 16) % len(options)
    return options[index]


def _build_fallback_theme(context: dict[str, Any]) -> dict[str, Any]:
    classe_id = int(context.get("classe_id") or 0)
    materia_nome = _as_text(context.get("materia_nome"), "Classe")
    classe_descricao = _as_text(context.get("classe_descricao"))
    topicos = list(context.get("topicos") or [])

    world_name = f"Reinos de {materia_nome}"
    world_subtitle = "Mapa principal da jornada de aprendizagem da turma."
    world_description = (
        f"Cada territorio representa um topico da classe. "
        f"Avance pelas rotas para consolidar conceitos e evoluir no percurso."
    )
    if classe_descricao:
        world_description = f"{_short_text(classe_descricao, 160)} {world_description}"

    countries: dict[str, dict[str, Any]] = {}
    for idx, topico in enumerate(topicos, start=1):
        topic_id = int(topico.get("id") or idx)
        node_id = str(topic_id)
        topic_title = _as_text(topico.get("nome"), f"Topico {idx}")
        compact = _short_text(topic_title, 56) or f"Topico {idx}"

        countries[node_id] = {
            "nodeId": node_id,
            "topicId": topic_id,
            "topicTitle": topic_title,
            "countryName": f"Reino de {compact}",
            "capitalName": f"Cidade de {compact}",
            "lore": (
                f"{compact} guarda os fundamentos de {_as_text(materia_nome, 'estudo').lower()} "
                f"e prepara a rota para os proximos desafios."
            ),
            "emblem": _stable_pick(f"{classe_id}:{topic_id}:emblem", _EMBLEMS),
            "biome": _stable_pick(f"{classe_id}:{topic_id}:biome", _BIOMES),
        }

    return {
        "world_name": _short_text(world_name, 90),
        "world_subtitle": _short_text(world_subtitle, 160),
        "world_description": _short_text(world_description, 420),
        "template_id": _slugify(f"{materia_nome}-trailup"),
        "palette": dict(_DEFAULT_PALETTE),
        "countries": countries,
    }


def _normalize_palette(value: Any) -> dict[str, str]:
    raw = value if isinstance(value, dict) else {}
    normalized: dict[str, str] = {}
    for key, fallback in _DEFAULT_PALETTE.items():
        candidate = _as_text(raw.get(key) if isinstance(raw, dict) else None, fallback)
        normalized[key] = candidate
    return normalized


def _normalize_country_entry(
    *,
    node_id: str,
    topic_id: int | None,
    topic_title: str,
    value: dict[str, Any] | None,
    classe_id: int,
) -> dict[str, Any]:
    raw = value or {}
    safe_title = _as_text(raw.get("topicTitle") or raw.get("topic_title"), topic_title)
    if not safe_title:
        safe_title = topic_title or f"Topico {node_id}"

    return {
        "nodeId": node_id,
        "topicId": topic_id,
        "topicTitle": _short_text(safe_title, 96),
        "countryName": _short_text(
            raw.get("countryName") or raw.get("country_name") or f"Reino de {safe_title}",
            120,
        ),
        "capitalName": _short_text(
            raw.get("capitalName") or raw.get("capital_name") or f"Cidade de {safe_title}",
            120,
        ),
        "lore": _short_text(
            raw.get("lore") or raw.get("description") or f"{safe_title} representa um eixo central da jornada da turma.",
            420,
        ),
        "emblem": _as_text(raw.get("emblem"), _stable_pick(f"{classe_id}:{node_id}:emblem", _EMBLEMS)),
        "biome": _as_text(raw.get("biome"), _stable_pick(f"{classe_id}:{node_id}:biome", _BIOMES)),
    }


def _normalize_countries(raw: Any, context: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    topicos = list(context.get("topicos") or [])
    classe_id = int(context.get("classe_id") or 0)

    expected_by_node: dict[str, tuple[int | None, str]] = {}
    for idx, topico in enumerate(topicos, start=1):
        topic_id = int(topico.get("id") or idx)
        node_id = str(topic_id)
        expected_by_node[node_id] = (topic_id, _as_text(topico.get("nome"), f"Topico {idx}"))

    normalized: dict[str, Any] = {}
    raw_obj = raw if isinstance(raw, dict) else {}
    for node_id, (topic_id, topic_title) in expected_by_node.items():
        candidate = raw_obj.get(node_id) if isinstance(raw_obj, dict) else None
        if isinstance(candidate, dict):
            normalized[node_id] = _normalize_country_entry(
                node_id=node_id,
                topic_id=topic_id,
                topic_title=topic_title,
                value=candidate,
                classe_id=classe_id,
            )
            continue

        fallback_entry = (fallback.get("countries") or {}).get(node_id) if isinstance(fallback.get("countries"), dict) else None
        normalized[node_id] = _normalize_country_entry(
            node_id=node_id,
            topic_id=topic_id,
            topic_title=topic_title,
            value=fallback_entry if isinstance(fallback_entry, dict) else None,
            classe_id=classe_id,
        )

    return normalized


def _normalize_theme(raw: Any, context: dict[str, Any]) -> dict[str, Any]:
    fallback = _build_fallback_theme(context)
    if not isinstance(raw, dict):
        return fallback

    world_name = _short_text(raw.get("world_name") or raw.get("worldName"), 90) or fallback["world_name"]
    world_subtitle = _short_text(raw.get("world_subtitle") or raw.get("worldSubtitle"), 160) or fallback["world_subtitle"]
    world_description = _short_text(
        raw.get("world_description") or raw.get("worldDescription"),
        420,
    ) or fallback["world_description"]
    template_id = _slugify(
        _as_text(raw.get("template_id") or raw.get("templateId"), str(fallback["template_id"])),
        fallback=str(fallback["template_id"]),
    )

    return {
        "world_name": world_name,
        "world_subtitle": world_subtitle,
        "world_description": world_description,
        "template_id": template_id,
        "palette": _normalize_palette(raw.get("palette")),
        "countries": _normalize_countries(raw.get("countries"), context, fallback),
    }


async def gerar_classe_mapa_tema(
    *,
    session: AsyncSession,
    settings: Settings,
    classe_id: int,
    trigger_source: str = "api",
) -> dict[str, Any]:
    repo = ClasseMapaTemaRepository(session)
    context = await repo.buscar_contexto_classe(classe_id)
    if not context:
        raise RuntimeError(f"Classe {classe_id} nao encontrada.")

    fallback = _build_fallback_theme(context)
    llm = JsonLLMService(settings)
    raw = await llm.ainvoke_json(
        prompt_name=_PROMPT_NAME,
        payload={
            "classe": {
                "id": context["classe_id"],
                "descricao": context.get("classe_descricao"),
                "materia_nome": context.get("materia_nome"),
                "materia_descricao": context.get("materia_descricao"),
            },
            "topicos": [
                {
                    "id": int(item.get("id") or 0),
                    "nome": item.get("nome"),
                    "descricao": item.get("descricao"),
                    "ordem": item.get("ordem"),
                }
                for item in (context.get("topicos") or [])
            ],
            "constraints": {
                "trigger_source": trigger_source,
                "min_topicos": len(context.get("topicos") or []),
            },
        },
        fallback_factory=lambda: fallback,
        provider="gemini",
    )

    normalized = _normalize_theme(raw, context)
    saved = await repo.upsert(
        classe_id=int(context["classe_id"]),
        world_name=str(normalized["world_name"]),
        world_subtitle=str(normalized.get("world_subtitle") or ""),
        world_description=str(normalized.get("world_description") or ""),
        template_id=str(normalized.get("template_id") or ""),
        palette=dict(normalized.get("palette") or {}),
        countries=dict(normalized.get("countries") or {}),
    )
    return {"record": saved, "context": context}

