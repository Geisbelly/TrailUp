import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.perfil import PerfilUpdate


class IADescricaoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._relation_name: str | None = None
        self._relation_resolved = False

    async def _resolve_relation_name(self) -> str | None:
        if self._relation_resolved:
            return self._relation_name

        result = await self.session.execute(
            text(
                """
                SELECT
                  to_regclass('public.iadescricao') AS lower_name,
                  to_regclass('public."iaDescricao"') AS camel_name
                """
            )
        )
        row = result.mappings().one()
        if row.get("lower_name"):
            self._relation_name = "iadescricao"
        elif row.get("camel_name"):
            self._relation_name = '"iaDescricao"'
        else:
            self._relation_name = None

        self._relation_resolved = True
        return self._relation_name

    async def upsert_cycle_summary(
        self,
        aluno_id: str,
        perfil_update: PerfilUpdate | None,
        recomendacao_trilha: str | None,
        insights: dict[str, Any],
    ) -> None:
        relation_name = await self._resolve_relation_name()
        if relation_name is None:
            return

        latest_query = (
            """
            SELECT id
            FROM iadescricao
            WHERE aluno_id = :aluno_id
            ORDER BY created_at DESC
            LIMIT 1
            """
            if relation_name == "iadescricao"
            else """
            SELECT id
            FROM "iaDescricao"
            WHERE aluno_id = :aluno_id
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        latest_result = await self.session.execute(text(latest_query), {"aluno_id": aluno_id})
        existing_id = latest_result.scalar()

        perfis = [perfil.model_dump() for perfil in perfil_update.perfis] if perfil_update else []
        modo_operacao = perfil_update.modo_operacao_sugerido if perfil_update else None

        if existing_id:
            update_query = (
                """
                UPDATE iadescricao
                SET
                  modooperacao = COALESCE(:modo_operacao, modooperacao),
                  insights = CAST(:insights AS JSON),
                  perfisdetectados = CAST(:perfis_detectados AS JSON),
                  recomendacaotrilha = COALESCE(:recomendacao_trilha, recomendacaotrilha)
                WHERE id = :record_id
                """
                if relation_name == "iadescricao"
                else """
                UPDATE "iaDescricao"
                SET
                  "modoOperacao" = COALESCE(:modo_operacao, "modoOperacao"),
                  insights = CAST(:insights AS JSON),
                  "perfisDetectados" = CAST(:perfis_detectados AS JSON),
                  "recomendacaoTrilha" = COALESCE(:recomendacao_trilha, "recomendacaoTrilha")
                WHERE id = :record_id
                """
            )
            await self.session.execute(
                text(update_query),
                {
                    "modo_operacao": modo_operacao,
                    "insights": json.dumps(insights, default=str),
                    "perfis_detectados": json.dumps(perfis, default=str),
                    "recomendacao_trilha": recomendacao_trilha,
                    "record_id": existing_id,
                },
            )
            return

        insert_query = (
            """
            INSERT INTO iadescricao (
              aluno_id, recomendacaotrilha, modooperacao, insights, perfisdetectados
            )
            VALUES (
              :aluno_id,
              :recomendacao_trilha,
              :modo_operacao,
              CAST(:insights AS JSON),
              CAST(:perfis_detectados AS JSON)
            )
            """
            if relation_name == "iadescricao"
            else """
            INSERT INTO "iaDescricao" (
              aluno_id, "recomendacaoTrilha", "modoOperacao", insights, "perfisDetectados"
            )
            VALUES (
              :aluno_id,
              :recomendacao_trilha,
              :modo_operacao,
              CAST(:insights AS JSON),
              CAST(:perfis_detectados AS JSON)
            )
            """
        )
        await self.session.execute(
            text(insert_query),
            {
                "aluno_id": aluno_id,
                "recomendacao_trilha": recomendacao_trilha,
                "modo_operacao": modo_operacao,
                "insights": json.dumps(insights, default=str),
                "perfis_detectados": json.dumps(perfis, default=str),
            },
        )
