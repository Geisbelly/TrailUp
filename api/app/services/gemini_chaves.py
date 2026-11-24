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

Tres regras alem da pausa por (chave, modelo), vindas do que `ia_uso_llm` mostrou em 24/11:

* modelo aposentado (404 `GoogleModelNotFoundError`) sai para TODAS as chaves pelo tempo da cota
  diaria: trocar de chave nao traz o modelo de volta, e a cadeia gastava uma chamada por chave em
  cada um dos tres modelos 2.x a cada pergunta do Guia;
* chave sem credito (402 RESOURCE_EXHAUSTED, que o langchain levanta como o generico
  `ChatGoogleGenerativeAIError`, porque so 400/401/403/404/429 tem classe propria) sai de todos os
  modelos pelo tempo da cota diaria, como no microservice (em 24/11, 27 desses em todos os modelos:
  pelo padrao, uma chave so; o texto do erro nao e gravado, entao o 402 e inferencia);
* na faixa do chat, `sem_cota_em_todas` diz se o modelo principal esta sem cota em todas as chaves.
  Quem chama (`llm._ainvoke_gemini_with_rotation`) desiste na hora em vez de descer a cadeia ate o
  prazo de 40 s, e o aluno recebe a reserva logo.

`GoogleAPIError` (o "erro:GoogleAPIError" de `ia_uso_llm`) e o 5xx do Gemini: o langchain-google-genai
4.x so cria essa classe a partir do `ServerError` do google-genai (500 a 599). 429 vira
`GoogleRateLimitError` e 403 vira `GooglePermissionDeniedError`, entao ele nao esconde cota nem
permissao. O status vem em `exc.code`; nas classes de 4xx o langchain so guarda a mensagem, e o status
mora na causa (`exc.__cause__.code`), que `_status_e_texto` tambem le.

Faixas: `gemini_chaves_reservadas_chat` guarda as ultimas chaves da lista para quem tem alguem
esperando na tela. O chat tenta a reserva primeiro e depois as outras; o resto (fila, enriquecimento,
agentes) nunca toca nela, entao um lote grande nao tira a cota da aula. So protege de verdade se a
reserva estiver em outro projeto do Google, porque a cota diaria e por projeto, e se o microservice,
que tem rodizio proprio, nao usar a mesma chave.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

logger = logging.getLogger(__name__)

COOLDOWN_PADRAO_SEC = 300
COOLDOWN_DIARIO_PADRAO_SEC = 6 * 3_600

_indisponivel_ate: dict[tuple[str, str], float] = {}
# Por que cada (chave, modelo) esta em pausa: so "cota"/"cota_diaria" contam como sem cota.
_motivo_da_pausa: dict[tuple[str, str], str] = {}
# Modelo aposentado (404): fora para todas as chaves.
_modelo_fora_ate: dict[str, float] = {}
# Chave sem credito (402): fora em todos os modelos.
_chave_fora_ate: dict[str, float] = {}
_MOTIVOS_DE_COTA = frozenset({"cota", "cota_diaria", "sem_credito"})
_indice_rodizio: int = 0
_na_faixa_do_chat: ContextVar[bool] = ContextVar("gemini_na_faixa_do_chat", default=False)


