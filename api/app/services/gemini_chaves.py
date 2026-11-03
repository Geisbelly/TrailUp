"""Pool unico de chaves do Gemini para a API inteira.

Antes cada caminho tinha o seu: `llm.py` (JsonLLMService), `content_enrichment.py`
e as chamadas HTTP diretas (multimodal, TTS, imagem), que nem rodavam chave --
mandavam `GEMINI_API_KEY` CRU no header. Com varias chaves configuradas
(`k1,k2,k3`), o header ia com a lista inteira e toda chamada direta voltava 401.

Dois pools separados tambem desperdicavam cota: uma chave que estourou a cota
DIARIA no enriquecimento continuava sendo tentada pelo JsonLLMService a cada
5 min, porque ele nao sabia do cooldown do outro e nem distinguia cota diaria
de cota por minuto. Aqui o cooldown e por (chave, modelo), compartilhado por
todo mundo, e cota diaria fica fora pelo tempo de
`content_enrichment_gemini_daily_quota_cooldown_sec` (6 h por padrao).

O estado vive em memoria do processo: restart zera, como antes.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

COOLDOWN_PADRAO_SEC = 300
COOLDOWN_DIARIO_PADRAO_SEC = 6 * 3_600

_indisponivel_ate: dict[tuple[str, str], float] = {}
_indice_rodizio: int = 0


def parse_lista(raw: str | None) -> list[str]:
    """Lista separada por virgula/ponto-e-virgula, sem vazios nem repetidos.
    Serve para chaves (`GEMINI_API_KEY=k1,k2`) e listas de modelos."""
    seen: set[str] = set()
    itens: list[str] = []
    for part in re.split(r"[,;]", raw or ""):
        item = part.strip()
        if item and item not in seen:
            seen.add(item)
            itens.append(item)
    return itens


def chaves_configuradas(settings: Any) -> list[str]:
    return parse_lista(str(getattr(settings, "gemini_api_key", "") or ""))


def _status_e_texto(exc: BaseException) -> tuple[str, str]:
    """Status e texto do erro, para SDK (status_code/code) e httpx.

    No `httpx.HTTPStatusError` o status mora em `exc.response` e o motivo
    (RESOURCE_EXHAUSTED, quotaId ...PerDay...) so aparece no corpo -- `str(exc)`
    traz apenas "429 Too Many Requests" e a URL.
    """
    status = str(getattr(exc, "status_code", "") or getattr(exc, "code", "") or "").strip()
    texto = str(exc)
    response = getattr(exc, "response", None)
    if response is not None:
        status_http = getattr(response, "status_code", None)
        if isinstance(status_http, int):
            status = status or str(status_http)
        try:
            corpo = response.text
        except Exception:
            corpo = ""
        if isinstance(corpo, str) and corpo:
            texto = f"{texto} {corpo[:2000]}"
    return status, texto.lower()


def is_quota_error(exc: BaseException) -> bool:
    status, texto = _status_e_texto(exc)
    if status in {"429", "RESOURCE_EXHAUSTED"}:
        return True
    return "resource_exhausted" in texto or "quota" in texto


def is_daily_quota_error(exc: BaseException) -> bool:
    """RequestsPerDay (so reseta amanha) x RequestsPerMinute (segundos): o
    Google poe o quotaId na mensagem, ex.
    'GenerateRequestsPerDayPerProjectPerModel-FreeTier'. Chamar so depois de
    confirmar `is_quota_error`."""
    _, texto = _status_e_texto(exc)
    return "perday" in texto.replace(" ", "")


def is_model_unavailable_error(exc: BaseException) -> bool:
    """404/401 de modelo aposentado ou indisponivel para novos usuarios (ex.:
    gemini-2.5-flash-lite, 'no longer available to new users'). Trocar de chave
    nao ajuda, mas vale pular para o proximo modelo candidato."""
    status, texto = _status_e_texto(exc)
    if status in {"404", "401", "NOT_FOUND", "UNAUTHENTICATED"}:
        return True
    return "not_found" in texto or "unauthenticated" in texto or "no longer available" in texto


def is_transient_error(exc: BaseException) -> bool:
    """503 UNAVAILABLE ('high demand') e 5xx: sobrecarga do servidor do Gemini,
    nao problema da chave."""
    status, texto = _status_e_texto(exc)
    if status in {"500", "502", "503", "504", "UNAVAILABLE"}:
        return True
    return (
        "unavailable" in texto
        or "overloaded" in texto
        or "high demand" in texto
        or "try again later" in texto
    )


def escolher_chave(api_keys: list[str], model: str) -> str | None:
    """Round-robin entre as chaves fora de cooldown PARA ESSE MODELO; None se
    todas estiverem indisponiveis agora."""
    global _indice_rodizio
    if not api_keys:
        return None
    agora = time.time()
    for offset in range(len(api_keys)):
        index = (_indice_rodizio + offset) % len(api_keys)
        key = api_keys[index]
        if agora >= _indisponivel_ate.get((key, model), 0.0):
            _indice_rodizio = index
            return key
    return None


def marcar_falha(
    key: str,
    model: str,
    exc: BaseException,
    *,
    cooldown_sec: int = COOLDOWN_PADRAO_SEC,
    cooldown_diario_sec: int = COOLDOWN_DIARIO_PADRAO_SEC,
) -> bool:
    """Poe (chave, modelo) em cooldown se o erro justifica tentar outra chave
    ou outro modelo. Devolve False para erro que nao e de cota/modelo/servidor
    -- quem chamou deve propagar, porque outra chave falharia igual."""
    if is_quota_error(exc):
        diaria = is_daily_quota_error(exc)
        segundos = cooldown_diario_sec if diaria else cooldown_sec
        motivo = "cota diaria" if diaria else "cota"
    elif is_model_unavailable_error(exc):
        segundos, motivo = cooldown_sec, "modelo indisponivel"
    elif is_transient_error(exc):
        segundos, motivo = cooldown_sec, "servidor"
    else:
        return False
    _indisponivel_ate[(key, model)] = time.time() + segundos
    logger.info(
        "Gemini: chave #%s em cooldown para %s por %ss (%s)",
        _rotulo_chave(key),
        model,
        segundos,
        motivo,
    )
    return True


def cooldowns_de(settings: Any) -> tuple[int, int]:
    def _int(nome: str, padrao: int) -> int:
        try:
            valor = int(getattr(settings, nome, padrao) or padrao)
        except (TypeError, ValueError):
            return padrao
        return valor if valor > 0 else padrao

    return (
        _int("content_enrichment_gemini_quota_cooldown_sec", COOLDOWN_PADRAO_SEC),
        _int("content_enrichment_gemini_daily_quota_cooldown_sec", COOLDOWN_DIARIO_PADRAO_SEC),
    )


def _rotulo_chave(key: str) -> str:
    # Nunca a chave no log: so os 4 ultimos caracteres.
    return key[-4:] if len(key) > 4 else "?"


def reset() -> None:
    global _indisponivel_ate, _indice_rodizio
    _indisponivel_ate = {}
    _indice_rodizio = 0


__all__ = [
    "COOLDOWN_DIARIO_PADRAO_SEC",
    "COOLDOWN_PADRAO_SEC",
    "chaves_configuradas",
    "cooldowns_de",
    "escolher_chave",
    "is_daily_quota_error",
    "is_model_unavailable_error",
    "is_quota_error",
    "is_transient_error",
    "marcar_falha",
    "parse_lista",
    "reset",
]
