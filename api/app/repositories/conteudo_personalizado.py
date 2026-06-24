import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.services.storage import BUCKET, build_public_storage_url


class ConteudoPersonalizadoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._column_cache: dict[str, bool] = {}
        self._public_base_url = (get_settings().supabase_url or "").strip()
        self._known_columns = {
            "ai_patch",
            "classe_id",
            "status",
            "source_hash",
            "updated_at",
        }

    @staticmethod
    def _normalize_json_field(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return {"raw": value}
        return value

    @staticmethod
    def _pick_string(*values: Any) -> str | None:
        for value in values:
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _normalize_profile_key(value: Any) -> str:
        normalized = str(value or "").strip().lower()
        aliases = {
            "socializer": "socializer",
            "socialiser": "socializer",
            "survivor": "survivor",
            "seeker": "seeker",
            "daredevil": "daredevil",
            "mastermind": "mastermind",
            "conqueror": "conqueror",
            "achiever": "achiever",
        }
        return aliases.get(normalized, normalized or "mastermind")

    @classmethod
    def _extract_profile_key_from_record(cls, item: dict[str, Any]) -> str:
        plano = item.get("plano") if isinstance(item.get("plano"), dict) else {}
        editorial_metadata = (
            plano.get("editorial_metadata")
            if isinstance(plano.get("editorial_metadata"), dict)
            else {}
        )
        perfil_editorial = (
            editorial_metadata.get("perfil_editorial")
            if isinstance(editorial_metadata.get("perfil_editorial"), dict)
            else {}
        )
        modelo_editorial = (
            editorial_metadata.get("modelo_editorial")
            if isinstance(editorial_metadata.get("modelo_editorial"), dict)
            else {}
        )
        personalizacao_brainhex = (
            modelo_editorial.get("personalizacao_brainhex")
            if isinstance(modelo_editorial.get("personalizacao_brainhex"), dict)
            else {}
        )
        perfil = (
            item.get("perfil_dominante")
            or perfil_editorial.get("perfil_dominante")
            or personalizacao_brainhex.get("perfil_dominante")
            or plano.get("perfil_dominante")
        )
        return cls._normalize_profile_key(perfil)

    def _hydrate_materiais_urls(self, materiais: Any) -> Any:
        if not isinstance(materiais, dict):
            return materiais

        hydrated: dict[str, Any] = {}
        for tipo, material in materiais.items():
            if not isinstance(material, dict):
                hydrated[tipo] = material
                continue

            metadata = material.get("metadata") if isinstance(material.get("metadata"), dict) else {}
            metadata_dict: dict[str, Any] = dict(metadata or {})
            raw_url = self._pick_string(material.get("arquivo_url"))
            raw_storage_path = self._pick_string(material.get("storage_path"))
            is_http_url = bool(raw_url and raw_url.startswith(("http://", "https://")))
            path_candidate = raw_storage_path or (None if is_http_url else raw_url)
            bucket = self._pick_string(
                material.get("bucket"),
                metadata_dict.get("bucket"),
                metadata_dict.get("bucketName"),
                metadata_dict.get("storageBucket"),
                metadata_dict.get("storage_bucket"),
            )

            if path_candidate and not bucket:
                bucket = BUCKET

            resolved_url = raw_url if is_http_url else None
            resolved_storage_path = raw_storage_path or path_candidate
            if path_candidate and bucket:
                public_url = build_public_storage_url(self._public_base_url, bucket, path_candidate)
                if public_url:
                    resolved_url = public_url
                    resolved_storage_path = path_candidate
                    metadata_dict.setdefault("bucket", bucket)

            hydrated[tipo] = {
                **material,
                "arquivo_url": resolved_url,
                "storage_path": resolved_storage_path,
                "metadata": metadata_dict,
            }

        return hydrated

    def _hydrate_record(self, item: dict[str, Any]) -> dict[str, Any]:
        item["plano"] = self._normalize_json_field(item.get("plano"))
        item["materiais"] = self._hydrate_materiais_urls(self._normalize_json_field(item.get("materiais")))
        item["ai_patch"] = self._normalize_json_field(item.get("ai_patch"))
        item["brainhex_profile_key"] = self._extract_profile_key_from_record(item)
        return item

    async def _ensure_column_cache(self) -> None:
        if self._column_cache.get("__loaded__"):
            return

        try:
            result = await self.session.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'conteudo_personalizado'
                    """
                )
            )
        except Exception:
            for column in self._known_columns:
                self._column_cache[column] = True
            self._column_cache["__loaded__"] = True
            return

        detected: set[str] = set()
        try:
            for row in result.mappings():
                column_name = row.get("column_name")
                if isinstance(column_name, str):
                    detected.add(column_name)
        except Exception:
            detected = set()

        if detected:
            for column in self._known_columns:
                self._column_cache[column] = column in detected
        else:
            scalar_value = None
            try:
                scalar_value = result.scalar()
            except Exception:
                scalar_value = None

            fallback = bool(scalar_value) if scalar_value is not None else True
            for column in self._known_columns:
                self._column_cache[column] = fallback

        self._column_cache["__loaded__"] = True

    async def _table_has_column(self, column_name: str) -> bool:
        await self._ensure_column_cache()
        if column_name in self._column_cache:
            return self._column_cache[column_name]

        return False

    async def salvar(
        self,
        *,
        aluno_id: str,
        classe_id: int | None = None,
        conteudo_id: int | None = None,
        topico_id: int | None = None,
        ciclo_id: str,
        plano: dict[str, Any] | None = None,
        materiais: dict[str, Any],
        ai_patch: dict[str, Any] | None,
        status: str = "pronto",
        source_hash: str | None = None,
        formato_prioritario: str,
        formatos_gerados: list[str],
    ) -> int:
        has_ai_patch = await self._table_has_column("ai_patch")
        has_classe_id = await self._table_has_column("classe_id")
        has_status = await self._table_has_column("status")
        has_source_hash = await self._table_has_column("source_hash")
        has_updated_at = await self._table_has_column("updated_at")

        can_upsert = all((has_ai_patch, has_classe_id, has_status, has_source_hash, topico_id is not None))

        if can_upsert:
            statement = text(
                """
                INSERT INTO conteudo_personalizado (
                  aluno_id,
                  classe_id,
                  conteudo_id,
                  topico_id,
                  ciclo_id,
                  plano,
                  materiais,
                  ai_patch,
                  status,
                  source_hash,
                  formato_prioritario,
                  formatos_gerados,
                  updated_at
                )
                VALUES (
                  :aluno_id,
                  COALESCE(
                    :classe_id,
                    (SELECT t.classe_id FROM topicos t WHERE t.id = :topico_id),
                    (
                      SELECT t.classe_id
                      FROM conteudos c
                      JOIN topicos t ON t.id = c.topico_id
                      WHERE c.id = :conteudo_id
                    )
                  ),
                  :conteudo_id,
                  :topico_id,
                  :ciclo_id,
                  CAST(:plano AS JSONB),
                  CAST(:materiais AS JSONB),
                  CAST(:ai_patch AS JSONB),
                  :status,
                  :source_hash,
                  :formato_prioritario,
                  :formatos_gerados,
                  NOW()
                )
                ON CONFLICT (aluno_id, topico_id) DO UPDATE
                SET
                  classe_id = EXCLUDED.classe_id,
                  conteudo_id = EXCLUDED.conteudo_id,
                  ciclo_id = EXCLUDED.ciclo_id,
                  plano = EXCLUDED.plano,
                  materiais = EXCLUDED.materiais,
                  ai_patch = EXCLUDED.ai_patch,
                  status = EXCLUDED.status,
                  source_hash = EXCLUDED.source_hash,
                  formato_prioritario = EXCLUDED.formato_prioritario,
                  formatos_gerados = EXCLUDED.formatos_gerados,
                  gerado_em = NOW(),
                  updated_at = NOW()
                RETURNING id
                """
            )
        elif has_ai_patch:
            statement = text(
                """
                INSERT INTO conteudo_personalizado
                  (aluno_id, conteudo_id, topico_id, ciclo_id, plano, materiais, ai_patch,
                   formato_prioritario, formatos_gerados)
                VALUES
                  (:aluno_id, :conteudo_id, :topico_id, :ciclo_id, CAST(:plano AS JSONB), CAST(:materiais AS JSONB), CAST(:ai_patch AS JSONB),
                   :formato_prioritario, :formatos_gerados)
                RETURNING id
                """
            )
        else:
            statement = text(
                """
                INSERT INTO conteudo_personalizado
                  (aluno_id, conteudo_id, topico_id, ciclo_id, plano, materiais,
                   formato_prioritario, formatos_gerados)
                VALUES
                  (:aluno_id, :conteudo_id, :topico_id, :ciclo_id, CAST(:plano AS JSONB), CAST(:materiais AS JSONB),
                   :formato_prioritario, :formatos_gerados)
                RETURNING id
                """
            )

        result = await self.session.execute(
            statement,
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "conteudo_id": conteudo_id,
                "topico_id": topico_id,
                "ciclo_id": ciclo_id,
                "plano": json.dumps(plano, ensure_ascii=False, default=str),
                "materiais": json.dumps(materiais, ensure_ascii=False, default=str),
                "ai_patch": json.dumps(ai_patch, ensure_ascii=False, default=str) if ai_patch is not None else None,
                "status": status,
                "source_hash": source_hash,
                "formato_prioritario": formato_prioritario,
                "formatos_gerados": formatos_gerados,
            },
        )
        row_id: int = result.scalar_one()
        await self.session.commit()
        return row_id

    async def buscar_por_aluno(
        self,
        aluno_id: str,
        *,
        classe_id: int | None = None,
        conteudo_id: int | None = None,
        topico_id: int | None = None,
        statuses: list[str] | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        has_ai_patch = await self._table_has_column("ai_patch")
        has_classe_id = await self._table_has_column("classe_id")
        has_status = await self._table_has_column("status")
        has_source_hash = await self._table_has_column("source_hash")
        has_updated_at = await self._table_has_column("updated_at")

        ai_patch_sql = "ai_patch" if has_ai_patch else "NULL::jsonb AS ai_patch"
        classe_sql = "classe_id" if has_classe_id else "NULL::bigint AS classe_id"
        status_sql = "status" if has_status else "'pronto'::text AS status"
        source_hash_sql = "source_hash" if has_source_hash else "NULL::text AS source_hash"
        updated_at_sql = "updated_at" if has_updated_at else "gerado_em AS updated_at"

        filters = "WHERE aluno_id = :aluno_id"
        params: dict[str, Any] = {"aluno_id": aluno_id, "limit": limit}
        if classe_id is not None and has_classe_id:
            filters += " AND classe_id = :classe_id"
            params["classe_id"] = classe_id
        if conteudo_id is not None:
            filters += " AND conteudo_id = :conteudo_id"
            params["conteudo_id"] = conteudo_id
        if topico_id is not None:
            filters += " AND topico_id = :topico_id"
            params["topico_id"] = topico_id
        if statuses and has_status:
            filters += " AND status = ANY(:statuses)"
            params["statuses"] = statuses

        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, {classe_sql}, conteudo_id, topico_id, ciclo_id,
                       plano, materiais, {ai_patch_sql}, {status_sql}, {source_hash_sql},
                       formato_prioritario, formatos_gerados, gerado_em, {updated_at_sql}
                FROM conteudo_personalizado
                {filters}
                ORDER BY COALESCE(updated_at, gerado_em) DESC, gerado_em DESC
                LIMIT :limit
                """
            ),
            params,
        )
        return [self._hydrate_record(dict(row)) for row in result.mappings()]

    async def buscar_por_perfil(
        self,
        *,
        classe_id: int,
        brainhex_profile_key: str,
        conteudo_id: int | None = None,
        topico_id: int | None = None,
        statuses: list[str] | None = None,
        source_hash: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        has_ai_patch = await self._table_has_column("ai_patch")
        has_classe_id = await self._table_has_column("classe_id")
        has_status = await self._table_has_column("status")
        has_source_hash = await self._table_has_column("source_hash")
        has_updated_at = await self._table_has_column("updated_at")

        ai_patch_sql = "ai_patch" if has_ai_patch else "NULL::jsonb AS ai_patch"
        classe_sql = "classe_id" if has_classe_id else "NULL::bigint AS classe_id"
        status_sql = "status" if has_status else "'pronto'::text AS status"
        source_hash_sql = "source_hash" if has_source_hash else "NULL::text AS source_hash"
        updated_at_sql = "updated_at" if has_updated_at else "gerado_em AS updated_at"

        filters = "WHERE classe_id = :classe_id" if has_classe_id else "WHERE 1 = 1"
        params: dict[str, Any] = {"classe_id": classe_id, "limit": max(1, min(limit, 200))}
        if conteudo_id is not None:
            filters += " AND conteudo_id = :conteudo_id"
            params["conteudo_id"] = conteudo_id
        if topico_id is not None:
            filters += " AND topico_id = :topico_id"
            params["topico_id"] = topico_id
        if statuses and has_status:
            filters += " AND status = ANY(:statuses)"
            params["statuses"] = statuses
        if source_hash and has_source_hash:
            filters += " AND source_hash = :source_hash"
            params["source_hash"] = source_hash

        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, {classe_sql}, conteudo_id, topico_id, ciclo_id,
                       plano, materiais, {ai_patch_sql}, {status_sql}, {source_hash_sql},
                       formato_prioritario, formatos_gerados, gerado_em, {updated_at_sql}
                FROM conteudo_personalizado
                {filters}
                ORDER BY COALESCE(updated_at, gerado_em) DESC, gerado_em DESC
                LIMIT :limit
                """
            ),
            params,
        )
        normalized_target = self._normalize_profile_key(brainhex_profile_key)
        hydrated = [self._hydrate_record(dict(row)) for row in result.mappings()]
        return [
            item
            for item in hydrated
            if self._normalize_profile_key(item.get("brainhex_profile_key")) == normalized_target
        ]

    async def buscar_mais_recente_por_perfil(
        self,
        *,
        classe_id: int,
        topico_id: int,
        brainhex_profile_key: str,
        source_hash: str | None = None,
    ) -> dict[str, Any] | None:
        records = await self.buscar_por_perfil(
            classe_id=classe_id,
            topico_id=topico_id,
            brainhex_profile_key=brainhex_profile_key,
            source_hash=source_hash,
            statuses=["pronto", "processando_midias", "failed_quality", "partial"],
            limit=25,
        )
        return records[0] if records else None

    async def existe_por_perfil_source_hash(
        self,
        *,
        classe_id: int,
        topico_id: int,
        brainhex_profile_key: str,
        source_hash: str,
    ) -> bool:
        record = await self.buscar_mais_recente_por_perfil(
            classe_id=classe_id,
            topico_id=topico_id,
            brainhex_profile_key=brainhex_profile_key,
            source_hash=source_hash,
        )
        return record is not None

    async def buscar_por_id(self, record_id: int) -> dict[str, Any] | None:
        has_ai_patch = await self._table_has_column("ai_patch")
        has_classe_id = await self._table_has_column("classe_id")
        has_status = await self._table_has_column("status")
        has_source_hash = await self._table_has_column("source_hash")
        has_updated_at = await self._table_has_column("updated_at")

        ai_patch_sql = "ai_patch" if has_ai_patch else "NULL::jsonb AS ai_patch"
        classe_sql = "classe_id" if has_classe_id else "NULL::bigint AS classe_id"
        status_sql = "status" if has_status else "'pronto'::text AS status"
        source_hash_sql = "source_hash" if has_source_hash else "NULL::text AS source_hash"
        updated_at_sql = "updated_at" if has_updated_at else "gerado_em AS updated_at"

        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, {classe_sql}, conteudo_id, topico_id, ciclo_id,
                       plano, materiais, {ai_patch_sql}, {status_sql}, {source_hash_sql},
                       formato_prioritario, formatos_gerados, gerado_em, {updated_at_sql}
                FROM conteudo_personalizado
                WHERE id = :id
                """
            ),
            {"id": record_id},
        )
        row = result.mappings().first()
        return self._hydrate_record(dict(row)) if row else None

    async def buscar_por_ciclo_id(self, *, aluno_id: str, ciclo_id: str) -> dict[str, Any] | None:
        has_ai_patch = await self._table_has_column("ai_patch")
        has_classe_id = await self._table_has_column("classe_id")
        has_status = await self._table_has_column("status")
        has_source_hash = await self._table_has_column("source_hash")
        has_updated_at = await self._table_has_column("updated_at")

        ai_patch_sql = "ai_patch" if has_ai_patch else "NULL::jsonb AS ai_patch"
        classe_sql = "classe_id" if has_classe_id else "NULL::bigint AS classe_id"
        status_sql = "status" if has_status else "'pronto'::text AS status"
        source_hash_sql = "source_hash" if has_source_hash else "NULL::text AS source_hash"
        updated_at_sql = "updated_at" if has_updated_at else "gerado_em AS updated_at"

        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, {classe_sql}, conteudo_id, topico_id, ciclo_id,
                       plano, materiais, {ai_patch_sql}, {status_sql}, {source_hash_sql},
                       formato_prioritario, formatos_gerados, gerado_em, {updated_at_sql}
                FROM conteudo_personalizado
                WHERE aluno_id = :aluno_id
                  AND ciclo_id = :ciclo_id
                ORDER BY gerado_em DESC
                LIMIT 1
                """
            ),
            {"aluno_id": aluno_id, "ciclo_id": ciclo_id},
        )
        row = result.mappings().first()
        return self._hydrate_record(dict(row)) if row else None

    async def atualizar_materiais_e_status(
        self,
        *,
        record_id: int,
        materiais: dict[str, Any],
        status: str | None = None,
        formatos_gerados: list[str] | None = None,
    ) -> dict[str, Any] | None:
        has_status = await self._table_has_column("status")
        has_updated_at = await self._table_has_column("updated_at")

        set_clauses = ["materiais = CAST(:materiais AS JSONB)"]
        params: dict[str, Any] = {
            "id": record_id,
            "materiais": json.dumps(materiais, ensure_ascii=False, default=str),
        }
        if formatos_gerados is not None:
            set_clauses.append("formatos_gerados = :formatos_gerados")
            params["formatos_gerados"] = formatos_gerados
        if has_status and status is not None:
            set_clauses.append("status = :status")
            params["status"] = status
        set_clauses.append("gerado_em = NOW()")
        if has_updated_at:
            set_clauses.append("updated_at = NOW()")

        result = await self.session.execute(
            text(
                f"""
                UPDATE conteudo_personalizado
                SET {', '.join(set_clauses)}
                WHERE id = :id
                RETURNING id
                """
            ),
            params,
        )
        row_id = result.scalar_one_or_none()
        await self.session.commit()
        if row_id is None:
            return None
        return await self.buscar_por_id(int(row_id))

    async def remover_por_aluno_classe(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int | None = None,
    ) -> None:
        if not await self._table_has_column("classe_id"):
            return
        await self.session.execute(
            text(
                """
                DELETE FROM conteudo_personalizado
                WHERE aluno_id = :aluno_id
                  AND classe_id = :classe_id
                  AND (CAST(:topico_id AS BIGINT) IS NULL OR topico_id = CAST(:topico_id AS BIGINT))
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id, "topico_id": topico_id},
        )
        await self.session.commit()
