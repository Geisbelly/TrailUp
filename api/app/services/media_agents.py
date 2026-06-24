from __future__ import annotations

import asyncio
import base64
import json
import re
from typing import Any

import httpx

from app.core.settings import Settings
from app.services.audio import gerar_mp3_gtts
from app.services.llm import JsonLLMService


def _extract_inline_audio_parts(payload: dict[str, Any]) -> list[tuple[str, bytes]]:
    parts: list[tuple[str, bytes]] = []
    candidates = payload.get("candidates") if isinstance(payload.get("candidates"), list) else []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content") if isinstance(candidate.get("content"), dict) else {}
        candidate_parts = content.get("parts") if isinstance(content.get("parts"), list) else []
        for part in candidate_parts:
            if not isinstance(part, dict):
                continue
            inline = part.get("inlineData") if isinstance(part.get("inlineData"), dict) else {}
            if not inline:
                inline = part.get("inline_data") if isinstance(part.get("inline_data"), dict) else {}
            if not inline:
                continue
            mime = str(inline.get("mimeType") or inline.get("mime_type") or "").strip().lower()
            raw_data = inline.get("data")
            if not isinstance(raw_data, str) or not raw_data.strip():
                continue
            try:
                decoded = base64.b64decode(raw_data)
            except Exception:
                continue
            if decoded:
                parts.append((mime, decoded))
    return parts


def _sample_rate_from_mime(mime: str) -> int:
    match = re.search(r"rate\s*=\s*(\d+)", mime)
    if not match:
        return 24_000
    try:
        return max(8_000, min(48_000, int(match.group(1))))
    except Exception:
        return 24_000


def _pcm_to_mp3(*, pcm_bytes: bytes, sample_rate: int) -> bytes | None:
    if not pcm_bytes:
        return None
    try:
        import lameenc
    except Exception:
        return None

    try:
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(128)
        encoder.set_in_sample_rate(sample_rate)
        encoder.set_channels(1)
        encoder.set_quality(2)
        mp3 = encoder.encode(pcm_bytes)
        mp3 += encoder.flush()
        return mp3 or None
    except Exception:
        return None


def _normalize_video_payload(payload: dict[str, Any]) -> dict[str, Any]:
    roteiro = str(payload.get("roteiro") or "").strip()
    cenas = [str(item).strip() for item in (payload.get("cenas") or []) if str(item).strip()]
    try:
        duracao = int(payload.get("duracao_estimada_seg") or 75)
    except (TypeError, ValueError):
        duracao = 75
    if not cenas:
        cenas = [
            "Abertura com contexto do tema.",
            "Explicacao do conceito principal.",
            "Exemplo pratico aplicado ao tema.",
            "Fechamento com resumo e proximo passo.",
        ]
    return {
        "roteiro": roteiro,
        "cenas": cenas,
        "duracao_estimada_seg": max(20, min(300, duracao)),
    }


async def gerar_audio_gemini_tts(
    *,
    settings: Settings,
    texto: str,
    voz: str = "Kore",
) -> bytes | None:
    cleaned = str(texto or "").strip()
    if not cleaned:
        return None

    if settings.gemini_api_key:
        model_name = str(getattr(settings, "gemini_model_tts", "") or "").strip() or "gemini-2.5-flash-preview-tts"
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent?key={settings.gemini_api_key}"
        )
        body = {
            "contents": [{"role": "user", "parts": [{"text": cleaned}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": voz,
                        }
                    }
                },
            },
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=body)
                response.raise_for_status()
                payload = response.json()
            for mime, audio_bytes in _extract_inline_audio_parts(payload):
                if mime in {"audio/mpeg", "audio/mp3", "audio/x-mp3"}:
                    return audio_bytes
                if "audio/l16" in mime:
                    converted = _pcm_to_mp3(
                        pcm_bytes=audio_bytes,
                        sample_rate=_sample_rate_from_mime(mime),
                    )
                    if converted:
                        return converted
        except Exception:
            pass

    try:
        return gerar_mp3_gtts(texto=cleaned, lang="pt")
    except Exception:
        return None


async def gerar_roteiro_video_llm(
    *,
    settings: Settings,
    briefing: dict[str, Any],
) -> dict[str, Any]:
    topico = str((briefing or {}).get("topico") or "").strip()
    resumo = str((briefing or {}).get("resumo") or "").strip()
    objetivo = str((briefing or {}).get("objetivo") or "Explicar o tema de forma didatica").strip()
    fallback_payload = _normalize_video_payload(
        {
            "roteiro": f"{topico or 'Tema'}: {objetivo}. {resumo}".strip(),
            "cenas": [],
            "duracao_estimada_seg": 75,
        }
    )

    llm = JsonLLMService(settings)
    response = await llm.ainvoke_json(
        prompt_name="gerador_conteudo.txt",
        payload={
            "formatos_solicitados": ["video"],
            "topico": {"titulo_modulo": topico, "descricao_modulo": resumo},
            "objetivo_video": objetivo,
            "idioma": "pt-BR",
            "locale": "pt-BR",
            "linguagem": "pt-BR",
        },
        fallback_factory=lambda: {"video": fallback_payload},
        provider="gemini",
    )

    if isinstance(response, dict):
        video_section = response.get("video") if isinstance(response.get("video"), dict) else response
        payload = video_section.get("payload") if isinstance(video_section, dict) and isinstance(video_section.get("payload"), dict) else video_section
        if isinstance(payload, dict):
            return _normalize_video_payload(payload)
    return fallback_payload


