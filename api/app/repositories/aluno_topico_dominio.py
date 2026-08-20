from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class AlunoTopicoDominioRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def buscar_por_classe(self, *, aluno_id: str, classe_id: int) -> dict[str, dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT d.topico_id, d.dominio_estimado, d.tendencia, d.confianca, d.atualizado_em
                FROM aluno_topico_dominio d
                JOIN topicos t ON t.id = d.topico_id
                WHERE d.aluno_id = CAST(:aluno_id AS UUID)
                  AND t.classe_id = :classe_id
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        registros: dict[str, dict[str, Any]] = {}
        for row in result.mappings():
            registros[str(row["topico_id"])] = {
                "dominio_estimado": float(row["dominio_estimado"]),
                "tendencia": row["tendencia"],
                "confianca": float(row["confianca"]),
                "atualizado_em": row["atualizado_em"],
            }
        return registros

    async def upsert(
        self,
        *,
        aluno_id: str,
        topico_id: int,
        dominio_estimado: float,
        tendencia: str,
        confianca: float,
    ) -> None:
        await self.session.execute(
            text(
                """
                INSERT INTO aluno_topico_dominio (
                  aluno_id, topico_id, dominio_estimado, tendencia, confianca, atualizado_em
                )
                VALUES (
                  CAST(:aluno_id AS UUID), :topico_id, :dominio_estimado, :tendencia, :confianca, NOW()
                )
                ON CONFLICT (aluno_id, topico_id) DO UPDATE
                SET dominio_estimado = EXCLUDED.dominio_estimado,
                    tendencia = EXCLUDED.tendencia,
                    confianca = EXCLUDED.confianca,
                    atualizado_em = EXCLUDED.atualizado_em
                """
            ),
            {
                "aluno_id": aluno_id,
                "topico_id": topico_id,
                "dominio_estimado": dominio_estimado,
                "tendencia": tendencia,
                "confianca": confianca,
            },
        )
        await self.session.commit()
