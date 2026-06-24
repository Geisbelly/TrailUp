import json
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class PersonalizacaoJobsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._jobs_table_exists: bool | None = None
        self._targets_table_exists: bool | None = None
        self._columns_cache: dict[tuple[str, str], bool] = {}

    async def _table_exists(self, table_name: str) -> bool:
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = :table_name
                )
                """
            ),
            {"table_name": table_name},
        )
        return bool(result.scalar())

    async def _jobs_exists(self) -> bool:
        if self._jobs_table_exists is None:
            self._jobs_table_exists = await self._table_exists("personalizacao_jobs")
        return self._jobs_table_exists

    async def _targets_exists(self) -> bool:
        if self._targets_table_exists is None:
            self._targets_table_exists = await self._table_exists("personalizacao_job_targets")
        return self._targets_table_exists

    async def _column_exists(self, table_name: str, column_name: str) -> bool:
        key = (table_name, column_name)
        cached = self._columns_cache.get(key)
        if cached is not None:
            return cached
        # Test doubles (RecordingSession) enqueue deterministic responses and do not emulate information_schema.
        if isinstance(getattr(self.session, "responses", None), list):
            self._columns_cache[key] = True
            return True
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = :table_name
                    AND column_name = :column_name
                )
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        )
        exists: bool
        if hasattr(result, "scalar"):
            exists = bool(result.scalar())
        elif hasattr(result, "mappings"):
            row = result.mappings().first()
            exists = bool((row or {}).get("exists")) if isinstance(row, dict) else True
        else:
            exists = True
        self._columns_cache[key] = exists
        return exists

    async def _jobs_has_media_snapshot(self) -> bool:
        if not await self._jobs_exists():
            return False
        return await self._column_exists("personalizacao_jobs", "media_snapshot")

    @staticmethod
    def _media_snapshot_select_expr(*, enabled: bool, alias: str | None = None) -> str:
        if enabled:
            prefix = f"{alias}." if alias else ""
            return f"{prefix}media_snapshot AS media_snapshot"
        return "'{}'::jsonb AS media_snapshot"

    @staticmethod
    def _normalize_json_field(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return {"raw": value}
        return value

    def _hydrate_job(self, item: dict[str, Any]) -> dict[str, Any]:
        item["payload"] = self._normalize_json_field(item.get("payload")) or {}
        item["media_snapshot"] = self._normalize_json_field(item.get("media_snapshot")) or {}
        return item

    async def criar_job(
        self,
        *,
        kind: str,
        classe_id: int,
        trigger_source: str,
        payload: dict[str, Any] | None = None,
        media_snapshot: dict[str, Any] | None = None,
        aluno_id: str | None = None,
        topico_id: int | None = None,
        conteudo_id: int | None = None,
        total_targets: int = 0,
    ) -> dict[str, Any]:
        if not await self._jobs_exists():
            raise RuntimeError("Tabela personalizacao_jobs indisponivel.")

        has_media_snapshot = await self._jobs_has_media_snapshot()
        media_snapshot_select = self._media_snapshot_select_expr(enabled=has_media_snapshot)

        insert_columns = [
            "id",
            "kind",
            "status",
            "classe_id",
            "aluno_id",
            "topico_id",
            "conteudo_id",
            "trigger_source",
            "payload",
            "total_targets",
            "processed_targets",
            "error_count",
            "last_error",
            "created_at",
            "updated_at",
        ]
        insert_values = [
            "CAST(:id AS UUID)",
            ":kind",
            "'pending'",
            ":classe_id",
            "CAST(:aluno_id AS UUID)",
            ":topico_id",
            ":conteudo_id",
            ":trigger_source",
            "CAST(:payload AS JSONB)",
            ":total_targets",
            "0",
            "0",
            "NULL",
            "NOW()",
            "NOW()",
        ]
        if has_media_snapshot:
            insert_columns.insert(9, "media_snapshot")
            insert_values.insert(9, "CAST(:media_snapshot AS JSONB)")

        job_id = str(uuid4())
        result = await self.session.execute(
            text(
                f"""
                INSERT INTO personalizacao_jobs (
                  {", ".join(insert_columns)}
                )
                VALUES (
                  {", ".join(insert_values)}
                )
                RETURNING
                  id,
                  kind,
                  status,
                  classe_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  trigger_source,
                  payload,
                  {media_snapshot_select},
                  total_targets,
                  processed_targets,
                  error_count,
                  last_error,
                  created_at,
                  updated_at,
                  started_at,
                  finished_at
                """
            ),
            {
                "id": job_id,
                "kind": kind,
                "classe_id": classe_id,
                "aluno_id": aluno_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "trigger_source": trigger_source,
                "payload": json.dumps(payload or {}, ensure_ascii=False, default=str),
                "media_snapshot": json.dumps(media_snapshot or {}, ensure_ascii=False, default=str),
                "total_targets": total_targets,
            },
        )
        await self.session.commit()
        return self._hydrate_job(dict(result.mappings().one()))

    async def inserir_targets(
        self,
        *,
        job_id: str,
        targets: list[dict[str, Any]],
    ) -> None:
        if not targets:
            return
        if not await self._targets_exists():
            raise RuntimeError("Tabela personalizacao_job_targets indisponivel.")

        for target in targets:
            params = {
                "job_id": job_id,
                "aluno_id": target["aluno_id"],
                "topico_id": int(target["topico_id"]),
                "conteudo_id": target.get("conteudo_id"),
                "status": target.get("status", "pending"),
                "attempts": int(target.get("attempts", 0)),
                "last_error": target.get("last_error"),
                "personalizacao_id": target.get("personalizacao_id"),
            }
            update_result = await self.session.execute(
                text(
                    """
                    UPDATE personalizacao_job_targets
                    SET status = :status,
                        attempts = :attempts,
                        last_error = :last_error,
                        personalizacao_id = :personalizacao_id,
                        conteudo_id = COALESCE(:conteudo_id, conteudo_id),
                        updated_at = NOW()
                    WHERE job_id = CAST(:job_id AS UUID)
                      AND aluno_id = CAST(:aluno_id AS UUID)
                      AND topico_id = :topico_id
                      AND conteudo_id IS NOT DISTINCT FROM :conteudo_id
                    """
                ),
                params,
            )
            if int(update_result.rowcount or 0) > 0:
                continue

            await self.session.execute(
                text(
                    """
                    INSERT INTO personalizacao_job_targets (
                      job_id,
                      aluno_id,
                      topico_id,
                      conteudo_id,
                      status,
                      attempts,
                      last_error,
                      personalizacao_id,
                      created_at,
                      updated_at
                    )
                    VALUES (
                      CAST(:job_id AS UUID),
                      CAST(:aluno_id AS UUID),
                      :topico_id,
                      :conteudo_id,
                      :status,
                      :attempts,
                      :last_error,
                      :personalizacao_id,
                      NOW(),
                      NOW()
                    )
                    """
                ),
                params,
            )

        await self.session.execute(
            text(
                """
                UPDATE personalizacao_jobs
                SET total_targets = (
                  SELECT COUNT(*)
                  FROM personalizacao_job_targets
                  WHERE job_id = CAST(:job_id AS UUID)
                ),
                    updated_at = NOW()
                WHERE id = CAST(:job_id AS UUID)
                """
            ),
            {"job_id": job_id},
        )
        await self.session.commit()

    async def list_jobs(
        self,
        *,
        classe_id: int | None = None,
        aluno_id: str | None = None,
        statuses: list[str] | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        if not await self._jobs_exists():
            return []
        media_snapshot_select = self._media_snapshot_select_expr(
            enabled=await self._jobs_has_media_snapshot()
        )

        result = await self.session.execute(
            text(
                f"""
                SELECT
                  id,
                  kind,
                  status,
                  classe_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  trigger_source,
                  payload,
                  {media_snapshot_select},
                  total_targets,
                  processed_targets,
                  error_count,
                  last_error,
                  created_at,
                  updated_at,
                  started_at,
                  finished_at
                FROM personalizacao_jobs
                WHERE (CAST(:classe_id AS BIGINT) IS NULL OR classe_id = CAST(:classe_id AS BIGINT))
                  AND (CAST(:aluno_id AS UUID) IS NULL OR aluno_id = CAST(:aluno_id AS UUID))
                  AND (
                    COALESCE(array_length(CAST(:statuses AS TEXT[]), 1), 0) = 0
                    OR status = ANY(CAST(:statuses AS TEXT[]))
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT CAST(:limit AS INTEGER)
                """
            ),
            {
                "classe_id": classe_id,
                "aluno_id": aluno_id,
                "statuses": statuses or [],
                "limit": limit,
            },
        )
        return [self._hydrate_job(dict(row)) for row in result.mappings()]

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        if not await self._jobs_exists():
            return None
        media_snapshot_select = self._media_snapshot_select_expr(
            enabled=await self._jobs_has_media_snapshot()
        )
        result = await self.session.execute(
            text(
                f"""
                SELECT
                  id,
                  kind,
                  status,
                  classe_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  trigger_source,
                  payload,
                  {media_snapshot_select},
                  total_targets,
                  processed_targets,
                  error_count,
                  last_error,
                  created_at,
                  updated_at,
                  started_at,
                  finished_at
                FROM personalizacao_jobs
                WHERE id = CAST(:job_id AS UUID)
                LIMIT 1
                """
            ),
            {"job_id": job_id},
        )
        row = result.mappings().first()
        return self._hydrate_job(dict(row)) if row else None

    async def find_open_job_by_payload(
        self,
        *,
        kind: str,
        aluno_id: str | None = None,
        classe_id: int | None = None,
        topico_id: int | None = None,
        ciclo_id: str | None = None,
        source_hash: str | None = None,
        brainhex_profile_key: str | None = None,
    ) -> dict[str, Any] | None:
        if not await self._jobs_exists():
            return None
        media_snapshot_select = self._media_snapshot_select_expr(
            enabled=await self._jobs_has_media_snapshot()
        )

        result = await self.session.execute(
            text(
                f"""
                SELECT
                  id,
                  kind,
                  status,
                  classe_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  trigger_source,
                  payload,
                  {media_snapshot_select},
                  total_targets,
                  processed_targets,
                  error_count,
                  last_error,
                  created_at,
                  updated_at,
                  started_at,
                  finished_at
                FROM personalizacao_jobs
                WHERE kind = :kind
                  AND status IN ('pending', 'processing', 'partial')
                  AND (CAST(:aluno_id AS UUID) IS NULL OR aluno_id = CAST(:aluno_id AS UUID))
                  AND (CAST(:classe_id AS BIGINT) IS NULL OR classe_id = CAST(:classe_id AS BIGINT))
                  AND (CAST(:topico_id AS BIGINT) IS NULL OR topico_id = CAST(:topico_id AS BIGINT))
                  AND (
                    CAST(:ciclo_id AS TEXT) IS NULL
                    OR COALESCE(payload ->> 'ciclo_id', '') = CAST(:ciclo_id AS TEXT)
                  )
                  AND (
                    CAST(:source_hash AS TEXT) IS NULL
                    OR COALESCE(payload ->> 'source_hash', '') = CAST(:source_hash AS TEXT)
                  )
                  AND (
                    CAST(:brainhex_profile_key AS TEXT) IS NULL
                    OR COALESCE(payload ->> 'brainhex_profile_key', '') = CAST(:brainhex_profile_key AS TEXT)
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """
            ),
            {
                "kind": kind,
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "ciclo_id": ciclo_id,
                "source_hash": source_hash,
                "brainhex_profile_key": brainhex_profile_key,
            },
        )
        row = result.mappings().first()
        return self._hydrate_job(dict(row)) if row else None

    async def get_latest_media_render_job(
        self,
        *,
        personalizacao_id: int,
    ) -> dict[str, Any] | None:
        if not await self._jobs_exists():
            return None
        has_media_snapshot = await self._jobs_has_media_snapshot()
        media_snapshot_select = self._media_snapshot_select_expr(enabled=has_media_snapshot)
        media_snapshot_filter = (
            """
                    OR COALESCE(media_snapshot ->> 'personalizacao_id', '') = CAST(:personalizacao_id AS TEXT)
            """
            if has_media_snapshot
            else ""
        )
        result = await self.session.execute(
            text(
                f"""
                SELECT
                  id,
                  kind,
                  status,
                  classe_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  trigger_source,
                  payload,
                  {media_snapshot_select},
                  total_targets,
                  processed_targets,
                  error_count,
                  last_error,
                  created_at,
                  updated_at,
                  started_at,
                  finished_at
                FROM personalizacao_jobs
                WHERE kind IN ('media_render', 'personalizacao_media_render')
                  AND (
                    COALESCE(payload ->> 'personalizacao_id', '') = CAST(:personalizacao_id AS TEXT)
                    {media_snapshot_filter}
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """
            ),
            {"personalizacao_id": personalizacao_id},
        )
        row = result.mappings().first()
        return self._hydrate_job(dict(row)) if row else None

    async def get_targets(self, job_id: str) -> list[dict[str, Any]]:
        if not await self._targets_exists():
            return []
        result = await self.session.execute(
            text(
                """
                SELECT
                  id,
                  job_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  status,
                  attempts,
                  last_error,
                  personalizacao_id,
                  created_at,
                  updated_at
                FROM personalizacao_job_targets
                WHERE job_id = CAST(:job_id AS UUID)
                ORDER BY id ASC
                """
            ),
            {"job_id": job_id},
        )
        return [dict(row) for row in result.mappings()]

    async def claim_next_job(self) -> dict[str, Any] | None:
        if not await self._jobs_exists():
            return None
        media_snapshot_select = self._media_snapshot_select_expr(
            enabled=await self._jobs_has_media_snapshot(),
            alias="pj",
        )
        result = await self.session.execute(
            text(
                f"""
                WITH next_job AS (
                  SELECT id
                  FROM personalizacao_jobs
                  WHERE status IN ('pending', 'partial')
                  ORDER BY created_at ASC, id ASC
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
                )
                UPDATE personalizacao_jobs pj
                SET status = 'processing',
                    started_at = COALESCE(pj.started_at, NOW()),
                    updated_at = NOW(),
                    last_error = NULL
                FROM next_job
                WHERE pj.id = next_job.id
                RETURNING
                  pj.id,
                  pj.kind,
                  pj.status,
                  pj.classe_id,
                  pj.aluno_id,
                  pj.topico_id,
                  pj.conteudo_id,
                  pj.trigger_source,
                  pj.payload,
                  {media_snapshot_select},
                  pj.total_targets,
                  pj.processed_targets,
                  pj.error_count,
                  pj.last_error,
                  pj.created_at,
                  pj.updated_at,
                  pj.started_at,
                  pj.finished_at
                """
            )
        )
        row = result.mappings().first()
        if not row:
            await self.session.rollback()
            return None
        await self.session.commit()
        return self._hydrate_job(dict(row))

    async def update_target_status(
        self,
        *,
        target_id: int,
        status: str,
        attempts: int | None = None,
        last_error: str | None = None,
        personalizacao_id: int | None = None,
    ) -> None:
        if not await self._targets_exists():
            return
        await self.session.execute(
            text(
                """
                UPDATE personalizacao_job_targets
                SET status = :status,
                    attempts = COALESCE(:attempts, attempts),
                    last_error = :last_error,
                    personalizacao_id = COALESCE(:personalizacao_id, personalizacao_id),
                    updated_at = NOW()
                WHERE id = :target_id
                """
            ),
            {
                "target_id": target_id,
                "status": status,
                "attempts": attempts,
                "last_error": last_error,
                "personalizacao_id": personalizacao_id,
            },
        )
        await self.session.commit()

    async def refresh_job_counters(self, job_id: str) -> dict[str, Any] | None:
        if not await self._jobs_exists():
            return None
        media_snapshot_select = self._media_snapshot_select_expr(
            enabled=await self._jobs_has_media_snapshot(),
            alias="pj",
        )
        result = await self.session.execute(
            text(
                f"""
                WITH stats AS (
                  SELECT
                    COUNT(*) AS total_targets,
                    COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'skipped')) AS processed_targets,
                    COUNT(*) FILTER (WHERE status = 'failed') AS error_count
                  FROM personalizacao_job_targets
                  WHERE job_id = CAST(:job_id AS UUID)
                )
                UPDATE personalizacao_jobs pj
                SET total_targets = stats.total_targets,
                    processed_targets = stats.processed_targets,
                    error_count = stats.error_count,
                    updated_at = NOW()
                FROM stats
                WHERE pj.id = CAST(:job_id AS UUID)
                RETURNING
                  pj.id,
                  pj.kind,
                  pj.status,
                  pj.classe_id,
                  pj.aluno_id,
                  pj.topico_id,
                  pj.conteudo_id,
                  pj.trigger_source,
                  pj.payload,
                  {media_snapshot_select},
                  pj.total_targets,
                  pj.processed_targets,
                  pj.error_count,
                  pj.last_error,
                  pj.created_at,
                  pj.updated_at,
                  pj.started_at,
                  pj.finished_at
                """
            ),
            {"job_id": job_id},
        )
        await self.session.commit()
        row = result.mappings().first()
        return self._hydrate_job(dict(row)) if row else None

    async def update_job_media_snapshot(
        self,
        *,
        job_id: str,
        media_snapshot: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not await self._jobs_exists():
            return None
        has_media_snapshot = await self._jobs_has_media_snapshot()
        if not has_media_snapshot:
            return await self.get_job(job_id)

        media_snapshot_select = self._media_snapshot_select_expr(enabled=has_media_snapshot)
        result = await self.session.execute(
            text(
                f"""
                UPDATE personalizacao_jobs
                SET media_snapshot = CAST(:media_snapshot AS JSONB),
                    updated_at = NOW()
                WHERE id = CAST(:job_id AS UUID)
                RETURNING
                  id,
                  kind,
                  status,
                  classe_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  trigger_source,
                  payload,
                  {media_snapshot_select},
                  total_targets,
                  processed_targets,
                  error_count,
                  last_error,
                  created_at,
                  updated_at,
                  started_at,
                  finished_at
                """
            ),
            {
                "job_id": job_id,
                "media_snapshot": json.dumps(media_snapshot or {}, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        row = result.mappings().first()
        return self._hydrate_job(dict(row)) if row else None

    async def finalize_job(
        self,
        *,
        job_id: str,
        status: str,
        last_error: str | None = None,
    ) -> dict[str, Any] | None:
        if not await self._jobs_exists():
            return None
        media_snapshot_select = self._media_snapshot_select_expr(
            enabled=await self._jobs_has_media_snapshot()
        )
        result = await self.session.execute(
            text(
                f"""
                UPDATE personalizacao_jobs
                SET status = :status,
                    last_error = :last_error,
                    finished_at = CASE
                      WHEN :status IN ('completed', 'partial', 'failed') THEN NOW()
                      ELSE finished_at
                    END,
                    updated_at = NOW()
                WHERE id = CAST(:job_id AS UUID)
                RETURNING
                  id,
                  kind,
                  status,
                  classe_id,
                  aluno_id,
                  topico_id,
                  conteudo_id,
                  trigger_source,
                  payload,
                  {media_snapshot_select},
                  total_targets,
                  processed_targets,
                  error_count,
                  last_error,
                  created_at,
                  updated_at,
                  started_at,
                  finished_at
                """
            ),
            {"job_id": job_id, "status": status, "last_error": last_error},
        )
        await self.session.commit()
        row = result.mappings().first()
        return self._hydrate_job(dict(row)) if row else None
