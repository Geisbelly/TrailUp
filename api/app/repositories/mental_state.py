from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class MentalStateHistoryRepository:
    """Persistencia e leitura do historico de mental-state inferido pela IA."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def registrar(
        self,
        *,
        aluno_id: str,
        kind: str,
        ciclo_id: str | None = None,
        intensity: float | None = None,
        confidence: float | None = None,
        reason: str | None = None,
    ) -> None:
        await self.session.execute(
            text(
                """
                INSERT INTO aluno_mental_state_history (
                  aluno_id,
                  ciclo_id,
                  kind,
                  intensity,
                  confidence,
                  reason
                )
                VALUES (
                  CAST(:aluno_id AS UUID),
                  :ciclo_id,
                  :kind,
                  :intensity,
                  :confidence,
                  :reason
                )
                """
            ),
            {
                "aluno_id": aluno_id,
                "ciclo_id": ciclo_id,
                "kind": kind,
                "intensity": intensity,
                "confidence": confidence,
                "reason": reason,
            },
        )

    async def listar_por_aluno(
        self,
        *,
        aluno_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT id, aluno_id, ciclo_id, kind, intensity, confidence, reason, created_at
                FROM aluno_mental_state_history
                WHERE aluno_id = CAST(:aluno_id AS UUID)
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"aluno_id": aluno_id, "limit": limit},
        )
        registros: list[dict[str, Any]] = []
        for row in result.mappings():
            registros.append(
                {
                    "id": row["id"],
                    "aluno_id": str(row["aluno_id"]),
                    "ciclo_id": row["ciclo_id"],
                    "kind": row["kind"],
                    "intensity": float(row["intensity"]) if row["intensity"] is not None else None,
                    "confidence": float(row["confidence"]) if row["confidence"] is not None else None,
                    "reason": row["reason"],
                    "created_at": row["created_at"],
                }
            )
        return registros
