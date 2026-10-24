from __future__ import annotations

import base64
import logging
from io import BytesIO
from typing import Any

import httpx

from app.core.settings import Settings
from app.services.gemini_http import gemini_generate_url, gemini_headers
from app.services.roteamento_ia import rota_de_menor_ativa

logger = logging.getLogger(__name__)

OPENAI_TTS_MODEL = "gpt-4o-mini-tts"
OPENAI_TTS_VOICE = "coral"


def gerar_mp3_gtts(*, texto: str, lang: str = "pt-br", slow: bool = False) -> bytes:
    cleaned = str(texto or "").strip()
    if not cleaned:
        raise RuntimeError("Roteiro de audio vazio para geracao MP3.")

    try:
        from gtts import gTTS
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Dependencia gTTS indisponivel no runtime.") from exc

    output = BytesIO()
    try:
        tts = gTTS(text=cleaned, lang=lang, slow=slow)
        tts.write_to_fp(output)
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"Falha ao gerar MP3 com gTTS: {exc}") from exc

    data = output.getvalue()
    if not data:
        raise RuntimeError("gTTS retornou audio vazio.")
    return data


async def gerar_mp3_openai_tts(
    *,
    settings: Settings,
    texto: str,
    instrucoes: str = "",
    client: Any | None = None,
) -> bytes | None:
    """TTS da rota de menor (#195): so OpenAI. Falhou -> None (sem audio); nao
    cai no Gemini nem no gTTS."""
    cleaned = str(texto or "").strip()
    api_key = str(getattr(settings, "openai_api_key", "") or "").strip()
    if not cleaned or (client is None and not api_key):
        return None
    try:
        if client is None:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=api_key)
        kwargs: dict[str, Any] = {
            "model": OPENAI_TTS_MODEL,
            "voice": OPENAI_TTS_VOICE,
            "input": cleaned[:4096],
            "response_format": "mp3",
        }
        if instrucoes.strip():
            kwargs["instructions"] = instrucoes.strip()[:1000]
        response = await client.audio.speech.create(**kwargs)
        data = getattr(response, "content", None)
        if data is None and hasattr(response, "read"):
            data = response.read()
        return bytes(data) if data else None
    except Exception as exc:
        logger.warning("tts_openai_rota_menor_falhou: %s", type(exc).__name__)
        return None


async def gerar_mp3_gemini_tts(*, settings: Settings, texto: str) -> bytes | None:
    cleaned = str(texto or "").strip()
    if rota_de_menor_ativa():
        # #195: menor -> TTS so pela OpenAI.
        return await gerar_mp3_openai_tts(settings=settings, texto=cleaned)
    if not cleaned or not settings.gemini_api_key:
        return None

    model_name = (
        str(getattr(settings, "gemini_model_tts", "") or "").strip()
        or "gemini-2.5-flash-preview-tts"
    )
    url = gemini_generate_url(model_name)
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Converta o texto para fala em português brasileiro, voz natural, "
                            "saída em áudio MP3."
                        )
                    },
                    {"text": cleaned},
                ],
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
        },
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(url, json=body, headers=gemini_headers(settings.gemini_api_key))
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return None

    candidates = payload.get("candidates") if isinstance(payload.get("candidates"), list) else []
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
            if not inline:
                continue
            mime = str(inline.get("mimeType") or inline.get("mime_type") or "").lower()
            data_b64 = inline.get("data")
            if not isinstance(data_b64, str) or not data_b64.strip():
                continue
            if mime not in {"audio/mpeg", "audio/mp3", "audio/x-mp3"}:
                continue
            try:
                decoded = base64.b64decode(data_b64)
            except Exception:
                continue
            if decoded:
                return decoded
    return None
