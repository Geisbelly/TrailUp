from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ProfessorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def buscar_geracao_automatica_por_classe(self, classe_id: int) -> bool:
        """True (default seguro) quando a classe/professor nao for
        encontrado - nunca bloqueia geracao por ausencia de dado, so quando
        o professor desligou explicitamente."""
        result = await self.session.execute(
            text(
                """
                SELECT p.geracao_automatica
                FROM classe c
                JOIN professor p ON p.id = c.professor_id
                WHERE c.id = :classe_id
                """
            ),
            {"classe_id": classe_id},
        )
        value = result.scalar()
        return True if value is None else bool(value)
