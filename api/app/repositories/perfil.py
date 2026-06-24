from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.perfil import PerfilUpdate


class PerfilRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._modo_operacao_relation: str | None = None
        self._modo_operacao_relation_resolved = False

    async def _resolve_modo_operacao_relation(self) -> str | None:
        if self._modo_operacao_relation_resolved:
            return self._modo_operacao_relation

        result = await self.session.execute(
            text(
                """
                SELECT
                  to_regclass('public.modooperacao') AS lower_name,
                  to_regclass('public."modoOperacao"') AS camel_name
                """
            )
        )
        row = result.mappings().one()
        if row.get("lower_name"):
            self._modo_operacao_relation = "modooperacao"
        elif row.get("camel_name"):
            self._modo_operacao_relation = '"modoOperacao"'
        else:
            self._modo_operacao_relation = None

        self._modo_operacao_relation_resolved = True
        return self._modo_operacao_relation

    async def atualizar_afinidades(self, aluno_id: str, perfil_update: PerfilUpdate) -> None:
        perfis_result = await self.session.execute(text("SELECT id, nome FROM perfil"))
        perfil_map = {row.nome.lower(): row.id for row in perfis_result}

        for perfil in perfil_update.perfis:
            perfil_id = perfil_map.get(perfil.perfil.lower())
            if perfil_id is None:
                continue

            await self.session.execute(
                text(
                    """
                    INSERT INTO aluno_perfil (aluno_id, perfil_id, afinidade)
                    VALUES (:aluno_id, :perfil_id, :afinidade)
                    ON CONFLICT (aluno_id, perfil_id)
                    DO UPDATE SET
                      afinidade = EXCLUDED.afinidade,
                      atualizado_em = NOW()
                    """
                ),
                {
                    "aluno_id": aluno_id,
                    "perfil_id": perfil_id,
                    "afinidade": perfil.afinidade,
                },
            )

        if perfil_update.modo_operacao_sugerido:
            modo_operacao_relation = await self._resolve_modo_operacao_relation()
            if modo_operacao_relation is not None:
                modo_result = await self.session.execute(
                    text(
                        f"""
                        SELECT id
                        FROM {modo_operacao_relation}
                        WHERE LOWER(nome) = LOWER(:modo)
                           OR LOWER(COALESCE(modoresposta, '')) = LOWER(:modo)
                        ORDER BY id
                        LIMIT 1
                        """
                    ),
                    {"modo": perfil_update.modo_operacao_sugerido},
                )
                modo_id = modo_result.scalar()
                if modo_id is not None:
                    await self.session.execute(
                        text(
                            """
                            UPDATE alunos
                            SET modooperacao_id = :modo_id
                            WHERE id = :aluno_id
                            """
                        ),
                        {"modo_id": modo_id, "aluno_id": aluno_id},
                    )

        if perfil_update.modo_resposta:
            await self.session.execute(
                text(
                    """
                    UPDATE alunos
                    SET modo_resposta = CAST(:modo_resposta AS modo_resposta_type)
                    WHERE id = :aluno_id
                    """
                ),
                {"modo_resposta": perfil_update.modo_resposta, "aluno_id": aluno_id},
            )
