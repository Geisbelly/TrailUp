"""Trava do tracing LangSmith (#195).

Com tracing ligado, o LangChain manda o estado inteiro de cada chamada (prompts,
respostas e, no grafo, o state com e-mail do aluno e frames da camera) para o
LangSmith, nos EUA. O default ja e desligado, mas uma env esquecida
(``LANGCHAIN_TRACING_V2=true`` no Dokploy) bastaria para ligar em producao — e o
SDK le essas envs direto do ``os.environ``, sem passar pelo ``Settings``.

Regra, aplicada no boot (``create_app``):
- fora de ambiente de desenvolvimento/teste, o tracing e FORCADO desligado
  (as envs que o SDK le sao sobrescritas com ``false``), a menos que
  ``langsmith_tracing_autorizado_em_producao`` esteja explicitamente ``True``;
- em desenvolvimento/teste, nada muda: liga quem quiser, com as envs de sempre.
"""

from __future__ import annotations

import logging
import os
from collections.abc import MutableMapping

from app.core.settings import Settings

logger = logging.getLogger(__name__)

AMBIENTES_COM_TRACING = frozenset({"development", "dev", "local", "test", "testing"})

# Todas as envs que o langsmith/langchain consultam para decidir se traceiam.
ENVS_DE_TRACING = (
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
)


def tracing_permitido(settings: Settings) -> bool:
    ambiente = str(settings.app_env or "").strip().lower()
    if ambiente in AMBIENTES_COM_TRACING:
        return True
    return bool(getattr(settings, "langsmith_tracing_autorizado_em_producao", False))


def aplicar_politica_de_tracing(
    settings: Settings, environ: MutableMapping[str, str] | None = None
) -> bool:
    """Devolve se o tracing pode ficar ligado. Quando nao pode, sobrescreve as
    envs do SDK com ``false`` — vale mesmo que alguem tenha posto ``true``."""
    environ = os.environ if environ is None else environ
    if tracing_permitido(settings):
        return True
    ligadas = [nome for nome in ENVS_DE_TRACING if str(environ.get(nome, "")).strip().lower() in {"1", "true", "yes"}]
    for nome in ENVS_DE_TRACING:
        environ[nome] = "false"
    if ligadas or settings.langchain_tracing_v2:
        logger.warning(
            "Tracing LangSmith desligado à força em app_env=%s (pedido por %s). "
            "Para liberar, LANGSMITH_TRACING_AUTORIZADO_EM_PRODUCAO=true.",
            settings.app_env,
            ", ".join(ligadas) or "langchain_tracing_v2",
        )
    return False


__all__ = ["AMBIENTES_COM_TRACING", "ENVS_DE_TRACING", "aplicar_politica_de_tracing", "tracing_permitido"]