@contextmanager
def faixa_do_chat() -> Iterator[None]:
    token = _na_faixa_do_chat.set(True)
    try:
        yield
    finally:
        _na_faixa_do_chat.reset(token)


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

    O langchain-google-genai levanta os 4xx com so a mensagem (`GoogleRateLimitError(msg)`) e guarda
    o `ClientError` do google-genai na causa: e de la que sai o status quando a excecao nao o tem.
    """
    status = str(getattr(exc, "status_code", "") or getattr(exc, "code", "") or "").strip()
    causa = exc.__cause__
    if not status and causa is not None:
        status = str(getattr(causa, "status_code", "") or getattr(causa, "code", "") or "").strip()
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


def is_billing_error(exc: BaseException) -> bool:
    """402: o projeto da chave saiu do free tier ("prepayment credits are depleted"). Esperar nao
    devolve credito e o erro vale para todos os modelos da chave."""
    status, texto = _status_e_texto(exc)
    return status == "402" or "prepayment" in texto or "credits are depleted" in texto


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


def _modelo_aposentado(exc: BaseException) -> bool:
    """404 ou "no longer available": vale para qualquer chave. 401 fica de fora (e da chave)."""
    status, texto = _status_e_texto(exc)
    return status in {"404", "NOT_FOUND"} or "not_found" in texto or "no longer available" in texto


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


def escolher_chave(api_keys: list[str], model: str, *, reservadas: int = 0) -> str | None:
    """Round-robin entre as chaves fora de cooldown PARA ESSE MODELO; None se
    todas estiverem indisponiveis agora. Reservar todas pararia o lote: vale como sem reserva."""
    corte = len(api_keys) - reservadas if 0 < reservadas < len(api_keys) else len(api_keys)
    compartilhadas, reserva = api_keys[:corte], api_keys[corte:]
    if _na_faixa_do_chat.get():
        return _proxima_chave(reserva, model) or _proxima_chave(compartilhadas, model)
    return _proxima_chave(compartilhadas, model)


def _proxima_chave(api_keys: list[str], model: str) -> str | None:
    global _indice_rodizio
    if not api_keys:
        return None
    agora = time.time()
    if agora < _modelo_fora_ate.get(model, 0.0):
        return None
    for offset in range(len(api_keys)):
        index = (_indice_rodizio + offset) % len(api_keys)
        key = api_keys[index]
        if agora >= _indisponivel_ate.get((key, model), 0.0) and agora >= _chave_fora_ate.get(key, 0.0):
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
    status, _ = _status_e_texto(exc)
    agora = time.time()
    if is_billing_error(exc):
        _chave_fora_ate[key] = agora + cooldown_diario_sec
        segundos, motivo = cooldown_diario_sec, "sem_credito"
    elif is_quota_error(exc):
        diaria = is_daily_quota_error(exc)
        segundos = cooldown_diario_sec if diaria else cooldown_sec
        motivo = "cota_diaria" if diaria else "cota"
    elif _modelo_aposentado(exc):
        # Aposentado para uma chave, aposentado para todas: pula o modelo inteiro.
        _modelo_fora_ate[model] = agora + cooldown_diario_sec
        segundos, motivo = cooldown_diario_sec, "modelo_indisponivel"
    elif is_model_unavailable_error(exc):
        # 401 e da chave, nao do modelo: so esta (chave, modelo), pelo tempo curto.
        segundos, motivo = cooldown_sec, "modelo_indisponivel"
    elif is_transient_error(exc):
        segundos, motivo = cooldown_sec, "servidor"
    else:
        return False
    _indisponivel_ate[(key, model)] = agora + segundos
    _motivo_da_pausa[(key, model)] = motivo
    # O status vai ao log para a proxima investigacao nao depender do nome da classe.
    logger.info(
        "Gemini: chave #%s em cooldown para %s por %ss (%s, status %s, %s)",
        _rotulo_chave(key),
        model,
        segundos,
        motivo,
        status or "?",
        type(exc).__name__,
    )
    return True


def motivo_da_pausa(key: str, model: str) -> str | None:
    """Motivo da pausa em vigor para (chave, modelo), ou None se a chave pode ser usada agora."""
    agora = time.time()
    if agora < _chave_fora_ate.get(key, 0.0):
        return "sem_credito"
    if agora < _modelo_fora_ate.get(model, 0.0):
        return "modelo_indisponivel"
    if agora < _indisponivel_ate.get((key, model), 0.0):
        return _motivo_da_pausa.get((key, model), "cota")
    return None


def sem_cota_em_todas(api_keys: list[str], model: str) -> bool:
    """Toda chave esta pausada por cota (ou sem credito) neste modelo. Pausa de servidor (5xx) nao
    conta: passa em minutos e outro pedido pode ser atendido."""
    if not api_keys:
        return False
    return all(motivo_da_pausa(key, model) in _MOTIVOS_DE_COTA for key in api_keys)


def na_faixa_do_chat() -> bool:
    return _na_faixa_do_chat.get()


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


def reservadas_de(settings: Any) -> int:
    try:
        return max(int(getattr(settings, "gemini_chaves_reservadas_chat", 0) or 0), 0)
    except (TypeError, ValueError):
        return 0


def _rotulo_chave(key: str) -> str:
    # Nunca a chave no log: so os 4 ultimos caracteres.
    return key[-4:] if len(key) > 4 else "?"


def reset() -> None:
    global _indisponivel_ate, _indice_rodizio
    _indisponivel_ate = {}
    _motivo_da_pausa.clear()
    _modelo_fora_ate.clear()
    _chave_fora_ate.clear()
    _indice_rodizio = 0


__all__ = [
    "COOLDOWN_DIARIO_PADRAO_SEC",
    "COOLDOWN_PADRAO_SEC",
    "chaves_configuradas",
    "cooldowns_de",
    "escolher_chave",
    "faixa_do_chat",
    "is_billing_error",
    "is_daily_quota_error",
    "is_model_unavailable_error",
    "is_quota_error",
    "is_transient_error",
    "marcar_falha",
    "motivo_da_pausa",
    "na_faixa_do_chat",
    "parse_lista",
    "reservadas_de",
    "reset",
    "sem_cota_em_todas",
]
