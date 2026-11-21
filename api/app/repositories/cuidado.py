"""Modo de cuidado (`20261121_01`, `_02`): consentimento e momento gravado pelo Guia.

O banco decide (consentimento, intervalo, matricula, chaves permitidas); a API so chama as funcoes
internas. Nada aqui recebe nem grava texto do aluno. `registrar_pelo_guia` roda em transacao propria
e pode levantar: quem chama trata a falha (`cuidado.` no log) sem derrubar a resposta.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CuidadoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def permitido(self, aluno_id: str) -> bool:
        """Consentimento vigente. Falha de leitura vale como "nao": sem prova, nao grava."""
        try:
            result = await self.session.execute(
                text("SELECT public.aluno_cuidado_permitido(CAST(:aluno_id AS uuid))"),
                {"aluno_id": str(aluno_id)},
            )
            return bool(result.scalar())
        except Exception as exc:
            await self.session.rollback()
            logger.warning("cuidado.permitido_falhou: %s", type(exc).__name__)
            return False

    async def registrar_pelo_guia(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int | None,
        nivel: str,
        acoes: dict[str, bool],
    ) -> dict[str, Any]:
        """Chama `fn_cuidado_registrar` com `origem = 'aluno_disse'` e commita. Recusa do banco
        volta como `{"ok": False, "motivo": ...}`, nao como excecao."""
        result = await self.session.execute(
            text(
                """
                SELECT public.fn_cuidado_registrar(
                  CAST(:aluno_id AS uuid), :classe_id, :topico_id, 'aluno_disse', :nivel,
                  CAST('{}' AS jsonb), CAST(:acoes AS jsonb)
                )
                """
            ),
            {
                "aluno_id": str(aluno_id),
                "classe_id": int(classe_id),
                "topico_id": topico_id,
                "nivel": nivel,
                "acoes": json.dumps(acoes),
            },
        )
        valor = result.scalar()
        await self.session.commit()
        if isinstance(valor, str):
            valor = json.loads(valor)
        return dict(valor) if isinstance(valor, dict) else {"ok": False, "motivo": "resposta_vazia"}
