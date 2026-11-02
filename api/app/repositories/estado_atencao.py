from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ESTADOS = frozenset({"alta", "moderada", "baixa"})


class EstadoAtencaoRepository:
    """Estado de atenção corrente do aluno, para o motor de notificações ler (#149).

    A API calcula (é IA); o banco decide a entrega (`notificacoes_em_foco`). Uma linha por aluno,
    sobrescrita a cada ciclo. `desde` só anda quando o estado muda.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def registrar(
        self,
        *,
        aluno_id: str,
        estado: str,
        score: float | None = None,
        ciclo_id: str | None = None,
    ) -> bool:
        if estado not in ESTADOS:
            return False
        if score is not None:
            score = min(1.0, max(0.0, float(score)))
        await self.session.execute(
            text(
                """
                INSERT INTO aluno_estado_atencao (aluno_id, estado, score, ciclo_id, desde, atualizado_em)
                VALUES (CAST(:aluno_id AS UUID), :estado, CAST(:score AS NUMERIC), :ciclo_id, now(), now())
                ON CONFLICT (aluno_id) DO UPDATE
                  SET desde = CASE WHEN aluno_estado_atencao.estado IS DISTINCT FROM EXCLUDED.estado
                                   THEN now() ELSE aluno_estado_atencao.desde END,
                      estado = EXCLUDED.estado,
                      score = EXCLUDED.score,
                      ciclo_id = EXCLUDED.ciclo_id,
                      atualizado_em = now()
                """
            ),
            {
                "aluno_id": aluno_id,
                "estado": estado,
                "score": round(score, 3) if score is not None else None,
                "ciclo_id": ciclo_id,
            },
        )
        return True


def estado_da_atencao(resultado: dict[str, Any] | None) -> tuple[str, float | None] | None:
    """`(estado, score)` do `attention_snapshot` que o pipeline deixa no estado do ciclo."""
    snapshot = (resultado or {}).get("attention_snapshot") or {}
    estado = snapshot.get("estado_atencao")
    if estado not in ESTADOS:
        return None
    score = snapshot.get("score")
    try:
        return estado, float(score) if score is not None else None
    except (TypeError, ValueError):
        return estado, None
