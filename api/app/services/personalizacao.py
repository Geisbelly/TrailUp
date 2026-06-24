from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import mimetypes
import re
import unicodedata
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.settings import Settings
from app.ingestion.pipeline import ingest_source as _ingest_source
from app.ingestion.semantic_chunker import chunks_to_plain_text as _chunks_to_plain_text
from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.context import ContextRepository
from app.repositories.fontes_personalizacao import FontesPersonalizacaoRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository
from app.services.behavioral_personalization import build_behavioral_personalization
from app.services.llm import JsonLLMService, load_prompt
from app.services.media_agents import disparar_brainhex_async
from app.services.media_pipeline import MultiOutputPipeline
from app.services.storage import SupabaseStorage, build_public_storage_url
from app.services.text_cleanup import (
    clean_extracted_text,
    expand_sections,
    split_text_chunks,
)

logger = logging.getLogger(__name__)
_CONTEUDOS_BUCKET = "conteudos"
_CONTEUDO_ALUNO_BUCKET = "conteudo_aluno"

_FALLBACK_PLANO: dict[str, Any] = {
    "formato_prioritario": "cards",
    "formatos": ["cards", "quiz"],
    "nivel": "equilibrado",
    "tom": "neutro",
    "estilo": "direto",
    "justificativa": "Plano padr\u00e3o por indisponibilidade do LLM.",
    "refresh_policy": {"mode": "once", "trigger_actions": []},
}

_ALL_FORMATOS = {"markdown", "cards", "audio", "apresentacao"}
_FAST_FORMATOS = {"cards"}
_MEDIA_FORMATOS = {"audio", "apresentacao", "markdown"}
_PIPELINE_CORE_FORMATOS = ("cards", "apresentacao", "audio", "markdown")
_MIN_PERSONALIZED_ITEMS = 5
_MAX_PERSONALIZED_ITEMS = 15
_DEFAULT_GEMINI_MULTIMODAL_PRIMARY = "gemini-2.5-flash"
_DEFAULT_GEMINI_MULTIMODAL_FALLBACK = "gemini-2.5-flash-lite"
_PERSONALIZACAO_MEDIA_RENDER_JOB_KIND = "media_render"
_PERSONALIZACAO_MEDIA_RENDER_JOB_LEGACY_KIND = "personalizacao_media_render"
_CHUNK_WINDOW = 1_000
_CHUNK_OVERLAP = 180
_MIDIA_PIPELINE_STAGES = ("estudo_conteudo", "planejamento", "estilizacao", "revisao", "correcao")
_MIDIA_PIPELINE_PROMPT = "pipeline_midia_etapas.txt"
_VISUAL_ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets" / "ImagensReferencia"
_QUALITY_REVIEW_STATUS_OK = {"ok", "aprovado", "pass"}
_QUALITY_REVIEW_STATUS_ADJUST = {"ajustar", "adjust", "revisar", "fix"}
_CONTENT_COMPLEXITY_LEVELS = ("curto", "medio", "longo")
_ADAPTIVE_SIZE_TARGETS: dict[str, dict[str, int]] = {
    "curto": {
        "slides_min": 4,
        "slides_max": 6,
        "secoes_min": 4,
        "secoes_max": 6,
        "audio_min_seg": 45,
        "audio_max_seg": 70,
        "video_min_seg": 55,
        "video_max_seg": 80,
    },
    "medio": {
        "slides_min": 6,
        "slides_max": 8,
        "secoes_min": 6,
        "secoes_max": 8,
        "audio_min_seg": 70,
        "audio_max_seg": 95,
        "video_min_seg": 75,
        "video_max_seg": 105,
    },
    "longo": {
        "slides_min": 8,
        "slides_max": 10,
        "secoes_min": 8,
        "secoes_max": 10,
        "audio_min_seg": 95,
        "audio_max_seg": 130,
        "video_min_seg": 100,
        "video_max_seg": 140,
    },
}

_PROFILE_VISUAL_REFERENCES: dict[str, dict[str, Any]] = {
    "Seeker": {
        "cores": {"primaria": "#A78C07", "secundaria": "#2A1D0A", "destaque": "#E2C454"},
        "icone": "rosa_dos_ventos",
        "imagem": "rosa_dos_ventos_filter.png",
    },
    "Survivor": {
        "cores": {"primaria": "#720101", "secundaria": "#290808", "destaque": "#C96B6B"},
        "icone": "cacador",
        "imagem": "cacador_filter.png",
    },
    "Daredevil": {
        "cores": {"primaria": "#1B6B1B", "secundaria": "#0F2E12", "destaque": "#72C172"},
        "icone": "espada",
        "imagem": "espada_filter.png",
    },
    "Mastermind": {
        "cores": {"primaria": "#707C88", "secundaria": "#1D232B", "destaque": "#B5C0CC"},
        "icone": "coruja",
        "imagem": "coruja_filter.png",
    },
    "Conqueror": {
        "cores": {"primaria": "#01808B", "secundaria": "#07292E", "destaque": "#66C7CF"},
        "icone": "coroa",
        "imagem": "coroa_filter.png",
    },
    "Socialiser": {
        "cores": {"primaria": "#6D15BE", "secundaria": "#250B3D", "destaque": "#B68AE0"},
        "icone": "coracao",
        "imagem": "coracao_filter.png",
    },
    "Achiever": {
        "cores": {"primaria": "#AD6002", "secundaria": "#3B2207", "destaque": "#E0AE70"},
        "icone": "arte",
        "imagem": "arte_filter.png",
    },
}

_BRAINHEX_EDITORIAL_SIGNATURES: dict[str, dict[str, Any]] = {
    "Seeker": {
        "tom_voz": "curioso e explorat\u00f3rio",
        "ritmo": "medio",
        "abertura_estilo": "pergunta instigante",
        "convencimento_estilo": "descoberta guiada por pistas",
        "progressao_narrativa": "descoberta",
        "fechamento_estilo": "convite \u00e0 explora\u00e7\u00e3o aut\u00f4noma",
        "narrativa_preferencial": "descoberta",
        "marcadores_linguisticos": ["explorar", "descobrir", "mapear", "pistas"],
        "proibicoes_estilo": ["tom burocr\u00e1tico", "excesso de jarg\u00e3o sem contexto"],
    },
    "Survivor": {
        "tom_voz": "pragm\u00e1tico e seguro",
        "ritmo": "medio-lento",
        "abertura_estilo": "problema real com risco claro",
        "convencimento_estilo": "redu\u00e7\u00e3o de risco com passos concretos",
        "progressao_narrativa": "fluxo/processo",
        "fechamento_estilo": "checklist aplic\u00e1vel",
        "narrativa_preferencial": "fluxo_processo",
        "marcadores_linguisticos": ["evite falhas", "mitigar", "passo a passo", "resili\u00eancia"],
        "proibicoes_estilo": ["promessas vagas", "met\u00e1foras desconectadas"],
    },
    "Daredevil": {
        "tom_voz": "energ\u00e9tico e desafiador",
        "ritmo": "dinamico",
        "abertura_estilo": "gancho de a\u00e7\u00e3o imediata",
        "convencimento_estilo": "desafio + recompensa pr\u00e1tica",
        "progressao_narrativa": "luta/supera\u00e7\u00e3o",
        "fechamento_estilo": "miss\u00e3o curta de execu\u00e7\u00e3o",
        "narrativa_preferencial": "luta_superacao",
        "marcadores_linguisticos": ["desafio", "miss\u00e3o", "a\u00e7\u00e3o", "supera\u00e7\u00e3o"],
        "proibicoes_estilo": ["explica\u00e7\u00e3o excessivamente lenta", "abertura morna"],
    },
    "Mastermind": {
        "tom_voz": "anal\u00edtico e preciso",
        "ritmo": "medio",
        "abertura_estilo": "tese conceitual",
        "convencimento_estilo": "l\u00f3gica e evid\u00eancia",
        "progressao_narrativa": "did\u00e1tica/anal\u00edtica",
        "fechamento_estilo": "s\u00edntese conceitual com pr\u00f3ximos passos",
        "narrativa_preferencial": "didatica_analitica",
        "marcadores_linguisticos": ["hip\u00f3tese", "evid\u00eancia", "trade-off", "modelo"],
        "proibicoes_estilo": ["sensacionalismo", "saltos sem justificativa"],
    },
    "Conqueror": {
        "tom_voz": "assertivo e orientado a resultado",
        "ritmo": "dinamico",
        "abertura_estilo": "meta expl\u00edcita e impacto",
        "convencimento_estilo": "performance e resultado mensur\u00e1vel",
        "progressao_narrativa": "conquista",
        "fechamento_estilo": "chamada para execu\u00e7\u00e3o",
        "narrativa_preferencial": "conquista",
        "marcadores_linguisticos": ["meta", "impacto", "resultado", "execu\u00e7\u00e3o"],
        "proibicoes_estilo": ["abordagem dispersa", "falta de objetividade"],
    },
    "Socialiser": {
        "tom_voz": "humano e colaborativo",
        "ritmo": "medio",
        "abertura_estilo": "hist\u00f3ria com personagem ou situa\u00e7\u00e3o social",
        "convencimento_estilo": "empatia e colabora\u00e7\u00e3o",
        "progressao_narrativa": "transforma\u00e7\u00e3o",
        "fechamento_estilo": "convite para compartilhar e aplicar em grupo",
        "narrativa_preferencial": "transformacao",
        "marcadores_linguisticos": ["colabora\u00e7\u00e3o", "compartilhar", "comunidade", "juntos"],
        "proibicoes_estilo": ["tom impessoal extremo", "isolamento de contexto"],
    },
    "Achiever": {
        "tom_voz": "objetivo e progressivo",
        "ritmo": "medio",
        "abertura_estilo": "objetivo mensur\u00e1vel",
        "convencimento_estilo": "progresso incremental e ganho concreto",
        "progressao_narrativa": "conquista",
        "fechamento_estilo": "pr\u00f3ximo marco de evolu\u00e7\u00e3o",
        "narrativa_preferencial": "fluxo_processo",
        "marcadores_linguisticos": ["progresso", "marco", "evolu\u00e7\u00e3o", "resultado"],
        "proibicoes_estilo": ["promessas abstratas", "falta de aplicabilidade"],
    },
}

_BRAINHEX_GUIDE_PERSONAS: dict[str, dict[str, str]] = {
    "Mastermind": {
        "guia_nome": "Atena",
        "guia_voz": "Charon",
        "guia_cor": "#707c88",
        "framing_narrativo": "Arquitetura do Conceito",
    },
    "Seeker": {
        "guia_nome": "Orion",
        "guia_voz": "Puck",
        "guia_cor": "#a78c07",
        "framing_narrativo": "Crônicas da Exploração",
    },
    "Survivor": {
        "guia_nome": "Valka",
        "guia_voz": "Fenrir",
        "guia_cor": "#720101",
        "framing_narrativo": "Diretrizes de Campo",
    },
    "Daredevil": {
        "guia_nome": "Rexa",
        "guia_voz": "Zephyr",
        "guia_cor": "#1b6b1b",
        "framing_narrativo": "Código de Impacto",
    },
    "Conqueror": {
        "guia_nome": "Drako",
        "guia_voz": "Kore",
        "guia_cor": "#01808b",
        "framing_narrativo": "Tratado de Soberania",
    },
    "Socialiser": {
        "guia_nome": "Luma",
        "guia_voz": "Kore",
        "guia_cor": "#6d15be",
        "framing_narrativo": "Elo da Comunidade",
    },
    "Achiever": {
        "guia_nome": "Auri",
        "guia_voz": "Puck",
        "guia_cor": "#ad6002",
        "framing_narrativo": "Caminho da Maestria",
    },
}

_NARRATIVE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "descoberta": ("explorar", "descobrir", "investigar", "pistas"),
    "conquista": ("meta", "resultado", "vit\u00f3ria", "marco"),
    "luta_superacao": ("desafio", "supera\u00e7\u00e3o", "obst\u00e1culo", "resili\u00eancia"),
    "fluxo_processo": ("passo", "etapa", "processo", "sequ\u00eancia"),
    "didatica_analitica": ("conceito", "modelo", "evid\u00eancia", "an\u00e1lise"),
    "transformacao": ("transformar", "mudan\u00e7a", "evolu\u00e7\u00e3o", "jornada"),
    "alerta_oportunidade": ("risco", "oportunidade", "aten\u00e7\u00e3o", "prioridade"),
}
_URL_KEYS = (
    "url",
    "uri",
    "src",
    "link",
    "href",
    "path",
    "storage_path",
    "storagePath",
    "arquivo_url",
    "arquivoUrl",
    "file_url",
    "fileUrl",
    "document_url",
    "documentUrl",
    "embed_url",
    "embedUrl",
    "image_url",
    "imageUrl",
    "imagem_url",
    "video_url",
    "audio_url",
    "viewerUrl",
)


