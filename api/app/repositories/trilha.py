import json
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.trilha_config import TrilhaConfig


class TrilhaRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def aplicar_config(self, aluno_id: str, trilha_config: TrilhaConfig) -> None:
        existing_result = await self.session.execute(
            text(
                """
                SELECT id
                FROM trilha_aluno
                WHERE aluno_id = :aluno_id
                  AND classe_id = :classe_id
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"aluno_id": aluno_id, "classe_id": trilha_config.classe_id},
        )
        existing_id = existing_result.scalar()

        payload = json.dumps(trilha_config.model_dump(mode="json"))
        if existing_id:
            await self.session.execute(
                text(
                    """
                    UPDATE trilha_aluno
                    SET configuracao = CAST(:configuracao AS JSONB)
                    WHERE id = :record_id
                    """
                ),
                {"configuracao": payload, "record_id": existing_id},
            )
            return

        await self.session.execute(
            text(
                """
                INSERT INTO trilha_aluno (id, aluno_id, classe_id, configuracao, status)
                VALUES (:id, :aluno_id, :classe_id, CAST(:configuracao AS JSONB), 'ativa')
                """
            ),
            {
                "id": str(uuid4()),
                "aluno_id": aluno_id,
                "classe_id": trilha_config.classe_id,
                "configuracao": payload,
            },
        )

