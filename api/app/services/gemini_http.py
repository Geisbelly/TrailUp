"""Chamadas HTTP diretas ao Gemini (generativelanguage.googleapis.com).

A chave vai no header ``x-goog-api-key``, nunca na query string (#195): URL
com ``?key=`` acaba em log de proxy, de cliente HTTP e em mensagem de erro
(``httpx.HTTPStatusError`` inclui a URL inteira).

Toda chamada direta passa por ``gemini_generate``, que escolhe a chave no pool
unico de ``gemini_chaves``. Antes cada chamador mandava
``settings.gemini_api_key`` cru -- com varias chaves configuradas, o header ia
com ``k1,k2,k3`` e o Gemini respondia 401 em toda chamada multimodal, TTS e de
imagem.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.services import gemini_chaves, uso_llm

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiSemChaveDisponivel(RuntimeError):
    """Nenhuma chave configurada, ou todas em cooldown para o modelo."""


def gemini_generate_url(model: str) -> str:
    return f"{GEMINI_API_BASE}/{model}:generateContent"


def gemini_headers(api_key: str | None) -> dict[str, str]:
    return {"x-goog-api-key": str(api_key or ""), "Content-Type": "application/json"}


async def gemini_generate(
    *,
    settings: Any,
    model: str,
    body: dict[str, Any],
    timeout: float,
    origem: str,
) -> dict[str, Any]:
    """POST ``generateContent`` com rodizio de chave; devolve o JSON da resposta.

    Erro de cota, de modelo indisponivel ou 5xx poe (chave, modelo) em cooldown
    e tenta a proxima chave. Qualquer outro erro sobe na hora, porque outra
    chave falharia igual. Esgotadas as chaves, sobe o ultimo
    ``httpx.HTTPStatusError`` (ou ``GeminiSemChaveDisponivel`` se nenhuma estava
    livre) -- o mesmo contrato do ``raise_for_status()`` que cada chamador fazia.

    Troca de MODELO continua com o chamador: cada um tem a sua lista.
    """
    api_keys = gemini_chaves.chaves_configuradas(settings)
    if not api_keys:
        raise GeminiSemChaveDisponivel("GEMINI_API_KEY ausente.")
    cooldown_sec, cooldown_diario_sec = gemini_chaves.cooldowns_de(settings)
    url = gemini_generate_url(model)
    ultimo_erro: httpx.HTTPStatusError | None = None

    for _ in range(len(api_keys)):
        key = gemini_chaves.escolher_chave(api_keys, model, reservadas=gemini_chaves.reservadas_de(settings))
        if key is None:
            break
        inicio = time.monotonic()
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=body, headers=gemini_headers(key))
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.info(
                "Gemini %s (%s): HTTP %s em %.1fs",
                origem,
                model,
                exc.response.status_code,
                time.monotonic() - inicio,
            )
            uso_llm.registrar(
                prompt=origem,
                provedor="gemini",
                modelo=model,
                tokens_entrada=None,
                tokens_saida=None,
                tokens_cache=None,
                fim=f"erro:http_{exc.response.status_code}",
                latencia_ms=round((time.monotonic() - inicio) * 1000),
            )
            if not gemini_chaves.marcar_falha(
                key,
                model,
                exc,
                cooldown_sec=cooldown_sec,
                cooldown_diario_sec=cooldown_diario_sec,
            ):
                raise
            ultimo_erro = exc
            continue
        logger.debug("Gemini %s (%s): ok em %.1fs", origem, model, time.monotonic() - inicio)
        corpo = response.json()
        uso_llm.registrar_resposta_gemini_http(
            corpo, prompt=origem, modelo=model, latencia_ms=round((time.monotonic() - inicio) * 1000)
        )
        return corpo

    if ultimo_erro is not None:
        raise ultimo_erro
    raise GeminiSemChaveDisponivel(
        f"Todas as chaves do Gemini em cooldown para {model} ({origem})."
    )


__all__ = [
    "GEMINI_API_BASE",
    "GeminiSemChaveDisponivel",
    "gemini_generate",
    "gemini_generate_url",
    "gemini_headers",
]
