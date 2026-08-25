import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class PersonalizacaoBlocosRepository:
    """Cache de conteudo por bloco, escopado a um job (ciclo de geracao).

    Nao guarda status proprio - quem decide o que ja rodou e o que falta e
    exclusivamente personalizacao_job_targets (os targets de
    enriquecimento/capitulo daquele block_id, no mesmo job_id). Esta tabela
    so segura o CONTEUDO produzido quando esses targets terminam completed.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _hydrate(row: dict[str, Any]) -> dict[str, Any]:
        item = dict(row)
        for field in ("enriched_payload", "slides"):
            value = item.get(field)
            if isinstance(value, str):
                try:
                    item[field] = json.loads(value)
                except (TypeError, ValueError):
                    item[field] = None
        return item

    async def upsert_enriquecimento(
        self,
        *,
        job_id: str,
        block_id: str,
        enriched_payload: dict[str, Any],
    ) -> dict[str, Any]:
        result = await self.session.execute(
            text(
                """
                INSERT INTO personalizacao_blocos_gerados (
                  job_id, block_id, enriched_payload, updated_at
                )
                VALUES (
                  CAST(:job_id AS UUID), :block_id, CAST(:enriched_payload AS JSONB), NOW()
                )
                ON CONFLICT (job_id, block_id) DO UPDATE
                SET enriched_payload = EXCLUDED.enriched_payload,
                    updated_at = NOW()
                RETURNING id, job_id, block_id, enriched_payload, markdown, audio_script, slides
                """
            ),
            {
                "job_id": job_id,
                "block_id": block_id,
                "enriched_payload": json.dumps(enriched_payload, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        return self._hydrate(dict(result.mappings().one()))

    async def upsert_capitulo(
        self,
        *,
        job_id: str,
        block_id: str,
        markdown: str,
        audio_script: str,
        slides: list[dict[str, Any]],
    ) -> dict[str, Any]:
        result = await self.session.execute(
            text(
                """
                INSERT INTO personalizacao_blocos_gerados (
                  job_id, block_id, markdown, audio_script, slides, updated_at
                )
                VALUES (
                  CAST(:job_id AS UUID), :block_id, :markdown, :audio_script, CAST(:slides AS JSONB), NOW()
                )
                ON CONFLICT (job_id, block_id) DO UPDATE
                SET markdown = EXCLUDED.markdown,
                    audio_script = EXCLUDED.audio_script,
                    slides = EXCLUDED.slides,
                    updated_at = NOW()
                RETURNING id, job_id, block_id, enriched_payload, markdown, audio_script, slides
                """
            ),
            {
                "job_id": job_id,
                "block_id": block_id,
                "markdown": markdown,
                "audio_script": audio_script,
                "slides": json.dumps(slides, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        return self._hydrate(dict(result.mappings().one()))

    async def listar_por_job(self, *, job_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT id, job_id, block_id, enriched_payload, markdown, audio_script, slides
                FROM personalizacao_blocos_gerados
                WHERE job_id = CAST(:job_id AS UUID)
                ORDER BY id ASC
                """
            ),
            {"job_id": job_id},
        )
        return [self._hydrate(dict(row)) for row in result.mappings()]
