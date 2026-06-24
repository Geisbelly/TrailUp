from __future__ import annotations

import base64
from io import BytesIO

import httpx

from app.core.settings import Settings


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


async def gerar_mp3_gemini_tts(*, settings: Settings, texto: str) -> bytes | None:
    cleaned = str(texto or "").strip()
    if not cleaned or not settings.gemini_api_key:
        return None

    model_name = (
        str(getattr(settings, "gemini_model_tts", "") or "").strip()
        or "gemini-2.5-flash-preview-tts"
    )
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
            response = await client.post(url, json=body)
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
