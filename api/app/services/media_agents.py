from __future__ import annotations

import asyncio
import base64
import logging
import re
from typing import Any

import httpx

from app.core.settings import Settings
from app.services.audio import gerar_mp3_gtts
from app.services.llm import JsonLLMService
from app.services.media_contract import (
    CONTENT_ENRICHMENT_PROVIDER,
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_ENGINE_VERSION,
)

logger = logging.getLogger(__name__)


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


def _build_guardian_tts_prompt(
    *,
    texto: str,
    direcao_voz: str = "",
    nome_speaker_principal: str | None = None,
    nome_speaker_secundario: str | None = None,
    direcao_voz_secundaria: str = "",
) -> str:
    if nome_speaker_principal and nome_speaker_secundario:
        return (
            "Sintetize somente o dialogo depois de TRANSCRICAO. "
            "Nao leia estas instrucoes em voz alta.\n"
            f"DIRECAO DE {nome_speaker_principal}: "
            f"{direcao_voz or 'voz natural e expressiva em portugues brasileiro'}\n"
            f"DIRECAO DE {nome_speaker_secundario}: "
            f"{direcao_voz_secundaria or 'voz natural e expressiva em portugues brasileiro'}\n"
            "CENA: conversa calorosa entre mentores durante uma jornada educacional fantastica.\n"
            f"TRANSCRICAO:\n{texto}"
        )

    return (
        "Sintetize somente o conteudo depois de TRANSCRICAO. "
        "Nao leia estas instrucoes em voz alta.\n"
        f"DIRECAO DE VOZ: "
        f"{direcao_voz or 'voz natural, didatica e expressiva em portugues brasileiro'}\n"
        "CENA: mentoria educacional em uma jornada fantastica, com naturalidade e emocao controlada.\n"
        f"TRANSCRICAO:\n{texto}"
    )


