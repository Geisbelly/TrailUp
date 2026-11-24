"""O que o Guia sabe da turma antes de saber do aluno: matéria, tema do mapa e arco narrativo.

É o primeiro degrau da hierarquia das analogias e das pontes do Guia: **turma primeiro, depois o
aluno**. O tema do mapa (`classe_mapa_tema`) e o arco que o professor escreveu
(`classe_arco_narrativo`, #145) são a moldura comum da turma; o perfil e o que o aluno conta vêm
depois, dentro dessa moldura.

**Ler nunca derruba o chat.** A consulta roda num SAVEPOINT: tabela ausente ou erro de leitura
desfazem só ela, e o Guia responde sem a moldura, como antes.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.personalizacao import normalizar_arco_narrativo

logger = logging.getLogger(__name__)

MAX_CARACTERES_DO_TEMA = 400

_SQL_TURMA = text(
    """
    SELECT m.nome AS materia,
           t.world_name AS mundo,
           t.world_subtitle AS subtitulo,
           t.world_description AS descricao_do_mundo,
           a.texto AS arco
      FROM public.classe c
      LEFT JOIN public.materia m ON m.id = c.materia_id
      LEFT JOIN public.classe_mapa_tema t ON t.classe_id = c.id
      LEFT JOIN public.classe_arco_narrativo a ON a.classe_id = c.id
     WHERE c.id = :classe_id
     LIMIT 1
    """
)


def _texto(valor: Any, limite: int = MAX_CARACTERES_DO_TEMA) -> str | None:
    texto = " ".join(str(valor or "").split())
    return texto[:limite] or None


def montar_turma(linha: dict[str, Any]) -> dict[str, Any] | None:
    """O bloco `turma` do payload. Sem nada preenchido, `None` (a chave não entra)."""
    tema = {
        "mundo": _texto(linha.get("mundo")),
        "subtitulo": _texto(linha.get("subtitulo")),
        "descricao": _texto(linha.get("descricao_do_mundo")),
    }
    bloco = {
        "materia": _texto(linha.get("materia")),
        "tema_do_mapa": {k: v for k, v in tema.items() if v} or None,
        "arco_narrativo": normalizar_arco_narrativo(linha.get("arco")),
    }
    bloco = {k: v for k, v in bloco.items() if v}
    return bloco or None


async def contexto_da_turma(session: AsyncSession | None, classe_id: Any) -> dict[str, Any] | None:
    """Matéria, tema do mapa e arco da turma. Qualquer falha devolve `None`."""
    if session is None or classe_id is None:
        return None
    try:
        async with session.begin_nested():
            linha = (await session.execute(_SQL_TURMA, {"classe_id": int(classe_id)})).mappings().first()
    except Exception as exc:  # tabela ausente, banco fora
        logger.warning("turma_do_chat.leitura_falhou: %s", type(exc).__name__)
        return None
    return montar_turma(dict(linha)) if linha else None
