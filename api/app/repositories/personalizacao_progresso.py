import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class PersonalizacaoProgressoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._table_exists: bool | None = None
        self._classe_aluno_camel_case: bool | None = None

    async def _progress_table_exists(self) -> bool:
        if self._table_exists is not None:
            return self._table_exists

        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = 'personalizacao_item_progresso'
                )
                """
            )
        )
        self._table_exists = bool(result.scalar())
        return self._table_exists

    async def _classe_aluno_uses_camel_case(self) -> bool:
        if self._classe_aluno_camel_case is not None:
            return self._classe_aluno_camel_case

        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'classe_aluno'
                    AND column_name = 'porcentagemConcluida'
                ) AS uses_camel_case
                """
            )
        )
        self._classe_aluno_camel_case = bool(result.scalar())
        return self._classe_aluno_camel_case

    @staticmethod
    def _normalize_json_field(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return {"raw": value}
        return value

    def _hydrate_record(self, item: dict[str, Any]) -> dict[str, Any]:
        item["metadata"] = self._normalize_json_field(item.get("metadata")) or {}
        return item

    async def upsert(
        self,
        *,
        personalizacao_id: int,
        aluno_id: str,
        classe_id: int,
        topico_id: int,
        item_key: str,
        item_kind: str,
        item_title: str,
        status: str,
        percentual_concluido: float,
        acertos_percentual: float | None,
        tempo_gasto_min: float | None,
        pontuacao_obtida: float | None,
        pontuacao_maxima: float | None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not await self._progress_table_exists():
            raise RuntimeError("Tabela personalizacao_item_progresso indisponivel.")

        result = await self.session.execute(
            text(
                """
                INSERT INTO personalizacao_item_progresso (
                  personalizacao_id,
                  aluno_id,
                  classe_id,
                  topico_id,
                  item_key,
                  item_kind,
                  item_title,
                  status,
                  percentual_concluido,
                  acertos_percentual,
                  tempo_gasto_min,
                  pontuacao_obtida,
                  pontuacao_maxima,
                  metadata,
                  completed_at,
                  updated_at
                )
                VALUES (
                  :personalizacao_id,
                  :aluno_id,
                  :classe_id,
                  :topico_id,
                  :item_key,
                  :item_kind,
                  :item_title,
                  :status,
                  :percentual_concluido,
                  :acertos_percentual,
                  :tempo_gasto_min,
                  :pontuacao_obtida,
                  :pontuacao_maxima,
                  CAST(:metadata AS JSONB),
                  CASE WHEN :status = 'concluido' THEN NOW() ELSE NULL END,
                  NOW()
                )
                ON CONFLICT (aluno_id, personalizacao_id, item_key) DO UPDATE
                SET
                  item_kind = EXCLUDED.item_kind,
                  item_title = EXCLUDED.item_title,
                  status = CASE
                    WHEN personalizacao_item_progresso.status = 'concluido' THEN personalizacao_item_progresso.status
                    ELSE EXCLUDED.status
                  END,
                  percentual_concluido = GREATEST(
                    COALESCE(personalizacao_item_progresso.percentual_concluido, 0),
                    COALESCE(EXCLUDED.percentual_concluido, 0)
                  ),
                  acertos_percentual = COALESCE(EXCLUDED.acertos_percentual, personalizacao_item_progresso.acertos_percentual),
                  tempo_gasto_min = COALESCE(personalizacao_item_progresso.tempo_gasto_min, 0) + COALESCE(EXCLUDED.tempo_gasto_min, 0),
                  pontuacao_obtida = GREATEST(
                    COALESCE(personalizacao_item_progresso.pontuacao_obtida, 0),
                    COALESCE(EXCLUDED.pontuacao_obtida, 0)
                  ),
                  pontuacao_maxima = COALESCE(EXCLUDED.pontuacao_maxima, personalizacao_item_progresso.pontuacao_maxima),
                  metadata = CAST(:metadata AS JSONB),
                  completed_at = CASE
                    WHEN personalizacao_item_progresso.completed_at IS NOT NULL THEN personalizacao_item_progresso.completed_at
                    WHEN EXCLUDED.status = 'concluido' THEN NOW()
                    ELSE NULL
                  END,
                  updated_at = NOW()
                RETURNING
                  id,
                  personalizacao_id,
                  aluno_id,
                  classe_id,
                  topico_id,
                  item_key,
                  item_kind,
                  item_title,
                  status,
                  percentual_concluido,
                  acertos_percentual,
                  tempo_gasto_min,
                  pontuacao_obtida,
                  pontuacao_maxima,
                  metadata,
                  completed_at,
                  updated_at
                """
            ),
            {
                "personalizacao_id": personalizacao_id,
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "item_key": item_key,
                "item_kind": item_kind,
                "item_title": item_title,
                "status": status,
                "percentual_concluido": max(0.0, min(100.0, float(percentual_concluido or 0))),
                "acertos_percentual": acertos_percentual,
                "tempo_gasto_min": max(0.0, float(tempo_gasto_min or 0)),
                "pontuacao_obtida": pontuacao_obtida,
                "pontuacao_maxima": pontuacao_maxima,
                "metadata": json.dumps(metadata or {}, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        return self._hydrate_record(dict(result.mappings().one()))

    async def atualizar_classe_aluno_snapshot(
        self,
        *,
        aluno_id: str,
        classe_id: int,
    ) -> None:
        if not await self._progress_table_exists():
            return

        stats_result = await self.session.execute(
            text(
                """
                SELECT
                  COUNT(*) AS total_itens,
                  COUNT(*) FILTER (WHERE status = 'concluido') AS itens_concluidos,
                  COUNT(*) FILTER (WHERE item_kind = 'activity' AND status = 'concluido') AS atividades_concluidas,
                  COALESCE(AVG(acertos_percentual), 0) AS acertos_media,
                  COALESCE(SUM(tempo_gasto_min), 0) AS tempo_total,
                  COALESCE(SUM(pontuacao_obtida), 0) AS pontos_obtidos,
                  COALESCE(SUM(pontuacao_maxima), 0) AS pontos_max
                FROM personalizacao_item_progresso
                WHERE aluno_id = CAST(:aluno_id AS UUID)
                  AND classe_id = :classe_id
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        stats = stats_result.mappings().first() or {}
        total_itens = float(stats.get("total_itens") or 0)
        itens_concluidos = float(stats.get("itens_concluidos") or 0)
        atividades_concluidas = int(stats.get("atividades_concluidas") or 0)
        acertos_media = float(stats.get("acertos_media") or 0)
        tempo_total = float(stats.get("tempo_total") or 0)
        pontos_obtidos = float(stats.get("pontos_obtidos") or 0)
        pontos_max = float(stats.get("pontos_max") or 0)

        percentual_concluido = (itens_concluidos / total_itens * 100.0) if total_itens > 0 else 0.0
        nota_media = (pontos_obtidos / pontos_max * 100.0) if pontos_max > 0 else acertos_media
        is_complete = total_itens > 0 and itens_concluidos >= total_itens

        use_camel = await self._classe_aluno_uses_camel_case()
        if use_camel:
            query = """
                INSERT INTO classe_aluno (
                  aluno_id,
                  classe_id,
                  "notaMedia",
                  "acertosPercentual",
                  "porcentagemConcluida",
                  "tempoGastoMin",
                  "atividadesConcluidas",
                  "isComplete",
                  updated_at
                )
                VALUES (
                  :aluno_id,
                  :classe_id,
                  :nota_media,
                  :acertos_media,
                  :percentual_concluido,
                  :tempo_total,
                  :atividades_concluidas,
                  :is_complete,
                  NOW()
                )
                ON CONFLICT (aluno_id, classe_id) DO UPDATE
                SET
                  "notaMedia" = EXCLUDED."notaMedia",
                  "acertosPercentual" = EXCLUDED."acertosPercentual",
                  "porcentagemConcluida" = EXCLUDED."porcentagemConcluida",
                  "tempoGastoMin" = EXCLUDED."tempoGastoMin",
                  "atividadesConcluidas" = EXCLUDED."atividadesConcluidas",
                  "isComplete" = EXCLUDED."isComplete",
                  updated_at = NOW()
                """
        else:
            query = """
                INSERT INTO classe_aluno (
                  aluno_id,
                  classe_id,
                  notamedia,
                  acertospercentual,
                  porcentagemconcluida,
                  tempogastomin,
                  atividadesconcluidas,
                  iscomplete,
                  updated_at
                )
                VALUES (
                  :aluno_id,
                  :classe_id,
                  :nota_media,
                  :acertos_media,
                  :percentual_concluido,
                  :tempo_total,
                  :atividades_concluidas,
                  :is_complete,
                  NOW()
                )
                ON CONFLICT (aluno_id, classe_id) DO UPDATE
                SET
                  notamedia = EXCLUDED.notamedia,
                  acertospercentual = EXCLUDED.acertospercentual,
                  porcentagemconcluida = EXCLUDED.porcentagemconcluida,
                  tempogastomin = EXCLUDED.tempogastomin,
                  atividadesconcluidas = EXCLUDED.atividadesconcluidas,
                  iscomplete = EXCLUDED.iscomplete,
                  updated_at = NOW()
                """

        await self.session.execute(
            text(query),
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "nota_media": nota_media,
                "acertos_media": acertos_media,
                "percentual_concluido": percentual_concluido,
                "tempo_total": tempo_total,
                "atividades_concluidas": atividades_concluidas,
                "is_complete": is_complete,
            },
        )

    async def listar_por_aluno(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        if not await self._progress_table_exists():
            return []

        result = await self.session.execute(
            text(
                """
                SELECT
                  id,
                  personalizacao_id,
                  aluno_id,
                  classe_id,
                  topico_id,
                  item_key,
                  item_kind,
                  item_title,
                  status,
                  percentual_concluido,
                  acertos_percentual,
                  tempo_gasto_min,
                  pontuacao_obtida,
                  pontuacao_maxima,
                  metadata,
                  completed_at,
                  updated_at
                FROM personalizacao_item_progresso
                WHERE aluno_id = :aluno_id
                  AND classe_id = :classe_id
                  AND (
                    CAST(:topico_id AS BIGINT) IS NULL
                    OR topico_id = CAST(:topico_id AS BIGINT)
                  )
                ORDER BY updated_at DESC, id DESC
                LIMIT CAST(:limit AS INTEGER)
                """
            ),
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "limit": limit,
            },
        )
        return [self._hydrate_record(dict(row)) for row in result.mappings()]

    async def buscar_item(
        self,
        *,
        aluno_id: str,
        personalizacao_id: int,
        item_key: str,
    ) -> dict[str, Any] | None:
        if not await self._progress_table_exists():
            return None

        result = await self.session.execute(
            text(
                """
                SELECT
                  id,
                  personalizacao_id,
                  aluno_id,
                  classe_id,
                  topico_id,
                  item_key,
                  item_kind,
                  item_title,
                  status,
                  percentual_concluido,
                  acertos_percentual,
                  tempo_gasto_min,
                  pontuacao_obtida,
                  pontuacao_maxima,
                  metadata,
                  completed_at,
                  updated_at
                FROM personalizacao_item_progresso
                WHERE aluno_id = :aluno_id
                  AND personalizacao_id = :personalizacao_id
                  AND item_key = :item_key
                LIMIT 1
                """
            ),
            {
                "aluno_id": aluno_id,
                "personalizacao_id": personalizacao_id,
                "item_key": item_key,
            },
        )
        row = result.mappings().first()
        if not row:
            return None
        return self._hydrate_record(dict(row))

    async def remover_por_aluno_classe(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int | None = None,
    ) -> int:
        if not await self._progress_table_exists():
            return 0

        result = await self.session.execute(
            text(
                """
                DELETE FROM personalizacao_item_progresso
                WHERE aluno_id = :aluno_id
                  AND classe_id = :classe_id
                  AND (
                    CAST(:topico_id AS BIGINT) IS NULL
                    OR topico_id = CAST(:topico_id AS BIGINT)
                  )
                """
            ),
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
            },
        )
        await self.session.commit()
        return int(result.rowcount or 0)