async def gerar_audio_gemini_tts(
    *,
    settings: Settings,
    texto: str,
    voz: str = "Kore",
    direcao_voz: str = "",
    nome_speaker_principal: str | None = None,
    speaker_secundario: tuple[str, str] | None = None,
    direcao_voz_secundaria: str = "",
) -> bytes | None:
    """Narracao solo (1 voz) ou dialogo (2 vozes, quando `speaker_secundario` e passado).

    Modo dialogo exige `nome_speaker_principal` (nome do 1o guardiao, ex. "Mateo") junto com
    `speaker_secundario` = `(nome_speaker_2, voz_speaker_2)` (ex. `("Zuri", "Aoede")`). Nesse
    modo o `texto` precisa vir com cada fala em uma linha comecando exatamente com
    "NomeDoSpeaker: " — o Gemini casa esse prefixo com `speaker` em `speakerVoiceConfigs` pra
    trocar de voz por fala. `voz` e sempre a voz do speaker principal, nos dois modos.
    """
    cleaned = str(texto or "").strip()
    if not cleaned:
        return None

    tts_prompt = _build_guardian_tts_prompt(
        texto=cleaned,
        direcao_voz=direcao_voz,
        nome_speaker_principal=nome_speaker_principal,
        nome_speaker_secundario=speaker_secundario[0] if speaker_secundario else None,
        direcao_voz_secundaria=direcao_voz_secundaria,
    )

    if settings.gemini_api_key:
        model_name = str(getattr(settings, "gemini_model_tts", "") or "").strip() or "gemini-2.5-flash-preview-tts"
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent?key={settings.gemini_api_key}"
        )
        if speaker_secundario and nome_speaker_principal:
            nome_secundario, voz_secundaria = speaker_secundario
            speech_config = {
                "multiSpeakerVoiceConfig": {
                    "speakerVoiceConfigs": [
                        {
                            "speaker": nome_speaker_principal,
                            "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}},
                        },
                        {
                            "speaker": nome_secundario,
                            "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz_secundaria}},
                        },
                    ]
                }
            }
        else:
            speech_config = {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}}}
        body = {
            "contents": [{"role": "user", "parts": [{"text": tts_prompt}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": speech_config,
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
    "mastermind": {"guia_nome": "Idris",  "guia_voz": "Charon", "guia_cor": "#5b3fd9", "framing": "Arquitetura do Conceito",   "label": "Estrategista"},
    "seeker":     {"guia_nome": "Amara",  "guia_voz": "Leda",   "guia_cor": "#17a398", "framing": "Crônicas da Exploração",    "label": "Explorador"},
    "survivor":   {"guia_nome": "Kenji",  "guia_voz": "Schedar", "guia_cor": "#4e5a66", "framing": "Diretrizes de Campo",       "label": "Sobrevivente"},
    "daredevil":  {"guia_nome": "Ember",  "guia_voz": "Zephyr", "guia_cor": "#d7263d", "framing": "Código de Impacto",         "label": "Aventureiro"},
    "conqueror":  {"guia_nome": "Amina",  "guia_voz": "Kore",   "guia_cor": "#1e4fd6", "framing": "Tratado de Soberania",      "label": "Conquistador"},
    "socializer": {"guia_nome": "Mateo",  "guia_voz": "Achird", "guia_cor": "#f4623a", "framing": "Elo da Comunidade",         "label": "Socializador", "guia_nome_secundario": "Zuri", "guia_voz_secundario": "Sulafat"},
    "achiever":   {"guia_nome": "Kwame",  "guia_voz": "Orus",   "guia_cor": "#c9a227", "framing": "Caminho da Maestria",       "label": "Realizador"},
}


def _brainhex_contract_matches(payload: Any) -> bool:
    return (
        isinstance(payload, dict)
        and payload.get("media_pipeline_version") == MEDIA_PIPELINE_VERSION
        and payload.get("presentation_engine_version") == PRESENTATION_ENGINE_VERSION
        and payload.get("content_enrichment_provider")
        == CONTENT_ENRICHMENT_PROVIDER
    )


async def brainhex_contract_ready(*, settings: Settings) -> bool:
    """Confirma o contrato do gerador antes de iniciar qualquer trabalho caro."""
    brainhex_url = str(getattr(settings, "brainhex_api_url", "") or "").strip()
    if not brainhex_url:
        return False
    brainhex_secret = str(getattr(settings, "brainhex_api_secret", "") or "").strip()
    headers = {"x-api-secret": brainhex_secret} if brainhex_secret else None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{brainhex_url.rstrip('/')}/api/health",
                headers=headers,
            )
        payload = response.json() if response.status_code == 200 else None
        if _brainhex_contract_matches(payload):
            return True
        logger.warning(
            "brainhex_contract_ready: microservice com contrato de midia "
            "incompativel (status=%s, esperado=%s/%s/%s, recebido=%s)",
            response.status_code,
            MEDIA_PIPELINE_VERSION,
            PRESENTATION_ENGINE_VERSION,
            CONTENT_ENRICHMENT_PROVIDER,
            payload,
        )
    except Exception:
        logger.exception("brainhex_contract_ready: falha ao consultar /api/health")
    return False


async def disparar_brainhex_async(
    *,
    settings: Settings,
    perfil: str,
    fontes: list[dict[str, Any]],
    personalizacao_id: int,
    content_blocks: list[dict[str, Any]] | None = None,
    aluno_id: str = "",
    classe_id: int | None = None,
    topico_id: int | None = None,
    conteudo_id: int | None = None,
    ciclo_id: str = "",
    source_hash: str = "",
    generation_key: str = "",
    wait_for_completion: bool = False,
) -> bool:
    """Dispara BrainHex e, opcionalmente, aguarda o pipeline terminar."""
    brainhex_url = str(getattr(settings, "brainhex_api_url", "") or "").strip()
    if not brainhex_url:
        return False
    brainhex_secret = str(getattr(settings, "brainhex_api_secret", "") or "").strip()
    headers = {"x-api-secret": brainhex_secret} if brainhex_secret else None
    try:
        if not await brainhex_contract_ready(settings=settings):
            logger.warning(
                "disparar_brainhex_async: geracao nao iniciada por contrato "
                "incompativel (personalizacao_id=%s)",
                personalizacao_id,
            )
            return False

        timeout_sec = (
            max(30, int(getattr(settings, "brainhex_api_wait_timeout_sec", 1980) or 1980))
            if wait_for_completion
            else 15.0
        )
        timeout = httpx.Timeout(timeout_sec, connect=min(60.0, float(timeout_sec)))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{brainhex_url.rstrip('/')}/api/personalizar",
                json={
                    "profile": str(perfil or "").strip().lower(),
                    "fontes": fontes,
                    "content_blocks": content_blocks or [],
                    "personalizacao_id": personalizacao_id,
                    "aluno_id": aluno_id,
                    "classe_id": classe_id,
                    "topico_id": topico_id,
                    "conteudo_id": conteudo_id,
                    "ciclo_id": ciclo_id,
                    "source_hash": source_hash,
                    "generation_key": generation_key,
                    "wait_for_completion": wait_for_completion,
                    "required_media_pipeline_version": MEDIA_PIPELINE_VERSION,
                    "required_presentation_engine_version": PRESENTATION_ENGINE_VERSION,
                },
                headers=headers,
            )
            expected_status = 200 if wait_for_completion else 202
            if response.status_code != expected_status:
                logger.warning(
                    "disparar_brainhex_async: microservice recusou o POST /api/personalizar "
                    "(personalizacao_id=%s, status=%s, body=%s)",
                    personalizacao_id,
                    response.status_code,
                    response.text[:500],
                )
            if wait_for_completion and response.status_code == 202:
                logger.warning(
                    "disparar_brainhex_async: microservice antigo respondeu de forma assincrona; "
                    "o target sera repetido ate haver confirmacao de conclusao "
                    "(personalizacao_id=%s)",
                    personalizacao_id,
                )
            try:
                response_payload = response.json()
            except Exception:
                response_payload = None
            if response.status_code == expected_status and not _brainhex_contract_matches(
                response_payload
            ):
                logger.warning(
                    "disparar_brainhex_async: resposta sem confirmacao do contrato "
                    "de midia; geracao nao confirmada "
                    "(personalizacao_id=%s, status=%s, body=%s)",
                    personalizacao_id,
                    response.status_code,
                    response.text[:500],
                )
                return False
            return response.status_code == expected_status
    except Exception:
        logger.exception(
            "disparar_brainhex_async: falha ao chamar o microservice (personalizacao_id=%s)",
            personalizacao_id,
        )
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
    brainhex_secret = str(getattr(settings, "brainhex_api_secret", "") or "").strip()
    headers = {"x-api-secret": brainhex_secret} if brainhex_secret else None
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(
                f"{brainhex_url.rstrip('/')}/api/personalizar",
                json={"profile": str(perfil or "").strip().lower(), "conteudo_estudado": conteudo_estudado},
                headers=headers,
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
