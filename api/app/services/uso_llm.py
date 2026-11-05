"""Uso de modelo por chamada: tokens, cache, tempo e motivo de parada, sem texto e sem aluno.

Mede tudo o que a API chama: `JsonLLMService`, `OpenAIRagService`, `gemini_http` e `content_enrichment`,
inclusive a chamada que falha (`fim` = `erro:<tipo>`). O microservice mede o dele em `usoDoModelo.ts` e
devolve à API por `uso_do_modelo`, que grava no alvo da fila: registrar aqui também contaria em dobro.

Medir nunca derruba nem atrasa a resposta: a gravação sai em segundo plano e a falha só vai para o log.
Sem `configurar()` (testes, scripts), o registro fica só no log.
"""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Iterator

from sqlalchemy import text

try:
    from langchain_core.callbacks import BaseCallbackHandler
except ImportError:  # pragma: no cover
    BaseCallbackHandler = object  # type: ignore[assignment,misc]

logger = logging.getLogger(__name__)

# Motivos de parada, em maiúsculas: OpenAI (`finish_reason`), Responses API (`incomplete_details`) e
# Gemini. `PROMPT_BLOQUEADO` é nosso: o Gemini recusa a entrada e não devolve candidato nem motivo.
_FINS_BLOQUEADOS = frozenset(
    {
        "CONTENT_FILTER", "REFUSAL", "PROMPT_BLOQUEADO", "SAFETY", "RECITATION", "BLOCKLIST",
        "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT",
    }
)
_FINS_CORTADOS = frozenset({"LENGTH", "MAX_TOKENS", "MAX_OUTPUT_TOKENS"})
# No `json_schema`, o SDK da OpenAI levanta estas no lugar de devolver a resposta. Pelo nome porque
# `openai` é import opcional.
_FIM_DA_EXCECAO = {"LengthFinishReasonError": "length", "ContentFilterFinishReasonError": "content_filter"}


@dataclass
class Chamada:
    """Preenchida pelo callback. `with_structured_output` devolve só o dict e o motivo se perderia."""

    fim: str | None = None
    inicio: float = field(default_factory=time.monotonic)

    def latencia_ms(self) -> int:
        return round((time.monotonic() - self.inicio) * 1000)


_prompt_atual: ContextVar[str | None] = ContextVar("uso_llm_prompt", default=None)
_chamada_atual: ContextVar[Chamada | None] = ContextVar("uso_llm_chamada", default=None)
_session_factory: Any = None
_tarefas: set[asyncio.Task[None]] = set()


def configurar(session_factory: Any) -> None:
    global _session_factory
    _session_factory = session_factory


@contextmanager
def etiqueta(prompt_name: str) -> Iterator[Chamada]:
    chamada = Chamada()
    token = _prompt_atual.set(prompt_name)
    token_chamada = _chamada_atual.set(chamada)
    try:
        yield chamada
    finally:
        _chamada_atual.reset(token_chamada)
        _prompt_atual.reset(token)


def fim_da_excecao(exc: BaseException) -> str:
    return _FIM_DA_EXCECAO.get(type(exc).__name__) or f"erro:{type(exc).__name__}"


def fim_bloqueado(fim: str | None) -> bool:
    return (fim or "").upper() in _FINS_BLOQUEADOS


def fim_cortado(fim: str | None) -> bool:
    return (fim or "").upper() in _FINS_CORTADOS