# ---------------------------------------------------------------------------
# BrainHex content generation (port from ApiBrainHex TypeScript)
# ---------------------------------------------------------------------------

_BRAINHEX_GUIDE_CONFIG: dict[str, dict[str, str]] = {
    "mastermind": {"guia_nome": "Atena",  "guia_voz": "Charon", "guia_cor": "#707c88", "framing": "Arquitetura do Conceito",   "label": "Estrategista"},
    "seeker":     {"guia_nome": "Orion",  "guia_voz": "Puck",   "guia_cor": "#a78c07", "framing": "Crônicas da Exploração",    "label": "Explorador"},
    "survivor":   {"guia_nome": "Valka",  "guia_voz": "Fenrir", "guia_cor": "#720101", "framing": "Diretrizes de Campo",       "label": "Sobrevivente"},
    "daredevil":  {"guia_nome": "Rexa",   "guia_voz": "Zephyr", "guia_cor": "#1b6b1b", "framing": "Código de Impacto",         "label": "Aventureiro"},
    "conqueror":  {"guia_nome": "Drako",  "guia_voz": "Kore",   "guia_cor": "#01808b", "framing": "Tratado de Soberania",      "label": "Conquistador"},
    "socializer": {"guia_nome": "Luma",   "guia_voz": "Kore",   "guia_cor": "#6d15be", "framing": "Elo da Comunidade",         "label": "Socializador"},
    "achiever":   {"guia_nome": "Auri",   "guia_voz": "Puck",   "guia_cor": "#ad6002", "framing": "Caminho da Maestria",       "label": "Realizador"},
}


async def disparar_brainhex_async(
    *,
    settings: Settings,
    perfil: str,
    fontes: list[dict[str, Any]],
    personalizacao_id: int,
    aluno_id: str = "",
    classe_id: int | None = None,
    topico_id: int | None = None,
    ciclo_id: str = "",
) -> bool:
    """Dispara BrainHex fire-and-forget com URLs brutas de fontes. Retorna True se 202."""
    brainhex_url = str(getattr(settings, "brainhex_api_url", "") or "").strip()
    if not brainhex_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{brainhex_url.rstrip('/')}/api/personalizar",
                json={
                    "profile": str(perfil or "").strip().lower(),
                    "fontes": fontes,
                    "personalizacao_id": personalizacao_id,
                    "aluno_id": aluno_id,
                    "classe_id": classe_id,
                    "topico_id": topico_id,
                    "ciclo_id": ciclo_id,
                },
            )
            return response.status_code == 202
    except Exception:
        return False


async def gerar_conteudo_brainhex(
    *,
    settings: Settings,
    perfil: str,
    conteudo_estudado: dict[str, Any],
) -> dict[str, Any] | None:
    """Legado — mantido para compatibilidade. Prefira disparar_brainhex_async."""
    brainhex_url = str(getattr(settings, "brainhex_api_url", "") or "").strip()
    if not brainhex_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{brainhex_url.rstrip('/')}/api/personalizar",
                json={"profile": str(perfil or "").strip().lower(), "conteudo_estudado": conteudo_estudado},
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        return None


async def gerar_imagem_slide(
    *,
    settings: Settings,
    prompt: str,
    retries: int = 3,
) -> str | None:
    """Port Python do generateSlideImage da ApiBrainHex."""
    if not getattr(settings, "gemini_api_key", None) or not str(prompt or "").strip():
        return None

    model_name = str(getattr(settings, "gemini_model_image", "") or "").strip() or "gemini-2.0-flash-preview-image-generation"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model_name}:generateContent?key={settings.gemini_api_key}"
    )
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Professional 2D concept art, sticker style, clean lines, "
                            f"vibrant colors, magical alchemy theme, center composition: {prompt}"
                        )
                    }
                ]
            }
        ],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }

    delays = [5, 10, 15]

    try:
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(url, json=body)

                if response.status_code == 429:
                    delay = delays[attempt] if attempt < len(delays) else delays[-1]
                    await asyncio.sleep(delay)
                    continue

                response.raise_for_status()
                payload = response.json()

                candidates = payload.get("candidates") or []
                for candidate in candidates:
                    if not isinstance(candidate, dict):
                        continue
                    content = candidate.get("content") if isinstance(candidate.get("content"), dict) else {}
                    parts = content.get("parts") if isinstance(content.get("parts"), list) else []
                    for part in parts:
                        if not isinstance(part, dict):
                            continue
                        inline = part.get("inlineData") if isinstance(part.get("inlineData"), dict) else {}
                        if not inline:
                            inline = part.get("inline_data") if isinstance(part.get("inline_data"), dict) else {}
                        if inline and inline.get("data"):
                            return str(inline["data"])

                return None
            except httpx.HTTPStatusError:
                raise
            except Exception:
                return None
    except Exception:
        return None

    return None
