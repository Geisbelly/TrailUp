import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ClasseMapaTemaRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._table_exists: bool | None = None

    async def _classe_mapa_tema_exists(self) -> bool:
        if self._table_exists is not None:
            return self._table_exists

        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = 'classe_mapa_tema'
                )
                """
            )
        )
        self._table_exists = bool(result.scalar())
        return self._table_exists

    @staticmethod
    def _normalize_json_field(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return {}
        return value

    def _hydrate_record(self, row: dict[str, Any]) -> dict[str, Any]:
        row["palette"] = self._normalize_json_field(row.get("palette")) or {}
        row["countries"] = self._normalize_json_field(row.get("countries")) or {}
        return row

    async def buscar_contexto_classe(self, classe_id: int) -> dict[str, Any] | None:
        classe_result = await self.session.execute(
            text(
                """
                SELECT
                  c.id AS classe_id,
                  c.descricao AS classe_descricao,
                  c.materia_id,
                  m.nome AS materia_nome,
                  m.descricao AS materia_descricao
                FROM classe c
                LEFT JOIN materia m ON m.id = c.materia_id
                WHERE c.id = :classe_id
                LIMIT 1
                """
            ),
            {"classe_id": classe_id},
        )
        classe = classe_result.mappings().first()
        if not classe:
            return None

        topicos_result = await self.session.execute(
            text(
                """
                SELECT
                  t.id,
                  t.nome,
                  t.descricao,
                  t.ordem
                FROM topicos t
                WHERE t.classe_id = :classe_id
                ORDER BY t.ordem NULLS LAST, t.id
                LIMIT 120
                """
            ),
            {"classe_id": classe_id},
        )

        return {
            "classe_id": int(classe["classe_id"]),
            "classe_descricao": classe.get("classe_descricao"),
            "materia_id": classe.get("materia_id"),
            "materia_nome": classe.get("materia_nome"),
            "materia_descricao": classe.get("materia_descricao"),
            "topicos": [dict(row) for row in topicos_result.mappings()],
        }

    async def upsert(
        self,
        *,
        classe_id: int,
        world_name: str,
        world_subtitle: str | None,
        world_description: str | None,
        template_id: str | None,
        palette: dict[str, Any],
        countries: dict[str, Any],
    ) -> dict[str, Any]:
        if not await self._classe_mapa_tema_exists():
            raise RuntimeError("Tabela classe_mapa_tema indisponivel.")

        result = await self.session.execute(
            text(
                """
                INSERT INTO classe_mapa_tema (
                  classe_id,
                  world_name,
                  world_subtitle,
                  world_description,
                  template_id,
                  palette,
                  countries,
                  created_at,
                  updated_at
                )
                VALUES (
                  :classe_id,
                  :world_name,
                  :world_subtitle,
                  :world_description,
                  :template_id,
                  CAST(:palette AS JSONB),
                  CAST(:countries AS JSONB),
                  NOW(),
                  NOW()
                )
                ON CONFLICT (classe_id) DO UPDATE
                SET
                  world_name = EXCLUDED.world_name,
                  world_subtitle = EXCLUDED.world_subtitle,
                  world_description = EXCLUDED.world_description,
                  template_id = EXCLUDED.template_id,
                  palette = EXCLUDED.palette,
                  countries = EXCLUDED.countries,
                  updated_at = NOW()
                RETURNING
                  classe_id,
                  world_name,
                  world_subtitle,
                  world_description,
                  template_id,
                  palette,
                  countries,
                  created_at,
                  updated_at
                """
            ),
            {
                "classe_id": classe_id,
                "world_name": world_name,
                "world_subtitle": world_subtitle,
                "world_description": world_description,
                "template_id": template_id,
                "palette": json.dumps(palette or {}, ensure_ascii=False, default=str),
                "countries": json.dumps(countries or {}, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        return self._hydrate_record(dict(result.mappings().one()))

    async def buscar_por_classe_id(self, classe_id: int) -> dict[str, Any] | None:
        if not await self._classe_mapa_tema_exists():
            return None
        result = await self.session.execute(
            text(
                """
                SELECT
                  classe_id,
                  world_name,
                  world_subtitle,
                  world_description,
                  template_id,
                  palette,
                  countries,
                  created_at,
                  updated_at
                FROM classe_mapa_tema
                WHERE classe_id = :classe_id
                LIMIT 1
                """
            ),
            {"classe_id": classe_id},
        )
        row = result.mappings().first()
        return self._hydrate_record(dict(row)) if row else None