async def _gravar(linha: dict[str, Any]) -> None:
    try:
        async with _session_factory() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO ia_uso_llm
                      (prompt, provedor, modelo, tokens_entrada, tokens_saida, tokens_cache, usou_rag, fim,
                       latencia_ms)
                    VALUES
                      (:prompt, :provedor, :modelo, :tokens_entrada, :tokens_saida, :tokens_cache, :usou_rag, :fim,
                       :latencia_ms)
                    """
                ),
                linha,
            )
            await session.commit()
    except Exception as exc:
        logger.warning("Falha ao gravar ia_uso_llm: %s", type(exc).__name__)


def registrar(
    *,
    prompt: str | None,
    provedor: str,
    modelo: str | None,
    tokens_entrada: int | None,
    tokens_saida: int | None,
    tokens_cache: int | None,
    usou_rag: bool = False,
    fim: str | None = None,
    latencia_ms: int | None = None,
) -> None:
    linha = {
        "prompt": prompt or "desconhecido",
        "provedor": provedor,
        "modelo": modelo,
        "tokens_entrada": tokens_entrada,
        "tokens_saida": tokens_saida,
        "tokens_cache": tokens_cache,
        "usou_rag": usou_rag,
        "fim": fim,
        "latencia_ms": latencia_ms,
    }
    logger.info("llm.uso=%s", linha)
    if _session_factory is None:
        return
    try:
        tarefa = asyncio.get_running_loop().create_task(_gravar(linha))
    except RuntimeError:
        return
    _tarefas.add(tarefa)
    tarefa.add_done_callback(_tarefas.discard)


def _fim_da_geracao(metadados: dict[str, Any], llm_output: dict[str, Any]) -> str | None:
    if fim := metadados.get("finish_reason"):
        return str(fim)
    # Entrada recusada não tem candidato: o Gemini devolve mensagem vazia e o motivo só em `llm_output`.
    feedback = llm_output.get("prompt_feedback") or {}
    return "PROMPT_BLOQUEADO" if feedback.get("block_reason") else None


class UsoCallback(BaseCallbackHandler):  # type: ignore[misc,valid-type]
    """Vai no construtor do cliente: vale também por dentro de `with_structured_output`, que devolve
    só o dict e perderia o `usage_metadata` da resposta."""

    run_inline = True

    def __init__(self, provedor: str, modelo: str | None = None, prompt: str | None = None) -> None:
        self.provedor = provedor
        self.modelo = modelo
        self.prompt = prompt

    def on_llm_error(self, error: BaseException, **_kwargs: Any) -> None:
        try:
            fim = fim_da_excecao(error)
            chamada = _chamada_atual.get()
            if chamada is not None:
                chamada.fim = fim
            # `LengthFinishReasonError` traz a resposta: os tokens dela foram gastos do mesmo jeito.
            uso = getattr(getattr(error, "completion", None), "usage", None)
            detalhes = getattr(uso, "prompt_tokens_details", None)
            registrar(
                prompt=_prompt_atual.get() or self.prompt,
                provedor=self.provedor,
                modelo=self.modelo,
                tokens_entrada=getattr(uso, "prompt_tokens", None),
                tokens_saida=getattr(uso, "completion_tokens", None),
                tokens_cache=getattr(detalhes, "cached_tokens", None),
                fim=fim,
                latencia_ms=chamada.latencia_ms() if chamada is not None else None,
            )
        except Exception:  # pragma: no cover
            logger.debug("Erro do modelo ilegivel", exc_info=True)

    def on_llm_end(self, response: Any, **_kwargs: Any) -> None:
        try:
            mensagem = response.generations[0][0].message
            metadados = getattr(mensagem, "response_metadata", None) or {}
            fim = _fim_da_geracao(metadados, getattr(response, "llm_output", None) or {})
            chamada = _chamada_atual.get()
            if chamada is not None:
                chamada.fim = fim
            uso = getattr(mensagem, "usage_metadata", None)
            if not uso:
                return
            registrar(
                prompt=_prompt_atual.get() or self.prompt,
                provedor=self.provedor,
                modelo=metadados.get("model_name") or metadados.get("model") or self.modelo,
                tokens_entrada=uso.get("input_tokens"),
                tokens_saida=uso.get("output_tokens"),
                tokens_cache=(uso.get("input_token_details") or {}).get("cache_read"),
                fim=fim,
                latencia_ms=chamada.latencia_ms() if chamada is not None else None,
            )
        except Exception:  # pragma: no cover
            logger.debug("Uso do modelo ilegivel", exc_info=True)


def fim_da_resposta_rag(response: Any) -> str | None:
    """Responses API: `incomplete_details.reason`, ou a recusa dentro de `output`."""
    try:
        if getattr(response, "status", None) == "incomplete":
            detalhes = getattr(response, "incomplete_details", None)
            return str(getattr(detalhes, "reason", None) or "incomplete")
        for item in getattr(response, "output", None) or []:
            for parte in getattr(item, "content", None) or []:
                if getattr(parte, "type", None) == "refusal":
                    return "refusal"
    except Exception:  # pragma: no cover
        logger.debug("Fim do RAG ilegivel", exc_info=True)
    return None


def registrar_resposta_openai(
    response: Any, *, prompt: str, modelo: str, usou_rag: bool = False, latencia_ms: int | None = None
) -> None:
    """Responses API: `usage.input_tokens_details.cached_tokens`."""
    try:
        uso = getattr(response, "usage", None)
        if uso is None:
            return
        detalhes = getattr(uso, "input_tokens_details", None)
        registrar(
            prompt=prompt,
            provedor="openai",
            modelo=modelo,
            tokens_entrada=getattr(uso, "input_tokens", None),
            tokens_saida=getattr(uso, "output_tokens", None),
            tokens_cache=getattr(detalhes, "cached_tokens", None),
            usou_rag=usou_rag,
            fim=fim_da_resposta_rag(response),
            latencia_ms=latencia_ms,
        )
    except Exception:  # pragma: no cover
        logger.debug("Uso da OpenAI ilegivel", exc_info=True)


def registrar_resposta_gemini_http(
    corpo: dict[str, Any], *, prompt: str, modelo: str, latencia_ms: int | None = None
) -> None:
    """JSON cru do `generateContent`. A saída cobrada inclui o raciocínio, como em `usoDoModelo.ts`."""
    try:
        uso = corpo.get("usageMetadata") or {}
        candidatos = corpo.get("candidates") or [{}]
        bloqueio = (corpo.get("promptFeedback") or {}).get("blockReason")
        saida = (uso.get("candidatesTokenCount") or 0) + (uso.get("thoughtsTokenCount") or 0)
        registrar(
            prompt=prompt,
            provedor="gemini",
            modelo=modelo,
            tokens_entrada=uso.get("promptTokenCount"),
            tokens_saida=saida if uso else None,
            tokens_cache=uso.get("cachedContentTokenCount"),
            fim=candidatos[0].get("finishReason") or ("PROMPT_BLOQUEADO" if bloqueio else None),
            latencia_ms=latencia_ms,
        )
    except Exception:  # pragma: no cover
        logger.debug("Uso do Gemini ilegivel", exc_info=True)