def _looks_like_storage_path(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    return bool(
        re.match(r"^[a-f0-9-]{8,}/\d+/\d+_.+\.[a-z0-9]+$", text, flags=re.I)
        or re.match(r"^[a-z0-9._/-]+\.(pdf|pptx|ppt|docx|doc|txt|md|mp3|mp4|png|jpg|jpeg|webm)$", text, flags=re.I)
    )


def _strip_path_to_label(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    normalized = text.replace("\\", "/")
    label = normalized.split("/")[-1] if "/" in normalized else normalized
    label = re.sub(r"^\d+_", "", label)
    label = re.sub(r"\.[a-z0-9]{2,5}$", "", label, flags=re.I)
    label = re.sub(r"[_-]+", " ", label)
    label = re.sub(r"\s+", " ", label).strip(" -_.")
    return label or text


def _infer_file_name(
    *,
    storage_path: str | None,
    source_url: str | None,
    explicit_name: str | None,
    fallback_title: str | None,
) -> str | None:
    explicit = _pick_string(explicit_name)
    if explicit:
        return explicit
    candidate = _pick_string(storage_path, source_url)
    if candidate:
        normalized = candidate.replace("\\", "/")
        tail = normalized.split("/")[-1].strip()
        if tail:
            return tail
    fallback = _pick_string(fallback_title)
    if fallback and "." in fallback:
        return fallback
    return None


def _infer_mime_type(
    *,
    declared_mime: str | None,
    file_name: str | None,
    source_url_or_path: str | None,
) -> str | None:
    declared = _pick_string(declared_mime)
    if declared and declared.lower() not in {"application/octet-stream", "binary/octet-stream"}:
        return declared
    guess_target = _pick_string(file_name, source_url_or_path)
    if not guess_target:
        return None
    guessed, _ = mimetypes.guess_type(guess_target)
    if guessed:
        return guessed
    normalized = guess_target.split("?")[0].split("#")[0].strip().lower()
    for extension, mime in _MIME_BY_EXTENSION.items():
        if normalized.endswith(extension):
            return mime
    return None


def _resolve_source_bucket(source: dict[str, Any]) -> str | None:
    explicit = _pick_string(source.get("bucket"))
    if explicit:
        return explicit
    storage_path = _pick_string(source.get("storage_path"))
    if not storage_path:
        return None
    origem = (_pick_string(source.get("origem")) or "").lower()
    source_id = (_pick_string(source.get("source_id")) or "").lower()
    if origem in {"sync_conteudo", "sync_midia", "conteudo_metadata", "conteudo_file", "midia"}:
        return _CONTEUDOS_BUCKET
    if source_id.startswith("fonte:") or origem in {"upload", "fonte", "fonte_personalizacao"}:
        return _CONTEUDO_ALUNO_BUCKET
    return _CONTEUDOS_BUCKET


def _parse_fonte_id(source: dict[str, Any]) -> int | None:
    source_id = _pick_string(source.get("source_id")) or ""
    if source_id.startswith("fonte:"):
        raw = source_id.split(":", maxsplit=1)[1]
    else:
        raw = _pick_string(source.get("id"))
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _is_meaningful_source_text(value: str | None) -> bool:
    text = _pick_string(value)
    if not text:
        return False
    if _looks_like_url(text) or _looks_like_storage_path(text) or _looks_like_path_or_filename(text):
        return False
    return len(text) >= 40


def _perfil_dominante(perfil_brainhex: list[dict[str, Any]]) -> str:
    if not perfil_brainhex:
        return "Achiever"
    return max(perfil_brainhex, key=lambda p: p.get("afinidade", 0)).get("perfil", "Achiever")


def _normalize_profile_label(value: Any) -> str | None:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip().lower()
    if not normalized:
        return None

    aliases = {
        "socializer": "Socialiser",
        "socialiser": "Socialiser",
        "survivor": "Survivor",
        "seeker": "Seeker",
        "daredevil": "Daredevil",
        "mastermind": "Mastermind",
        "conqueror": "Conqueror",
        "achiever": "Achiever",
    }
    return aliases.get(normalized, normalized.title())


def _brainhex_profile_key(value: Any) -> str:
    normalized = _normalize_profile_label(value) or "Mastermind"
    key = re.sub(r"[^a-z0-9]+", "_", normalized.lower()).strip("_")
    return key or "mastermind"


def _merge_perfil_brainhex(
    context_profiles: list[dict[str, Any]] | None,
    payload_profiles: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    merged: dict[str, float] = {}

    for source in (context_profiles or []):
        profile = _normalize_profile_label(source.get("perfil") or source.get("nome"))
        if not profile:
            continue
        merged[profile] = max(merged.get(profile, 0.0), float(source.get("afinidade") or 0.0))

    for source in (payload_profiles or []):
        profile = _normalize_profile_label(source.get("perfil") or source.get("nome"))
        if not profile:
            continue
        merged[profile] = max(merged.get(profile, 0.0), float(source.get("afinidade") or 0.0))

    return [
        {"perfil": profile, "afinidade": affinity}
        for profile, affinity in sorted(merged.items(), key=lambda item: item[1], reverse=True)
    ]


_XP_POR_DIFICULDADE = {"facil": 5, "medio": 10, "dificil": 20}
_ICONES_PADRAO = ["*", "+", "o", ">", "#", "@", "%", "="]
_MIME_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def _build_materiais_response_schema(formatos: list[str]) -> dict[str, Any]:
    question_item_schema: dict[str, Any] = {
        "type": "OBJECT",
        "properties": {
            "tipo": {"type": "STRING", "enum": ["quiz", "true_false", "fill_blank", "essay"]},
            "enunciado": {"type": "STRING"},
            "alternativas": {"type": "ARRAY", "items": {"type": "STRING"}, "nullable": True},
            "resposta_correta": {"type": "STRING"},
            "nota_estabelecida": {"type": "NUMBER", "nullable": True},
        },
        "required": ["tipo", "enunciado", "resposta_correta"],
    }
    atividade_item_schema: dict[str, Any] = {
        "type": "OBJECT",
        "properties": {
            "titulo": {"type": "STRING"},
            "descricao": {"type": "STRING"},
            "tipo": {"type": "STRING", "enum": ["quiz", "true_false", "fill_blank", "essay"]},
            "enunciado": {"type": "STRING"},
            "alternativas": {"type": "ARRAY", "items": {"type": "STRING"}, "nullable": True},
            "resposta_correta": {"type": "STRING"},
            "nota_estabelecida": {"type": "NUMBER", "nullable": True},
            "questoes": {"type": "ARRAY", "items": question_item_schema},
        },
        "required": ["titulo", "tipo"],
    }

    properties: dict[str, Any] = {}
    required: list[str] = []

    if "cards" in formatos:
        properties["cards"] = {
            "type": "ARRAY",
            "minItems": _MIN_PERSONALIZED_ITEMS,
            "maxItems": _MAX_PERSONALIZED_ITEMS,
            "items": {
                "type": "OBJECT",
                "properties": {
                    "titulo": {"type": "STRING"},
                    "descricao": {"type": "STRING"},
                    "frente": {"type": "STRING"},
                    "verso": {"type": "STRING"},
                },
            },
        }
        required.append("cards")

    if "quiz" in formatos:
        properties["quiz"] = {
            "type": "OBJECT",
            "properties": {
                "atividades": {
                    "type": "ARRAY",
                    "minItems": _MIN_PERSONALIZED_ITEMS,
                    "maxItems": _MAX_PERSONALIZED_ITEMS,
                    "items": atividade_item_schema,
                }
            },
        }
        properties["atividades"] = {
            "type": "ARRAY",
            "minItems": _MIN_PERSONALIZED_ITEMS,
            "maxItems": _MAX_PERSONALIZED_ITEMS,
            "items": atividade_item_schema,
        }

    for formato in ("pdf", "documento", "apresentacao", "audio", "video", "imagem"):
        if formato in formatos:
            properties[formato] = {"type": "OBJECT"}

    schema: dict[str, Any] = {
        "type": "OBJECT",
        "properties": properties,
    }
    if required:
        schema["required"] = required
    return schema


def _list_visual_assets_catalog() -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {
        "imagens_referencia": [],
        "imagens_perfil": [],
        "imagens_base": [],
    }

    if _VISUAL_ASSETS_DIR.exists() and _VISUAL_ASSETS_DIR.is_dir():
        grouped["imagens_referencia"] = sorted(
            [
                item.name
                for item in _VISUAL_ASSETS_DIR.iterdir()
                if item.is_file() and item.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
            ]
        )

    profile_dir = _VISUAL_ASSETS_DIR.parent / "imgPerfil"
    if profile_dir.exists() and profile_dir.is_dir():
        grouped["imagens_perfil"] = sorted(
            [
                item.name
                for item in profile_dir.iterdir()
                if item.is_file() and item.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
            ]
        )

    images_dir = _VISUAL_ASSETS_DIR.parent / "images"
    if images_dir.exists() and images_dir.is_dir():
        grouped["imagens_base"] = sorted(
            [
                item.name
                for item in images_dir.iterdir()
                if item.is_file() and item.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
            ]
        )

    return grouped


def _build_visual_profile_context(perfil_dominante: str, perfil_brainhex: list[dict[str, Any]]) -> dict[str, Any]:
    normalized_dominante = _normalize_profile_label(perfil_dominante) or "Mastermind"
    dominante_ref = _PROFILE_VISUAL_REFERENCES.get(
        normalized_dominante,
        _PROFILE_VISUAL_REFERENCES["Mastermind"],
    )

    top_profiles: list[dict[str, Any]] = []
    for profile in perfil_brainhex[:3]:
        normalized = _normalize_profile_label(profile.get("perfil") or profile.get("nome")) or ""
        if not normalized:
            continue
        top_profiles.append(
            {
                "perfil": normalized,
                "afinidade": float(profile.get("afinidade") or 0.0),
                "referencias": _PROFILE_VISUAL_REFERENCES.get(normalized),
            }
        )

    return {
        "perfil_dominante": normalized_dominante,
        "referencia_dominante": dominante_ref,
        "top_perfis": top_profiles,
        "assets_disponiveis": _list_visual_assets_catalog(),
        "direcao_visual": {
            "tema_app": "medieval m\u00edstico e m\u00e1gico",
            "orientacao": (
                "Use tipografia leg\u00edvel, contraste alto e elementos visuais coerentes com o conte\u00fado. "
                "Priorize \u00edcones e imagens do cat\u00e1logo quando fizer sentido pedag\u00f3gico."
            ),
        },
    }


def _build_tema_visual_for_profile(perfil: str | None) -> dict[str, Any]:
    perfil_normalizado = _normalize_profile_label(perfil) or "Mastermind"
    perfil_visual = _PROFILE_VISUAL_REFERENCES.get(perfil_normalizado, _PROFILE_VISUAL_REFERENCES["Mastermind"])
    return {
        "cores": dict(perfil_visual.get("cores") or {}),
        "imagem_referencia": perfil_visual.get("imagem"),
        "icone_referencia": perfil_visual.get("icone"),
        "perfil": perfil_normalizado,
    }


def _build_profile_editorial_context(
    perfil_dominante: str,
    perfil_brainhex: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = _normalize_profile_label(perfil_dominante) or "Mastermind"
    signature = dict(_BRAINHEX_EDITORIAL_SIGNATURES.get(normalized, _BRAINHEX_EDITORIAL_SIGNATURES["Mastermind"]))
    persona = _BRAINHEX_GUIDE_PERSONAS.get(normalized, _BRAINHEX_GUIDE_PERSONAS["Mastermind"])

    top_profiles: list[dict[str, Any]] = []
    for item in perfil_brainhex[:3]:
        profile_name = _normalize_profile_label(item.get("perfil") or item.get("nome"))
        if not profile_name:
            continue
        profile_signature = _BRAINHEX_EDITORIAL_SIGNATURES.get(
            profile_name,
            _BRAINHEX_EDITORIAL_SIGNATURES["Mastermind"],
        )
        top_profiles.append(
            {
                "perfil": profile_name,
                "afinidade": float(item.get("afinidade") or 0.0),
                "narrativa_preferencial": profile_signature.get("narrativa_preferencial"),
                "tom_voz": profile_signature.get("tom_voz"),
                "ritmo": profile_signature.get("ritmo"),
            }
        )

    assinatura = (
        f"{normalized}: {signature.get('abertura_estilo')} -> "
        f"{signature.get('progressao_narrativa')} -> {signature.get('fechamento_estilo')}"
    )

    return {
        "perfil_dominante": normalized,
        "assinatura_perfil": assinatura,
        "tom_voz": signature.get("tom_voz"),
        "ritmo": signature.get("ritmo"),
        "abertura_estilo": signature.get("abertura_estilo"),
        "convencimento_estilo": signature.get("convencimento_estilo"),
        "progressao_narrativa": signature.get("progressao_narrativa"),
        "fechamento_estilo": signature.get("fechamento_estilo"),
        "narrativa_preferencial": signature.get("narrativa_preferencial"),
        "marcadores_linguisticos": list(signature.get("marcadores_linguisticos") or []),
        "proibicoes_estilo": list(signature.get("proibicoes_estilo") or []),
        "top_perfis": top_profiles,
        "guia_nome": persona["guia_nome"],
        "guia_voz": persona["guia_voz"],
        "guia_cor": persona["guia_cor"],
        "framing_narrativo": persona["framing_narrativo"],
    }


def _build_editorial_format_adaptation(size_targets: dict[str, Any]) -> dict[str, Any]:
    return {
        "video": {
            "duracao_seg": int((int(size_targets.get("video_min_seg", 75)) + int(size_targets.get("video_max_seg", 105))) / 2),
            "estrutura_cenas": [],
        },
        "apresentacao": {
            "qtd_slides": int((int(size_targets.get("slides_min", 6)) + int(size_targets.get("slides_max", 8))) / 2),
            "wireframe": [],
        },
        "pdf": {"secoes": []},
        "documento": {"secoes": []},
        "audio": {
            "duracao_seg": int((int(size_targets.get("audio_min_seg", 70)) + int(size_targets.get("audio_max_seg", 95))) / 2),
            "blocos": [],
        },
        "imagem": {"direcao_arte": "medieval m\u00edstico e m\u00e1gico com alta legibilidade"},
        "cards": {"qtd": 10},
        "quiz": {"qtd_atividades": 8},
    }


def _build_editorial_model(
    *,
    conteudo_estudado: dict[str, Any],
    perfil_editorial: dict[str, Any],
    metas_tamanho: dict[str, Any],
) -> dict[str, Any]:
    tema_central = _pick_string(conteudo_estudado.get("tema_central")) or "Tema de estudo"
    conceitos = [str(item).strip() for item in (conteudo_estudado.get("conceitos_nucleares") or []) if str(item).strip()]
    fatos = [str(item).strip() for item in (conteudo_estudado.get("fatos_ancorados") or []) if str(item).strip()]
    objetivo = _pick_string(conteudo_estudado.get("objetivo_pedagogico")) or f"Compreender os fundamentos de {tema_central}."
    narrativa_pedagogica = (
        conteudo_estudado.get("narrativa_pedagogica")
        if isinstance(conteudo_estudado.get("narrativa_pedagogica"), dict)
        else {}
    )

    return {
        "versao": "1.0",
        "conteudo_origem": {
            "tema": tema_central,
            "objetivo_pedagogico": objetivo,
            "mensagem_central": _pick_string(conteudo_estudado.get("mensagem_central"))
            or f"{tema_central} exige entendimento conceitual e aplica\u00e7\u00e3o pr\u00e1tica.",
            "argumentos_principais": conceitos[:6],
            "fatos_ancorados": fatos[:8],
            "restricoes_fidelidade": [
                "nao contradizer fonte",
                "nao inventar fato central",
                "preservar consistencia entre midias",
            ],
        },
        "estrategia_editorial": {
            "emocao_dominante": "confian\u00e7a orientada \u00e0 pr\u00e1tica",
            "objetivo_comunicacional": "ensinar",
            "promessa": f"Voc\u00ea ser\u00e1 capaz de explicar e aplicar {tema_central} com seguran\u00e7a.",
            "conflitos": [
                "complexidade t\u00e9cnica sem contexto",
                "dificuldade em conectar teoria e pr\u00e1tica",
            ],
            "cta": "Aplique os conceitos em um exemplo real do seu contexto de estudo.",
            "tom": _pick_string(perfil_editorial.get("tom_voz")) or "claro e objetivo",
            "narrativa_tipo": _pick_string(perfil_editorial.get("narrativa_preferencial")) or "didatica_analitica",
            "progressao": {
                "abertura": _pick_string(narrativa_pedagogica.get("abertura"))
                or "Contextualizar objetivo e relev\u00e2ncia do tema.",
                "desenvolvimento": [
                    _pick_string(narrativa_pedagogica.get("desenvolvimento"))
                    or "Construir entendimento progressivo com exemplos concretos."
                ],
                "fechamento": _pick_string(narrativa_pedagogica.get("fechamento"))
                or "Consolidar aprendizados e pr\u00f3ximos passos.",
            },
        },
        "personalizacao_brainhex": {
            "perfil_dominante": _pick_string(perfil_editorial.get("perfil_dominante")) or "Mastermind",
            "tom_voz": _pick_string(perfil_editorial.get("tom_voz")) or "anal\u00edtico e preciso",
            "ritmo": _pick_string(perfil_editorial.get("ritmo")) or "medio",
            "abertura_estilo": _pick_string(perfil_editorial.get("abertura_estilo")) or "tese conceitual",
            "convencimento_estilo": _pick_string(perfil_editorial.get("convencimento_estilo")) or "l\u00f3gica e evid\u00eancia",
            "fechamento_estilo": _pick_string(perfil_editorial.get("fechamento_estilo")) or "s\u00edntese conceitual",
            "progressao_narrativa": _pick_string(perfil_editorial.get("progressao_narrativa")) or "did\u00e1tica/anal\u00edtica",
            "marcadores_linguisticos": list(perfil_editorial.get("marcadores_linguisticos") or []),
            "proibicoes_estilo": list(perfil_editorial.get("proibicoes_estilo") or []),
            "assinatura_perfil": _pick_string(perfil_editorial.get("assinatura_perfil")) or "",
        },
        "adaptacao_formatos": _build_editorial_format_adaptation(metas_tamanho),
    }


def _extract_editorial_model_candidate(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    direct = raw.get("modelo_editorial")
    if isinstance(direct, dict):
        return direct
    for key in ("plano", "payload", "resultado", "conteudo_estudado"):
        candidate = raw.get(key)
        if isinstance(candidate, dict) and isinstance(candidate.get("modelo_editorial"), dict):
            return candidate.get("modelo_editorial")
    return None


def _collect_chunk_text_values(source_chunks: list[dict[str, Any]], *, limit: int = 20) -> list[str]:
    values: list[str] = []
    for item in source_chunks[:limit]:
        if not isinstance(item, dict):
            continue
        text_value = _pick_string(item.get("chunk_texto"))
        if not text_value:
            continue
        values.append(text_value)
    return values


def _infer_content_complexity(
    *,
    source_chunks: list[dict[str, Any]],
    conteudos: list[dict[str, Any]],
) -> str:
    chunk_texts = _collect_chunk_text_values(source_chunks, limit=24)
    chunk_count = len(chunk_texts)
    chunk_chars = sum(len(text) for text in chunk_texts)
    conteudo_chars = sum(len(str((item or {}).get("conteudo") or "")) for item in (conteudos or [])[:12])
    total_chars = chunk_chars + conteudo_chars

    if chunk_count >= 14 or total_chars >= 11_000:
        return "longo"
    if chunk_count <= 6 and total_chars <= 3_800:
        return "curto"
    return "medio"


def _adaptive_size_targets(complexidade: str | None) -> dict[str, int]:
    normalized = str(complexidade or "").strip().lower()
    if normalized not in _ADAPTIVE_SIZE_TARGETS:
        normalized = "medio"
    return dict(_ADAPTIVE_SIZE_TARGETS[normalized])


def _extract_key_sentences_from_chunks(chunk_texts: list[str], *, limit: int = 8) -> list[str]:
    sentences: list[str] = []
    seen: set[str] = set()
    for chunk in chunk_texts:
        split = [item.strip() for item in re.split(r"(?<=[.!?;])\s+", chunk) if item.strip()]
        for sentence in split:
            normalized = _normalize_key(sentence)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            sentences.append(sentence)
            if len(sentences) >= limit:
                return sentences
    return sentences


def _extract_core_concepts(chunk_texts: list[str], *, limit: int = 10) -> list[str]:
    stopwords = {
        "de",
        "da",
        "do",
        "das",
        "dos",
        "em",
        "na",
        "no",
        "nas",
        "nos",
        "para",
        "com",
        "sobre",
        "entre",
        "uma",
        "um",
        "como",
        "que",
        "por",
        "sem",
        "mais",
        "menos",
        "ser",
        "sao",
        "são",
    }
    concepts: list[str] = []
    seen: set[str] = set()
    for chunk in chunk_texts:
        candidates = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9/\-\s]{8,64}", chunk)
        for raw in candidates:
            compact = re.sub(r"\s+", " ", raw).strip(" -;:,.")
            if len(compact.split()) < 2:
                continue
            if len(compact) < 10:
                continue
            lowered = compact.lower()
            if lowered in stopwords:
                continue
            key = _normalize_key(compact)
            if not key or key in seen:
                continue
            seen.add(key)
            concepts.append(compact)
            if len(concepts) >= limit:
                return concepts
    return concepts


def _build_fallback_content_study(
    *,
    topico_context: dict[str, Any],
    source_chunks: list[dict[str, Any]],
    conteudos: list[dict[str, Any]],
    fontes_midias_relevantes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    complexidade = _infer_content_complexity(source_chunks=source_chunks, conteudos=conteudos)
    chunk_texts = _collect_chunk_text_values(source_chunks, limit=20)
    key_sentences = _extract_key_sentences_from_chunks(chunk_texts, limit=8)
    key_concepts = _extract_core_concepts(chunk_texts, limit=10)
    topico_nome = _pick_string(topico_context.get("nome")) or "T\u00f3pico"
    topico_descricao = _pick_string(topico_context.get("descricao")) or ""

    if not key_concepts and topico_descricao:
        key_concepts = _extract_core_concepts([topico_descricao], limit=6)
    if not key_concepts:
        key_concepts = [
            f"Fundamentos de {topico_nome}",
            f"Aplica\u00e7\u00f5es pr\u00e1ticas de {topico_nome}",
            f"S\u00edntese conceitual de {topico_nome}",
        ]

    facts = key_sentences[:6] or [topico_descricao] if topico_descricao else []
    if not facts:
        facts = [f"O conte\u00fado aborda conceitos essenciais de {topico_nome}."]

    output = {
        "tema_central": topico_nome,
        "objetivo_pedagogico": f"Compreender e aplicar os conceitos-chave de {topico_nome}.",
        "conceitos_nucleares": key_concepts[:8],
        "fatos_ancorados": facts[:6],
        "narrativa_pedagogica": {
            "abertura": f"Contextualizar o tema {topico_nome} e seus objetivos de aprendizagem.",
            "desenvolvimento": "Explorar conceitos, rela\u00e7\u00f5es e exemplos pr\u00e1ticos com progress\u00e3o did\u00e1tica.",
            "fechamento": "Recapitular ideias centrais e indicar pr\u00f3ximos passos de estudo.",
        },
        "glossario": [
            {"termo": concept[:36], "definicao": f"Conceito relevante no contexto de {topico_nome}."}
            for concept in key_concepts[:4]
        ],
        "restricoes_conteudo": [
            "N\u00e3o contradizer fatos presentes nas fontes.",
            "Evitar incluir informa\u00e7\u00f5es sem conex\u00e3o com as fontes.",
            "Manter linguagem em portugu\u00eas brasileiro, com clareza e objetividade.",
        ],
        "fidelidade": "criativa",
        "complexidade": complexidade,
        "metas_tamanho": _adaptive_size_targets(complexidade),
    }
    if fontes_midias_relevantes:
        output["midias_relevantes"] = list(fontes_midias_relevantes[:8])
    return output


def _extract_content_study_candidate(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    candidate = raw.get("conteudo_estudado")
    if isinstance(candidate, dict):
        return candidate
    for key in ("plano", "payload", "resultado", "estudo"):
        value = raw.get(key)
        if isinstance(value, dict) and isinstance(value.get("conteudo_estudado"), dict):
            return value.get("conteudo_estudado")
    return None


def _collect_payload_text(formato: str, payload: Any) -> str:
    if formato == "cards" and isinstance(payload, list):
        parts: list[str] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            parts.extend(
                [
                    _pick_string(item.get("frente"), item.get("titulo")) or "",
                    _pick_string(item.get("verso"), item.get("descricao")) or "",
                ]
            )
        return " ".join(part for part in parts if part).strip()

    if formato == "quiz" and isinstance(payload, dict):
        parts = []
        atividades = payload.get("atividades") if isinstance(payload.get("atividades"), list) else []
        for atividade in atividades:
            if not isinstance(atividade, dict):
                continue
            parts.append(_pick_string(atividade.get("titulo"), atividade.get("descricao")) or "")
            for questao in atividade.get("questoes") or []:
                if isinstance(questao, dict):
                    parts.append(_pick_string(questao.get("enunciado"), questao.get("pergunta")) or "")
        return " ".join(part for part in parts if part).strip()

    if not isinstance(payload, dict):
        return ""

    parts: list[str] = []
    if formato in {"pdf", "documento"}:
        parts.extend(
            [
                _pick_string(payload.get("titulo")) or "",
                _pick_string(payload.get("resumo")) or "",
            ]
        )
        parts.extend(str(item or "").strip() for item in (payload.get("secoes") or []) if str(item or "").strip())
    elif formato == "apresentacao":
        parts.extend(
            [
                _pick_string(payload.get("titulo")) or "",
                _pick_string(payload.get("abertura")) or "",
            ]
        )
        for slide in payload.get("slides") or []:
            if not isinstance(slide, dict):
                continue
            parts.append(_pick_string(slide.get("titulo"), slide.get("subtitulo")) or "")
            parts.extend(str(item or "").strip() for item in (slide.get("pontos") or []) if str(item or "").strip())
    elif formato in {"audio", "video"}:
        parts.append(_pick_string(payload.get("roteiro"), payload.get("texto")) or "")
        parts.extend(str(item or "").strip() for item in (payload.get("cenas") or []) if str(item or "").strip())
    elif formato == "imagem":
        parts.extend(
            [
                _pick_string(payload.get("titulo")) or "",
                _pick_string(payload.get("legenda")) or "",
                _pick_string(payload.get("prompt_imagem"), payload.get("prompt")) or "",
            ]
        )
    return " ".join(part for part in parts if part).strip()


def _evaluate_media_payload_quality(
    *,
    formato: str,
    payload: dict[str, Any] | list[Any] | None,
    conteudo_estudado: dict[str, Any] | None,
    min_quality_score: float,
    modelo_editorial: dict[str, Any] | None = None,
    perfil_dominante: str | None = None,
) -> dict[str, Any]:
    structure_checks = 0
    structure_ok = 0
    critical_issues: list[str] = []
    warnings: list[str] = []
    study = conteudo_estudado if isinstance(conteudo_estudado, dict) else {}
    targets = _adaptive_size_targets(study.get("complexidade"))

    if formato in {"pdf", "documento"}:
        structure_checks += 3
        if isinstance(payload, dict) and _pick_string(payload.get("titulo")):
            structure_ok += 1
        else:
            critical_issues.append("titulo_ausente")
        if isinstance(payload, dict) and _pick_string(payload.get("resumo")):
            structure_ok += 1
        else:
            critical_issues.append("resumo_ausente")
        secoes = payload.get("secoes") if isinstance(payload, dict) and isinstance(payload.get("secoes"), list) else []
        if secoes:
            structure_ok += 1
            if len(secoes) < targets["secoes_min"] or len(secoes) > targets["secoes_max"]:
                warnings.append("secoes_fora_da_faixa_adaptativa")
        else:
            critical_issues.append("secoes_ausentes")
    elif formato == "apresentacao":
        structure_checks += 3
        if isinstance(payload, dict) and _pick_string(payload.get("titulo")):
            structure_ok += 1
        else:
            critical_issues.append("titulo_ausente")
        slides = payload.get("slides") if isinstance(payload, dict) and isinstance(payload.get("slides"), list) else []
        if slides:
            structure_ok += 1
            if len(slides) < targets["slides_min"] or len(slides) > targets["slides_max"]:
                warnings.append("slides_fora_da_faixa_adaptativa")
            if any(not isinstance(slide, dict) or not (slide.get("pontos") or []) for slide in slides):
                warnings.append("slide_sem_pontos")
        else:
            critical_issues.append("slides_ausentes")
        if isinstance(payload, dict) and _pick_string(payload.get("abertura")):
            structure_ok += 1
        else:
            warnings.append("abertura_ausente")
    elif formato == "audio":
        structure_checks += 2
        if isinstance(payload, dict) and _pick_string(payload.get("roteiro"), payload.get("texto")):
            structure_ok += 1
        else:
            critical_issues.append("roteiro_ausente")
        duracao = int(payload.get("duracao_estimada_seg") or 0) if isinstance(payload, dict) else 0
        if duracao:
            structure_ok += 1
            if duracao < targets["audio_min_seg"] or duracao > targets["audio_max_seg"]:
                warnings.append("duracao_audio_fora_da_faixa_adaptativa")
        else:
            warnings.append("duracao_audio_ausente")
    elif formato == "video":
        structure_checks += 3
        if isinstance(payload, dict) and _pick_string(payload.get("roteiro")):
            structure_ok += 1
        else:
            critical_issues.append("roteiro_ausente")
        cenas = payload.get("cenas") if isinstance(payload, dict) and isinstance(payload.get("cenas"), list) else []
        if cenas:
            structure_ok += 1
        else:
            critical_issues.append("cenas_ausentes")
        duracao = int(payload.get("duracao_estimada_seg") or 0) if isinstance(payload, dict) else 0
        if duracao:
            structure_ok += 1
            if duracao < targets["video_min_seg"] or duracao > targets["video_max_seg"]:
                warnings.append("duracao_video_fora_da_faixa_adaptativa")
        else:
            warnings.append("duracao_video_ausente")
    elif formato == "imagem":
        structure_checks += 2
        if isinstance(payload, dict) and _pick_string(payload.get("titulo"), payload.get("legenda")):
            structure_ok += 1
        else:
            critical_issues.append("titulo_ou_legenda_ausente")
        if isinstance(payload, dict) and _pick_string(payload.get("prompt_imagem"), payload.get("prompt")):
            structure_ok += 1
        else:
            critical_issues.append("prompt_imagem_ausente")
    elif formato == "cards":
        structure_checks += 1
        cards = payload if isinstance(payload, list) else []
        if len(cards) >= 3:
            structure_ok += 1
        else:
            critical_issues.append("cards_insuficientes")
    elif formato == "quiz":
        structure_checks += 1
        atividades = payload.get("atividades") if isinstance(payload, dict) and isinstance(payload.get("atividades"), list) else []
        if len(atividades) >= 3:
            structure_ok += 1
        else:
            critical_issues.append("atividades_insuficientes")

    payload_text = _collect_payload_text(formato, payload)
    concepts = [str(item).strip() for item in (study.get("conceitos_nucleares") or []) if str(item).strip()]
    matched = 0
    lowered_payload = payload_text.lower()
    for concept in concepts[:10]:
        concept_key = _normalize_key(concept)
        if concept_key and concept_key in _normalize_key(lowered_payload):
            matched += 1
    concept_score = (matched / min(len(concepts), 6)) if concepts else 0.7
    concept_score = max(0.0, min(1.0, concept_score))

    structure_score = (structure_ok / structure_checks) if structure_checks else 1.0
    size_score = 1.0 if not warnings else max(0.55, 1.0 - (len(warnings) * 0.15))
    normalized_payload_key = _normalize_key(payload_text)

    editorial = modelo_editorial if isinstance(modelo_editorial, dict) else {}
    editorial_profile = (
        editorial.get("personalizacao_brainhex")
        if isinstance(editorial.get("personalizacao_brainhex"), dict)
        else {}
    )
    normalized_profile = _normalize_profile_label(
        perfil_dominante
        or editorial_profile.get("perfil_dominante")
        or editorial.get("perfil_dominante")
    )
    signature = _BRAINHEX_EDITORIAL_SIGNATURES.get(
        normalized_profile or "",
        _BRAINHEX_EDITORIAL_SIGNATURES["Mastermind"],
    )
    has_personalization_context = bool(normalized_profile or editorial_profile)

    markers = [str(item).strip() for item in signature.get("marcadores_linguisticos", []) if str(item).strip()]
    marker_hits = 0
    for marker in markers[:6]:
        marker_key = _normalize_key(marker)
        if marker_key and marker_key in normalized_payload_key:
            marker_hits += 1
    marker_score = (marker_hits / min(len(markers), 3)) if markers else 0.0

    forbidden_rules = [str(item).strip() for item in signature.get("proibicoes_estilo", []) if str(item).strip()]
    forbidden_hits = 0
    for rule in forbidden_rules[:5]:
        rule_key = _normalize_key(rule)
        if rule_key and rule_key in normalized_payload_key:
            forbidden_hits += 1
    forbidden_penalty = min(0.35, forbidden_hits * 0.12)

    if has_personalization_context:
        personalization_score = max(0.45, min(1.0, 0.62 + (marker_score * 0.30) - forbidden_penalty))
    else:
        personalization_score = 0.72

    narrative_type = _pick_string(
        editorial.get("estrategia_editorial", {}).get("narrativa_tipo")
        if isinstance(editorial.get("estrategia_editorial"), dict)
        else None,
        editorial_profile.get("progressao_narrativa"),
        signature.get("narrativa_preferencial"),
    ) or "didatica_analitica"
    narrative_tokens = _NARRATIVE_KEYWORDS.get(
        str(narrative_type).replace("/", "_"),
        _NARRATIVE_KEYWORDS.get(str(signature.get("narrativa_preferencial") or ""), ()),
    )
    narrative_hits = 0
    for token in narrative_tokens:
        token_key = _normalize_key(token)
        if token_key and token_key in normalized_payload_key:
            narrative_hits += 1
    narrative_score = (narrative_hits / min(len(narrative_tokens), 3)) if narrative_tokens else 0.0
    if has_personalization_context:
        diferenciacao_score = max(0.5, min(1.0, 0.55 + (marker_score * 0.25) + (narrative_score * 0.2) - forbidden_penalty))
    else:
        diferenciacao_score = 0.7

    sentence_candidates = [part.strip() for part in re.split(r"[.!?]+", payload_text) if part.strip()]
    if sentence_candidates:
        average_sentence_size = sum(len(item.split()) for item in sentence_candidates) / max(1, len(sentence_candidates))
        if average_sentence_size <= 12:
            clarity_score = 0.82
        elif average_sentence_size <= 20:
            clarity_score = 0.92
        elif average_sentence_size <= 30:
            clarity_score = 0.78
        else:
            clarity_score = 0.62
    else:
        clarity_score = 0.7
    clarity_score = max(0.45, min(1.0, clarity_score))

    progression_terms = ("abertura", "contexto", "desenvolvimento", "passo", "etapa", "s\u00edntese", "conclus\u00e3o", "resumo")
    progression_hits = sum(1 for term in progression_terms if _normalize_key(term) in normalized_payload_key)
    progression_score = min(1.0, progression_hits / 3.0)

    coherence_score = max(
        0.45,
        min(
            1.0,
            (structure_score * 0.45) + (concept_score * 0.35) + (progression_score * 0.20),
        ),
    )
    fidelity_score = max(0.5, min(1.0, (concept_score * 0.8) + (structure_score * 0.2)))
    adequacao_formato_score = max(0.45, min(1.0, (structure_score * 0.85) + (size_score * 0.15)))

    final_score = (
        (coherence_score * 0.26)
        + (fidelity_score * 0.24)
        + (clarity_score * 0.18)
        + (personalization_score * 0.18)
        + (adequacao_formato_score * 0.14)
    )
    min_axis = max(0.55, min(0.78, min_quality_score - 0.02))
    axis_checks = [
        coherence_score >= min_axis,
        fidelity_score >= min_axis,
        adequacao_formato_score >= 0.60,
    ]
    if has_personalization_context:
        axis_checks.extend(
            [
                personalization_score >= max(0.6, min_axis - 0.03),
                diferenciacao_score >= 0.52,
            ]
        )
    approved = bool(not critical_issues and final_score >= min_quality_score and all(axis_checks))

    return {
        "score": round(final_score, 3),
        "min_score": round(min_quality_score, 3),
        "aprovado": approved,
        "estrutura_score": round(structure_score, 3),
        "conceitos_score": round(concept_score, 3),
        "size_score": round(size_score, 3),
        "score_coerencia": round(coherence_score, 3),
        "score_fidelidade": round(fidelity_score, 3),
        "score_clareza": round(clarity_score, 3),
        "score_personalizacao": round(personalization_score, 3),
        "score_adequacao_formato": round(adequacao_formato_score, 3),
        "score_diferenciacao_interperfil": round(diferenciacao_score, 3),
        "conceitos_match": matched,
        "conceitos_total": len(concepts),
        "perfil_validado": normalized_profile or "Mastermind",
        "narrativa_validada": str(narrative_type),
        "markers_hit": marker_hits,
        "markers_total": len(markers),
        "issues": [*critical_issues, *warnings],
        "critical_issues": critical_issues,
        "warnings": warnings,
    }


def _coerce_format_payload(formato: str, value: Any) -> dict[str, Any] | list[Any] | None:
    if formato == "cards":
        return value if isinstance(value, list) else None
    if formato == "quiz":
        if isinstance(value, dict):
            if isinstance(value.get("atividades"), list):
                return value
            if isinstance(value.get("payload"), dict) and isinstance(value["payload"].get("atividades"), list):
                return value["payload"]
        return None
    return value if isinstance(value, dict) else None


def _looks_like_stage_envelope(formato: str, value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if not {"formato", "etapa"}.issubset(set(value.keys())):
        return False
    if formato in {"pdf", "documento"}:
        return not any(key in value for key in ("titulo", "resumo", "secoes"))
    if formato == "apresentacao":
        return "slides" not in value and "titulo" not in value
    if formato in {"audio", "video"}:
        return "roteiro" not in value
    if formato == "imagem":
        return "prompt_imagem" not in value and "prompt" not in value
    if formato == "quiz":
        return "atividades" not in value
    return False


def _extract_format_payload_candidate(formato: str, raw: Any) -> dict[str, Any] | list[Any] | None:
    if not isinstance(raw, dict):
        return _coerce_format_payload(formato, raw)

    direct = _coerce_format_payload(formato, raw.get(formato))
    if direct is not None:
        return direct

    for key in ("payload_final", "payload", "rascunho", "resultado"):
        candidate = raw.get(key)
        if isinstance(candidate, dict):
            nested = _coerce_format_payload(formato, candidate.get(formato))
            if nested is not None:
                return nested
        coerced = _coerce_format_payload(formato, candidate)
        if coerced is not None:
            return coerced

    coerced = _coerce_format_payload(formato, raw)
    if _looks_like_stage_envelope(formato, coerced):
        return None
    return coerced


async def _invoke_media_stage_llm(
    *,
    llm: JsonLLMService,
    settings: Settings,
    stage: str,
    formato: str,
    context_payload: dict[str, Any],
    fallback_payload: dict[str, Any] | list[Any] | None,
) -> dict[str, Any]:
    fallback_result = {
        "formato": formato,
        "etapa": stage,
        "payload": fallback_payload,
        "revisao": {
            "status": "fallback",
            "achados": ["fallback_llm"],
            "ajustes": [],
        },
    }
    return await llm.ainvoke_json(
        prompt_name=_MIDIA_PIPELINE_PROMPT,
        payload=context_payload,
        fallback_factory=lambda: fallback_result,
        provider="gemini",
        model=str(getattr(settings, "gemini_materiais_model", "") or "").strip() or None,
    )


async def _invoke_multistage_materiais_por_formato(
    *,
    settings: Settings,
    state: dict[str, Any],
    formatos: list[str],
    plano: dict[str, Any],
    perfil_dominante: str,
    source_chunks: list[dict[str, Any]],
    fallback_payloads: dict[str, Any],
    fontes_midias_relevantes: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    llm = JsonLLMService(settings)
    raw_output: dict[str, Any] = {}
    meta: dict[str, Any] = {
        "pipeline": "multistage",
        "stages": {},
        "errors": [],
        "estudo_conteudo": {},
        "scores_validacao": {},
        "quality_gate": {},
        "rejected_by_quality": [],
        "modelo_editorial": {},
    }

    review_max_cycles = max(1, int(getattr(settings, "personalizacao_media_review_max_cycles", 3) or 3))
    min_quality_score = float(getattr(settings, "personalizacao_media_min_quality_score", 0.72) or 0.72)
    min_quality_score = max(0.4, min(0.95, min_quality_score))

    visual_context = _build_visual_profile_context(
        perfil_dominante=perfil_dominante,
        perfil_brainhex=state.get("perfil_brainhex", []) or [],
    )
    perfil_editorial = _build_profile_editorial_context(
        perfil_dominante=perfil_dominante,
        perfil_brainhex=state.get("perfil_brainhex", []) or [],
    )
    topico_context = state.get("topico_contexto") if isinstance(state.get("topico_contexto"), dict) else {}
    conteudos = state.get("conteudos_topico") if isinstance(state.get("conteudos_topico"), list) else []
    complexidade = _infer_content_complexity(source_chunks=source_chunks, conteudos=conteudos)
    adaptive_targets = _adaptive_size_targets(complexidade)

    study_fallback = _build_fallback_content_study(
        topico_context=topico_context,
        source_chunks=source_chunks,
        conteudos=conteudos,
        fontes_midias_relevantes=fontes_midias_relevantes,
    )
    study_payload = {
        "etapa": "estudo_conteudo",
        "formato": "global",
        "topico": {
            "titulo_modulo": topico_context.get("nome"),
            "descricao_modulo": topico_context.get("descricao"),
        },
        "plano_personalizacao": plano,
        "perfil_contexto": {
            "dominante": perfil_dominante,
            "perfil_brainhex": state.get("perfil_brainhex", []),
            "modo_operacao": state.get("modo_operacao") or "imediato",
            "modo_resposta": state.get("modo_resposta") or "imediato",
        },
        "visual_contexto": visual_context,
        "fontes_chunks": source_chunks[:20],
        "fontes_midias_relevantes": fontes_midias_relevantes or [],
        "complexidade_detectada": complexidade,
        "metas_tamanho_adaptativas": adaptive_targets,
        "fidelidade_conteudo": "criativa",
        "perfil_editorial": perfil_editorial,
        "modelo_editorial_schema_versao": "1.0",
    }
    study_raw = await _invoke_media_stage_llm(
        llm=llm,
        settings=settings,
        stage="estudo_conteudo",
        formato="global",
        context_payload=study_payload,
        fallback_payload=study_fallback,
    )
    conteudo_estudado = _extract_content_study_candidate(study_raw) or study_fallback
    if not isinstance(conteudo_estudado, dict):
        conteudo_estudado = study_fallback
    conteudo_estudado["complexidade"] = str(conteudo_estudado.get("complexidade") or complexidade).lower()
    if conteudo_estudado["complexidade"] not in _CONTENT_COMPLEXITY_LEVELS:
        conteudo_estudado["complexidade"] = complexidade
    conteudo_estudado["metas_tamanho"] = _adaptive_size_targets(conteudo_estudado.get("complexidade"))
    if fontes_midias_relevantes and not isinstance(conteudo_estudado.get("midias_relevantes"), list):
        conteudo_estudado["midias_relevantes"] = list(fontes_midias_relevantes[:8])
    editorial_candidate = _extract_editorial_model_candidate(study_raw)
    modelo_editorial = _build_editorial_model(
        conteudo_estudado=conteudo_estudado,
        perfil_editorial=perfil_editorial,
        metas_tamanho=conteudo_estudado.get("metas_tamanho") if isinstance(conteudo_estudado.get("metas_tamanho"), dict) else adaptive_targets,
    )
    if isinstance(editorial_candidate, dict):
        modelo_editorial = {
            **modelo_editorial,
            **editorial_candidate,
        }
        if isinstance(editorial_candidate.get("conteudo_origem"), dict):
            modelo_editorial["conteudo_origem"] = {
                **modelo_editorial.get("conteudo_origem", {}),
                **editorial_candidate.get("conteudo_origem", {}),
            }
        if isinstance(editorial_candidate.get("estrategia_editorial"), dict):
            modelo_editorial["estrategia_editorial"] = {
                **modelo_editorial.get("estrategia_editorial", {}),
                **editorial_candidate.get("estrategia_editorial", {}),
            }
        if isinstance(editorial_candidate.get("personalizacao_brainhex"), dict):
            modelo_editorial["personalizacao_brainhex"] = {
                **modelo_editorial.get("personalizacao_brainhex", {}),
                **editorial_candidate.get("personalizacao_brainhex", {}),
            }
        if isinstance(editorial_candidate.get("adaptacao_formatos"), dict):
            modelo_editorial["adaptacao_formatos"] = {
                **modelo_editorial.get("adaptacao_formatos", {}),
                **editorial_candidate.get("adaptacao_formatos", {}),
            }
    state["conteudo_estudado"] = conteudo_estudado
    state["media_size_policy"] = conteudo_estudado.get("metas_tamanho")
    state["modelo_editorial"] = modelo_editorial
    state["perfil_editorial"] = perfil_editorial
    meta["estudo_conteudo"] = {
        "ok": bool(conteudo_estudado),
        "complexidade": conteudo_estudado.get("complexidade"),
        "conceitos_nucleares": len(conteudo_estudado.get("conceitos_nucleares") or []),
        "fallback": bool(study_raw.get("revisao", {}).get("status") == "fallback") if isinstance(study_raw, dict) else True,
    }
    meta["modelo_editorial"] = {
        "versao": modelo_editorial.get("versao"),
        "tema": (modelo_editorial.get("conteudo_origem") or {}).get("tema")
        if isinstance(modelo_editorial.get("conteudo_origem"), dict)
        else None,
        "mensagem_central": (modelo_editorial.get("conteudo_origem") or {}).get("mensagem_central")
        if isinstance(modelo_editorial.get("conteudo_origem"), dict)
        else None,
        "narrativa_tipo": (modelo_editorial.get("estrategia_editorial") or {}).get("narrativa_tipo")
        if isinstance(modelo_editorial.get("estrategia_editorial"), dict)
        else None,
        "perfil_dominante": (modelo_editorial.get("personalizacao_brainhex") or {}).get("perfil_dominante")
        if isinstance(modelo_editorial.get("personalizacao_brainhex"), dict)
        else perfil_editorial.get("perfil_dominante"),
        "assinatura_perfil": (modelo_editorial.get("personalizacao_brainhex") or {}).get("assinatura_perfil")
        if isinstance(modelo_editorial.get("personalizacao_brainhex"), dict)
        else perfil_editorial.get("assinatura_perfil"),
    }

    for formato in formatos:
        stage_log: list[dict[str, Any]] = []
        fallback_payload = _coerce_format_payload(formato, fallback_payloads.get(formato))
        common_payload = {
            "formato": formato,
            "topico": {
                "titulo_modulo": topico_context.get("nome"),
                "descricao_modulo": topico_context.get("descricao"),
            },
            "plano_personalizacao": plano,
            "perfil_contexto": {
                "dominante": perfil_dominante,
                "perfil_brainhex": state.get("perfil_brainhex", []),
                "modo_operacao": state.get("modo_operacao") or "imediato",
                "modo_resposta": state.get("modo_resposta") or "imediato",
            },
            "visual_contexto": visual_context,
            "fontes_chunks": source_chunks[:16],
            "fontes_midias_relevantes": fontes_midias_relevantes or [],
            "conteudo_estudado": conteudo_estudado,
            "modelo_editorial": modelo_editorial,
            "perfil_editorial": perfil_editorial,
            "metas_tamanho_adaptativas": conteudo_estudado.get("metas_tamanho"),
            "fidelidade_conteudo": "criativa",
            "cards_referencia": [
                {
                    "titulo": item.get("titulo"),
                    "descricao": item.get("descricao"),
                }
                for item in (state.get("cards_conteudo") or [])[:12]
                if isinstance(item, dict)
            ],
            "atividades_referencia": [
                {
                    "titulo": item.get("titulo"),
                    "descricao": item.get("descricao"),
                    "tipo": item.get("tipo"),
                }
                for item in (state.get("atividades_topico") or [])[:12]
                if isinstance(item, dict)
            ],
        }

        planning_raw = await _invoke_media_stage_llm(
            llm=llm,
            settings=settings,
            stage="planejamento",
            formato=formato,
            context_payload={**common_payload, "etapa": "planejamento"},
            fallback_payload=fallback_payload,
        )
        planning = planning_raw.get("plano") if isinstance(planning_raw.get("plano"), dict) else {}
        stage_log.append(
            {
                "etapa": "planejamento",
                "ok": bool(planning),
                "fallback": bool(planning_raw.get("revisao", {}).get("status") == "fallback"),
            }
        )

        style_payload = {
            **common_payload,
            "etapa": "estilizacao",
            "planejamento": planning,
            "payload_anterior": fallback_payload,
        }
        styling_raw = await _invoke_media_stage_llm(
            llm=llm,
            settings=settings,
            stage="estilizacao",
            formato=formato,
            context_payload=style_payload,
            fallback_payload=fallback_payload,
        )
        current_payload = _extract_format_payload_candidate(formato, styling_raw) or fallback_payload
        stage_log.append(
            {
                "etapa": "estilizacao",
                "ok": current_payload is not None,
                "fallback": bool(styling_raw.get("revisao", {}).get("status") == "fallback"),
            }
        )

        if current_payload is None:
            meta["errors"].append(f"{formato}:payload_vazio_estilizacao")
            meta["quality_gate"][formato] = {
                "approved": False,
                "status": "rejected",
                "issues": ["payload_vazio_estilizacao"],
            }
            meta["rejected_by_quality"].append(formato)
            meta["stages"][formato] = stage_log
            continue

        final_payload = current_payload
        for cycle in range(review_max_cycles):
            review_quality = _evaluate_media_payload_quality(
                formato=formato,
                payload=final_payload if isinstance(final_payload, (dict, list)) else None,
                conteudo_estudado=conteudo_estudado,
                min_quality_score=min_quality_score,
                modelo_editorial=modelo_editorial,
                perfil_dominante=perfil_dominante,
            )
            review_raw = await _invoke_media_stage_llm(
                llm=llm,
                settings=settings,
                stage="revisao",
                formato=formato,
                context_payload={
                    **style_payload,
                    "etapa": "revisao",
                    "payload_anterior": final_payload,
                    "checklist_qualidade": review_quality,
                    "ciclo_revisao": cycle + 1,
                },
                fallback_payload=final_payload,
            )
            review_info = review_raw.get("revisao") if isinstance(review_raw.get("revisao"), dict) else {}
            review_status = str(review_info.get("status") or "").strip().lower()
            should_adjust = (review_status in _QUALITY_REVIEW_STATUS_ADJUST) or (not review_quality["aprovado"])
            stage_log.append(
                {
                    "etapa": "revisao",
                    "ciclo": cycle + 1,
                    "status": review_status or "unknown",
                    "ok": bool(review_info),
                    "fallback": bool(review_status == "fallback"),
                    "quality_score": review_quality["score"],
                    "quality_approved": review_quality["aprovado"],
                    "score_coerencia": review_quality.get("score_coerencia"),
                    "score_fidelidade": review_quality.get("score_fidelidade"),
                    "score_personalizacao": review_quality.get("score_personalizacao"),
                    "score_diferenciacao_interperfil": review_quality.get("score_diferenciacao_interperfil"),
                    "issues": review_quality["issues"],
                }
            )

            if (
                not should_adjust
                and review_quality["aprovado"]
                and (review_status in _QUALITY_REVIEW_STATUS_OK or not review_status)
            ):
                break

            if cycle >= review_max_cycles - 1:
                break

            correction_raw = await _invoke_media_stage_llm(
                llm=llm,
                settings=settings,
                stage="correcao",
                formato=formato,
                context_payload={
                    **style_payload,
                    "etapa": "correcao",
                    "payload_anterior": final_payload,
                    "revisao": {
                        **review_info,
                        "checklist_qualidade": review_quality,
                    },
                    "ciclo_revisao": cycle + 1,
                },
                fallback_payload=final_payload,
            )
            corrected_payload = _extract_format_payload_candidate(formato, correction_raw) or final_payload
            final_payload = corrected_payload
            stage_log.append(
                {
                    "etapa": "correcao",
                    "ciclo": cycle + 1,
                    "ok": corrected_payload is not None,
                    "fallback": bool(correction_raw.get("revisao", {}).get("status") == "fallback"),
                }
            )

        final_quality = _evaluate_media_payload_quality(
            formato=formato,
            payload=final_payload if isinstance(final_payload, (dict, list)) else None,
            conteudo_estudado=conteudo_estudado,
            min_quality_score=min_quality_score,
            modelo_editorial=modelo_editorial,
            perfil_dominante=perfil_dominante,
        )
        meta["scores_validacao"][formato] = final_quality
        quality_approved = bool(final_quality.get("aprovado"))
        if not quality_approved:
            meta["errors"].append(
                f"{formato}:qualidade_nao_aprovada(score={final_quality['score']},issues={','.join(final_quality['issues'][:3])})"
            )
            meta["quality_gate"][formato] = {
                "approved": False,
                "status": "rejected",
                "issues": list(final_quality.get("issues") or []),
            }
            meta["rejected_by_quality"].append(formato)
        else:
            meta["quality_gate"][formato] = {
                "approved": True,
                "status": "approved",
                "issues": [],
            }
            raw_output[formato] = final_payload
        meta["stages"][formato] = stage_log

    return (raw_output or None), meta


def _pick_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _coerce_object(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw or raw[0] not in "{[":
            return None
        try:
            parsed = json.loads(raw)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _truncate_text(value: Any, limit: int = 420) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _looks_like_url(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("http://") or value.startswith("https://")


def _looks_like_path_or_filename(value: str | None) -> bool:
    if not value:
        return False
    text = value.strip().lower()
    if not text:
        return False
    if re.search(r"\s", text):
        return False
    if "/" in text or "\\" in text:
        return bool(
            re.match(r"^[a-z0-9._~:@%+\-/\\]+$", text, flags=re.I)
            and (
                re.search(r"\.(pdf|docx|doc|pptx|ppt|png|jpg|jpeg|mp3|mp4|csv|xlsx)$", text, flags=re.I)
                or re.match(r"^[a-f0-9-]{8,}/\d+/.+", text, flags=re.I)
            )
        )
    return bool(re.search(r"^[^/\\]+\.(pdf|docx|doc|pptx|ppt|png|jpg|jpeg|mp3|mp4|csv|xlsx)$", text, flags=re.I))


def _source_locator(value: str | None, *, bucket: str | None = None) -> dict[str, Any]:
    normalized = _pick_string(value)
    if not normalized:
        return {"url": None, "storage_path": None, "bucket": bucket}
    if _looks_like_url(normalized):
        return {"url": normalized, "storage_path": None, "bucket": bucket}
    return {"url": None, "storage_path": normalized, "bucket": bucket}


def _infer_source_type(
    *,
    declared_type: str | None = None,
    url: str | None = None,
    mime_hint: str | None = None,
) -> str:
    normalized_type = (declared_type or "").strip().lower()
    normalized_url = (url or "").strip().lower()
    normalized_mime = (mime_hint or "").strip().lower()

    if "pdf" in normalized_type or normalized_url.endswith(".pdf") or "application/pdf" in normalized_mime:
        return "pdf"
    if (
        any(token in normalized_type for token in ("slide", "ppt", "apresent"))
        or normalized_url.endswith((".ppt", ".pptx", ".pps", ".ppsx", ".odp", ".key"))
        or "docs.google.com/presentation" in normalized_url
    ):
        return "apresentacao"
    if (
        any(token in normalized_type for token in ("doc", "word", "document", "planilha", "sheet"))
        or normalized_url.endswith((".doc", ".docx", ".odt", ".rtf", ".xls", ".xlsx", ".csv"))
        or "docs.google.com/document" in normalized_url
    ):
        return "documento"
    if (
        any(token in normalized_type for token in ("image", "imagem", "png", "jpg", "jpeg", "webp", "svg"))
        or normalized_url.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"))
        or normalized_mime.startswith("image/")
    ):
        return "imagem"
    if (
        any(token in normalized_type for token in ("video", "youtube", "vimeo"))
        or normalized_url.endswith((".mp4", ".mov", ".webm", ".m4v", ".avi", ".m3u8"))
        or "youtube.com" in normalized_url
        or "youtu.be" in normalized_url
        or normalized_mime.startswith("video/")
    ):
        return "video"
    if (
        any(token in normalized_type for token in ("audio", "mp3", "wav", "ogg", "m4a", "aac"))
        or normalized_url.endswith((".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"))
        or normalized_mime.startswith("audio/")
    ):
        return "audio"
    if _looks_like_url(url):
        return "link"
    return "texto"


def _extract_urls(obj: dict[str, Any] | None) -> list[str]:
    if not obj:
        return []

    urls: list[str] = []
    nested_keys = ("viewer", "embed", "asset", "source", "arquivo", "midia")
    list_keys = ("files", "attachments", "anexos", "arquivos", "midias")

    for key in _URL_KEYS:
        value = _pick_string(obj.get(key))
        if value:
            urls.append(value)

    for nested_key in nested_keys:
        nested = _coerce_object(obj.get(nested_key))
        urls.extend(_extract_urls(nested))

    for list_key in list_keys:
        nested_list = obj.get(list_key)
        if not isinstance(nested_list, list):
            continue
        for item in nested_list:
            if isinstance(item, dict):
                urls.extend(_extract_urls(item))

    seen: set[str] = set()
    result: list[str] = []
    for url in urls:
        normalized = url.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _extract_urls_from_text(value: str | None) -> list[str]:
    text = str(value or "")
    if not text:
        return []
    matches = re.findall(r"https?://[^\s<>\]\)\"']+", text)
    deduped: list[str] = []
    seen: set[str] = set()
    for match in matches:
        normalized = match.strip().rstrip(".,;:!?")
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def _merge_relevant_media(
    base: list[dict[str, Any]] | None,
    extra: list[dict[str, Any]] | None,
    *,
    limit: int = 8,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in [*(base or []), *(extra or [])]:
        if not isinstance(item, dict):
            continue
        kind = _pick_string(item.get("tipo")) or ""
        url = _pick_string(item.get("url")) or ""
        storage_path = _pick_string(item.get("storage_path")) or ""
        key = f"{kind}|{url}|{storage_path}"
        if not kind or key in seen:
            continue
        seen.add(key)
        merged.append(item)
    merged.sort(key=lambda item: (0 if _pick_string(item.get("tipo")) == "imagem" else 1, _pick_string(item.get("url")) or ""))
    return merged[:limit]


def _collect_relevant_media_for_source(
    *,
    source: dict[str, Any],
    settings: Settings,
    source_kind: str,
    source_mime: str | None,
    bucket: str | None,
    storage_path: str | None,
    source_url: str | None,
    preview_payload: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    candidates: list[tuple[str | None, str | None, str | None]] = []
    if source_url:
        candidates.append((source_url, storage_path, source_mime))
    elif storage_path:
        public_url = build_public_storage_url(settings.supabase_url, bucket, storage_path)
        candidates.append((public_url, storage_path, source_mime))

    for extracted_url in _extract_urls(source):
        candidates.append((extracted_url, None, None))

    preview_obj = preview_payload if isinstance(preview_payload, dict) else {}
    for extracted_url in _extract_urls(preview_obj):
        candidates.append((extracted_url, None, _pick_string(preview_obj.get("arquivo_mime"))))

    preview_text = _pick_string(preview_obj.get("texto_extraido"))
    for extracted_url in _extract_urls_from_text(preview_text):
        candidates.append((extracted_url, None, None))

    if source_kind in {"imagem", "video", "audio"} and not candidates:
        candidates.append((source_url, storage_path, source_mime))

    relevant: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate_url, candidate_path, candidate_mime in candidates:
        kind = _infer_source_type(
            declared_type=source_kind,
            url=candidate_url or candidate_path,
            mime_hint=candidate_mime or source_mime,
        )
        if kind not in {"imagem", "video", "audio"}:
            continue
        normalized_url = _pick_string(candidate_url)
        normalized_path = _pick_string(candidate_path, storage_path)
        if not normalized_url and normalized_path:
            normalized_url = build_public_storage_url(settings.supabase_url, bucket, normalized_path)
        key = f"{kind}|{normalized_url or ''}|{normalized_path or ''}"
        if key in seen:
            continue
        seen.add(key)
        relevant.append(
            {
                "tipo": kind,
                "url": normalized_url,
                "storage_path": normalized_path,
                "bucket": bucket,
                "mime_type": _pick_string(candidate_mime, source_mime),
                "titulo": _pick_string(source.get("titulo"), source.get("nome_arquivo"), source.get("source_id")),
                "source_id": _pick_string(source.get("source_id")),
            }
        )

    return relevant[:8]


def _extract_transcript(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    return _truncate_text(
        _pick_string(
            metadata.get("transcricao"),
            metadata.get("transcript"),
            metadata.get("texto_extraido"),
            metadata.get("text"),
        ),
        limit=4000,
    )


def _iter_metadata_files(metadata: dict[str, Any] | None) -> list[dict[str, Any]]:
    files = metadata.get("files") if isinstance(metadata, dict) else None
    if not isinstance(files, list):
        return []
    return [item for item in files if isinstance(item, dict)]


def _build_source_hash(
    *,
    classe_id: int,
    topico_id: int | None,
    conteudo_id: int | None,
    materiais_origem: list[dict[str, Any]],
    cards_topico: list[dict[str, Any]] | None = None,
    atividades_topico: list[dict[str, Any]] | None = None,
    questoes_topico: list[dict[str, Any]] | None = None,
) -> str:
    payload = {
        "classe_id": classe_id,
        "topico_id": topico_id,
        "conteudo_id": conteudo_id,
        "fontes": [
            {
                "source_id": item.get("source_id"),
                "tipo": item.get("tipo"),
                "url": item.get("url"),
                "storage_path": item.get("storage_path"),
                "titulo": item.get("titulo"),
                "texto_base": item.get("texto_base"),
                "transcricao": item.get("transcricao"),
                "texto_extraido": item.get("texto_extraido"),
                "mime_type": item.get("mime_type"),
                "arquivo_bytes": item.get("arquivo_bytes"),
                "arquivo_mime": item.get("arquivo_mime"),
            }
            for item in materiais_origem
        ],
        "sinais_topico": {
            "cards": [
                {
                    "id": item.get("id"),
                    "conteudo_id": item.get("conteudo_id"),
                    "titulo": item.get("titulo"),
                    "descricao": item.get("descricao"),
                    "ordem": item.get("ordem"),
                }
                for item in (cards_topico or [])
            ],
            "atividades": [
                {
                    "id": item.get("id"),
                    "titulo": item.get("titulo"),
                    "descricao": item.get("descricao"),
                    "tipo": item.get("tipo"),
                    "pontuacao_maxima": item.get("pontuacao_maxima"),
                    "metadata": item.get("metadata"),
                }
                for item in (atividades_topico or [])
            ],
            "questoes": [
                {
                    "id": item.get("id"),
                    "atividade_id": item.get("atividade_id"),
                    "enunciado": item.get("enunciado"),
                    "tipo": item.get("tipo"),
                }
                for item in (questoes_topico or [])
            ],
        },
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()


def _extract_source_materials(
    conteudos: list[dict[str, Any]],
    midias: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()

    def append_source(source: dict[str, Any]) -> None:
        dedupe_key = (
            source.get("conteudo_id"),
            source.get("tipo"),
            source.get("url"),
            source.get("storage_path"),
            source.get("texto_base"),
            source.get("titulo"),
        )
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        sources.append(source)

    for conteudo in conteudos:
        conteudo_id = conteudo.get("id")
        titulo = _pick_string(conteudo.get("titulo")) or f"Conteudo {conteudo_id}"
        metadata = _coerce_object(conteudo.get("metadata")) or {}
        conteudo_tipo = _pick_string(conteudo.get("tipo"))
        conteudo_raw = _pick_string(conteudo.get("conteudo"))
        descricao_campo = _truncate_text(conteudo.get("descricao"))
        conteudo_referencia_arquivo = _looks_like_url(conteudo_raw) or _looks_like_storage_path(conteudo_raw)
        descricao = descricao_campo or (None if conteudo_referencia_arquivo else _truncate_text(conteudo_raw))
        transcricao = _extract_transcript(metadata)
        mime_type = _pick_string(
            conteudo.get("mime_type"),
            conteudo.get("arquivo_mime"),
            metadata.get("mimeType"),
            metadata.get("mime"),
        )

        if conteudo_referencia_arquivo:
            locator = _source_locator(conteudo_raw, bucket=_CONTEUDOS_BUCKET)
            append_source(
                {
                    "source_id": f"conteudo:{conteudo_id}:arquivo",
                    "origem": "conteudo_payload",
                    "conteudo_id": conteudo_id,
                    "tipo": _infer_source_type(
                        declared_type=conteudo_tipo,
                        url=conteudo_raw,
                        mime_hint=mime_type,
                    ),
                    "titulo": titulo,
                    "descricao": descricao,
                    "url": locator["url"],
                    "storage_path": locator["storage_path"],
                    "bucket": locator["bucket"],
                    "texto_base": transcricao or descricao,
                    "transcricao": transcricao,
                    "mime_type": mime_type,
                }
            )

        for index, url in enumerate(_extract_urls(metadata), start=1):
            locator = _source_locator(url, bucket=_CONTEUDOS_BUCKET)
            append_source(
                {
                    "source_id": f"conteudo:{conteudo_id}:url:{index}",
                    "origem": "conteudo_metadata",
                    "conteudo_id": conteudo_id,
                    "tipo": _infer_source_type(
                        declared_type=conteudo_tipo,
                        url=url,
                        mime_hint=mime_type,
                    ),
                    "titulo": titulo,
                    "descricao": descricao,
                    "url": locator["url"],
                    "storage_path": locator["storage_path"],
                    "bucket": locator["bucket"],
                    "texto_base": descricao,
                    "transcricao": transcricao,
                    "mime_type": mime_type,
                }
            )

        for index, file_item in enumerate(_iter_metadata_files(metadata), start=1):
            file_url = _pick_string(
                file_item.get("url"),
                file_item.get("path"),
                file_item.get("storage_path"),
                file_item.get("storagePath"),
                file_item.get("arquivo_url"),
            )
            file_transcricao = _extract_transcript(file_item)
            if not file_url and not file_transcricao:
                continue
            locator = _source_locator(file_url, bucket=_CONTEUDOS_BUCKET)
            append_source(
                {
                    "source_id": f"conteudo:{conteudo_id}:file:{index}",
                    "origem": "conteudo_file",
                    "conteudo_id": conteudo_id,
                    "tipo": _infer_source_type(
                        declared_type=_pick_string(file_item.get("tipo"), file_item.get("name"), conteudo_tipo),
                        url=file_url,
                        mime_hint=_pick_string(file_item.get("mimeType"), file_item.get("mime_type")),
                    ),
                    "titulo": _pick_string(file_item.get("name"), titulo) or titulo,
                    "descricao": descricao,
                    "url": locator["url"],
                    "storage_path": locator["storage_path"],
                    "bucket": locator["bucket"],
                    "texto_base": file_transcricao or descricao,
                    "transcricao": file_transcricao,
                    "mime_type": _pick_string(file_item.get("mimeType"), file_item.get("mime_type")),
                }
            )

        if descricao:
            append_source(
                {
                    "source_id": f"conteudo:{conteudo_id}:texto",
                    "origem": "conteudo_texto",
                    "conteudo_id": conteudo_id,
                    "tipo": _infer_source_type(declared_type=conteudo_tipo),
                    "titulo": titulo,
                    "descricao": descricao,
                    "url": None,
                    "texto_base": descricao,
                    "transcricao": transcricao,
                }
            )

    for midia in midias:
        conteudo_id = midia.get("conteudo_id")
        url = _pick_string(midia.get("url"))
        locator = _source_locator(url, bucket=_CONTEUDOS_BUCKET)
        legenda = _truncate_text(midia.get("legenda"))
        conteudo_titulo = _pick_string(midia.get("conteudo_titulo")) or f"Conteudo {conteudo_id}"
        metadata = _coerce_object(midia.get("metadata")) or {}
        transcricao = _extract_transcript(metadata)
        append_source(
            {
                "source_id": f"midia:{midia.get('id')}",
                "origem": "midia",
                "conteudo_id": conteudo_id,
                "tipo": _infer_source_type(declared_type=_pick_string(midia.get("tipo")), url=url),
                "titulo": conteudo_titulo,
                "descricao": legenda,
                "url": locator["url"],
                "storage_path": locator["storage_path"],
                "bucket": locator["bucket"],
                "texto_base": transcricao or legenda,
                "transcricao": transcricao,
                "mime_type": _pick_string(metadata.get("mimeType"), metadata.get("mime_type")),
            }
        )

    return sources[:24]


def _merge_source_materials(
    primary_sources: list[dict[str, Any]],
    extra_sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()

    for source in [*primary_sources, *extra_sources]:
        dedupe_key = (
            source.get("conteudo_id"),
            source.get("tipo"),
            source.get("url"),
            source.get("storage_path"),
            source.get("texto_base"),
            source.get("titulo"),
        )
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        merged.append(source)

    return merged[:32]


def _summarize_sources_debug(
    materiais_origem: list[dict[str, Any]],
    *,
    sample_limit: int = 8,
) -> dict[str, Any]:
    sample: list[dict[str, Any]] = []
    by_origem: dict[str, int] = {}
    by_tipo: dict[str, int] = {}
    with_storage_path = 0
    with_url = 0
    with_texto_extraido = 0
    with_real_file = 0

    for item in materiais_origem:
        if not isinstance(item, dict):
            continue
        origem = str(item.get("origem") or "").strip().lower() or "desconhecida"
        tipo = str(item.get("tipo") or "").strip().lower() or "desconhecido"
        by_origem[origem] = by_origem.get(origem, 0) + 1
        by_tipo[tipo] = by_tipo.get(tipo, 0) + 1

        storage_path = _pick_string(item.get("storage_path"))
        url = _pick_string(item.get("url"), item.get("arquivo_url"))
        texto = _pick_string(item.get("texto_extraido"))
        if storage_path:
            with_storage_path += 1
        if url:
            with_url += 1
        if texto:
            with_texto_extraido += 1
        if bool(item.get("arquivo_real_carregado")):
            with_real_file += 1

        if len(sample) < sample_limit:
            sample.append(
                {
                    "source_id": item.get("source_id"),
                    "origem": origem,
                    "tipo": tipo,
                    "bucket": item.get("bucket"),
                    "storage_path": storage_path,
                    "url": url,
                    "texto_extraido_len": len(texto or ""),
                    "arquivo_real_carregado": bool(item.get("arquivo_real_carregado")),
                    "multimodal_contexto_gerado": bool(item.get("multimodal_contexto_gerado")),
                }
            )

    return {
        "total": len([item for item in materiais_origem if isinstance(item, dict)]),
        "with_storage_path": with_storage_path,
        "with_url": with_url,
        "with_texto_extraido": with_texto_extraido,
        "with_real_file": with_real_file,
        "by_origem": by_origem,
        "by_tipo": by_tipo,
        "sample": sample,
    }


def _clean_extracted_text(
    text: str,
    *,
    preserve_lines: bool = False,
    max_chars: int | None = None,
) -> str:
    return clean_extracted_text(
        text,
        preserve_lines=preserve_lines,
        max_chars=max_chars,
    )


def _split_text_chunks(
    text: str,
    *,
    window: int = _CHUNK_WINDOW,
    overlap: int = _CHUNK_OVERLAP,
) -> list[str]:
    return split_text_chunks(
        text,
        window=window,
        overlap=overlap,
        min_chunk_chars=20,
    )


def _doc_to_context_text(doc: Any, *, max_chars: int = 8000) -> str | None:
    if doc is None:
        return None
    text: str | None = None
    try:
        plain_text_fn = getattr(doc, "plain_text", None)
        if callable(plain_text_fn):
            text = plain_text_fn(separator="\n")
    except Exception:
        text = None
    if not text:
        blocks = getattr(doc, "blocks", None)
        if isinstance(blocks, list):
            parts: list[str] = []
            for block in blocks:
                block_text = _pick_string(getattr(block, "text", None))
                if block_text:
                    parts.append(block_text)
            text = "\n".join(parts)
    normalized = _clean_extracted_text(str(text or ""), preserve_lines=True, max_chars=max_chars)
    if not normalized:
        return None
    single_line = re.sub(r"\s+", " ", normalized).strip()
    if _looks_like_url(single_line) or _looks_like_storage_path(single_line) or _looks_like_path_or_filename(single_line):
        return None
    return normalized


def _score_chunk(chunk: str, tokens: list[str]) -> int:
    base = chunk.lower()
    score = 0
    for token in tokens:
        if token and token in base:
            score += 1
    return score


def _collect_source_chunks(
    *,
    materiais_origem: list[dict[str, Any]],
    topico: dict[str, Any] | None,
    perfil: str,
    limit: int = 18,
) -> list[dict[str, Any]]:
    tokens = [
        str(perfil or "").lower(),
        str((topico or {}).get("nome") or "").lower(),
        str((topico or {}).get("descricao") or "").lower(),
    ]
    ranked: list[tuple[int, dict[str, Any]]] = []
    for source in materiais_origem:
        source_id = _pick_string(source.get("source_id")) or str(source.get("id") or "fonte")
        source_tipo = _pick_string(source.get("tipo")) or "texto"
        source_titulo = _pick_string(source.get("titulo")) or source_id
        chunks = source.get("texto_chunks") if isinstance(source.get("texto_chunks"), list) else []
        if not chunks:
            text = _pick_string(
                source.get("texto_extraido"),
                source.get("texto_base"),
                source.get("descricao"),
                _strip_path_to_label(source.get("titulo")),
            )
            chunks = _split_text_chunks(text or "")
        for idx, chunk in enumerate(chunks[:10], start=1):
            normalized = str(chunk).strip()
            if not normalized:
                continue
            score = _score_chunk(normalized, tokens)
            ranked.append(
                (
                    score,
                    {
                        "source_id": source_id,
                        "source_tipo": source_tipo,
                        "source_titulo": source_titulo,
                        "chunk_ordem": idx,
                        "chunk_texto": normalized,
                    },
                )
            )
    ranked.sort(key=lambda item: item[0], reverse=True)
    dedup: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for _, item in ranked:
        key = (str(item["source_id"]), str(item["chunk_texto"])[:120])
        if key in seen:
            continue
        seen.add(key)
        dedup.append(item)
        if len(dedup) >= limit:
            break
    return dedup


def _target_items_count(*, seeds: int, chunks: int) -> int:
    if seeds <= 0 and chunks <= 0:
        return _MIN_PERSONALIZED_ITEMS
    proportional = max(seeds, min(_MAX_PERSONALIZED_ITEMS, max(1, chunks // 2)))
    return max(_MIN_PERSONALIZED_ITEMS, min(_MAX_PERSONALIZED_ITEMS, proportional))


def _is_uploaded_reference_source(source: dict[str, Any]) -> bool:
    origem = (_pick_string(source.get("origem")) or "").lower()
    source_id = (_pick_string(source.get("source_id")) or "").lower()
    if origem in {"upload", "fonte", "fonte_personalizacao"}:
        return True
    return source_id.startswith("fonte:")


def _has_uploaded_file_reference(materiais_origem: list[dict[str, Any]]) -> bool:
    for source in materiais_origem:
        if not isinstance(source, dict):
            continue
        if _pick_string(source.get("storage_path"), source.get("url"), source.get("arquivo_url")):
            return True
    return False


def _has_meaningful_extracted_content(materiais_origem: list[dict[str, Any]], min_chars: int = 120) -> bool:
    for source in materiais_origem:
        if not isinstance(source, dict):
            continue
        text = _pick_string(source.get("texto_extraido"))
        if text and len(text.strip()) >= min_chars:
            return True
    return False


def _media_payload_text_volume(materiais: dict[str, Any]) -> int:
    total = 0
    for key in ("pdf", "documento", "apresentacao", "video", "audio"):
        material = materiais.get(key)
        if not isinstance(material, dict):
            continue
        payload = material.get("payload") if isinstance(material.get("payload"), dict) else {}
        if key in {"pdf", "documento"}:
            total += len(_pick_string(payload.get("titulo"), payload.get("resumo")) or "")
            for secao in payload.get("secoes") or []:
                total += len(str(secao or "").strip())
        elif key == "apresentacao":
            total += len(_pick_string(payload.get("titulo"), payload.get("abertura")) or "")
            for slide in payload.get("slides") or []:
                if not isinstance(slide, dict):
                    continue
                total += len(_pick_string(slide.get("titulo")) or "")
                for ponto in slide.get("pontos") or []:
                    total += len(str(ponto or "").strip())
        elif key in {"video", "audio"}:
            total += len(_pick_string(payload.get("roteiro"), payload.get("texto")) or "")
            for cena in payload.get("cenas") or []:
                total += len(str(cena or "").strip())
    return total


async def _download_source_bytes(
    *,
    storage: SupabaseStorage,
    source: dict[str, Any],
    bucket: str | None,
    storage_path: str | None,
    url: str | None,
) -> bytes | None:
    raw: bytes | None = None
    if storage_path and bucket:
        try:
            raw = await storage.download_bytes(bucket=bucket, path=storage_path)
        except Exception:
            raw = None
    if raw is None and url:
        try:
            raw = await storage.download_public_bytes(url)
        except Exception:
            raw = None
    return raw


def _multimodal_models(settings: Settings) -> tuple[str, str]:
    primary = str(getattr(settings, "gemini_materiais_model", "") or "").strip()
    if not primary:
        primary = str(getattr(settings, "gemini_model_multimodal_primary", "") or "").strip()
    fallback = str(getattr(settings, "gemini_model_multimodal_fallback", "") or "").strip()
    if not primary:
        primary = _DEFAULT_GEMINI_MULTIMODAL_PRIMARY
    if not fallback:
        fallback = _DEFAULT_GEMINI_MULTIMODAL_FALLBACK
    if fallback == primary:
        fallback = _DEFAULT_GEMINI_MULTIMODAL_FALLBACK if primary != _DEFAULT_GEMINI_MULTIMODAL_FALLBACK else ""
    return primary, fallback


async def _summarize_multimodal_source_with_gemini(
    *,
    settings: Settings,
    raw_bytes: bytes,
    mime_type: str,
    source_title: str,
) -> str | None:
    if not settings.gemini_api_key or not raw_bytes:
        return None

    encoded = base64.b64encode(raw_bytes).decode("ascii")
    primary, fallback = _multimodal_models(settings)
    tried_models: list[str] = []
    for model_name in [primary, fallback]:
        if not model_name or model_name in tried_models:
            continue
        tried_models.append(model_name)
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent?key={settings.gemini_api_key}"
        )
        body = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "Analise o arquivo multimodal e gere um resumo fiel em português brasileiro. "
                                "Extraia os conceitos centrais, fatos relevantes, estrutura e termos técnicos em até 12 tópicos curtos. "
                                "Não invente informações ausentes."
                            )
                        },
                        {"text": f"Título da fonte: {source_title or 'fonte sem título'}"},
                        {
                            "inline_data": {
                                "mime_type": mime_type or "application/octet-stream",
                                "data": encoded,
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 2048,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=body)
                response.raise_for_status()
                payload = response.json()
        except Exception:
            continue

        summary = _extract_text_from_gemini_payload(payload).strip()
        if summary:
            return summary
    return None


async def _hydrate_source_materials_content(
    *,
    materiais_origem: list[dict[str, Any]],
    settings: Settings,
) -> list[dict[str, Any]]:
    storage = SupabaseStorage(settings)
    hydrated: list[dict[str, Any]] = []

    for source in materiais_origem:
        source_id = _pick_string(source.get("source_id")) or "fonte"
        if _pick_string(source.get("transcricao")):
            transcricao = _pick_string(source.get("transcricao"))
            source_url = _pick_string(source.get("url"), source.get("arquivo_url"))
            source_storage_path = _pick_string(source.get("storage_path"))
            source_mime = _pick_string(source.get("mime_type"), source.get("arquivo_mime"))
            source_kind = _infer_source_type(
                declared_type=_pick_string(source.get("tipo"), source.get("source_tipo")),
                url=source_url or source_storage_path,
                mime_hint=source_mime,
            )
            midias_relevantes = _collect_relevant_media_for_source(
                source=source,
                settings=settings,
                source_kind=source_kind,
                source_mime=source_mime,
                bucket=_resolve_source_bucket(source),
                storage_path=source_storage_path,
                source_url=source_url,
            )
            hydrated.append(
                {
                    **source,
                    "titulo": _strip_path_to_label(_pick_string(source.get("titulo"), source.get("nome_arquivo"))),
                    "texto_extraido": transcricao,
                    "texto_chunks": _split_text_chunks(transcricao or ""),
                    "midias_relevantes": midias_relevantes,
                }
            )
            logger.info(
                "DEBUG_PERSONALIZACAO.hydrate_source=%s",
                {
                    "source_id": source_id,
                    "mode": "transcricao_existente",
                    "origem": source.get("origem"),
                    "tipo": source.get("tipo"),
                    "bucket": source.get("bucket"),
                    "storage_path": source.get("storage_path"),
                    "texto_extraido_len": len(transcricao or ""),
                },
            )
            continue
        resolved_storage_path = _pick_string(source.get("storage_path"))
        if not resolved_storage_path:
            descricao_candidate = _pick_string(source.get("descricao"), source.get("texto_base"))
            if descricao_candidate and _looks_like_storage_path(descricao_candidate):
                resolved_storage_path = descricao_candidate

        source_with_resolved_path = {
            **source,
            "storage_path": resolved_storage_path or source.get("storage_path"),
        }
        resolved_bucket = _resolve_source_bucket(source_with_resolved_path)

        # Enrich source dict with resolved bucket/path before passing to ingest_source
        source_for_ingest = {
            **source_with_resolved_path,
            "bucket": resolved_bucket or source.get("bucket"),
            "storage_path": resolved_storage_path or source_with_resolved_path.get("storage_path"),
        }
        source_url = _pick_string(source.get("url"), source.get("arquivo_url"))
        source_url_or_path = source_url or _pick_string(source_for_ingest.get("storage_path"))
        source_mime = _pick_string(source.get("mime_type"), source.get("arquivo_mime"))
        source_kind = _infer_source_type(
            declared_type=_pick_string(source.get("tipo"), source.get("source_tipo")),
            url=source_url_or_path,
            mime_hint=source_mime,
        )
        midias_relevantes_base = _collect_relevant_media_for_source(
            source=source,
            settings=settings,
            source_kind=source_kind,
            source_mime=source_mime,
            bucket=resolved_bucket,
            storage_path=resolved_storage_path,
            source_url=source_url,
        )
        _doc = None
        try:
            _doc, chunks = await _ingest_source(source_for_ingest, storage_downloader=storage)
        except Exception:
            _doc = None
            chunks = []

        texto_doc = _doc_to_context_text(_doc) if _doc is not None else None

        if chunks:
            texto_extraido = _clean_extracted_text(
                _chunks_to_plain_text(chunks, limit=10),
                preserve_lines=True,
                max_chars=10_000,
            )
            hydrated.append(
                {
                    **source,
                    "bucket": resolved_bucket or source.get("bucket"),
                    "storage_path": resolved_storage_path or source.get("storage_path"),
                    "titulo": _strip_path_to_label(_pick_string(source.get("titulo"), source.get("nome_arquivo"))),
                    "texto_extraido": texto_extraido,
                    "texto_chunks": _split_text_chunks(texto_extraido or ""),
                    "midias_relevantes": midias_relevantes_base,
                    "arquivo_real_carregado": True,
                    "mime_type": _pick_string(source.get("mime_type"), source.get("arquivo_mime"), source_mime),
                }
            )
            logger.info(
                "DEBUG_PERSONALIZACAO.hydrate_source=%s",
                {
                    "source_id": source_id,
                    "mode": "arquivo_real",
                    "origem": source.get("origem"),
                    "tipo": source_kind,
                    "bucket": resolved_bucket or source.get("bucket"),
                    "storage_path": resolved_storage_path or source.get("storage_path"),
                    "url": source_url,
                    "chunks_count": len(chunks),
                    "texto_extraido_len": len(texto_extraido or ""),
                },
            )
        elif texto_doc:
            hydrated.append(
                {
                    **source,
                    "bucket": resolved_bucket or source.get("bucket"),
                    "storage_path": resolved_storage_path or source.get("storage_path"),
                    "titulo": _strip_path_to_label(_pick_string(source.get("titulo"), source.get("nome_arquivo"))),
                    "texto_extraido": texto_doc,
                    "texto_chunks": _split_text_chunks(texto_doc or ""),
                    "midias_relevantes": midias_relevantes_base,
                    "arquivo_real_carregado": True,
                    "mime_type": _pick_string(source.get("mime_type"), source.get("arquivo_mime"), source_mime),
                }
            )
            logger.info(
                "DEBUG_PERSONALIZACAO.hydrate_source=%s",
                {
                    "source_id": source_id,
                    "mode": "arquivo_real_doc_sem_chunks",
                    "origem": source.get("origem"),
                    "tipo": source_kind,
                    "bucket": resolved_bucket or source.get("bucket"),
                    "storage_path": resolved_storage_path or source.get("storage_path"),
                    "url": source_url,
                    "doc_blocks_count": len(getattr(_doc, "blocks", []) or []),
                    "texto_extraido_len": len(texto_doc or ""),
                },
            )
            continue
        else:
            texto_fallback = _pick_string(source.get("texto_base"), source.get("descricao"))
            multimodal_contexto_gerado = False
            preview_payload: dict[str, Any] = {}
            source_size_bytes: int | None = None
            if texto_fallback and (
                _looks_like_storage_path(texto_fallback)
                or _looks_like_url(texto_fallback)
                or _looks_like_path_or_filename(texto_fallback)
            ):
                texto_fallback = ""
            try:
                preview_payload = await storage.load_source_preview(
                    url=source_url,
                    bucket=resolved_bucket,
                    storage_path=resolved_storage_path,
                    mime_type=source_mime,
                )
            except Exception:
                preview_payload = {}
            midias_relevantes = _merge_relevant_media(
                midias_relevantes_base,
                _collect_relevant_media_for_source(
                    source=source,
                    settings=settings,
                    source_kind=source_kind,
                    source_mime=source_mime,
                    bucket=resolved_bucket,
                    storage_path=resolved_storage_path,
                    source_url=source_url,
                    preview_payload=preview_payload,
                ),
            )
            preview_text = _pick_string(preview_payload.get("texto_extraido"))
            preview_mime = _pick_string(preview_payload.get("arquivo_mime"))
            if not source_mime and preview_mime:
                source_mime = preview_mime
            try:
                source_size_bytes = int(preview_payload.get("arquivo_bytes"))
            except (TypeError, ValueError):
                source_size_bytes = None
            if preview_text and not (
                _looks_like_storage_path(preview_text)
                or _looks_like_url(preview_text)
                or _looks_like_path_or_filename(preview_text)
            ):
                texto_fallback = preview_text
            if not texto_fallback:
                texto_fallback = _strip_path_to_label(
                    _pick_string(source.get("titulo"), source.get("nome_arquivo"), source.get("source_id"))
                )
            if not _is_meaningful_source_text(texto_fallback):
                raw_bytes = await _download_source_bytes(
                    storage=storage,
                    source=source,
                    bucket=resolved_bucket,
                    storage_path=resolved_storage_path,
                    url=source_url,
                )
                if raw_bytes:
                    multimodal_summary = await _summarize_multimodal_source_with_gemini(
                        settings=settings,
                        raw_bytes=raw_bytes,
                        mime_type=source_mime or "",
                        source_title=_pick_string(source.get("titulo"), source.get("nome_arquivo"), source.get("source_id")) or "fonte",
                    )
                    if multimodal_summary:
                        texto_fallback = multimodal_summary
                        multimodal_contexto_gerado = True
            hydrated.append(
                {
                    **source,
                    "bucket": resolved_bucket or source.get("bucket"),
                    "storage_path": resolved_storage_path or source.get("storage_path"),
                    "titulo": _strip_path_to_label(_pick_string(source.get("titulo"), source.get("nome_arquivo"))),
                    "texto_extraido": texto_fallback,
                    "texto_chunks": _split_text_chunks(texto_fallback or ""),
                    "midias_relevantes": midias_relevantes,
                    "multimodal_contexto_gerado": multimodal_contexto_gerado,
                    "tamanho_bytes": source.get("tamanho_bytes") if source.get("tamanho_bytes") is not None else source_size_bytes,
                    "mime_type": _pick_string(source.get("mime_type"), source.get("arquivo_mime"), source_mime),
                }
            )
            logger.info(
                "DEBUG_PERSONALIZACAO.hydrate_source=%s",
                {
                    "source_id": source_id,
                    "mode": "fallback",
                    "origem": source.get("origem"),
                    "tipo": source_kind,
                    "bucket": resolved_bucket or source.get("bucket"),
                    "storage_path": resolved_storage_path or source.get("storage_path"),
                    "url": source_url,
                    "multimodal_contexto_gerado": multimodal_contexto_gerado,
                    "preview_text_len": len(preview_text or ""),
                    "source_size_bytes": source_size_bytes,
                    "texto_fallback_len": len(texto_fallback or ""),
                },
            )

    return hydrated


def _build_fonte_enrichment_payload(
    *,
    source: dict[str, Any],
    settings: Settings,
) -> dict[str, Any] | None:
    fonte_id = _parse_fonte_id(source)
    if fonte_id is None:
        return None

    storage_path = _pick_string(source.get("storage_path"))
    source_url = _pick_string(source.get("arquivo_url"), source.get("url"))
    bucket = _resolve_source_bucket(source) or _pick_string(source.get("bucket"))
    arquivo_url = source_url
    if not arquivo_url and bucket and storage_path:
        arquivo_url = build_public_storage_url(settings.supabase_url, bucket, storage_path)

    nome_arquivo = _infer_file_name(
        storage_path=storage_path,
        source_url=source_url,
        explicit_name=_pick_string(source.get("nome_arquivo")),
        fallback_title=_pick_string(source.get("titulo")),
    )
    mime_type = _infer_mime_type(
        declared_mime=_pick_string(source.get("mime_type"), source.get("arquivo_mime")),
        file_name=nome_arquivo,
        source_url_or_path=_pick_string(storage_path, source_url),
    )

    texto_extraido = _pick_string(source.get("texto_extraido"))
    descricao = _truncate_text(texto_extraido, limit=6000) if _is_meaningful_source_text(texto_extraido) else None
    tamanho_bytes = source.get("tamanho_bytes")
    if tamanho_bytes is not None:
        try:
            tamanho_bytes = int(tamanho_bytes)
        except (TypeError, ValueError):
            tamanho_bytes = None

    midias_relevantes: list[dict[str, Any]] = []
    if isinstance(source.get("midias_relevantes"), list):
        for item in source.get("midias_relevantes") or []:
            if not isinstance(item, dict):
                continue
            tipo = _pick_string(item.get("tipo"))
            url = _pick_string(item.get("url"))
            storage_ref = _pick_string(item.get("storage_path"))
            if not tipo or (not url and not storage_ref):
                continue
            midias_relevantes.append(
                {
                    "tipo": tipo,
                    "url": url,
                    "storage_path": storage_ref,
                    "bucket": _pick_string(item.get("bucket")),
                    "mime_type": _pick_string(item.get("mime_type")),
                    "titulo": _pick_string(item.get("titulo")),
                    "source_id": _pick_string(item.get("source_id")),
                }
            )
    metadata_patch: dict[str, Any] = {}
    if bucket:
        metadata_patch["bucket"] = bucket
    if midias_relevantes:
        metadata_patch["midias_relevantes"] = midias_relevantes

    if not any([descricao, arquivo_url, storage_path, mime_type, nome_arquivo, tamanho_bytes is not None, metadata_patch]):
        return None

    return {
        "fonte_id": fonte_id,
        "descricao": descricao,
        "arquivo_url": arquivo_url,
        "storage_path": storage_path,
        "mime_type": mime_type,
        "nome_arquivo": nome_arquivo,
        "tamanho_bytes": tamanho_bytes,
        "metadata_patch": metadata_patch or None,
    }


async def _persist_hydrated_sources_into_fontes(
    *,
    fontes_repo: FontesPersonalizacaoRepository,
    materiais_origem: list[dict[str, Any]],
    settings: Settings,
) -> None:
    updates = 0
    for source in materiais_origem:
        if not isinstance(source, dict):
            continue
        payload = _build_fonte_enrichment_payload(source=source, settings=settings)
        if not payload:
            continue
        try:
            updated = await fontes_repo.atualizar_enriquecimento(
                fonte_id=int(payload["fonte_id"]),
                descricao=payload.get("descricao"),
                arquivo_url=payload.get("arquivo_url"),
                storage_path=payload.get("storage_path"),
                mime_type=payload.get("mime_type"),
                nome_arquivo=payload.get("nome_arquivo"),
                tamanho_bytes=payload.get("tamanho_bytes"),
                metadata_patch=payload.get("metadata_patch"),
            )
            if updated:
                updates += 1
        except Exception:
            logger.exception(
                "Falha ao atualizar fonte_personalizacao com texto extraido",
                extra={
                    "source_id": source.get("source_id"),
                    "conteudo_id": source.get("conteudo_id"),
                    "topico_id": source.get("topico_id"),
                },
            )
            try:
                await fontes_repo.session.rollback()
            except Exception:
                logger.exception(
                    "Falha ao executar rollback apos erro em fontes_personalizacao",
                    extra={"source_id": source.get("source_id")},
                )
    if updates:
        logger.info("fontes_personalizacao.hydrated_updates=%s", {"updates": updates})


def _coerce_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _recomendar_formatos(
    *,
    perfil: str,
    modo_operacao: str | None,
    materiais_origem: list[dict[str, Any]],
) -> list[str]:
    entradas = {str(item.get("tipo") or "").lower() for item in materiais_origem}
    ranked: list[str] = []

    if entradas & {"pdf", "documento", "apresentacao"}:
        ranked.extend(["apresentacao", "markdown", "audio", "cards"])
    if "video" in entradas:
        ranked.extend(["cards", "markdown", "apresentacao"])
    if "imagem" in entradas:
        ranked.extend(["cards", "markdown", "apresentacao"])
    if "audio" in entradas:
        ranked.extend(["cards", "markdown"])

    profile_preferences = {
        "Achiever": ["markdown", "apresentacao", "cards", "audio"],
        "Conqueror": ["apresentacao", "cards", "markdown", "audio"],
        "Socialiser": ["audio", "cards", "markdown", "apresentacao"],
        "Daredevil": ["audio", "cards", "apresentacao", "markdown"],
        "Mastermind": ["markdown", "apresentacao", "audio", "cards"],
        "Seeker": ["markdown", "apresentacao", "cards", "audio"],
        "Survivor": ["cards", "markdown", "audio", "apresentacao"],
    }
    ranked.extend(profile_preferences.get(perfil, ["markdown", "cards", "audio", "apresentacao"]))

    normalized_mode = (modo_operacao or "").strip().lower()
    if normalized_mode == "imediato":
        ranked = ["cards", "audio", "markdown"] + ranked
    elif normalized_mode == "analitico":
        ranked = ["markdown", "apresentacao", "audio", "cards"] + ranked
    elif normalized_mode == "exploratorio":
        ranked = ["apresentacao", "cards", "markdown", "audio"] + ranked

    if not entradas:
        ranked = ["markdown", "cards", "audio", "apresentacao"] + ranked

    unique: list[str] = []
    for formato in ranked:
        if formato not in _ALL_FORMATOS or formato in unique:
            continue
        unique.append(formato)

    return unique[:4] or ["cards", "markdown"]


def _fallback_plano_for_state(state: dict[str, Any]) -> dict[str, Any]:
    perfil = _perfil_dominante(state.get("perfil_brainhex", []))
    formatos = _recomendar_formatos(
        perfil=perfil,
        modo_operacao=state.get("modo_operacao"),
        materiais_origem=state.get("materiais_origem", []),
    )
    return {
        **_FALLBACK_PLANO,
        "formato_prioritario": formatos[0],
        "formatos": formatos,
        "estilo": "transformação-multiformato orientada por fontes",
        "justificativa": "Plano padrão baseado no perfil do aluno e nos materiais-fonte disponíveis.",
        "refresh_policy": {"mode": "once", "trigger_actions": []},
    }


def _strip_leading_index(value: str) -> str:
    out = str(value or "").strip()
    if not out:
        return ""
    out = re.sub(r"^(?:card|atividade|quest(?:ao|Ã£o)|pergunta)\s*#?\s*\d+\s*[:.)-]\s*", "", out, flags=re.I)
    out = re.sub(r"^\d+\s*[:.)-]\s*", "", out)
    out = re.sub(r"^[ivxlcdm]+\s*[:.)-]\s*", "", out, flags=re.I)
    return out.strip()

def _ensure_card_question_title(value: str) -> str:
    clean = re.sub(r"^pergunta\s*[:.)-]\s*", "", _strip_leading_index(value), flags=re.I).strip()
    if not clean:
        return ""
    if clean.endswith("?"):
        return clean
    return f"{clean.rstrip('.:;!, ')}?"


def _ensure_card_answer_text(value: str) -> str:
    return re.sub(r"^resposta\s*[:.)-]\s*", "", _strip_leading_index(value), flags=re.I).strip()


def _normalize_key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or "").lower())
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", ascii_text).strip()


def _strip_personalization_language(value: str) -> str:
    text = _clean_extracted_text(str(value or ""), preserve_lines=False)
    if not text:
        return ""
    patterns = [
        r"\bconteudo\s+personalizado\b",
        r"\bmaterial\s+personalizado\b",
        r"\batividade\s+personalizada\b",
        r"\bcards?\s+personalizados?\b",
        r"\bquest(?:ao|oes|Ã£o|Ãµes)\s+personalizadas?\b",
        r"\bperfil\s+do\s+aluno\b",
        r"\bcom\s+base\s+no\s+perfil\b",
        r"\bexplica(?:cao|Ã§Ã£o)\s+da\s+personaliza(?:cao|Ã§Ã£o)\b",
        r"\bpersonaliza(?:cao|Ã§Ã£o)\b",
        r"\[?\s*fonte\s+\d+[^\]]*\]?",
        r"\bslide\s+\d+\b",
    ]
    sanitized = text
    for pattern in patterns:
        sanitized = re.sub(pattern, "", sanitized, flags=re.I)
    sanitized = re.sub(r"\s*---+\s*", " ", sanitized)
    sanitized = re.sub(r"\s{2,}", " ", sanitized).strip(" .,:;-")
    return sanitized or text


def _question_signature(item: dict[str, Any]) -> str:
    tipo = _normalize_atividade_tipo(item.get("tipo"))
    base = _pick_string(item.get("enunciado"), item.get("pergunta"), item.get("titulo"))
    return f"{tipo}|{_normalize_key(base)}"


def _ensure_min_media_formatos(formatos: list[str], materiais_origem: list[dict[str, Any]]) -> list[str]:
    unique: list[str] = []
    for formato in formatos:
        normalized = str(formato or "").strip().lower()
        if normalized in _ALL_FORMATOS and normalized not in unique:
            unique.append(normalized)

    medias = [f for f in unique if f in _MEDIA_FORMATOS]
    if len(medias) >= 2:
        return unique

    source_types = {str(item.get("tipo") or "").strip().lower() for item in materiais_origem if item.get("tipo")}
    preferred: list[str] = []
    if "video" in source_types:
        preferred.append("video")
    if "audio" in source_types:
        preferred.append("audio")
    if any(t in source_types for t in {"apresentacao", "slides"}):
        preferred.append("apresentacao")
    if "documento" in source_types:
        preferred.append("documento")
    if "pdf" in source_types:
        preferred.append("pdf")
    preferred.extend(["pdf", "video", "audio", "apresentacao", "documento"])

    for formato in preferred:
        if formato in _MEDIA_FORMATOS and formato not in unique:
            unique.append(formato)
        medias = [f for f in unique if f in _MEDIA_FORMATOS]
        if len(medias) >= 2:
            break

    return unique


def _ensure_pipeline_formatos(
    formatos: list[str],
    materiais_origem: list[dict[str, Any]],
    *,
    force_all_media: bool,
) -> list[str]:
    unique = _ensure_min_media_formatos(formatos, materiais_origem)
    if not force_all_media:
        return unique

    required = list(_PIPELINE_CORE_FORMATOS)

    for formato in required:
        if formato in _ALL_FORMATOS and formato not in unique:
            unique.append(formato)

    ordered = [formato for formato in required if formato in unique]
    ordered.extend(formato for formato in unique if formato not in ordered)
    return ordered


def _dedupe_by(items: list[dict[str, Any]], key_factory: Any) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        key = str(key_factory(item) or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _fallback_card(index: int, topic_name: str) -> dict[str, Any]:
    label = topic_name or "este t\u00f3pico"
    perguntas = [
        f"Qual \u00e9 o conceito central de {label}",
        f"Como aplicar {label} em um exemplo pr\u00e1tico",
        f"Qual erro comum deve ser evitado em {label}",
        f"Qual diferen\u00e7a-chave aparece em {label}",
        f"Qual etapa inicial \u00e9 essencial em {label}",
        f"Como validar o entendimento de {label}",
        f"Qual evid\u00eancia mostra dom\u00ednio de {label}",
        f"Como explicar {label} para iniciantes",
    ]
    respostas = [
        "A resposta correta destaca defini\u00e7\u00e3o, objetivo e contexto de aplica\u00e7\u00e3o.",
        "A aplica\u00e7\u00e3o correta conecta conceito, decis\u00e3o e resultado observ\u00e1vel.",
        "O erro comum \u00e9 usar termos sem justificar com base na fonte.",
        "A diferen\u00e7a principal aparece no prop\u00f3sito e no crit\u00e9rio de uso.",
        "A etapa inicial \u00e9 revisar os fundamentos antes de executar.",
        "A valida\u00e7\u00e3o acontece ao resolver um caso com justificativa t\u00e9cnica.",
        "A evid\u00eancia \u00e9 explicar o conceito e aplicar sem contradi\u00e7\u00f5es.",
        "A explica\u00e7\u00e3o para iniciantes deve ser simples e progressiva.",
    ]
    return {
        "frente": _ensure_card_question_title(perguntas[index % len(perguntas)]),
        "verso": respostas[index % len(respostas)],
    }


def _build_anchor_pool(
    *,
    topic_name: str | None,
    anchor_concepts: list[str] | None = None,
    anchor_facts: list[str] | None = None,
) -> list[dict[str, str]]:
    pool: list[dict[str, str]] = []
    seen: set[str] = set()
    topic = str(topic_name or "").strip() or "o t\u00f3pico"

    for fact in anchor_facts or []:
        cleaned_fact = _strip_personalization_language(str(fact or "").strip())
        if not cleaned_fact:
            continue
        key = f"f|{_normalize_key(cleaned_fact)}"
        if key in seen:
            continue
        seen.add(key)
        pool.append(
            {
                "frente": _ensure_card_question_title(f"Qual evid\u00eancia da fonte sustenta este ponto de {topic}"),
                "verso": _ensure_card_answer_text(cleaned_fact),
            }
        )

    for concept in anchor_concepts or []:
        cleaned_concept = _strip_personalization_language(str(concept or "").strip())
        if not cleaned_concept:
            continue
        key = f"c|{_normalize_key(cleaned_concept)}"
        if key in seen:
            continue
        seen.add(key)
        pool.append(
            {
                "frente": _ensure_card_question_title(f"Como aplicar {cleaned_concept} em {topic}"),
                "verso": _ensure_card_answer_text(
                    f"{cleaned_concept}: conecte definição, decisão prática e resultado observável."
                ),
            }
        )

    return pool


def _enriquecer_cards(
    cards: list[Any],
    *,
    topic_name: str | None = None,
    target_count: int = _MIN_PERSONALIZED_ITEMS,
    anchor_concepts: list[str] | None = None,
    anchor_facts: list[str] | None = None,
) -> list[dict[str, Any]]:
    parsed: list[dict[str, Any]] = []
    for i, card in enumerate(cards):
        if not isinstance(card, dict):
            continue
        frente = _ensure_card_question_title(
            _strip_personalization_language(str(card.get("frente") or card.get("titulo") or ""))
        )
        verso = _ensure_card_answer_text(
            _strip_personalization_language(str(card.get("verso") or card.get("descricao") or ""))
        )
        if not frente or not verso:
            continue
        dificuldade = str(card.get("dificuldade") or "medio").strip().lower() or "medio"
        if dificuldade not in {"facil", "medio", "dificil"}:
            dificuldade = "medio"
        parsed.append(
            {
                "frente": frente,
                "verso": verso,
                "icone": card.get("icone") or _ICONES_PADRAO[i % len(_ICONES_PADRAO)],
                "dificuldade": dificuldade,
                "xp": int(card.get("xp") or _XP_POR_DIFICULDADE.get(dificuldade, 10)),
            }
        )

    unique = _dedupe_by(
        parsed,
        lambda item: f"{_normalize_key(item.get('frente', ''))}|{_normalize_key(item.get('verso', ''))}",
    )
    count = max(_MIN_PERSONALIZED_ITEMS, min(_MAX_PERSONALIZED_ITEMS, int(target_count or _MIN_PERSONALIZED_ITEMS)))
    anchor_pool = _build_anchor_pool(
        topic_name=topic_name,
        anchor_concepts=anchor_concepts,
        anchor_facts=anchor_facts,
    )
    anchor_index = 0
    while len(unique) < count:
        if anchor_index >= len(anchor_pool):
            break
        fallback = anchor_pool[anchor_index]
        anchor_index += 1
        unique.append(
            {
                **fallback,
                "icone": _ICONES_PADRAO[len(unique) % len(_ICONES_PADRAO)],
                "dificuldade": "medio",
                "xp": 10,
            }
        )
        unique = _dedupe_by(
            unique,
            lambda item: f"{_normalize_key(item.get('frente', ''))}|{_normalize_key(item.get('verso', ''))}",
        )
    return unique[:count]


def _normalize_atividade_tipo(value: Any) -> str:
    normalized = str(value or "quiz").strip().lower()
    if normalized in {"multipla_escolha", "multiple_choice", "multi_select", "multiselect"}:
        return "quiz"
    if normalized in {"verdadeiro_falso", "verdadeiro ou falso", "verdadeiro/falso", "booleano"}:
        return "true_false"
    if normalized in {"fill in the blank", "fill-in-the-blank", "completar lacuna", "lacuna"}:
        return "fill_blank"
    if normalized in {"dissertativa", "aberta", "questao", "essay", "texto", "leitura"}:
        return "essay"
    if normalized not in {"quiz", "true_false", "fill_blank", "essay"}:
        return "quiz"
    return normalized


def _looks_like_question_item(item: dict[str, Any]) -> bool:
    return bool(
        _pick_string(
            item.get("pergunta"),
            item.get("enunciado"),
            item.get("resposta_correta"),
            item.get("alternativas"),
        )
    )


def _normalize_alt_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [part.strip() for part in re.split(r"\s*\|\s*|\s*;\s*", value) if part.strip()]
    return []


def _contains_blank_marker(text: str) -> bool:
    return bool(re.search(r"_{3,}|\[\s*\]|\(\s*\)", text))


def _ensure_fill_blank_text(text: str) -> str:
    base = text.strip()
    if not base:
        return "Complete a lacuna: ___"
    if _contains_blank_marker(base):
        return base
    if base.endswith((".", ":", ";")):
        return f"{base} ___"
    return f"{base} ___"


def _ensure_statement(text: str) -> str:
    base = text.strip()
    if not base:
        return "A afirmação a seguir é verdadeira."
    if base.endswith("?"):
        base = base.rstrip("?").strip() + "."
    if len(base) < 12:
        return f"A afirmação a seguir é verdadeira: {base}."
    return base


def _enriquecer_questao(item: dict[str, Any], index: int) -> dict[str, Any]:
    tipo = _normalize_atividade_tipo(item.get("tipo"))
    alternativas = _normalize_alt_list(item.get("alternativas"))
    if tipo == "true_false" and not alternativas:
        alternativas = ["Verdadeiro", "Falso"]

    pergunta = _strip_personalization_language(
        _pick_string(item.get("pergunta"), item.get("enunciado"), item.get("titulo")) or ""
    )
    enunciado = _strip_personalization_language(
        _pick_string(item.get("enunciado"), item.get("pergunta"), item.get("titulo")) or ""
    )
    resposta_correta = _pick_string(
        item.get("resposta_correta"),
        item.get("correta"),
        item.get("resposta"),
        item.get("gabarito"),
    )
    if not enunciado and pergunta:
        enunciado = pergunta

    if tipo == "fill_blank":
        enunciado = _ensure_fill_blank_text(enunciado)
        if not resposta_correta and alternativas:
            resposta_correta = alternativas[0]
    elif tipo == "true_false":
        enunciado = _ensure_statement(enunciado)
        if not resposta_correta:
            resposta_correta = alternativas[0] if alternativas else ""
        if resposta_correta not in {"Verdadeiro", "Falso"}:
            resposta_correta = "Verdadeiro"
    elif tipo == "quiz":
        if not resposta_correta:
            resposta_correta = alternativas[0] if alternativas else "Alternativa correta"
        alternativas_base = [alt for alt in alternativas if alt]
        if resposta_correta and resposta_correta not in alternativas_base:
            alternativas_base.insert(0, resposta_correta)
        while len(alternativas_base) < 4:
            alternativas_base.append(f"Distrator {len(alternativas_base) + 1}")
        alternativas = alternativas_base[:4]
        if not resposta_correta and alternativas:
            resposta_correta = alternativas[0]
        if resposta_correta not in alternativas:
            resposta_correta = alternativas[0]
    else:
        alternativas = []
        if not resposta_correta:
            resposta_correta = "Resposta dissertativa fundamentada no conteúdo."

    return {
        "id": item.get("id") or item.get("questao_id") or -(index + 1),
        "tipo": tipo,
        "pergunta": pergunta,
        "enunciado": enunciado,
        "alternativas": alternativas,
        "resposta_correta": resposta_correta or "",
        "explicacao": _strip_personalization_language(
            _pick_string(item.get("explicacao"), item.get("feedback"), item.get("descricao")) or ""
        ),
        "xp": item.get("xp", 10),
        "nota_estabelecida": item.get("nota_estabelecida"),
        "midias": item.get("midias") if isinstance(item.get("midias"), list) else [],
        "arquivos": item.get("arquivos") if isinstance(item.get("arquivos"), list) else [],
        "anexos": item.get("anexos") if isinstance(item.get("anexos"), list) else [],
        "pdf_url": _pick_string(item.get("pdf_url"), item.get("pdfUrl")),
        "documento_url": _pick_string(
            item.get("documento_url"),
            item.get("documentoUrl"),
            item.get("arquivo_url"),
            item.get("file_url"),
        ),
        "apresentacao_url": _pick_string(item.get("apresentacao_url"), item.get("apresentacaoUrl")),
        "audio_url": _pick_string(item.get("audio_url"), item.get("audioUrl")),
        "video_url": _pick_string(item.get("video_url"), item.get("videoUrl")),
        "imagem_url": _pick_string(item.get("imagem_url"), item.get("image_url")),
    }


def _fallback_atividade(
    index: int,
    topic_name: str,
    total: int,
    *,
    anchor_text: str | None = None,
) -> dict[str, Any]:
    label = topic_name or "o tópico estudado"
    anchor = _strip_personalization_language(str(anchor_text or "").strip())
    anchor_label = anchor or label
    if index < max(2, total // 3):
        tipo = "quiz"
    elif index < max(4, (2 * total) // 3):
        tipo = "fill_blank" if index % 2 else "true_false"
    else:
        tipo = "essay"
    enunciado_quiz = f"Qual alternativa representa melhor o conceito '{anchor_label}' no contexto de {label}?"
    enunciado_tf = f"O ponto '{anchor_label}' deve ser aplicado com justificativa baseada na fonte."
    enunciado_blank = f"Para aplicar '{anchor_label}' corretamente, o primeiro passo é ___."
    enunciado_essay = f"Explique como aplicar '{anchor_label}' em um cenário prático, justificando cada decisão."
    if tipo == "quiz":
        questao = {
            "tipo": "quiz",
            "enunciado": enunciado_quiz,
            "alternativas": [
                "Definição correta e contextualizada",
                "Afirmação sem base na fonte",
                "Interpretação contraditória",
                "Exemplo fora do escopo",
            ],
            "resposta_correta": "Definição correta e contextualizada",
            "explicacao": "A resposta correta conecta definição, contexto e objetivo.",
        }
    elif tipo == "true_false":
        questao = {
            "tipo": "true_false",
            "enunciado": enunciado_tf,
            "alternativas": ["Verdadeiro", "Falso"],
            "resposta_correta": "Verdadeiro",
            "explicacao": "A aplicação correta exige justificativa com base no material.",
        }
    elif tipo == "fill_blank":
        questao = {
            "tipo": "fill_blank",
            "enunciado": enunciado_blank,
            "alternativas": [],
            "resposta_correta": "revisar os fundamentos",
            "explicacao": "A base conceitual orienta a execução prática.",
        }
    else:
        questao = {
            "tipo": "essay",
            "enunciado": enunciado_essay,
            "alternativas": [],
            "resposta_correta": "Resposta dissertativa fundamentada no conteúdo.",
            "explicacao": "A resposta deve argumentar com coerência e evidências da fonte.",
        }
    return {
        "titulo": f"Atividade {index + 1}",
        "descricao": f"Prática orientada para consolidar {label}.",
        "tipo": tipo,
        "pontuacao_maxima": 10 if tipo != "essay" else 20,
        "questoes": [_enriquecer_questao(questao, 0)],
    }


def _normalize_personalized_activities(
    raw: Any,
    *,
    topic_name: str | None = None,
    target_count: int = _MIN_PERSONALIZED_ITEMS,
    anchor_concepts: list[str] | None = None,
    anchor_facts: list[str] | None = None,
) -> list[dict[str, Any]]:
    if isinstance(raw, dict):
        if isinstance(raw.get("atividades"), list):
            base = _coerce_dict_list(raw.get("atividades"))
        elif isinstance(raw.get("activities"), list):
            base = _coerce_dict_list(raw.get("activities"))
        elif isinstance(raw.get("questoes"), list):
            base = [{"titulo": "Atividade", "tipo": "quiz", "questoes": raw.get("questoes")}]
        else:
            base = [raw]
    else:
        base = _coerce_dict_list(raw)

    if base and all(_looks_like_question_item(item) for item in base):
        # Quando a IA devolve uma lista "achatada" de questões, converte para
        # uma atividade por questão para manter consistência com o pipeline.
        base = [
            {
                "titulo": _pick_string(item.get("titulo"), item.get("title")) or f"Atividade {idx + 1}",
                "tipo": _normalize_atividade_tipo(item.get("tipo") or "quiz"),
                "questoes": [item],
            }
            for idx, item in enumerate(base)
        ]

    result: list[dict[str, Any]] = []
    seen_questions_global: set[str] = set()
    for index, atividade in enumerate(base):
        tipo = _normalize_atividade_tipo(atividade.get("tipo"))
        questoes_raw = atividade.get("questoes") if isinstance(atividade.get("questoes"), list) else []
        if not questoes_raw and _looks_like_question_item(atividade):
            questoes_raw = [atividade]
        if not questoes_raw:
            questoes_raw = [
                {
                    "tipo": tipo,
                    "enunciado": _pick_string(
                        atividade.get("enunciado"),
                        atividade.get("descricao"),
                        atividade.get("conteudo"),
                        atividade.get("texto"),
                    )
                    or f"Resolva a atividade sobre {topic_name or 'o tópico'}.",
                }
            ]

        atividade_fallback = _pick_string(
            atividade.get("descricao"),
            atividade.get("description"),
            atividade.get("titulo"),
            atividade.get("title"),
        )
        questoes = [
            _enriquecer_questao(item, idx)
            for idx, item in enumerate(_coerce_dict_list(questoes_raw))
        ]
        if atividade_fallback:
            for questao in questoes:
                enunciado = str(questao.get("enunciado") or "").strip()
                if len(enunciado) < 8:
                    questao["enunciado"] = f"{atividade_fallback}. {enunciado}".strip()
        questoes = [item for item in questoes if str(item.get("enunciado") or "").strip()]
        questoes = _dedupe_by(questoes, _question_signature)
        filtered_questions: list[dict[str, Any]] = []
        for questao in questoes:
            signature = _question_signature(questao)
            if not signature or signature in seen_questions_global:
                continue
            seen_questions_global.add(signature)
            filtered_questions.append(questao)
        questoes = filtered_questions
        if not questoes:
            continue
        tipo = _normalize_atividade_tipo(questoes[0].get("tipo") or tipo)
        titulo = _strip_leading_index(
            _pick_string(atividade.get("titulo"), atividade.get("title"), atividade.get("nome"))
            or f"Atividade {index + 1}"
        )
        titulo = _strip_personalization_language(titulo)
        if not titulo:
            titulo = f"Atividade {index + 1}"

        result.append(
            {
                "id": atividade.get("id") or atividade.get("atividade_id") or -(index + 101),
                "titulo": titulo,
                "descricao": _strip_personalization_language(
                    _pick_string(
                        atividade.get("descricao"),
                        atividade.get("description"),
                        atividade.get("conteudo"),
                        atividade.get("texto"),
                    )
                ),
                "conteudo": _strip_personalization_language(
                    _pick_string(atividade.get("conteudo"), atividade.get("texto"))
                ),
                "tipo": tipo,
                "pontuacao_maxima": atividade.get("pontuacao_maxima")
                or atividade.get("pontuacaoMaxima")
                or max(10, len(questoes) * 10),
                "questoes": questoes,
                "midias": atividade.get("midias") if isinstance(atividade.get("midias"), list) else [],
                "arquivos": atividade.get("arquivos") if isinstance(atividade.get("arquivos"), list) else [],
                "anexos": atividade.get("anexos") if isinstance(atividade.get("anexos"), list) else [],
                "pdf_url": _pick_string(atividade.get("pdf_url"), atividade.get("pdfUrl")),
                "documento_url": _pick_string(
                    atividade.get("documento_url"),
                    atividade.get("documentoUrl"),
                    atividade.get("arquivo_url"),
                    atividade.get("file_url"),
                ),
                "apresentacao_url": _pick_string(
                    atividade.get("apresentacao_url"),
                    atividade.get("apresentacaoUrl"),
                ),
                "audio_url": _pick_string(atividade.get("audio_url"), atividade.get("audioUrl")),
                "video_url": _pick_string(atividade.get("video_url"), atividade.get("videoUrl")),
                "imagem_url": _pick_string(atividade.get("imagem_url"), atividade.get("image_url")),
            }
        )

    result = _dedupe_by(
        result,
        lambda item: (
            f"{_normalize_key(item.get('titulo', ''))}|"
            f"{_normalize_key(item.get('descricao', ''))}|"
            f"{_normalize_key((item.get('questoes') or [{}])[0].get('enunciado', ''))}"
        ),
    )

    count = max(_MIN_PERSONALIZED_ITEMS, min(_MAX_PERSONALIZED_ITEMS, int(target_count or _MIN_PERSONALIZED_ITEMS)))
    anchor_pool: list[str] = []
    seen_anchors: set[str] = set()
    for raw_anchor in (anchor_facts or []) + (anchor_concepts or []):
        anchor = _strip_personalization_language(str(raw_anchor or "").strip())
        key = _normalize_key(anchor)
        if not anchor or not key or key in seen_anchors:
            continue
        seen_anchors.add(key)
        anchor_pool.append(anchor)
    anchor_index = 0
    while len(result) < count:
        if anchor_index >= len(anchor_pool):
            break
        fallback = _fallback_atividade(
            len(result),
            topic_name or "",
            count,
            anchor_text=anchor_pool[anchor_index],
        )
        anchor_index += 1
        result.append(
            {
                "id": -(len(result) + 101),
                **fallback,
                "midias": [],
                "arquivos": [],
                "anexos": [],
                "pdf_url": None,
                "documento_url": None,
                "apresentacao_url": None,
                "audio_url": None,
                "video_url": None,
                "imagem_url": None,
            }
        )
        result = _dedupe_by(
            result,
            lambda item: (
                f"{_normalize_key(item.get('titulo', ''))}|"
                f"{_normalize_key(item.get('descricao', ''))}|"
                f"{_normalize_key((item.get('questoes') or [{}])[0].get('enunciado', ''))}"
            ),
        )

    return result[:count]


def _material_refs(state: dict[str, Any]) -> dict[str, Any]:
    content_id = state.get("conteudo_boss_foco_id") or state.get("conteudo_foco_id")
    item_key = f"content:{content_id}" if content_id is not None else None
    return {
        "item_key": item_key,
        "source_item_key": item_key,
        "content_id": content_id,
        "content_id_ref": content_id,
    }


def _normalize_materiais(raw: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    refs = _material_refs(state)
    out: dict[str, Any] = {}
    topico_contexto = state.get("topico_contexto") if isinstance(state.get("topico_contexto"), dict) else {}
    topico_nome = _pick_string(topico_contexto.get("nome")) or "t\u00f3pico"
    topico_descricao = _pick_string(topico_contexto.get("descricao")) or ""
    conteudo_estudado = state.get("conteudo_estudado") if isinstance(state.get("conteudo_estudado"), dict) else {}
    conceitos_nucleares = [
        str(item).strip()
        for item in (conteudo_estudado.get("conceitos_nucleares") or [])
        if str(item).strip()
    ]
    fatos_ancorados = [
        str(item).strip()
        for item in (conteudo_estudado.get("fatos_ancorados") or [])
        if str(item).strip()
    ]
    perfil_normalizado = _normalize_profile_label(_perfil_dominante(state.get("perfil_brainhex", []) or [])) or "Mastermind"
    perfil_visual = _PROFILE_VISUAL_REFERENCES.get(perfil_normalizado, _PROFILE_VISUAL_REFERENCES["Mastermind"])
    tema_visual_base = _build_tema_visual_for_profile(perfil_normalizado)
    size_policy = (
        state.get("media_size_policy")
        if isinstance(state.get("media_size_policy"), dict)
        else _adaptive_size_targets(conteudo_estudado.get("complexidade"))
    )

    cards_seed = [
        {
            "frente": item.get("titulo"),
            "verso": item.get("descricao"),
            "icone": item.get("icone"),
            "dificuldade": item.get("dificuldade"),
            "xp": item.get("xp"),
        }
        for item in (state.get("cards_conteudo") or [])
        if isinstance(item, dict)
    ]
    atividades_seed = [item for item in (state.get("atividades_topico") or []) if isinstance(item, dict)]
    questoes_seed = [item for item in (state.get("questoes_topico") or []) if isinstance(item, dict)]

    def _clean_text(value: Any, *, max_chars: int = 700, preserve_lines: bool = False) -> str:
        base = _strip_personalization_language(str(value or ""))
        return _clean_extracted_text(base, max_chars=max_chars, preserve_lines=preserve_lines)

    def _clean_sections(
        raw_sections: Any,
        *,
        max_items: int,
        section_max_chars: int,
        fallback_items: list[str] | None = None,
    ) -> list[str]:
        normalized = expand_sections(
            raw_sections,
            max_items=max_items * 2,
            section_max_chars=section_max_chars,
            min_chars=8,
        )
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in normalized:
            text = _clean_text(item, max_chars=section_max_chars)
            key = _normalize_key(text)
            if not text or not key or key in seen:
                continue
            seen.add(key)
            cleaned.append(text)
            if len(cleaned) >= max_items:
                break

        if cleaned:
            return cleaned

        for item in (fallback_items or []):
            text = _clean_text(item, max_chars=section_max_chars)
            key = _normalize_key(text)
            if not text or not key or key in seen:
                continue
            seen.add(key)
            cleaned.append(text)
            if len(cleaned) >= max_items:
                break
        return cleaned

    def _normalize_cards(raw_cards: Any) -> list[dict[str, Any]]:
        base_cards = raw_cards if isinstance(raw_cards, list) else []
        cleaned: list[dict[str, Any]] = []
        seen: set[str] = set()
        for idx, item in enumerate(base_cards):
            if not isinstance(item, dict):
                continue
            frente = _clean_text(_pick_string(item.get("frente"), item.get("titulo")), max_chars=220)
            verso = _clean_text(_pick_string(item.get("verso"), item.get("descricao")), max_chars=320)
            if not frente or not verso:
                continue
            if not frente.endswith("?"):
                frente = _ensure_card_question_title(frente)
            key = f"{_normalize_key(frente)}|{_normalize_key(verso)}"
            if not key or key in seen:
                continue
            seen.add(key)
            cleaned.append(
                {
                    "id": item.get("id") or -(idx + 101),
                    "frente": frente,
                    "verso": verso,
                    "titulo": _clean_text(_pick_string(item.get("titulo"), frente), max_chars=220),
                    "descricao": _clean_text(_pick_string(item.get("descricao"), verso), max_chars=320),
                    "icone": _pick_string(item.get("icone")) or "*",
                    "dificuldade": _pick_string(item.get("dificuldade")) or "medio",
                    "xp": int(item.get("xp") or 10),
                }
            )
            if len(cleaned) >= _MAX_PERSONALIZED_ITEMS:
                break
        return cleaned

    if "pdf" in raw and isinstance(raw["pdf"], dict):
        pdf_raw = dict(raw["pdf"])
        titulo = _clean_text(_pick_string(pdf_raw.get("titulo")), max_chars=140) or f"Guia de estudo: {topico_nome}"
        resumo = _clean_text(
            _pick_string(pdf_raw.get("resumo"), pdf_raw.get("texto"), topico_descricao, (fatos_ancorados or [None])[0]),
            max_chars=900,
        )
        if not resumo:
            resumo = f"S\u00edntese de {topico_nome} com foco nos pontos centrais."
        secoes = _clean_sections(
            pdf_raw.get("secoes") if isinstance(pdf_raw.get("secoes"), list) else [pdf_raw.get("secoes"), resumo],
            max_items=max(4, int(size_policy.get("secoes_min", 4))),
            section_max_chars=460,
            fallback_items=fatos_ancorados[:6] + conceitos_nucleares[:4],
        )
        if not secoes and resumo:
            secoes = [resumo]
        out["pdf"] = {
            "payload": {
                "titulo": titulo,
                "resumo": resumo,
                "secoes": secoes[:10],
                "tema_visual": tema_visual_base,
            },
            "arquivo_url": None,
            **refs,
        }

    cards_raw = raw.get("cards")
    if isinstance(cards_raw, list):
        cards_payload = _normalize_cards(cards_raw)
        if cards_payload:
            out["cards"] = {"payload": cards_payload, "arquivo_url": None, **refs}
    elif cards_seed:
        cards_payload = _normalize_cards(cards_seed)
        if cards_payload:
            out["cards"] = {"payload": cards_payload, "arquivo_url": None, **refs}

    quiz_input: Any = None
    if "quiz" in raw:
        quiz_input = raw.get("quiz")
    elif "atividades" in raw:
        quiz_input = {"atividades": raw.get("atividades")}
    elif atividades_seed or questoes_seed:
        if atividades_seed:
            quiz_input = {"atividades": atividades_seed}
        elif questoes_seed:
            quiz_input = {"atividades": [{"titulo": "Atividade", "tipo": "quiz", "questoes": questoes_seed}]}

    if quiz_input is not None:
        provided_count = 0
        if isinstance(quiz_input, dict) and isinstance(quiz_input.get("atividades"), list):
            provided_count = len(quiz_input.get("atividades") or [])
        elif isinstance(quiz_input, list):
            provided_count = len(quiz_input)
        target_count = max(1, min(_MAX_PERSONALIZED_ITEMS, provided_count or 1))
        atividades = _normalize_personalized_activities(
            quiz_input,
            topic_name=topico_nome,
            target_count=target_count,
            anchor_concepts=conceitos_nucleares,
            anchor_facts=fatos_ancorados,
        )
        if provided_count > 0:
            atividades = atividades[:provided_count]
        if atividades:
            out["quiz"] = {
                "payload": {"atividades": atividades},
                "arquivo_url": None,
                **refs,
            }

    if "video" in raw and isinstance(raw["video"], dict):
        video_raw = dict(raw["video"])
        roteiro = _clean_text(_pick_string(video_raw.get("roteiro"), video_raw.get("texto")), max_chars=2_400)
        if not roteiro:
            roteiro = f"Introdu\u00e7\u00e3o ao tema {topico_nome} com foco em conceitos e aplica\u00e7\u00f5es pr\u00e1ticas."
        cenas = _clean_sections(
            video_raw.get("cenas"),
            max_items=6,
            section_max_chars=180,
            fallback_items=conceitos_nucleares[:4],
        )
        if not roteiro and cenas:
            roteiro = _clean_text(" ".join(cenas), max_chars=2_400)
        duracao = int(video_raw.get("duracao_estimada_seg") or 0)
        if duracao <= 0:
            duracao = int((int(size_policy.get("video_min_seg", 75)) + int(size_policy.get("video_max_seg", 105))) / 2)
        tema_visual_video_raw = video_raw.get("tema_visual") if isinstance(video_raw.get("tema_visual"), dict) else {}
        tema_visual_video = {
            **tema_visual_video_raw,
            **tema_visual_base,
            "cores": {
                **(tema_visual_video_raw.get("cores") if isinstance(tema_visual_video_raw.get("cores"), dict) else {}),
                **(tema_visual_base.get("cores") if isinstance(tema_visual_base.get("cores"), dict) else {}),
            },
        }
        video_payload = {
            **video_raw,
            "roteiro": roteiro,
            "cenas": cenas,
            "duracao_estimada_seg": max(20, min(300, duracao)),
            "tema_visual": tema_visual_video,
        }
        out["video"] = {"payload": video_payload, "arquivo_url": None, **refs}

    if "audio" in raw and isinstance(raw["audio"], dict):
        audio_raw = dict(raw["audio"])
        roteiro = _clean_text(_pick_string(audio_raw.get("roteiro"), audio_raw.get("texto"), (fatos_ancorados or [None])[0]), max_chars=2_200)
        if not roteiro:
            roteiro = f"Neste \u00e1udio, vamos revisar os fundamentos de {topico_nome} de forma clara e objetiva."
        duracao = int(audio_raw.get("duracao_estimada_seg") or 0)
        if duracao <= 0:
            duracao = int((int(size_policy.get("audio_min_seg", 70)) + int(size_policy.get("audio_max_seg", 95))) / 2)
        out["audio"] = {
            "payload": {
                **audio_raw,
                "roteiro": roteiro,
                "texto": _clean_text(_pick_string(audio_raw.get("texto"), roteiro), max_chars=2_200),
                "duracao_estimada_seg": max(20, min(300, duracao)),
                "tema_visual": tema_visual_base,
            },
            "arquivo_url": None,
            **refs,
        }

    if "documento" in raw and isinstance(raw["documento"], dict):
        doc_raw = dict(raw["documento"])
        titulo = _clean_text(_pick_string(doc_raw.get("titulo")), max_chars=160) or f"Documento de estudo: {topico_nome}"
        resumo = _clean_text(
            _pick_string(doc_raw.get("resumo"), doc_raw.get("texto"), topico_descricao, (fatos_ancorados or [None])[0]),
            max_chars=1_100,
        )
        if not resumo:
            resumo = f"Documento de estudo com os pontos essenciais de {topico_nome}."
        secoes = _clean_sections(
            doc_raw.get("secoes") if isinstance(doc_raw.get("secoes"), list) else [doc_raw.get("secoes"), resumo],
            max_items=max(5, int(size_policy.get("secoes_min", 5))),
            section_max_chars=520,
            fallback_items=fatos_ancorados[:8] + conceitos_nucleares[:5],
        )
        if not secoes and resumo:
            secoes = [resumo]
        out["documento"] = {
            "payload": {
                "titulo": titulo,
                "resumo": resumo,
                "secoes": secoes[:12],
                "tema_visual": tema_visual_base,
            },
            "arquivo_url": None,
            **refs,
        }

    if "apresentacao" in raw and isinstance(raw["apresentacao"], dict):
        apresentacao_raw = dict(raw["apresentacao"])
        titulo = _clean_text(_pick_string(apresentacao_raw.get("titulo")), max_chars=170) or f"Apresenta\u00e7\u00e3o: {topico_nome}"
        abertura = _clean_text(
            _pick_string(apresentacao_raw.get("abertura"), apresentacao_raw.get("resumo"), topico_descricao),
            max_chars=420,
        )
        if not abertura:
            abertura = f"Panorama dos conceitos e aplica\u00e7\u00f5es de {topico_nome}."
        cleaned_slides: list[dict[str, Any]] = []
        for slide in (apresentacao_raw.get("slides") or []):
            if not isinstance(slide, dict):
                continue
            slide_title = _clean_text(_pick_string(slide.get("titulo"), slide.get("subtitulo")), max_chars=120) or "T\u00f3pico-chave"
            slide_subtitle = _clean_text(_pick_string(slide.get("subtitulo")), max_chars=180)
            points = _clean_sections(
                slide.get("pontos"),
                max_items=4,
                section_max_chars=220,
                fallback_items=[slide_subtitle] if slide_subtitle else [],
            )
            if not points and abertura:
                points = [abertura]
            cleaned_slide: dict[str, Any] = {"titulo": slide_title, "pontos": points[:4]}
            if slide_subtitle:
                cleaned_slide["subtitulo"] = slide_subtitle
            layout = _clean_text(_pick_string(slide.get("layout")), max_chars=32)
            if layout:
                cleaned_slide["layout"] = layout
            imagem_ref = _clean_text(
                _pick_string(slide.get("imagem_referencia"), slide.get("imagem"), slide.get("image")),
                max_chars=120,
            )
            if imagem_ref:
                cleaned_slide["imagem_referencia"] = imagem_ref
            slide_theme_raw = slide.get("tema_visual") if isinstance(slide.get("tema_visual"), dict) else {}
            cleaned_slide["tema_visual"] = {
                **slide_theme_raw,
                **tema_visual_base,
                "cores": {
                    **(slide_theme_raw.get("cores") if isinstance(slide_theme_raw.get("cores"), dict) else {}),
                    **(tema_visual_base.get("cores") if isinstance(tema_visual_base.get("cores"), dict) else {}),
                },
            }
            cleaned_slides.append(cleaned_slide)

        if not cleaned_slides:
            fallback_sections = _clean_sections(
                apresentacao_raw.get("secoes") if isinstance(apresentacao_raw.get("secoes"), list) else [abertura],
                max_items=max(4, int(size_policy.get("slides_min", 4))),
                section_max_chars=220,
                fallback_items=fatos_ancorados[:6] + conceitos_nucleares[:4],
            )
            if not fallback_sections and abertura:
                fallback_sections = [abertura]
            if not fallback_sections:
                fallback_sections = [f"Conceitos centrais de {topico_nome}."]
            cleaned_slides = [
                {"titulo": f"Slide {index + 1}", "pontos": [section]}
                for index, section in enumerate(fallback_sections[:10])
            ]
        apresentacao_tema_raw = (
            apresentacao_raw.get("tema_visual")
            if isinstance(apresentacao_raw.get("tema_visual"), dict)
            else {}
        )
        apresentacao_tema = {
            **apresentacao_tema_raw,
            **tema_visual_base,
            "cores": {
                **(apresentacao_tema_raw.get("cores") if isinstance(apresentacao_tema_raw.get("cores"), dict) else {}),
                **(tema_visual_base.get("cores") if isinstance(tema_visual_base.get("cores"), dict) else {}),
            },
        }

        out["apresentacao"] = {
            "payload": {
                "titulo": titulo,
                "abertura": abertura,
                "tema_visual": apresentacao_tema,
                "slides": cleaned_slides[:12],
            },
            "arquivo_url": None,
            **refs,
        }

    if "imagem" in raw and isinstance(raw["imagem"], dict):
        imagem_raw = dict(raw["imagem"])
        titulo = _clean_text(_pick_string(imagem_raw.get("titulo")), max_chars=140) or "Cena-chave"
        legenda = _clean_text(
            _pick_string(imagem_raw.get("legenda"), topico_descricao, (fatos_ancorados or [None])[0]),
            max_chars=420,
        )
        prompt_imagem = _clean_text(
            _pick_string(imagem_raw.get("prompt_imagem"), imagem_raw.get("prompt"), legenda),
            max_chars=620,
        )
        if not prompt_imagem:
            prompt_imagem = (
                f"Ilustra\u00e7\u00e3o educacional medieval e m\u00edstica sobre {topico_nome}, "
                f"com paleta {perfil_visual.get('cores', {}).get('primaria', '#A78C07')}."
            )
        imagem_url = _pick_string(
            imagem_raw.get("arquivo_url"),
            imagem_raw.get("url"),
            imagem_raw.get("image_url"),
            imagem_raw.get("imagem_url"),
        )
        out["imagem"] = {
            "payload": {
                **imagem_raw,
                "titulo": titulo,
                "legenda": legenda,
                "prompt_imagem": prompt_imagem,
                "tema_visual": tema_visual_base,
            },
            "arquivo_url": imagem_url,
            **refs,
        }

    return out


def build_personalizacao_steps(record: dict[str, Any]) -> list[dict[str, Any]]:
    materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
    plano = record.get("plano") if isinstance(record.get("plano"), dict) else {}
    topico_id = record.get("topico_id")
    content_id = record.get("conteudo_id")
    ordered_formats = [
        *[str(item).strip().lower() for item in (record.get("formatos_gerados") or []) if str(item).strip()],
        str(record.get("formato_prioritario") or "").strip().lower(),
    ]
    seen_formats: set[str] = set()
    formatos = [item for item in ordered_formats if item and not (item in seen_formats or seen_formats.add(item))]
    if not formatos:
        formatos = [item for item in materiais.keys() if materiais.get(item)]

    steps: list[dict[str, Any]] = []
    ordem = 0

    for formato in formatos:
        material = materiais.get(formato)
        if not material:
            continue
        if isinstance(material, dict):
            status = str((material.get("metadata") or {}).get("status") or "").lower()
            quality_rejected = bool((material.get("metadata") or {}).get("quality_gate_rejected"))
            if status in {"failed", "failed_quality"} or quality_rejected:
                continue
            if status == "pending" and formato in _MEDIA_FORMATOS:
                continue

        raw_payload = material.get("payload")
        payload_dict = raw_payload if isinstance(raw_payload, dict) else {}
        payload_list = raw_payload if isinstance(raw_payload, list) else []

        item_key = _pick_string(material.get("item_key"), material.get("source_item_key")) or (
            f"content:{content_id}" if content_id is not None else f"topic:{topico_id}:{formato}:{ordem}"
        )

        if formato == "quiz":
            activities_payload = _normalize_personalized_activities(
                payload_dict if payload_dict else payload_list
            )
            if not activities_payload:
                activities_payload = [
                    {
                        "id": -abs(int(record.get("id") or 1) * 100 + ordem + 1),
                        "titulo": "Atividade personalizada",
                        "descricao": _pick_string(plano.get("justificativa"))
                        or "Atividade gerada para este módulo.",
                        "tipo": "quiz",
                        "pontuacao_maxima": 100,
                        "questoes": [],
                    }
                ]

            for activity_index, normalized_activity in enumerate(activities_payload):
                step_item_key = f"{item_key}:activity:{activity_index + 1}"
                activity_payload = {
                    "id": normalized_activity.get("id")
                    or -abs(int(record.get("id") or 1) * 100 + ordem + activity_index + 1),
                    "titulo": normalized_activity.get("titulo") or "Atividade personalizada",
                    "descricao": normalized_activity.get("descricao")
                    or _pick_string(plano.get("justificativa"))
                    or "Atividade gerada para este módulo.",
                    "conteudo": normalized_activity.get("conteudo"),
                    "tipo": normalized_activity.get("tipo") or "quiz",
                    "status": None,
                    "pontuacao_maxima": normalized_activity.get("pontuacao_maxima") or 100,
                    "data_entrega": None,
                    "topico_id": topico_id,
                    "questoes": normalized_activity.get("questoes") or [],
                    "conteudo_ids": [content_id] if content_id is not None else [],
                    "anexos": normalized_activity.get("anexos") or [],
                    "arquivos": normalized_activity.get("arquivos") or [],
                    "midias": normalized_activity.get("midias") or [],
                    "pdf_url": normalized_activity.get("pdf_url"),
                    "documento_url": normalized_activity.get("documento_url"),
                    "apresentacao_url": normalized_activity.get("apresentacao_url"),
                    "audio_url": normalized_activity.get("audio_url"),
                    "video_url": normalized_activity.get("video_url"),
                    "imagem_url": normalized_activity.get("imagem_url"),
                    "isPersonalizedLocal": True,
                    "personalizationKey": step_item_key,
                }
                steps.append(
                    {
                        "item_key": step_item_key,
                        "ordem": ordem,
                        "kind": "activity",
                        "title": activity_payload["titulo"],
                        "description": activity_payload["descricao"],
                        "required": True,
                        "pontuacao_maxima": activity_payload["pontuacao_maxima"],
                        "blocks": [],
                        "activity": activity_payload,
                        "metadata": {
                            "material_type": "quiz",
                            "topico_id": topico_id,
                            "activity_type": activity_payload["tipo"],
                        },
                    }
                )
                ordem += 1
            continue

        block_payload = {
            **payload_dict,
            "metadata": {
                **(payload_dict.get("metadata") or {}),
                "itemKey": item_key,
                "topicoId": topico_id,
                "contentId": content_id,
                "contentIdRef": content_id,
                "materialType": formato,
                "materialKey": f"{formato}:{record.get('id')}:{ordem}",
            },
        }

        block_type = formato
        if formato == "cards":
            cards_payload = payload_list or (
                payload_dict.get("cards") if isinstance(payload_dict.get("cards"), list) else []
            )
            block_payload = {
                "title": "Cards de estudo",
                "texto": "Revise os conceitos principais deste módulo.",
                "cards": cards_payload,
                "metadata": block_payload["metadata"],
            }
        elif payload_list:
            if formato == "apresentacao":
                block_payload = {
                    "title": material.get("titulo") or f"Etapa {ordem + 1}",
                    "slides": payload_list,
                    "metadata": block_payload["metadata"],
                }
            elif formato in {"pdf", "documento"}:
                block_payload = {
                    "title": material.get("titulo") or f"Etapa {ordem + 1}",
                    "secoes": payload_list,
                    "metadata": block_payload["metadata"],
                }
            else:
                block_payload = {
                    "title": material.get("titulo") or f"Etapa {ordem + 1}",
                    "items": payload_list,
                    "metadata": block_payload["metadata"],
                }

        steps.append(
            {
                "item_key": item_key,
                "ordem": ordem,
                "kind": "content",
                "title": _pick_string(block_payload.get("title"), block_payload.get("titulo")) or f"Etapa {ordem + 1}",
                "description": _pick_string(block_payload.get("resumo"), block_payload.get("descricao"), block_payload.get("abertura")),
                "required": True,
                "pontuacao_maxima": 40 if formato == "cards" else 20,
                "blocks": [
                    {
                        "id": f"{formato}-{record.get('id')}-{ordem}",
                        "tipo": block_type,
                        "payload": block_payload,
                    }
                ],
                "activity": None,
                "metadata": {"material_type": formato, "topico_id": topico_id},
            }
        )
        ordem += 1

    return steps


def _fallback_materiais(
    formatos: list[str],
    conteudos: list[dict[str, Any]],
    perfil: str,
    materiais_origem: list[dict[str, Any]],
) -> dict[str, Any]:
    tema_visual = _build_tema_visual_for_profile(perfil)
    source_titles = [str(item.get("titulo")).strip() for item in materiais_origem if str(item.get("titulo") or "").strip()]
    source_titles = [_strip_path_to_label(item) for item in source_titles if item]
    base_texts = [
        _pick_string(
            item.get("texto_extraido"),
            item.get("texto_base"),
            item.get("descricao"),
            _strip_path_to_label(item.get("titulo")),
        )
        for item in materiais_origem
    ]
    if not any(base_texts):
        base_texts = [
            _pick_string(conteudo.get("conteudo"), conteudo.get("descricao"), conteudo.get("titulo"))
            for conteudo in conteudos
        ]

    chunks: list[str] = []
    for base in base_texts:
        if not base:
            continue
        chunks.extend(_split_text_chunks(base)[:3])

    if not chunks:
        chunks = [
            "Base conceitual do tópico",
            "Aplicação prática do conceito",
            "Revisão guiada dos pontos centrais",
        ]

    source_hint = ", ".join(source_titles[:3]) if source_titles else "as fontes pedagógicas disponíveis"
    cards_target = _target_items_count(seeds=len(source_titles), chunks=len(chunks))
    atividades_target = _target_items_count(seeds=len(conteudos), chunks=len(chunks))

    cards_seed = [
        {
            "frente": f"Como interpretar o trecho: {chunk[:80]}",
            "verso": f"Este trecho reforça um ponto-chave derivado de {source_hint}.",
        }
        for chunk in chunks[:cards_target]
    ]

    atividades_seed: list[dict[str, Any]] = []
    for idx in range(atividades_target):
        chunk = chunks[idx % len(chunks)]
        if idx < max(2, atividades_target // 3):
            tipo = "quiz"
            questao = {
                "tipo": "quiz",
                "enunciado": f"Qual alternativa representa melhor a ideia do trecho '{chunk[:70]}'?",
                "alternativas": [
                    "Interpretação alinhada ao conceito central",
                    "Interpretação contraditória",
                    "Exemplo fora de contexto",
                    "Conclusão sem evidência",
                ],
                "resposta_correta": "Interpretação alinhada ao conceito central",
                "explicacao": "A resposta correta mantém coerência com a fonte.",
            }
        elif idx < max(4, (2 * atividades_target) // 3):
            tipo = "true_false" if idx % 2 == 0 else "fill_blank"
            if tipo == "true_false":
                questao = {
                    "tipo": "true_false",
                    "enunciado": f"A aplicação do conceito em '{chunk[:70]}' exige justificativa com base no material.",
                    "alternativas": ["Verdadeiro", "Falso"],
                    "resposta_correta": "Verdadeiro",
                    "explicacao": "A justificativa é parte da competência esperada.",
                }
            else:
                questao = {
                    "tipo": "fill_blank",
                    "enunciado": f"Para aplicar o conceito do trecho '{chunk[:70]}', o primeiro passo é ___.",
                    "alternativas": [],
                    "resposta_correta": "identificar o objetivo do problema",
                    "explicacao": "O primeiro passo orienta a escolha da estratégia.",
                }
        else:
            tipo = "essay"
            questao = {
                "tipo": "essay",
                "enunciado": f"Explique como o trecho '{chunk[:70]}' se conecta com a prática do tópico.",
                "alternativas": [],
                "resposta_correta": "Resposta dissertativa fundamentada no conteúdo.",
                "explicacao": "A resposta deve articular conceito, evidência e aplicação.",
            }

        atividades_seed.append(
            {
                "titulo": f"Atividade {idx + 1}",
                "descricao": f"Prática orientada com base em {source_hint}.",
                "tipo": tipo,
                "pontuacao_maxima": 10 if tipo != "essay" else 20,
                "questoes": [questao],
            }
        )

    result: dict[str, Any] = {}
    if "pdf" in formatos:
        result["pdf"] = {
            "titulo": "Guia de estudo",
            "resumo": f"Síntese do conteúdo a partir de {source_hint}.",
            "secoes": chunks[: min(8, len(chunks))],
            "tema_visual": tema_visual,
        }
    if "documento" in formatos:
        result["documento"] = {
            "titulo": "Documento de estudo",
            "resumo": f"Documento guiado com pontos centrais de {source_hint}.",
            "secoes": chunks[: min(10, len(chunks))],
            "tema_visual": tema_visual,
        }
    if "apresentacao" in formatos:
        result["apresentacao"] = {
            "titulo": "Apresentação de estudo",
            "abertura": f"Sequência de slides baseada em {source_hint}.",
            "slides": [
                {
                    "titulo": f"Slide {index + 1}",
                    "pontos": [chunk, "Aplicação prática do conceito"],
                }
                for index, chunk in enumerate(chunks[: min(10, len(chunks))])
            ],
            "tema_visual": tema_visual,
        }
    if "cards" in formatos:
        result["cards"] = _enriquecer_cards(
            cards_seed,
            target_count=cards_target,
            topic_name=source_hint,
            anchor_concepts=source_titles,
            anchor_facts=chunks,
        )
    if "quiz" in formatos:
        result["quiz"] = {"atividades": atividades_seed}
    if "video" in formatos:
        result["video"] = {
            "roteiro": f"Apresente o tópico com foco em exemplos de {source_hint}.",
            "cenas": [
                "Abertura com objetivo da aula",
                "Conceito principal com definição aplicada",
                "Exemplo resolvido passo a passo",
                "Resumo final e desafio para o aluno",
            ],
            "tema_visual": tema_visual,
        }
    if "audio" in formatos:
        result["audio"] = {
            "roteiro": (
                "Olá! Neste áudio, vamos revisar os pontos-chave do tópico com base nas fontes enviadas. "
                f"Ponto central: {chunks[0] if chunks else 'conceito principal'}. "
                "No final, pratique explicando o conceito com suas próprias palavras."
            ),
            "duracao_estimada_seg": 60,
            "tema_visual": tema_visual,
        }
    if "imagem" in formatos:
        result["imagem"] = {
            "titulo": "Cena-chave",
            "legenda": f"Representação visual inspirada nos materiais de origem: {source_hint}.",
            "prompt_imagem": f"Ilustração educacional mobile, estilo TrailUp, baseada em {source_hint}.",
            "tema_visual": tema_visual,
        }
    return result

def _extract_png_from_gemini(payload: dict[str, Any]) -> bytes | None:
    candidates = payload.get("candidates") or []
    for candidate in candidates:
        parts = ((candidate.get("content") or {}).get("parts")) or []
        for part in parts:
            inline_data = part.get("inlineData") or part.get("inline_data")
            if not isinstance(inline_data, dict):
                continue
            mime_type = inline_data.get("mimeType") or inline_data.get("mime_type") or ""
            if mime_type != "image/png":
                continue
            data = inline_data.get("data")
            if not data:
                continue
            try:
                return base64.b64decode(data)
            except Exception:
                return None
    return None


async def _generate_personalized_image_png(
    *,
    settings: Settings,
    image_prompt: str,
) -> bytes | None:
    if not settings.gemini_api_key or not image_prompt.strip():
        return None

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model_image}:generateContent?key={settings.gemini_api_key}"
    )
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Generate a single PNG illustration for a mobile learning artifact. "
                            f"Prompt: {image_prompt}. "
                            "Educational composition, no text, centered subject, polished game-like style."
                        )
                    }
                ]
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=body)
            response.raise_for_status()
        return _extract_png_from_gemini(response.json())
    except Exception as exc:  # pragma: no cover
        logger.warning("Falha ao gerar imagem personalizada: %s", exc)
        return None


async def fetch_personalizacao_context(
    *,
    aluno_id: str,
    classe_id: int,
    topico_id: int | None,
    conteudo_id: int | None,
    settings: Settings,
    session: AsyncSession,
) -> dict[str, Any]:
    from uuid import uuid4

    if topico_id is None and conteudo_id is None:
        raise ValueError("topico_id ou conteudo_id é obrigatório para personalização.")

    ciclo_id = str(uuid4())
    context_repo = ContextRepository(session)
    classe_repo = ConteudoClasseRepository(session)
    fontes_repo = FontesPersonalizacaoRepository(session)

    context = await context_repo.fetch_aluno_context(aluno_id=aluno_id, classe_id=classe_id)

    # Resolve topico_id a partir do conteudo_id se não foi fornecido
    if topico_id is None and conteudo_id is not None:
        topico_id = await classe_repo.buscar_topico_id_por_conteudo(conteudo_id)
    if topico_id is None:
        raise ValueError("Não foi possível resolver topico_id para personalização.")

    # Resolve conteudo_id foco se não foi fornecido
    if conteudo_id is None:
        conteudo_id = await context_repo.resolve_conteudo_foco_id(
            topico_id=topico_id, atividade_id=None, fallback_topico_id=None
        )

    await fontes_repo.seed_from_class_content(
        classe_id=classe_id, topico_ids=[topico_id]
    )
    fontes_raw = await fontes_repo.listar_para_contexto(
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        aluno_id=aluno_id,
    )
    supabase_base = str(getattr(settings, "supabase_url", "") or "").strip()
    fontes = []
    for f in fontes_raw:
        public_url = str(f.get("arquivo_url") or f.get("url") or "").strip()
        if not public_url:
            # Tenta gerar URL pública a partir de storage_path + bucket
            storage_path = str(f.get("storage_path") or "").strip()
            bucket = str(f.get("bucket") or _CONTEUDO_ALUNO_BUCKET).strip()
            if storage_path and supabase_base:
                public_url = build_public_storage_url(supabase_base, bucket, storage_path) or ""
        if not public_url:
            continue
        fontes.append({
            "url": public_url,
            "mime_type": str(f.get("mime_type") or "").strip(),
            "tipo": str(f.get("tipo") or "documento").strip(),
        })

    topico = await classe_repo.buscar_topico(topico_id)
    conteudos = await classe_repo.buscar_conteudos_topico(topico_id)
    atividades = await classe_repo.buscar_atividades_topico(topico_id)
    questoes = await classe_repo.buscar_questoes_topico(topico_id)
    cards_topico = await classe_repo.buscar_cards_topico(topico_id)

    source_hash = _build_source_hash(
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        materiais_origem=[],
        cards_topico=cards_topico,
        atividades_topico=atividades,
        questoes_topico=questoes,
    )

    perfil_brainhex = context.get("perfil_brainhex") or []
    perfil_dominante = _perfil_dominante(perfil_brainhex)

    logger.info(
        "fetch_personalizacao_context.ok aluno=%s topico=%s conteudo=%s perfil=%s fontes=%s",
        aluno_id, topico_id, conteudo_id, perfil_dominante, len(fontes),
    )

    return {
        "perfil_dominante": perfil_dominante,
        "perfil_brainhex": perfil_brainhex,
        "fontes": fontes,
        "topico_id": topico_id,
        "conteudo_id": conteudo_id,
        "conteudo_classe": {
            "topico": topico or {},
            "conteudos": conteudos,
            "atividades": atividades,
        },
        "contexto_aluno": {
            "modo_operacao": (context.get("aluno") or {}).get("modo_operacao"),
            "modo_resposta": (context.get("aluno") or {}).get("modo_resposta"),
            "historico_eventos": context.get("historico_eventos") or [],
            "desempenho_recente": context.get("desempenho_recente") or {},
        },
        "source_hash": source_hash,
        "ciclo_id": ciclo_id,
    }


async def gerar_cards_direto(
    *,
    perfil: str,
    conteudo_classe: dict[str, Any],
    contexto_aluno: dict[str, Any],
    perfil_brainhex: list[dict[str, Any]],
    settings: Settings,
) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    perfil_editorial = _build_profile_editorial_context(perfil, perfil_brainhex)

    topico = conteudo_classe.get("topico") or {}
    conteudos = conteudo_classe.get("conteudos") or []
    atividades = conteudo_classe.get("atividades") or []

    conteudo_estudado = {
        "tema_central": str(topico.get("nome") or topico.get("title") or "").strip(),
        "objetivo_pedagogico": str(topico.get("objetivo") or topico.get("descricao") or "").strip(),
        "conceitos_nucleares": [
            str(c.get("nome") or c.get("titulo") or "").strip()
            for c in conteudos
            if (c.get("nome") or c.get("titulo") or "").strip()
        ],
        "atividades": [
            str(a.get("enunciado") or a.get("titulo") or "").strip()
            for a in atividades
            if (a.get("enunciado") or a.get("titulo") or "").strip()
        ],
        "contexto_aluno": {
            "modo_operacao": contexto_aluno.get("modo_operacao") or "imediato",
            "desempenho": contexto_aluno.get("desempenho_recente") or {},
        },
    }

    modelo_editorial = {
        "perfil_dominante": perfil,
        "personalizacao_brainhex": {
            "perfil": perfil,
            "guia_nome": perfil_editorial.get("guia_nome"),
            "framing_narrativo": perfil_editorial.get("framing_narrativo"),
        },
    }

    logger.info(
        "gerar_cards_direto.invoke perfil=%s tema=%s conteudos=%d atividades=%d",
        perfil,
        conteudo_estudado.get("tema_central") or "(vazio)",
        len(conteudos),
        len(atividades),
    )

    result = await llm.ainvoke_json(
        prompt_name="gerador_conteudo.txt",
        payload={
            "modelo_editorial": modelo_editorial,
            "conteudo_estudado": conteudo_estudado,
            "perfil_editorial": perfil_editorial,
            "formatos_solicitados": ["cards"],
            "metas_tamanho_adaptativas": {"cards_min": 5, "cards_max": 15},
        },
    )

    if not isinstance(result, dict):
        raise ValueError(f"gerar_cards_direto: LLM retornou tipo inesperado {type(result)}")
    cards_payload = result.get("cards")
    if not cards_payload:
        logger.error(
            "gerar_cards_direto.sem_cards perfil=%s result_keys=%s",
            perfil,
            list(result.keys()),
        )
        raise ValueError(
            f"gerar_cards_direto: LLM nao retornou campo 'cards' (chaves: {list(result.keys())})"
        )
    logger.info("gerar_cards_direto.ok perfil=%s cards=%d", perfil, len(cards_payload) if isinstance(cards_payload, list) else 1)
    return cards_payload


async def build_personalizacao_state(
    *,
    aluno_id: str,
    classe_id: int,
    topico_id: int | None,
    conteudo_id: int | None,
    conteudo_foco_id: int | None = None,
    perfis: list[dict[str, Any]] | None = None,
    topico_snapshot: dict[str, Any] | None = None,
    materiais_origem_cliente: list[dict[str, Any]] | None = None,
    settings: Settings,
    session: AsyncSession,
) -> dict[str, Any]:
    ciclo_id = str(uuid4())
    context_repo = ContextRepository(session)
    classe_repo = ConteudoClasseRepository(session)
    context = await context_repo.fetch_aluno_context(aluno_id=aluno_id, classe_id=classe_id)
    context["perfil_brainhex"] = _merge_perfil_brainhex(context.get("perfil_brainhex", []), perfis)

    snapshot = topico_snapshot if isinstance(topico_snapshot, dict) else {}
    snapshot_topico = snapshot.get("topico") if isinstance(snapshot.get("topico"), dict) else None
    snapshot_conteudos = _coerce_dict_list(snapshot.get("conteudos"))
    snapshot_atividades = _coerce_dict_list(snapshot.get("atividades"))
    snapshot_cards = _coerce_dict_list(snapshot.get("cards"))
    snapshot_sources = _coerce_dict_list(snapshot.get("materiais_origem_cliente"))
    client_sources = _coerce_dict_list(materiais_origem_cliente)

    resolved_conteudo_id = conteudo_id or conteudo_foco_id or snapshot.get("conteudo_foco_id")
    resolved_topico_id = topico_id
    if resolved_conteudo_id is None and resolved_topico_id is not None:
        resolved_conteudo_id = await context_repo.resolve_conteudo_foco_id(
            topico_id=resolved_topico_id,
            atividade_id=None,
            fallback_topico_id=None,
        )
    if resolved_topico_id is None and resolved_conteudo_id is not None:
        resolved_topico_id = await classe_repo.buscar_topico_id_por_conteudo(resolved_conteudo_id)

    if resolved_topico_id is None and resolved_conteudo_id is None:
        raise ValueError("Nao foi possivel resolver topico ou conteudo para personalizacao.")

    topico = await classe_repo.buscar_topico(resolved_topico_id) if resolved_topico_id is not None else None
    conteudos = await classe_repo.buscar_conteudos_topico(resolved_topico_id) if resolved_topico_id is not None else []
    midias = await classe_repo.buscar_midias_topico(resolved_topico_id) if resolved_topico_id is not None else []
    atividades = await classe_repo.buscar_atividades_topico(resolved_topico_id) if resolved_topico_id is not None else []
    questoes = await classe_repo.buscar_questoes_topico(resolved_topico_id) if resolved_topico_id is not None else []
    cards_topico = await classe_repo.buscar_cards_topico(resolved_topico_id) if resolved_topico_id is not None else []
    cards = await classe_repo.buscar_cards_conteudo(resolved_conteudo_id) if resolved_conteudo_id is not None else []

    if topico is None and snapshot_topico:
        topico = snapshot_topico
    if not conteudos and snapshot_conteudos:
        conteudos = snapshot_conteudos
    if not atividades and snapshot_atividades:
        atividades = snapshot_atividades
    if not cards and snapshot_cards:
        cards = snapshot_cards

    fontes_repo = FontesPersonalizacaoRepository(session)
    seeded = await fontes_repo.seed_from_class_content(
        classe_id=classe_id,
        topico_ids=[int(resolved_topico_id)] if resolved_topico_id is not None else None,
    )
    fontes_upload = await fontes_repo.listar_para_contexto(
        classe_id=classe_id,
        topico_id=resolved_topico_id,
        conteudo_id=resolved_conteudo_id,
        aluno_id=aluno_id,
    )
    logger.info(
        "fontes_personalizacao.seeded=%s",
        {
            "classe_id": classe_id,
            "topico_id": resolved_topico_id,
            "conteudo_id": resolved_conteudo_id,
            "conteudos": int(seeded.get("conteudos") or 0),
            "midias": int(seeded.get("midias") or 0),
        },
    )
    fontes_upload_aluno = [
        item
        for item in fontes_upload
        if str(item.get("visibilidade") or "").strip().lower() == "aluno"
        and str(item.get("aluno_id") or "").strip() == aluno_id
    ]
    fontes_upload_classe = [
        item
        for item in fontes_upload
        if str(item.get("visibilidade") or "").strip().lower() == "classe"
    ]
    fontes_priorizadas = [*fontes_upload_aluno, *fontes_upload_classe]
    materiais_origem = _merge_source_materials(fontes_priorizadas, _extract_source_materials(conteudos, midias))
    materiais_origem = _merge_source_materials(materiais_origem, snapshot_sources)
    materiais_origem = _merge_source_materials(materiais_origem, client_sources)
    logger.info(
        "DEBUG_PERSONALIZACAO.sources_pre_hydrate=%s",
        _summarize_sources_debug(materiais_origem),
    )
    materiais_origem = await _hydrate_source_materials_content(
        materiais_origem=materiais_origem,
        settings=settings,
    )
    logger.info(
        "DEBUG_PERSONALIZACAO.sources_post_hydrate=%s",
        _summarize_sources_debug(materiais_origem),
    )
    await _persist_hydrated_sources_into_fontes(
        fontes_repo=fontes_repo,
        materiais_origem=materiais_origem,
        settings=settings,
    )
    source_hash = _build_source_hash(
        classe_id=classe_id,
        topico_id=resolved_topico_id,
        conteudo_id=resolved_conteudo_id,
        materiais_origem=materiais_origem,
        cards_topico=cards_topico,
        atividades_topico=atividades,
        questoes_topico=questoes,
    )

    focus_content_id = resolved_conteudo_id or (int(conteudos[0]["id"]) if conteudos else None)
    if focus_content_id is None:
        raise ValueError("Nao foi possivel resolver um conteudo foco para personalizacao.")

    return {
        "workflow_kind": "personalizar",
        "aluno_id": aluno_id,
        "classe_id": classe_id,
        "nome_aluno": context["aluno"].get("nome"),
        "email_aluno": context["aluno"].get("email"),
        "modo_operacao": context["aluno"].get("modo_operacao"),
        "modo_resposta": context["aluno"].get("modo_resposta"),
        "perfil_brainhex": context.get("perfil_brainhex", []),
        "historico_eventos": context.get("historico_eventos", []),
        "desempenho_recente": context.get("desempenho_recente", {}),
        "trilha_atual": context.get("trilha_atual"),
        "ia_descricao_atual": context.get("ia_descricao_atual"),
        "payload_topico_id": resolved_topico_id,
        "conteudo_foco_id": focus_content_id,
        "topico_contexto": topico,
        "conteudos_topico": conteudos,
        "midias_topico": midias,
        "atividades_topico": atividades,
        "questoes_topico": questoes,
        "cards_conteudo": cards,
        "materiais_origem": materiais_origem,
        "source_hash": source_hash,
        "conteudo_boss_foco_id": focus_content_id,
        "emit_legacy_topic_battle": True,
        "plano_personalizacao": None,
        "ai_patch": None,
        "materiais_personalizados": None,
        "midias_em_processamento": False,
        "personalizacao_record": None,
        "boss_visual_processado": False,
        "next": [],
        "ciclo_id": ciclo_id,
        "completed_nodes": [],
        "acoes_aplicadas": [],
        "messages": [],
        "erros": [],
    }


async def generate_plano_personalizacao(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    perfil_brainhex = state.get("perfil_brainhex", [])
    perfil_dominante = _perfil_dominante(perfil_brainhex)
    desempenho = state.get("desempenho_recente", {}) or {}
    fallback_plan = _fallback_plano_for_state(state)
    logger.info(
        "personalizacao.plan.input=%s",
        json.dumps(
            {
                "aluno_id": state.get("aluno_id"),
                "classe_id": state.get("classe_id"),
                "topico_id": state.get("payload_topico_id"),
                "conteudo_foco_id": state.get("conteudo_foco_id"),
                "perfil_dominante": perfil_dominante,
                "perfis_count": len(perfil_brainhex),
                "conteudos_count": len(state.get("conteudos_topico", [])),
                "atividades_count": len(state.get("atividades_topico", [])),
                "fontes_count": len(state.get("materiais_origem", [])),
            },
            ensure_ascii=False,
            default=str,
        ),
    )
    result = await llm.ainvoke_json(
        prompt_name="planejador_conteudo.txt",
        payload={
            "perfil_dominante": perfil_dominante,
            "perfil_brainhex": perfil_brainhex,
            "modo_operacao": state.get("modo_operacao") or "imediato",
            "modo_resposta": state.get("modo_resposta") or "imediato",
            "topico": {
                "titulo_modulo": (state.get("topico_contexto") or {}).get("nome"),
                "descricao_modulo": (state.get("topico_contexto") or {}).get("descricao"),
            },
            "emocao": None,
            "desempenho": {
                "media_acertos": float(desempenho.get("media_acertos", 0.5)),
                "percentual_concluido": float(desempenho.get("percentual_concluido", 0)),
            },
            "conteudos_disponiveis": [
                {
                    "titulo_modulo": (state.get("topico_contexto") or {}).get("nome"),
                    "descricao_modulo": (state.get("topico_contexto") or {}).get("descricao"),
                    "titulo": c.get("titulo"),
                    "descricao": c.get("descricao"),
                    "tipo": c.get("tipo"),
                    "ordem": c.get("ordem"),
                }
                for c in state.get("conteudos_topico", [])[:10]
            ],
            "atividades_disponiveis": [
                {
                    "titulo_modulo": (state.get("topico_contexto") or {}).get("nome"),
                    "descricao_modulo": (state.get("topico_contexto") or {}).get("descricao"),
                    "titulo": a.get("titulo"),
                    "descricao": a.get("descricao"),
                    "tipo": a.get("tipo"),
                }
                for a in state.get("atividades_topico", [])[:10]
            ],
            "cards_disponiveis": [
                {"titulo": c.get("titulo"), "descricao": c.get("descricao")}
                for c in state.get("cards_conteudo", [])[:10]
            ],
            "fontes_originais": state.get("materiais_origem", [])[:12],
            "tipos_fontes_disponiveis": sorted(
                {str(item.get("tipo") or "").lower() for item in state.get("materiais_origem", []) if item.get("tipo")}
            ),
        },
        fallback_factory=lambda: dict(fallback_plan),
        provider="openai",
    )
    formatos = [f for f in result.get("formatos", fallback_plan["formatos"]) if f in _ALL_FORMATOS]
    if not formatos:
        formatos = fallback_plan["formatos"]
    result["formatos"] = formatos
    result["formato_prioritario"] = (
        result.get("formato_prioritario")
        if result.get("formato_prioritario") in formatos
        else formatos[0]
    )
    raw_refresh_policy = result.get("refresh_policy")
    if not isinstance(raw_refresh_policy, dict):
        raw_refresh_policy = fallback_plan.get("refresh_policy") or {"mode": "once", "trigger_actions": []}
    result["refresh_policy"] = {
        "mode": "analysis"
        if str(raw_refresh_policy.get("mode") or "").strip().lower() == "analysis"
        else "once",
        "trigger_actions": [
            str(item).strip()
            for item in (raw_refresh_policy.get("trigger_actions") or [])
            if str(item).strip()
        ],
    }
    logger.info(
        "personalizacao.plan.output=%s",
        json.dumps(
            {
                "aluno_id": state.get("aluno_id"),
                "ciclo_id": state.get("ciclo_id"),
                "formato_prioritario": result.get("formato_prioritario"),
                "formatos": result.get("formatos", []),
                "nivel": result.get("nivel"),
                "tom": result.get("tom"),
                "refresh_policy": result.get("refresh_policy"),
            },
            ensure_ascii=False,
            default=str,
        ),
    )
    return result


async def generate_ai_patch_personalizacao(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    plano = state.get("plano_personalizacao") or dict(_FALLBACK_PLANO)
    model = await build_behavioral_personalization(
        aluno_id=state["aluno_id"],
        ciclo_id=state["ciclo_id"],
        context={
            "aluno": {
                "modo_operacao": state.get("modo_operacao"),
                "modo_resposta": state.get("modo_resposta"),
            },
            "perfil_brainhex": state.get("perfil_brainhex", []),
            "desempenho_recente": state.get("desempenho_recente", {}),
            "historico_eventos": state.get("historico_eventos", []),
        },
        plano=plano,
        topico=state.get("topico_contexto"),
        conteudos=state.get("conteudos_topico", []),
        atividades=state.get("atividades_topico", []),
        questoes=state.get("questoes_topico", []),
        cards=state.get("cards_conteudo", []),
        settings=settings,
        conteudo_boss_foco_id=state.get("conteudo_boss_foco_id"),
        emit_legacy_topic_battle=bool(state.get("emit_legacy_topic_battle", True)),
    )
    return model.model_dump(mode="json", by_alias=True)


def _extract_json_candidate(raw_text: str) -> str | None:
    cleaned = str(raw_text or "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    first_object = cleaned.find("{")
    first_array = cleaned.find("[")
    if first_object < 0 and first_array < 0:
        return None
    if first_object >= 0 and first_array >= 0:
        start = min(first_object, first_array)
    else:
        start = max(first_object, first_array)

    opening = cleaned[start]
    closing = "}" if opening == "{" else "]"
    depth = 0
    in_string = False
    escaped = False

    for idx in range(start, len(cleaned)):
        ch = cleaned[idx]
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == "\"":
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == opening:
            depth += 1
        elif ch == closing:
            depth -= 1
        if depth == 0:
            return cleaned[start : idx + 1]
    return None


def _parse_json_candidate(raw_text: str) -> dict[str, Any] | None:
    candidate = _extract_json_candidate(raw_text or "")
    if not candidate:
        return None
    try:
        parsed = json.loads(candidate)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _extract_text_from_gemini_payload(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") if isinstance(payload.get("candidates"), list) else []
    if not candidates:
        return ""
    first = candidates[0] if isinstance(candidates[0], dict) else {}
    content = first.get("content") if isinstance(first.get("content"), dict) else {}
    parts = content.get("parts") if isinstance(content.get("parts"), list) else []
    return "".join(str(part.get("text") or "") for part in parts if isinstance(part, dict)).strip()


async def _build_multimodal_inline_parts(
    *,
    settings: Settings,
    materiais_origem: list[dict[str, Any]],
    max_files: int = 3,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    storage = SupabaseStorage(settings)
    inline_parts: list[dict[str, Any]] = []
    technical_logs: list[dict[str, Any]] = []
    max_inline_source_bytes = max(1_000_000, int(getattr(settings, "personalizacao_max_inline_source_bytes", 18_000_000) or 18_000_000))

    def _source_rank(source: dict[str, Any]) -> tuple[int, int]:
        origem = (_pick_string(source.get("origem")) or "").lower()
        has_file = bool(
            _pick_string(source.get("storage_path"))
            or _pick_string(source.get("url"), source.get("arquivo_url"))
        )
        origin_rank = 0 if origem in {"upload", "fonte", "fonte_personalizacao", "classe", "aluno", "link"} else 1
        return (0 if has_file else 1, origin_rank)

    ranked_sources = sorted(materiais_origem, key=_source_rank)
    for source in ranked_sources:
        if len(inline_parts) >= max_files:
            break

        storage_path = _pick_string(source.get("storage_path"))
        bucket = _resolve_source_bucket(source)
        url = _pick_string(source.get("url"), source.get("arquivo_url"))
        mime_type = _pick_string(source.get("mime_type"), source.get("arquivo_mime"))

        raw: bytes | None = None
        if storage_path and bucket:
            raw = await storage.download_bytes(bucket=bucket, path=storage_path)
        if raw is None and url:
            raw = await storage.download_public_bytes(url)
        if raw is None:
            logger.info(
                "DEBUG_PERSONALIZACAO.inline_source_skip=%s",
                {
                    "source_id": source.get("source_id"),
                    "origem": source.get("origem"),
                    "tipo": source.get("tipo"),
                    "bucket": bucket,
                    "storage_path": storage_path,
                    "url": url,
                    "reason": "download_failed_or_missing",
                },
            )
            continue
        original_size = len(raw)
        if original_size > max_inline_source_bytes:
            technical_logs.append(
                {
                    "source_id": source.get("source_id"),
                    "storage_path": storage_path,
                    "url": url,
                    "mime_type": mime_type,
                    "bytes": original_size,
                    "max_inline_source_bytes": max_inline_source_bytes,
                    "skipped": "inline_file_too_large",
                }
            )
            logger.info(
                "DEBUG_PERSONALIZACAO.inline_source_skip=%s",
                {
                    "source_id": source.get("source_id"),
                    "bucket": bucket,
                    "storage_path": storage_path,
                    "url": url,
                    "bytes": original_size,
                    "max_inline_source_bytes": max_inline_source_bytes,
                    "reason": "file_too_large",
                },
            )
            continue
        effective_mime = (
            mime_type
            or mimetypes.guess_type(url or storage_path or "")[0]
            or "application/octet-stream"
        )
        encoded = base64.b64encode(raw).decode("ascii")
        inline_parts.append(
            {
                "inline_data": {
                    "mime_type": effective_mime,
                    "data": encoded,
                }
            }
        )
        technical_logs.append(
            {
                "source_id": source.get("source_id"),
                "storage_path": storage_path,
                "url": url,
                "mime_type": effective_mime,
                "bytes": original_size,
            }
        )
        logger.info(
            "DEBUG_PERSONALIZACAO.inline_source_selected=%s",
            {
                "source_id": source.get("source_id"),
                "bucket": bucket,
                "storage_path": storage_path,
                "url": url,
                "mime_type": effective_mime,
                "bytes": original_size,
            },
        )

    return inline_parts, technical_logs


async def _invoke_multimodal_materiais(
    *,
    settings: Settings,
    state: dict[str, Any],
    formatos: list[str],
    perfil_dominante: str,
    plano: dict[str, Any],
    preferred_model: str | None = None,
    fontes_midias_relevantes: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    if not settings.gemini_api_key:
        return None, {"reason": "missing_gemini_api_key"}

    materiais_origem = state.get("materiais_origem", []) or []
    topico_context = state.get("topico_contexto") if isinstance(state.get("topico_contexto"), dict) else {}
    conteudos = state.get("conteudos_topico") if isinstance(state.get("conteudos_topico"), list) else []
    chunks = _collect_source_chunks(
        materiais_origem=materiais_origem,
        topico=topico_context,
        perfil=perfil_dominante,
        limit=20,
    )
    inline_parts, file_logs = await _build_multimodal_inline_parts(
        settings=settings,
        materiais_origem=materiais_origem,
        max_files=3,
    )
    conteudo_estudado = state.get("conteudo_estudado") if isinstance(state.get("conteudo_estudado"), dict) else None
    if not conteudo_estudado:
        conteudo_estudado = _build_fallback_content_study(
            topico_context=topico_context,
            source_chunks=chunks,
            conteudos=conteudos,
            fontes_midias_relevantes=fontes_midias_relevantes,
        )
        state["conteudo_estudado"] = conteudo_estudado

    complexidade = str(conteudo_estudado.get("complexidade") or "").strip().lower()
    if complexidade not in _CONTENT_COMPLEXITY_LEVELS:
        complexidade = _infer_content_complexity(source_chunks=chunks, conteudos=conteudos)
        conteudo_estudado["complexidade"] = complexidade
    conteudo_estudado["metas_tamanho"] = _adaptive_size_targets(complexidade)
    min_quality_score = float(getattr(settings, "personalizacao_media_min_quality_score", 0.72) or 0.72)
    min_quality_score = max(0.4, min(0.95, min_quality_score))

    base_payload = {
        "perfil_dominante": perfil_dominante,
        "perfil_brainhex": state.get("perfil_brainhex", []),
        "perfil_editorial": state.get("perfil_editorial") if isinstance(state.get("perfil_editorial"), dict) else {},
        "plano": plano,
        "formatos_solicitados": formatos,
        "topico": {
            "titulo_modulo": topico_context.get("nome"),
            "descricao_modulo": topico_context.get("descricao"),
        },
        "conteudo_estudado": conteudo_estudado,
        "modelo_editorial": state.get("modelo_editorial") if isinstance(state.get("modelo_editorial"), dict) else {},
        "metas_tamanho_adaptativas": conteudo_estudado.get("metas_tamanho"),
        "fidelidade_conteudo": "criativa",
        "cards_padrao": [
            {"titulo": item.get("titulo"), "descricao": item.get("descricao")}
            for item in (state.get("cards_conteudo") or [])[:20]
            if isinstance(item, dict)
        ],
        "atividades": [
            {"titulo": item.get("titulo"), "descricao": item.get("descricao"), "tipo": item.get("tipo")}
            for item in (state.get("atividades_topico") or [])[:20]
            if isinstance(item, dict)
        ],
        "questoes_referencia": [
            {
                "enunciado": item.get("enunciado"),
                "tipo": item.get("tipo"),
                "nota_estabelecida": item.get("nota_estabelecida"),
            }
            for item in (state.get("questoes_topico") or [])[:40]
            if isinstance(item, dict)
        ],
        "fontes_chunks": chunks,
        "fontes_midias_relevantes": fontes_midias_relevantes or [],
    }

    parts: list[dict[str, Any]] = [
        {
            "text": (
                f"{load_prompt('gerador_conteudo.txt')}\n\n"
                "Use os arquivos inline anexados quando presentes como fonte principal da transformacao. "
                "Leia os chunks e os seeds do professor para transformar o conteudo. "
                "Gere todos os formatos solicitados, sem omitir nenhum, mantendo consistencia entre eles. "
                "Nao escreva frases sobre personalizacao, perfil do aluno ou processo interno. "
                "Use o conteudo_estudado como ancora semantica para manter consistencia factual entre as midias."
            )
        },
        {"text": json.dumps(base_payload, ensure_ascii=False, default=str)},
        *inline_parts,
    ]

    primary, fallback = _multimodal_models(settings)
    candidate_models = [preferred_model, primary, fallback]
    tried_models: list[str] = []
    errors: list[dict[str, Any]] = []

    for model_name in candidate_models:
        normalized_model = str(model_name or "").strip()
        if not normalized_model or normalized_model in tried_models:
            continue
        tried_models.append(normalized_model)
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{normalized_model}:generateContent?key={settings.gemini_api_key}"
        )
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json",
                "responseSchema": _build_materiais_response_schema(formatos),
            },
        }

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(url, json=body)
                response.raise_for_status()
                payload = response.json()
            raw_text = _extract_text_from_gemini_payload(payload)
            parsed = _parse_json_candidate(raw_text)
            if isinstance(parsed, dict) and parsed:
                quality_by_formato: dict[str, Any] = {}
                approved_payloads: dict[str, Any] = {}
                rejected_by_quality: list[str] = []

                for formato in formatos:
                    candidate_payload = _extract_format_payload_candidate(formato, parsed)
                    if candidate_payload is None:
                        continue
                    quality = _evaluate_media_payload_quality(
                        formato=formato,
                        payload=candidate_payload if isinstance(candidate_payload, (dict, list)) else None,
                        conteudo_estudado=conteudo_estudado,
                        min_quality_score=min_quality_score,
                        modelo_editorial=state.get("modelo_editorial") if isinstance(state.get("modelo_editorial"), dict) else None,
                        perfil_dominante=perfil_dominante,
                    )
                    quality_by_formato[formato] = quality
                    if quality.get("aprovado"):
                        approved_payloads[formato] = candidate_payload
                    else:
                        rejected_by_quality.append(formato)

                if approved_payloads:
                    return approved_payloads, {
                        "model": normalized_model,
                        "chunks_count": len(chunks),
                        "inline_files_count": len(inline_parts),
                        "inline_files": file_logs,
                        "tried_models": tried_models,
                        "quality": quality_by_formato,
                        "rejected_by_quality": rejected_by_quality,
                    }
                errors.append(
                    {
                        "model": normalized_model,
                        "error": "quality_rejected_all",
                        "quality": quality_by_formato,
                    }
                )
                continue
            errors.append({"model": normalized_model, "error": "empty_or_invalid_json"})
        except Exception as exc:
            logger.warning("Falha na geracao multimodal com arquivo inline (%s): %s", normalized_model, exc)
            errors.append({"model": normalized_model, "error": str(exc)})

    return None, {
        "model": tried_models[0] if tried_models else None,
        "chunks_count": len(chunks),
        "inline_files_count": len(inline_parts),
        "inline_files": file_logs,
        "tried_models": tried_models,
        "errors": errors,
    }


async def _materialize_and_upload_media_assets(
    *,
    state: dict[str, Any],
    settings: Settings,
    media_materiais: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    if not media_materiais:
        return {}, []

    pipeline = MultiOutputPipeline(settings=settings, state=state)
    output: dict[str, Any] = {}
    errors: list[str] = []

    renderable_media = {key: value for key, value in media_materiais.items() if key != "imagem"}
    rendered_media, render_errors = await pipeline.render_media(renderable_media)
    output.update(rendered_media)
    errors.extend(render_errors)

    if "imagem" in media_materiais:
        imagem_material = media_materiais.get("imagem")
        if isinstance(imagem_material, dict):
            try:
                payload = imagem_material.get("payload") if isinstance(imagem_material.get("payload"), dict) else {}
                prompt = _pick_string(
                    payload.get("prompt_imagem"),
                    payload.get("image_prompt"),
                    payload.get("prompt"),
                    payload.get("legenda"),
                    payload.get("titulo"),
                )
                image_bytes = await _generate_personalized_image_png(settings=settings, image_prompt=prompt or "")
                if image_bytes:
                    context = pipeline.build_context()
                    storage_path = f"{context.base_prefix}/imagem/material-{context.ref_id}.png"
                    arquivo_url = await context.storage.upload(
                        path=storage_path,
                        data=image_bytes,
                        content_type="image/png",
                    )
                    if arquivo_url:
                        output["imagem"] = pipeline.with_status(
                            {
                                **imagem_material,
                                "arquivo_url": arquivo_url,
                                "storage_path": storage_path,
                                "bucket": "conteudo_aluno",
                                "mime_type": "image/png",
                                "payload": {
                                    **payload,
                                    "url": arquivo_url,
                                    "image_url": arquivo_url,
                                },
                            },
                            status="completed",
                        )
                    else:
                        output["imagem"] = pipeline.with_status(
                            imagem_material,
                            status="failed",
                            error="upload_failed:imagem",
                        )
                        errors.append("imagem:upload_failed")
                else:
                    output["imagem"] = pipeline.with_status(
                        imagem_material,
                        status="failed",
                        error="imagem_generation_failed",
                    )
                    errors.append("imagem:empty_render")
            except Exception as exc:
                output["imagem"] = pipeline.with_status(
                    imagem_material,
                    status="failed",
                    error=str(exc),
                )
                errors.append(f"imagem:{exc}")

    return output, errors


def _normalize_generation_phase(phase: str | None) -> str:
    normalized = str(phase or "full").strip().lower()
    if normalized not in {"full", "fast_only", "slow_only"}:
        return "full"
    return normalized


def _filter_formatos_gerados(
    materiais: dict[str, Any],
    *,
    allowed: set[str] | None = None,
) -> dict[str, Any]:
    if allowed is None:
        return {key: value for key, value in materiais.items() if key in _ALL_FORMATOS}
    return {key: value for key, value in materiais.items() if key in allowed}


def _pending_media_formats(materiais: dict[str, Any]) -> list[str]:
    pending: list[str] = []
    for formato, material in materiais.items():
        if formato not in _MEDIA_FORMATOS or not isinstance(material, dict):
            continue
        status = str((material.get("metadata") or {}).get("status") or "").lower()
        if status == "pending":
            pending.append(formato)
    return pending


def _merge_materiais(existing: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing or {})
    for key, value in (updates or {}).items():
        merged[key] = value
    return merged


def _collect_fontes_midias_relevantes(
    materiais_origem: list[dict[str, Any]] | None,
    *,
    max_items: int = 12,
) -> list[dict[str, Any]]:
    if not isinstance(materiais_origem, list) or not materiais_origem:
        return []

    relevant: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source in materiais_origem:
        if not isinstance(source, dict):
            continue
        source_id = _pick_string(source.get("source_id"), source.get("id"), source.get("titulo")) or "fonte"
        media_candidates = source.get("midias_relevantes") if isinstance(source.get("midias_relevantes"), list) else []
        for item in media_candidates:
            if not isinstance(item, dict):
                continue
            tipo = _pick_string(item.get("tipo"), item.get("kind")) or "midia"
            url = _pick_string(item.get("url"), item.get("arquivo_url"))
            storage_path = _pick_string(item.get("storage_path"))
            if not url and not storage_path:
                continue
            key = f"{_normalize_key(tipo)}|{_normalize_key(url or '')}|{_normalize_key(storage_path or '')}|{_normalize_key(source_id)}"
            if not key or key in seen:
                continue
            seen.add(key)
            relevant.append(
                {
                    "source_id": source_id,
                    "tipo": tipo,
                    "url": url,
                    "storage_path": storage_path,
                    "bucket": _pick_string(item.get("bucket"), source.get("bucket")),
                    "mime_type": _pick_string(item.get("mime_type"), source.get("mime_type"), source.get("arquivo_mime")),
                    "titulo": _pick_string(item.get("titulo"), source.get("titulo")),
                }
            )
            if len(relevant) >= max_items:
                return relevant

    return relevant


def _material_status(material: dict[str, Any] | None) -> str:
    if not isinstance(material, dict):
        return ""
    return str((material.get("metadata") or {}).get("status") or "").strip().lower()


def _is_quality_rejected(material: dict[str, Any] | None) -> bool:
    return _material_status(material) == "failed_quality"


def _collect_quality_rejected_formatos(
    *,
    multistage_meta: dict[str, Any] | None,
    multimodal_meta: dict[str, Any] | None,
) -> set[str]:
    rejected: set[str] = set()
    if isinstance(multistage_meta, dict):
        for formato in multistage_meta.get("rejected_by_quality") or []:
            if formato in _ALL_FORMATOS:
                rejected.add(formato)
        quality_gate = multistage_meta.get("quality_gate") if isinstance(multistage_meta.get("quality_gate"), dict) else {}
        for formato, gate in quality_gate.items():
            if formato not in _ALL_FORMATOS or not isinstance(gate, dict):
                continue
            if gate.get("approved") is False:
                rejected.add(formato)
    if isinstance(multimodal_meta, dict):
        for formato in multimodal_meta.get("rejected_by_quality") or []:
            if formato in _MEDIA_FORMATOS:
                rejected.add(formato)
    return rejected


def _build_failed_quality_material(
    *,
    formato: str,
    refs: dict[str, Any],
    quality_scores: dict[str, Any],
    quality_gate: dict[str, Any],
    ciclo_id: str | None,
    base_payload: dict[str, Any] | list[Any] | None = None,
) -> dict[str, Any]:
    score = quality_scores.get(formato) if isinstance(quality_scores.get(formato), dict) else {}
    gate = quality_gate.get(formato) if isinstance(quality_gate.get(formato), dict) else {}
    status = "failed_quality"
    metadata: dict[str, Any] = {
        "status": status,
        "error": "quality_gate_rejected",
        "quality_gate": {
            "approved": False,
            "status": "rejected",
            "issues": list(gate.get("issues") or score.get("issues") or []),
        },
        "quality_gate_rejected": True,
    }
    if isinstance(score, dict) and score:
        metadata["scores_validacao"] = score
    if ciclo_id:
        metadata["quality_gate_cycle"] = str(ciclo_id)
    return {
        "payload": base_payload if isinstance(base_payload, (dict, list)) else {},
        "arquivo_url": None,
        "storage_path": None,
        "metadata": metadata,
        **refs,
    }


def _resolve_personalizacao_status_from_materiais(materiais: dict[str, Any]) -> str:
    statuses = [_material_status(material) for material in (materiais or {}).values() if isinstance(material, dict)]
    if not statuses:
        return "pronto"
    if any(status == "pending" for status in statuses):
        return "processando_midias"
    failed_like = [status for status in statuses if status in {"failed", "failed_quality"}]
    completed_like = [status for status in statuses if status in {"completed", "ready"}]
    if failed_like and completed_like:
        return "partial"
    if failed_like and not completed_like:
        return "failed"
    return "pronto"


async def generate_materiais_personalizados(
    state: dict[str, Any],
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    *,
    phase: str = "full",
    existing_materiais: dict[str, Any] | None = None,
) -> dict[str, Any]:
    generation_phase = _normalize_generation_phase(phase)
    previous_materiais = existing_materiais if isinstance(existing_materiais, dict) else {}

    llm = JsonLLMService(settings)
    plano = state.get("plano_personalizacao") or _fallback_plano_for_state(state)
    formatos = [f for f in plano.get("formatos", ["cards"]) if f in _ALL_FORMATOS]
    if not formatos:
        formatos = _fallback_plano_for_state(state)["formatos"]
    formatos = _ensure_pipeline_formatos(
        formatos,
        state.get("materiais_origem", []) or [],
        force_all_media=bool(getattr(settings, "personalizacao_force_all_media_formats", True)),
    )

    pending_existing_media = _pending_media_formats(previous_materiais)
    if generation_phase == "fast_only":
        requested_formatos = list(formatos)
    elif generation_phase == "slow_only":
        requested_formatos = pending_existing_media or [formato for formato in formatos if formato in _MEDIA_FORMATOS]
    else:
        requested_formatos = list(formatos)

    perfil_dominante = _perfil_dominante(state.get("perfil_brainhex", []))
    state["perfil_dominante"] = perfil_dominante
    conteudos = state.get("conteudos_topico", [])
    cards_padrao = state.get("cards_conteudo", [])
    atividades = state.get("atividades_topico", [])
    materiais_origem = state.get("materiais_origem", [])
    fontes_midias_relevantes = _collect_fontes_midias_relevantes(materiais_origem)

    logger.info(
        "personalizacao.materials.input=%s",
        json.dumps(
            {
                "aluno_id": state.get("aluno_id"),
                "ciclo_id": state.get("ciclo_id"),
                "topico_id": state.get("payload_topico_id"),
                "conteudo_foco_id": state.get("conteudo_foco_id"),
                "phase": generation_phase,
                "formatos_planejados": formatos,
                "formatos_requisitados": requested_formatos,
                "conteudos_count": len(conteudos),
                "atividades_count": len(atividades),
                "cards_count": len(cards_padrao),
                "fontes_count": len(materiais_origem),
            },
            ensure_ascii=False,
            default=str,
        ),
    )

    if not requested_formatos:
        materiais_result = dict(previous_materiais)
        state["media_status"] = {
            key: str(((value.get("metadata") or {}).get("status") or "completed")).lower()
            for key, value in materiais_result.items()
            if isinstance(value, dict)
        }
        state["midias_em_processamento"] = bool(_pending_media_formats(materiais_result))
        return materiais_result

    source_chunks = _collect_source_chunks(
        materiais_origem=materiais_origem,
        topico=state.get("topico_contexto") if isinstance(state.get("topico_contexto"), dict) else None,
        perfil=perfil_dominante,
        limit=16,
    )
    fallback_raw = _fallback_materiais(requested_formatos, conteudos, perfil_dominante, materiais_origem)
    raw_multistage, multistage_meta = await _invoke_multistage_materiais_por_formato(
        settings=settings,
        state=state,
        formatos=requested_formatos,
        plano=plano,
        perfil_dominante=perfil_dominante,
        source_chunks=source_chunks,
        fallback_payloads=fallback_raw if isinstance(fallback_raw, dict) else {},
        fontes_midias_relevantes=fontes_midias_relevantes,
    )

    raw_multimodal: dict[str, Any] | None = None
    multimodal_meta: dict[str, Any] = {"reason": "not_needed"}
    missing_for_multimodal = [
        formato
        for formato in requested_formatos
        if formato in _MEDIA_FORMATOS and not isinstance((raw_multistage or {}).get(formato), (dict, list))
    ]
    if missing_for_multimodal:
        raw_multimodal, multimodal_meta = await _invoke_multimodal_materiais(
            settings=settings,
            state=state,
            formatos=missing_for_multimodal,
            perfil_dominante=perfil_dominante,
            plano=plano,
            fontes_midias_relevantes=fontes_midias_relevantes,
        )

    conteudo_estudado = state.get("conteudo_estudado") if isinstance(state.get("conteudo_estudado"), dict) else None
    if not conteudo_estudado:
        conteudo_estudado = _build_fallback_content_study(
            topico_context=state.get("topico_contexto") if isinstance(state.get("topico_contexto"), dict) else {},
            source_chunks=source_chunks,
            conteudos=conteudos if isinstance(conteudos, list) else [],
            fontes_midias_relevantes=fontes_midias_relevantes,
        )
        state["conteudo_estudado"] = conteudo_estudado

    has_uploaded_reference = _has_uploaded_file_reference(materiais_origem)
    has_extracted_reference = _has_meaningful_extracted_content(materiais_origem)

    logger.info(
        "personalizacao.materials.context=%s",
        json.dumps(
            {
                "aluno_id": state.get("aluno_id"),
                "fontes_count": len(materiais_origem),
                "has_uploaded_reference": has_uploaded_reference,
                "has_extracted_reference": has_extracted_reference,
                "source_chunks_count": len(source_chunks),
                "multistage_ok": isinstance(raw_multistage, dict) and bool(raw_multistage),
                "multistage_meta": multistage_meta,
                "multimodal_ok": isinstance(raw_multimodal, dict) and bool(raw_multimodal),
                "multimodal_meta": multimodal_meta,
                "chunks_preview": [
                    c.get("chunk_texto", "")[:80] for c in source_chunks[:3]
                ],
            },
            ensure_ascii=False,
            default=str,
        ),
    )

    media_generation_warnings: list[str] = []
    raw: dict[str, Any] = {}
    if isinstance(raw_multistage, dict):
        raw.update(raw_multistage)
    if isinstance(raw_multimodal, dict):
        raw.update(raw_multimodal)
    if not raw and has_uploaded_reference and not has_extracted_reference:
        media_generation_warnings.append("source_content_unavailable")
    if not raw:
        raw = await llm.ainvoke_json(
            prompt_name="gerador_conteudo.txt",
            payload={
                "perfil_dominante": perfil_dominante,
                "perfil_brainhex": state.get("perfil_brainhex", []),
                "perfil_editorial": state.get("perfil_editorial") if isinstance(state.get("perfil_editorial"), dict) else {},
                "plano": plano,
                "formatos_solicitados": requested_formatos,
                "topico": {
                    "titulo_modulo": (state.get("topico_contexto") or {}).get("nome"),
                    "descricao_modulo": (state.get("topico_contexto") or {}).get("descricao"),
                },
                "conteudo_bruto": [
                    {
                        "titulo_modulo": (state.get("topico_contexto") or {}).get("nome"),
                        "descricao_modulo": (state.get("topico_contexto") or {}).get("descricao"),
                        "titulo": c.get("titulo"),
                        "descricao": c.get("descricao"),
                        "conteudo": (c.get("conteudo") or "")[:1200],
                    }
                    for c in conteudos[:8]
                ],
                "cards_padrao": [
                    {"titulo": c.get("titulo"), "descricao": c.get("descricao")}
                    for c in cards_padrao[:15]
                    if isinstance(c, dict)
                ],
                "atividades": [
                    {
                        "titulo": a.get("titulo"),
                        "descricao": a.get("descricao"),
                        "tipo": a.get("tipo"),
                    }
                    for a in atividades[:15]
                    if isinstance(a, dict)
                ],
                "fontes_originais": materiais_origem[:15],
                "fontes_chunks": source_chunks,
                "fontes_midias_relevantes": fontes_midias_relevantes,
                "conteudo_estudado": conteudo_estudado,
                "modelo_editorial": state.get("modelo_editorial") if isinstance(state.get("modelo_editorial"), dict) else {},
                "metas_tamanho_adaptativas": conteudo_estudado.get("metas_tamanho") if isinstance(conteudo_estudado, dict) else None,
                "fidelidade_conteudo": "criativa",
            },
            fallback_factory=lambda: _fallback_materiais(requested_formatos, conteudos, perfil_dominante, materiais_origem),
            provider="gemini",
        )
    rejected_by_quality = _collect_quality_rejected_formatos(
        multistage_meta=multistage_meta if isinstance(multistage_meta, dict) else None,
        multimodal_meta=multimodal_meta if isinstance(multimodal_meta, dict) else None,
    )
    hard_rejected_by_quality = {formato for formato in rejected_by_quality if formato not in _MEDIA_FORMATOS}
    soft_rejected_media = {formato for formato in rejected_by_quality if formato in _MEDIA_FORMATOS}
    quality_scores = (
        multistage_meta.get("scores_validacao")
        if isinstance(multistage_meta, dict) and isinstance(multistage_meta.get("scores_validacao"), dict)
        else {}
    )
    multimodal_quality = (
        multimodal_meta.get("quality")
        if isinstance(multimodal_meta, dict) and isinstance(multimodal_meta.get("quality"), dict)
        else {}
    )
    if multimodal_quality:
        quality_scores = {**multimodal_quality, **quality_scores}
    quality_gate = (
        multistage_meta.get("quality_gate")
        if isinstance(multistage_meta, dict) and isinstance(multistage_meta.get("quality_gate"), dict)
        else {}
    )
    materiais = _filter_formatos_gerados(
        _normalize_materiais(raw if isinstance(raw, dict) else {}, state),
        allowed=set(requested_formatos),
    )
    fallback_norm = _filter_formatos_gerados(
        _normalize_materiais(fallback_raw, state),
        allowed=set(requested_formatos),
    )
    for formato in requested_formatos:
        if formato in hard_rejected_by_quality:
            continue
        if formato not in materiais and formato in fallback_norm:
            materiais[formato] = fallback_norm[formato]

    if has_uploaded_reference:
        missing_media = [formato for formato in requested_formatos if formato in _MEDIA_FORMATOS and formato not in materiais]
        if missing_media:
            retry_raw, retry_meta = await _invoke_multimodal_materiais(
                settings=settings,
                state=state,
                formatos=missing_media,
                perfil_dominante=perfil_dominante,
                plano=plano,
                preferred_model=getattr(settings, "gemini_materiais_model", None),
                fontes_midias_relevantes=fontes_midias_relevantes,
            )
            if isinstance(retry_raw, dict):
                retry_norm = _filter_formatos_gerados(
                    _normalize_materiais(retry_raw, state),
                    allowed=set(missing_media),
                )
                for formato in missing_media:
                    if formato in hard_rejected_by_quality:
                        continue
                    if formato in retry_norm:
                        materiais[formato] = retry_norm[formato]
                multimodal_meta = {
                    **(multimodal_meta or {}),
                    "retry_media": retry_meta,
                }
            missing_media = [formato for formato in requested_formatos if formato in _MEDIA_FORMATOS and formato not in materiais]
            if missing_media:
                for formato in missing_media:
                    if formato in hard_rejected_by_quality:
                        continue
                    if formato in fallback_norm:
                        materiais[formato] = fallback_norm[formato]
                missing_media = [formato for formato in requested_formatos if formato in _MEDIA_FORMATOS and formato not in materiais]
            if missing_media:
                media_generation_warnings.append(
                    "missing_media:" + ",".join(sorted(missing_media))
                )

    for formato in sorted(hard_rejected_by_quality):
        if formato not in requested_formatos:
            continue
        if _is_quality_rejected(materiais.get(formato)):
            continue
        base_payload = None
        fallback_candidate = fallback_norm.get(formato)
        if isinstance(fallback_candidate, dict):
            base_payload = fallback_candidate.get("payload")
        elif isinstance(fallback_candidate, list):
            base_payload = fallback_candidate
        materiais[formato] = _build_failed_quality_material(
            formato=formato,
            refs=_material_refs(state),
            quality_scores=quality_scores,
            quality_gate=quality_gate,
            ciclo_id=str(state.get("ciclo_id") or ""),
            base_payload=base_payload,
        )

    media_pipeline = MultiOutputPipeline(settings=settings, state=state)
    materiais_result: dict[str, Any] = {}
    materiais_to_save: dict[str, Any] = {}

    if generation_phase == "fast_only":
        materiais_fast_raw, media_materiais = media_pipeline.split(materiais)
        fast_materiais: dict[str, Any] = {}
        for key, value in materiais_fast_raw.items():
            if key not in _FAST_FORMATOS or not isinstance(value, dict):
                continue
            if _is_quality_rejected(value):
                fast_materiais[key] = value
            else:
                fast_materiais[key] = media_pipeline.with_status(value, status="completed")
        pending_formats = [
            formato
            for formato in formatos
            if formato in _MEDIA_FORMATOS and formato not in hard_rejected_by_quality
        ]
        fallback_pending_norm = _filter_formatos_gerados(
            _normalize_materiais(
                _fallback_materiais(pending_formats, conteudos, perfil_dominante, materiais_origem),
                state,
            ),
            allowed=set(pending_formats),
        )
        pending_materials_base: dict[str, Any] = {}
        for formato in pending_formats:
            candidate = media_materiais.get(formato)
            if not isinstance(candidate, dict):
                candidate = fallback_pending_norm.get(formato)
            if not isinstance(candidate, dict):
                candidate = {"payload": {}, **_material_refs(state)}
            if _is_quality_rejected(candidate):
                fast_materiais[formato] = candidate
                continue
            pending_materials_base[formato] = {
                **candidate,
                "arquivo_url": None,
                "storage_path": None,
            }
        pending_media = media_pipeline.mark_pending(pending_materials_base)
        materiais_result = _merge_materiais(fast_materiais, pending_media)
        materiais_to_save = dict(materiais_result)
        state["media_pending_payload"] = {
            key: value
            for key, value in pending_media.items()
            if key in _MEDIA_FORMATOS and isinstance(value, dict)
        }
        state["midias_em_processamento"] = bool(pending_media)
    else:
        materiais_fast_raw, media_materiais = media_pipeline.split(materiais)
        materiais_rendered: dict[str, Any] = {}
        for key, value in materiais_fast_raw.items():
            if not isinstance(value, dict):
                continue
            if _is_quality_rejected(value):
                materiais_rendered[key] = value
            else:
                materiais_rendered[key] = media_pipeline.with_status(value, status="completed")
        blocked_media = {
            formato: material
            for formato, material in media_materiais.items()
            if isinstance(material, dict) and _is_quality_rejected(material)
        }
        media_materiais = {
            formato: material
            for formato, material in media_materiais.items()
            if isinstance(material, dict) and formato not in blocked_media
        }
        if blocked_media:
            materiais_rendered.update(blocked_media)
        media_errors: list[str] = []
        if media_materiais:
            uploaded_media, media_errors = await _materialize_and_upload_media_assets(
                state=state,
                settings=settings,
                media_materiais=media_materiais,
            )
            if uploaded_media:
                materiais_rendered.update(uploaded_media)
            missing_after_render = [
                formato for formato in media_materiais.keys() if formato not in materiais_rendered
            ]
            for formato in missing_after_render:
                material = media_materiais.get(formato)
                if isinstance(material, dict):
                    materiais_rendered[formato] = media_pipeline.with_status(
                        material,
                        status="failed",
                        error="media_output_missing",
                    )
                    media_errors.append(f"{formato}:media_output_missing")

        if media_errors:
            media_generation_warnings.extend(media_errors)

        if generation_phase == "slow_only":
            materiais_result = _merge_materiais(previous_materiais, materiais_rendered)
            materiais_to_save = {
                key: value
                for key, value in materiais_rendered.items()
                if key in _MEDIA_FORMATOS and isinstance(value, dict)
            }
        else:
            materiais_result = dict(materiais_rendered)
            materiais_to_save = dict(materiais_rendered)

        state["midias_em_processamento"] = False
        state.pop("media_pending_payload", None)

    if media_generation_warnings:
        state["media_generation_warnings"] = media_generation_warnings

    editorial_snapshot = {
        "versao": ((state.get("modelo_editorial") or {}).get("versao") if isinstance(state.get("modelo_editorial"), dict) else None)
        or "1.0",
        "perfil_dominante": perfil_dominante,
        "narrativa_tipo": (
            ((state.get("modelo_editorial") or {}).get("estrategia_editorial") or {}).get("narrativa_tipo")
            if isinstance((state.get("modelo_editorial") or {}).get("estrategia_editorial"), dict)
            else None
        ),
    }
    state["editorial_pipeline"] = {
        "conteudo_estudado": state.get("conteudo_estudado") if isinstance(state.get("conteudo_estudado"), dict) else {},
        "modelo_editorial": state.get("modelo_editorial") if isinstance(state.get("modelo_editorial"), dict) else {},
        "perfil_editorial": state.get("perfil_editorial") if isinstance(state.get("perfil_editorial"), dict) else {},
        "multistage": multistage_meta if isinstance(multistage_meta, dict) else {},
        "multimodal": multimodal_meta if isinstance(multimodal_meta, dict) else {},
    }
    for formato, material in materiais_result.items():
        if not isinstance(material, dict):
            continue
        metadata = dict(material.get("metadata") or {})
        metadata.setdefault("editorial", editorial_snapshot)
        if isinstance(quality_scores.get(formato), dict):
            metadata["scores_validacao"] = quality_scores.get(formato)
        if isinstance(quality_gate.get(formato), dict):
            metadata["quality_gate"] = quality_gate.get(formato)
        if formato in hard_rejected_by_quality:
            metadata["quality_gate_rejected"] = True
            metadata.setdefault("status", "failed_quality")
            metadata.setdefault("error", "quality_gate_rejected")
            metadata["quality_gate_cycle"] = str(state.get("ciclo_id") or "")
        elif formato in soft_rejected_media and formato in _MEDIA_FORMATOS:
            metadata["quality_gate_warning"] = True
            metadata["quality_gate_cycle"] = str(state.get("ciclo_id") or "")
        material["metadata"] = metadata

    state["media_status"] = {
        key: str(((value.get("metadata") or {}).get("status") or "completed")).lower()
        for key, value in materiais_result.items()
        if isinstance(value, dict)
    }

    if session_factory is not None:
        async with session_factory() as session:
            repo_artefatos = ArtefatosPersonalizadosRepository(session)
            topico_id = state.get("payload_topico_id") or state.get("conteudo_boss_foco_id")
            classe_id = state.get("classe_id")
            conteudo_id = state.get("conteudo_boss_foco_id") or state.get("conteudo_foco_id")
            ciclo_id = str(state.get("ciclo_id") or "")
            logger.info(
                "DEBUG_PERSONALIZACAO.persist_fast_inputs=%s",
                {
                    "phase": generation_phase,
                    "aluno_id": state.get("aluno_id"),
                    "classe_id": classe_id,
                    "topico_id": topico_id,
                    "conteudo_id": conteudo_id,
                    "ciclo_id": ciclo_id,
                    "has_cards": isinstance(
                        (materiais_result.get("cards") or {}).get("payload")
                        if isinstance(materiais_result.get("cards"), dict)
                        else None,
                        list,
                    ),
                    "has_quiz": isinstance(
                        (materiais_result.get("quiz") or {}).get("payload")
                        if isinstance(materiais_result.get("quiz"), dict)
                        else None,
                        dict,
                    ),
                },
            )

            if generation_phase in {"full", "fast_only"} and topico_id is not None and classe_id is not None and ciclo_id:
                profile_key = _brainhex_profile_key(
                    state.get("perfil_dominante")
                    or state.get("plano_personalizacao", {}).get("perfil_dominante")
                )
                await repo_artefatos.marcar_ciclos_anteriores_obsoletos(
                    aluno_id=state["aluno_id"],
                    classe_id=int(classe_id),
                    topico_id=int(topico_id),
                    ciclo_id=ciclo_id,
                    brainhex_profile_key=profile_key,
                )

                cards_payload = (
                    materiais_result.get("cards", {}).get("payload")
                    if isinstance(materiais_result.get("cards"), dict)
                    else None
                )
                cards_status = _material_status(
                    materiais_result.get("cards") if isinstance(materiais_result.get("cards"), dict) else None
                )
                if cards_status != "failed_quality" and isinstance(cards_payload, list):
                    saved_cards = await repo_artefatos.salvar_cards(
                        aluno_id=state["aluno_id"],
                        classe_id=int(classe_id),
                        topico_id=int(topico_id),
                        conteudo_id=int(conteudo_id) if conteudo_id is not None else None,
                        ciclo_id=ciclo_id,
                        brainhex_profile_key=profile_key,
                        source_hash=str(state.get("source_hash") or ""),
                        cards=cards_payload,
                    )
                    materiais_result["cards"] = dict(materiais_result["cards"])
                    materiais_result["cards"]["payload"] = saved_cards
                    materiais_result["cards"]["metadata"] = {
                        **(materiais_result["cards"].get("metadata") or {}),
                        "cards_personalizados_ids": [item.get("id") for item in saved_cards if item.get("id") is not None],
                        "ciclo_id": ciclo_id,
                    }
                    if "cards" in materiais_to_save:
                        materiais_to_save["cards"] = materiais_result["cards"]
                    logger.info(
                        "DEBUG_PERSONALIZACAO.persist_cards=%s",
                        {
                            "saved_count": len(saved_cards),
                            "saved_ids": [item.get("id") for item in saved_cards if item.get("id") is not None],
                        },
                    )

                quiz_payload = (
                    materiais_result.get("quiz", {}).get("payload")
                    if isinstance(materiais_result.get("quiz"), dict)
                    else None
                )
                quiz_status = _material_status(
                    materiais_result.get("quiz") if isinstance(materiais_result.get("quiz"), dict) else None
                )
                if (
                    quiz_status != "failed_quality"
                    and isinstance(quiz_payload, dict)
                    and isinstance(quiz_payload.get("atividades"), list)
                ):
                    updated_activities = await repo_artefatos.salvar_atividades_quiz(
                        aluno_id=state["aluno_id"],
                        classe_id=int(classe_id),
                        topico_id=int(topico_id),
                        conteudo_id=int(conteudo_id) if conteudo_id is not None else None,
                        ciclo_id=ciclo_id,
                        atividades=quiz_payload["atividades"],
                    )
                    materiais_result["quiz"] = dict(materiais_result["quiz"])
                    materiais_result["quiz"]["payload"] = {
                        **quiz_payload,
                        "atividades": updated_activities,
                    }
                    materiais_result["quiz"]["metadata"] = {
                        **(materiais_result["quiz"].get("metadata") or {}),
                        "quiz_atividades_count": len(updated_activities),
                        "quiz_questoes_count": sum(
                            len([questao for questao in (atividade.get("questoes") or []) if isinstance(questao, dict)])
                            for atividade in updated_activities
                        ),
                        "quiz_storage_mode": "canonical_payload_only",
                        "ciclo_id": ciclo_id,
                    }
                    if "quiz" in materiais_to_save:
                        materiais_to_save["quiz"] = materiais_result["quiz"]
                    logger.info(
                        "DEBUG_PERSONALIZACAO.persist_quiz=%s",
                        {
                            "saved_atividades_count": len(updated_activities),
                            "saved_questoes_count": sum(
                                len([questao for questao in (atividade.get("questoes") or []) if isinstance(questao, dict)])
                                for atividade in updated_activities
                            ),
                            "quiz_storage_mode": "canonical_payload_only",
                        },
                    )
            elif generation_phase in {"full", "fast_only"}:
                logger.warning(
                    "DEBUG_PERSONALIZACAO.persist_fast_skipped_missing_context=%s",
                    {
                        "phase": generation_phase,
                        "classe_id": classe_id,
                        "topico_id": topico_id,
                        "ciclo_id": ciclo_id,
                    },
                )

            # Mantém artefatos rápidos e payload canônico mesmo se materiais_gerados estiver inconsistente.
            await session.commit()

            repo_materiais = MateriaisRepository(session)
            if materiais_to_save:
                try:
                    saved_ids_by_tipo = await repo_materiais.salvar(
                        aluno_id=state["aluno_id"],
                        conteudo_id=state.get("conteudo_boss_foco_id") or state.get("conteudo_foco_id"),
                        materiais=materiais_to_save,
                    )
                    previous_ids = state.get("materiais_saved_ids")
                    merged_ids: dict[str, int] = dict(previous_ids) if isinstance(previous_ids, dict) else {}
                    for tipo, material_id in (saved_ids_by_tipo or {}).items():
                        try:
                            merged_ids[str(tipo)] = int(material_id)
                        except (TypeError, ValueError):
                            continue
                    state["materiais_saved_ids"] = merged_ids
                except Exception as exc:
                    await session.rollback()
                    logger.warning(
                        "Falha ao persistir materiais_gerados; seguindo com conteudo_personalizado como fonte canônica",
                        extra={
                            "aluno_id": state.get("aluno_id"),
                            "classe_id": state.get("classe_id"),
                            "topico_id": state.get("payload_topico_id"),
                            "conteudo_id": state.get("conteudo_boss_foco_id") or state.get("conteudo_foco_id"),
                            "phase": generation_phase,
                            "error": str(exc),
                        },
                    )

    logger.info(
        "personalizacao.materials.output=%s",
        json.dumps(
            {
                "aluno_id": state.get("aluno_id"),
                "ciclo_id": state.get("ciclo_id"),
                "phase": generation_phase,
                "material_types": sorted(materiais_result.keys()),
                "requested_formatos": requested_formatos,
                "media_warnings": state.get("media_generation_warnings", []),
                "uploaded_assets": {
                    key: bool((value or {}).get("arquivo_url"))
                    for key, value in materiais_result.items()
                    if isinstance(value, dict)
                },
                "multistage": multistage_meta,
                "multimodal": multimodal_meta,
            },
            ensure_ascii=False,
            default=str,
        ),
    )
    return materiais_result

def _formatos_gerados(materiais: dict[str, Any]) -> list[str]:
    return [key for key, value in materiais.items() if value]


async def reconcile_material_links_for_record(
    *,
    session: AsyncSession,
    record: dict[str, Any],
    saved_ids_by_tipo: dict[str, Any] | None = None,
) -> tuple[dict[str, int], int]:
    if not isinstance(record, dict) or record.get("id") is None:
        return {}, 0

    materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
    tipos_record = {
        str(tipo).strip()
        for tipo, material in materiais.items()
        if str(tipo).strip() and isinstance(material, dict)
    }
    if not tipos_record:
        return {}, 0

    repo_materiais = MateriaisRepository(session)
    merged_ids: dict[str, int] = {}
    for tipo, raw_id in (saved_ids_by_tipo or {}).items():
        normalized_tipo = str(tipo).strip()
        if not normalized_tipo or normalized_tipo not in tipos_record:
            continue
        try:
            merged_ids[normalized_tipo] = int(raw_id)
        except (TypeError, ValueError):
            continue

    missing_tipos = sorted(tipos_record - set(merged_ids.keys()))
    if missing_tipos:
        fallback_ids = await repo_materiais.resolver_ids_por_tipo_recente(
            aluno_id=str(record.get("aluno_id") or ""),
            conteudo_id=record.get("conteudo_id"),
            tipos=missing_tipos,
            ciclo_id=record.get("ciclo_id"),
            prefer_pending=_pending_media_formats(materiais),
        )
        for tipo, material_id in fallback_ids.items():
            if tipo in tipos_record and tipo not in merged_ids:
                merged_ids[tipo] = int(material_id)

    linked_materials = 0
    for tipo, material_id in merged_ids.items():
        try:
            await repo_materiais.vincular_personalizacao(
                material_id=int(material_id),
                personalizacao_id=int(record["id"]),
            )
            linked_materials += 1
        except Exception as exc:
            logger.warning(
                "Falha ao vincular material ao registro de personalizacao",
                extra={
                    "record_id": int(record["id"]),
                    "tipo": tipo,
                    "material_id": material_id,
                    "error": str(exc),
                },
            )

    return merged_ids, linked_materials


async def _enqueue_media_render_job_if_needed(
    *,
    session: AsyncSession,
    state: dict[str, Any],
    record: dict[str, Any],
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
    pending_formats = _pending_media_formats(materiais)
    if not pending_formats:
        return None

    aluno_id = str(record.get("aluno_id") or state.get("aluno_id") or "").strip()
    topico_id = record.get("topico_id") or state.get("payload_topico_id")
    classe_id = record.get("classe_id") or state.get("classe_id")
    conteudo_id = record.get("conteudo_id") or state.get("conteudo_foco_id")
    ciclo_id = str(record.get("ciclo_id") or state.get("ciclo_id") or "").strip()
    source_hash = str(record.get("source_hash") or state.get("source_hash") or "").strip() or None

    if not aluno_id or topico_id is None or classe_id is None or not ciclo_id:
        return None

    perfil_editorial = state.get("perfil_editorial") if isinstance(state.get("perfil_editorial"), dict) else {}
    perfil_dominante = (
        _pick_string(
            perfil_editorial.get("perfil_dominante"),
            state.get("perfil_dominante"),
        )
        or _perfil_dominante(state.get("perfil_brainhex", []) or [])
    )
    brainhex_profile_key = _brainhex_profile_key(perfil_dominante)

    pending_payload_from_state = (
        state.get("media_pending_payload")
        if isinstance(state.get("media_pending_payload"), dict)
        else {}
    )
    slow_payload: dict[str, Any] = {}
    for formato in pending_formats:
        candidate = pending_payload_from_state.get(formato)
        if not isinstance(candidate, dict):
            candidate = materiais.get(formato)
        if isinstance(candidate, dict):
            slow_payload[formato] = candidate
    if not slow_payload:
        return None

    saved_ids_raw = state.get("materiais_saved_ids") if isinstance(state.get("materiais_saved_ids"), dict) else {}
    material_ids_by_tipo: dict[str, int] = {}
    for formato in pending_formats:
        raw_id = saved_ids_raw.get(formato)
        if raw_id is None:
            continue
        try:
            material_ids_by_tipo[formato] = int(raw_id)
        except (TypeError, ValueError):
            continue
    missing_material_formats = [formato for formato in pending_formats if formato not in material_ids_by_tipo]
    if missing_material_formats:
        repo_materiais = MateriaisRepository(session)
        fallback_ids = await repo_materiais.resolver_ids_por_tipo_recente(
            aluno_id=aluno_id,
            conteudo_id=int(conteudo_id) if conteudo_id is not None else None,
            tipos=missing_material_formats,
            ciclo_id=ciclo_id,
            prefer_pending=pending_formats,
        )
        for formato, material_id in fallback_ids.items():
            if formato not in pending_formats or formato in material_ids_by_tipo:
                continue
            material_ids_by_tipo[formato] = int(material_id)

    jobs_repo = PersonalizacaoJobsRepository(session)
    open_job = await jobs_repo.find_open_job_by_payload(
        kind=_PERSONALIZACAO_MEDIA_RENDER_JOB_KIND,
        classe_id=int(classe_id),
        topico_id=int(topico_id),
        ciclo_id=ciclo_id,
        source_hash=source_hash,
        brainhex_profile_key=brainhex_profile_key,
    )
    if not open_job:
        open_job = await jobs_repo.find_open_job_by_payload(
            kind=_PERSONALIZACAO_MEDIA_RENDER_JOB_LEGACY_KIND,
            classe_id=int(classe_id),
            topico_id=int(topico_id),
            ciclo_id=ciclo_id,
            source_hash=source_hash,
            brainhex_profile_key=brainhex_profile_key,
        )
    if open_job:
        open_payload = open_job.get("payload") if isinstance(open_job.get("payload"), dict) else {}
        open_pending_formats = {
            str(formato)
            for formato in (open_payload.get("formatos_pending") or [])
            if str(formato) in _MEDIA_FORMATOS
        }
        requested_pending_formats = {str(formato) for formato in pending_formats if str(formato) in _MEDIA_FORMATOS}
        if requested_pending_formats.issubset(open_pending_formats):
            await jobs_repo.inserir_targets(
                job_id=str(open_job["id"]),
                targets=[
                    {
                        "aluno_id": aluno_id,
                        "topico_id": int(topico_id),
                        "conteudo_id": int(conteudo_id) if conteudo_id is not None else None,
                        "status": "pending",
                        "attempts": 0,
                        "last_error": None,
                        "personalizacao_id": int(record["id"]),
                    }
                ],
            )
            refreshed_job = await jobs_repo.refresh_job_counters(str(open_job["id"]))
            return refreshed_job or open_job

    payload = {
        "personalizacao_id": int(record["id"]),
        "ciclo_id": ciclo_id,
        "source_hash": source_hash,
        "aluno_id": aluno_id,
        "classe_id": int(classe_id),
        "topico_id": int(topico_id),
        "conteudo_id": int(conteudo_id) if conteudo_id is not None else None,
        "formatos_pending": pending_formats,
        "brainhex_profile_key": brainhex_profile_key,
    }
    tema_visual = state.get("tema_visual") if isinstance(state.get("tema_visual"), dict) else {}
    if not tema_visual:
        tema_visual = _build_tema_visual_for_profile(perfil_dominante)
    media_snapshot: dict[str, Any] = {
        "personalizacao_id": int(record["id"]),
        "aluno_id": aluno_id,
        "classe_id": int(classe_id),
        "topico_id": int(topico_id),
        "conteudo_id": int(conteudo_id) if conteudo_id is not None else None,
        "ciclo_id": ciclo_id,
        "source_hash": source_hash,
        "brainhex_profile_key": brainhex_profile_key,
        "slow_payload": slow_payload,
        "material_ids_by_tipo": material_ids_by_tipo,
        "shared_rendered_media": {},
        "perfil_brainhex": state.get("perfil_brainhex") if isinstance(state.get("perfil_brainhex"), list) else [],
        "perfil_dominante": perfil_dominante,
        "perfil_editorial": perfil_editorial,
        "tema_visual": tema_visual,
        "contexto": {
            "aluno_id": aluno_id,
            "classe_id": int(classe_id),
            "topico_id": int(topico_id),
            "conteudo_id": int(conteudo_id) if conteudo_id is not None else None,
            "ciclo_id": ciclo_id,
            "perfil_dominante": perfil_dominante,
            "perfil_editorial": perfil_editorial,
            "tema_visual": tema_visual,
            "perfil_brainhex": state.get("perfil_brainhex") if isinstance(state.get("perfil_brainhex"), list) else [],
            "brainhex_profile_key": brainhex_profile_key,
        },
    }
    snapshot_encoded = json.dumps(media_snapshot, ensure_ascii=False, default=str).encode("utf-8")
    if len(snapshot_encoded) > 256 * 1024:
        media_snapshot["slow_payload"] = {
            formato: {
                "payload": (
                    material.get("payload")
                    if isinstance(material, dict) and isinstance(material.get("payload"), (dict, list))
                    else {}
                ),
                "metadata": {"status": "pending"},
                "arquivo_url": None,
                "storage_path": None,
            }
            for formato, material in slow_payload.items()
            if isinstance(material, dict)
        }

    job = await jobs_repo.criar_job(
        kind=_PERSONALIZACAO_MEDIA_RENDER_JOB_KIND,
        classe_id=int(classe_id),
        trigger_source="personalizacao_api",
        payload=payload,
        media_snapshot=media_snapshot,
        aluno_id=aluno_id,
        topico_id=int(topico_id),
        conteudo_id=int(conteudo_id) if conteudo_id is not None else None,
        total_targets=1,
    )
    await jobs_repo.inserir_targets(
        job_id=str(job["id"]),
        targets=[
            {
                "aluno_id": aluno_id,
                "topico_id": int(topico_id),
                "conteudo_id": int(conteudo_id) if conteudo_id is not None else None,
                "status": "pending",
                "attempts": 0,
                "last_error": None,
                "personalizacao_id": int(record["id"]),
            }
        ],
    )

    # Dispara BrainHex em background: persiste audio + markdown direto no Supabase
    if settings is not None and getattr(settings, "brainhex_api_url", None):
        _conteudo_estudado = state.get("conteudo_estudado") if isinstance(state.get("conteudo_estudado"), dict) else {}
        asyncio.create_task(
            disparar_brainhex_async(
                settings=settings,
                perfil=brainhex_profile_key or perfil_dominante or "mastermind",
                conteudo_estudado=_conteudo_estudado,
                personalizacao_id=int(record["id"]),
                aluno_id=aluno_id,
                classe_id=int(classe_id) if classe_id is not None else None,
                topico_id=int(topico_id) if topico_id is not None else None,
                ciclo_id=ciclo_id,
            )
        )

    return job


async def _apply_media_job_metadata(
    *,
    repo: ConteudoPersonalizadoRepository,
    repo_materiais: MateriaisRepository,
    record: dict[str, Any],
    saved_ids_by_tipo: dict[str, int],
    media_job_id: str,
) -> dict[str, Any]:
    record_materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
    updated_record_materiais = dict(record_materiais)
    pending_formats = _pending_media_formats(record_materiais)
    for formato, material in list(updated_record_materiais.items()):
        if formato not in _MEDIA_FORMATOS or formato not in pending_formats or not isinstance(material, dict):
            continue
        metadata = dict(material.get("metadata") or {})
        metadata["status"] = "pending"
        metadata["job_id"] = media_job_id
        updated_record_materiais[formato] = {
            **material,
            "metadata": metadata,
            "arquivo_url": None,
            "storage_path": None,
        }

    for formato, material_id in saved_ids_by_tipo.items():
        if formato not in pending_formats:
            continue
        try:
            await repo_materiais.patch_materiais_media(
                material_id=int(material_id),
                arquivo_url=None,
                storage_path=None,
                metadata_patch={"status": "pending", "job_id": media_job_id},
            )
        except Exception as exc:
            logger.warning(
                "Falha ao atualizar metadata do material pendente",
                extra={
                    "record_id": int(record["id"]),
                    "tipo": str(formato),
                    "material_id": material_id,
                    "job_id": media_job_id,
                    "error": str(exc),
                },
            )

    updated_record = await repo.atualizar_materiais_e_status(
        record_id=int(record["id"]),
        materiais=updated_record_materiais,
        status="processando_midias",
        formatos_gerados=_formatos_gerados(updated_record_materiais),
    )
    if updated_record:
        updated_record["media_render_job_id"] = media_job_id
        return updated_record

    record["media_render_job_id"] = media_job_id
    return record


async def persist_personalizacao_record(
    state: dict[str, Any],
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings | None = None,
) -> dict[str, Any]:
    async with session_factory() as session:
        repo = ConteudoPersonalizadoRepository(session)
        repo_materiais = MateriaisRepository(session)
        materiais_payload = (
            state.get("materiais_personalizados")
            if isinstance(state.get("materiais_personalizados"), dict)
            else {}
        )
        pending_from_payload = _pending_media_formats(materiais_payload)
        record_status = _resolve_personalizacao_status_from_materiais(materiais_payload)
        plano_payload = dict(state.get("plano_personalizacao") or {})
        editorial_pipeline = state.get("editorial_pipeline") if isinstance(state.get("editorial_pipeline"), dict) else {}
        if editorial_pipeline:
            plano_payload["editorial_metadata"] = {
                "conteudo_estudado": editorial_pipeline.get("conteudo_estudado"),
                "modelo_editorial": editorial_pipeline.get("modelo_editorial"),
                "perfil_editorial": editorial_pipeline.get("perfil_editorial"),
                "multistage": editorial_pipeline.get("multistage"),
                "multimodal": editorial_pipeline.get("multimodal"),
            }
        record_id = await repo.salvar(
            aluno_id=state["aluno_id"],
            classe_id=state.get("classe_id"),
            conteudo_id=state.get("conteudo_foco_id"),
            topico_id=state.get("payload_topico_id"),
            ciclo_id=state["ciclo_id"],
            plano=plano_payload,
            materiais=materiais_payload,
            ai_patch=state.get("ai_patch"),
            status=record_status if record_status else ("processando_midias" if pending_from_payload else "pronto"),
            source_hash=state.get("source_hash"),
            formato_prioritario=(state.get("plano_personalizacao") or {}).get("formato_prioritario", "cards"),
            formatos_gerados=_formatos_gerados(materiais_payload),
        )
        record = await repo.buscar_por_id(record_id)

        raw_saved_ids_by_tipo = (
            state.get("materiais_saved_ids")
            if isinstance(state.get("materiais_saved_ids"), dict)
            else {}
        )
        saved_ids_by_tipo: dict[str, int] = {}
        if record:
            saved_ids_by_tipo, _ = await reconcile_material_links_for_record(
                session=session,
                record=record,
                saved_ids_by_tipo=raw_saved_ids_by_tipo,
            )
            state["materiais_saved_ids"] = saved_ids_by_tipo

        record_materiais = record.get("materiais") if isinstance((record or {}).get("materiais"), dict) else {}
        pending_formats = _pending_media_formats(record_materiais)

        if record and pending_formats:
            try:
                media_job = await _enqueue_media_render_job_if_needed(session=session, state=state, record=record, settings=settings)
                if media_job:
                    media_job_id = str(media_job.get("id"))
                    record["media_render_job_id"] = media_job_id
                    state["media_render_job_id"] = media_job_id
                    record = await _apply_media_job_metadata(
                        repo=repo,
                        repo_materiais=repo_materiais,
                        record=record,
                        saved_ids_by_tipo=saved_ids_by_tipo,
                        media_job_id=media_job_id,
                    )
                    state["midias_em_processamento"] = True
                else:
                    state["midias_em_processamento"] = True
            except Exception as exc:
                logger.warning("Falha ao enfileirar job de midias lentas: %s", exc)
                state["midias_em_processamento"] = True
        else:
            state["midias_em_processamento"] = False
        return record or {}


def _extract_brainhex_profile_key_from_record(record: dict[str, Any]) -> str | None:
    plano = record.get("plano") if isinstance(record.get("plano"), dict) else {}
    editorial_metadata = (
        plano.get("editorial_metadata") if isinstance(plano.get("editorial_metadata"), dict) else {}
    )
    perfil_editorial = (
        editorial_metadata.get("perfil_editorial")
        if isinstance(editorial_metadata.get("perfil_editorial"), dict)
        else {}
    )
    modelo_editorial = (
        editorial_metadata.get("modelo_editorial")
        if isinstance(editorial_metadata.get("modelo_editorial"), dict)
        else {}
    )
    personalizacao_brainhex = (
        modelo_editorial.get("personalizacao_brainhex")
        if isinstance(modelo_editorial.get("personalizacao_brainhex"), dict)
        else {}
    )

    perfil_dominante = _pick_string(
        record.get("perfil_dominante"),
        perfil_editorial.get("perfil_dominante"),
        personalizacao_brainhex.get("perfil_dominante"),
        plano.get("perfil_dominante"),
    )
    if not perfil_dominante:
        return None
    return _brainhex_profile_key(perfil_dominante)


async def backfill_media_render_jobs(
    *,
    session: AsyncSession,
    classe_id: int | None = None,
    aluno_id: str | None = None,
    personalizacao_id: int | None = None,
    limit: int = 200,
    dry_run: bool = True,
) -> dict[str, int | bool]:
    normalized_limit = max(1, min(int(limit or 200), 1000))
    counters: dict[str, int | bool] = {
        "scanned": 0,
        "eligible": 0,
        "enqueued": 0,
        "already_open_job": 0,
        "linked_materials": 0,
        "errors": 0,
        "dry_run": bool(dry_run),
    }

    candidate_rows = await session.execute(
        text(
            """
            SELECT cp.id
            FROM conteudo_personalizado cp
            WHERE (CAST(:personalizacao_id AS BIGINT) IS NULL OR cp.id = CAST(:personalizacao_id AS BIGINT))
              AND (CAST(:classe_id AS BIGINT) IS NULL OR cp.classe_id = CAST(:classe_id AS BIGINT))
              AND (CAST(:aluno_id AS UUID) IS NULL OR cp.aluno_id = CAST(:aluno_id AS UUID))
              AND EXISTS (
                SELECT 1
                FROM jsonb_each(COALESCE(cp.materiais, '{}'::jsonb)) AS material(tipo, value)
                WHERE material.tipo = ANY(CAST(:media_tipos AS TEXT[]))
                  AND COALESCE(LOWER(material.value -> 'metadata' ->> 'status'), '') = 'pending'
              )
            ORDER BY COALESCE(cp.updated_at, cp.gerado_em) DESC, cp.id DESC
            LIMIT CAST(:limit AS INTEGER)
            """
        ),
        {
            "personalizacao_id": personalizacao_id,
            "classe_id": classe_id,
            "aluno_id": aluno_id,
            "media_tipos": sorted(_MEDIA_FORMATOS),
            "limit": normalized_limit,
        },
    )
    candidate_ids = [int(row["id"]) for row in candidate_rows.mappings() if row.get("id") is not None]
    counters["scanned"] = len(candidate_ids)

    repo = ConteudoPersonalizadoRepository(session)
    jobs_repo = PersonalizacaoJobsRepository(session)
    repo_materiais = MateriaisRepository(session)

    for record_id in candidate_ids:
        try:
            record = await repo.buscar_por_id(record_id)
            if not record:
                continue

            materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
            pending_formats = _pending_media_formats(materiais)
            if not pending_formats:
                continue

            saved_ids_by_tipo, linked_materials = await reconcile_material_links_for_record(
                session=session,
                record=record,
                saved_ids_by_tipo=None,
            )
            counters["linked_materials"] = int(counters["linked_materials"]) + int(linked_materials)

            current_aluno_id = str(record.get("aluno_id") or "").strip() or None
            current_topico_id = record.get("topico_id")
            current_ciclo_id = str(record.get("ciclo_id") or "").strip() or None
            current_source_hash = str(record.get("source_hash") or "").strip() or None
            current_brainhex_profile_key = _extract_brainhex_profile_key_from_record(record)

            open_job = await jobs_repo.find_open_job_by_payload(
                kind=_PERSONALIZACAO_MEDIA_RENDER_JOB_KIND,
                classe_id=int(record.get("classe_id")) if record.get("classe_id") is not None else None,
                topico_id=int(current_topico_id) if current_topico_id is not None else None,
                ciclo_id=current_ciclo_id,
                source_hash=current_source_hash,
                brainhex_profile_key=current_brainhex_profile_key,
            )
            if not open_job:
                open_job = await jobs_repo.find_open_job_by_payload(
                    kind=_PERSONALIZACAO_MEDIA_RENDER_JOB_LEGACY_KIND,
                    classe_id=int(record.get("classe_id")) if record.get("classe_id") is not None else None,
                    topico_id=int(current_topico_id) if current_topico_id is not None else None,
                    ciclo_id=current_ciclo_id,
                    source_hash=current_source_hash,
                    brainhex_profile_key=current_brainhex_profile_key,
                )
            if open_job:
                counters["already_open_job"] = int(counters["already_open_job"]) + 1
                continue

            counters["eligible"] = int(counters["eligible"]) + 1
            if dry_run:
                continue

            enqueue_state: dict[str, Any] = {
                "aluno_id": current_aluno_id,
                "classe_id": record.get("classe_id"),
                "payload_topico_id": current_topico_id,
                "conteudo_foco_id": record.get("conteudo_id"),
                "ciclo_id": current_ciclo_id,
                "source_hash": current_source_hash,
                "media_pending_payload": {
                    formato: materiais.get(formato)
                    for formato in pending_formats
                    if isinstance(materiais.get(formato), dict)
                },
            }
            if saved_ids_by_tipo:
                enqueue_state["materiais_saved_ids"] = saved_ids_by_tipo

            media_job = await _enqueue_media_render_job_if_needed(
                session=session,
                state=enqueue_state,
                record=record,
            )
            if not media_job:
                counters["errors"] = int(counters["errors"]) + 1
                continue

            media_job_id = str(media_job.get("id") or "").strip()
            if not media_job_id:
                counters["errors"] = int(counters["errors"]) + 1
                continue

            await _apply_media_job_metadata(
                repo=repo,
                repo_materiais=repo_materiais,
                record=record,
                saved_ids_by_tipo=saved_ids_by_tipo,
                media_job_id=media_job_id,
            )
            counters["enqueued"] = int(counters["enqueued"]) + 1
        except Exception:
            counters["errors"] = int(counters["errors"]) + 1
            logger.exception(
                "Falha ao executar backfill de midias pendentes",
                extra={"personalizacao_id": record_id, "dry_run": dry_run},
            )

    return counters





