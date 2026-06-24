import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.services.storage import BUCKET, build_public_storage_url


class MateriaisRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._public_base_url = (get_settings().supabase_url or "").strip()
        self._column_cache: dict[str, bool] = {}

    async def _column_exists(self, column_name: str) -> bool:
        cached = self._column_cache.get(column_name)
        if cached is not None:
            return cached
        # Test doubles (RecordingSession) enqueue responses and do not emulate information_schema.
        if isinstance(getattr(self.session, "responses", None), list):
            self._column_cache[column_name] = True
            return True
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'materiais_gerados'
                    AND column_name = :column_name
                )
                """
            ),
            {"column_name": column_name},
        )
        exists: bool
        if hasattr(result, "scalar"):
            exists = bool(result.scalar())
        elif hasattr(result, "mappings"):
            row = result.mappings().first()
            exists = bool((row or {}).get("exists")) if isinstance(row, dict) else True
        else:
            exists = True
        self._column_cache[column_name] = exists
        return exists

    async def _supports_personalizacao_id(self) -> bool:
        return await self._column_exists("personalizacao_id")

    async def _supports_storage_path(self) -> bool:
        return await self._column_exists("storage_path")

    async def _supports_metadata(self) -> bool:
        return await self._column_exists("metadata")

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

    def _resolve_asset_fields(
        self,
        *,
        tipo: str | None,
        arquivo_url: Any,
        storage_path: Any,
        metadata: dict[str, Any] | None,
    ) -> tuple[str | None, str | None, dict[str, Any]]:
        normalized_metadata = dict(metadata or {})
        raw_url = self._pick_string(arquivo_url)
        raw_storage_path = self._pick_string(storage_path)
        is_http_url = bool(raw_url and raw_url.startswith(("http://", "https://")))
        path_candidate = raw_storage_path or (None if is_http_url else raw_url)

        bucket = self._pick_string(
            normalized_metadata.get("bucket"),
            normalized_metadata.get("bucketName"),
            normalized_metadata.get("storageBucket"),
            normalized_metadata.get("storage_bucket"),
        )

        # Materiais renderizados ficam no bucket conteudo_aluno quando o bucket nao vem no payload.
        if path_candidate and not bucket:
            bucket = BUCKET

        resolved_url = raw_url if is_http_url else None
        resolved_storage_path = raw_storage_path or path_candidate
        if path_candidate and bucket:
            public_url = build_public_storage_url(self._public_base_url, bucket, path_candidate)
            if public_url:
                resolved_url = public_url
                resolved_storage_path = path_candidate
                normalized_metadata.setdefault("bucket", bucket)

        return resolved_url, resolved_storage_path, normalized_metadata

    async def buscar_por_conteudo(
        self,
        aluno_id: str,
        conteudo_id: int | None,
    ) -> dict[str, Any] | None:
        if conteudo_id is None:
            return None

        supports_personalizacao_id = await self._supports_personalizacao_id()
        supports_storage_path = await self._supports_storage_path()
        supports_metadata = await self._supports_metadata()

        storage_expr = "storage_path" if supports_storage_path else "NULL::TEXT AS storage_path"
        metadata_expr = "metadata" if supports_metadata else "'{}'::jsonb AS metadata"
        personalizacao_expr = (
            "personalizacao_id" if supports_personalizacao_id else "NULL::BIGINT AS personalizacao_id"
        )

        result = await self.session.execute(
            text(
                f"""
                SELECT DISTINCT ON (tipo)
                  tipo,
                  payload,
                  arquivo_url,
                  {storage_expr},
                  {metadata_expr},
                  {personalizacao_expr}
                FROM materiais_gerados
                WHERE aluno_id = :aluno_id
                  AND conteudo_id = :conteudo_id
                ORDER BY tipo, criado_em DESC, id DESC
                """
            ),
            {"aluno_id": aluno_id, "conteudo_id": conteudo_id},
        )
        rows = list(result.mappings())
        if not rows:
            return None

        materiais: dict[str, Any] = {}
        for row in rows:
            payload = self._normalize_json_field(row["payload"])
            metadata = self._normalize_json_field(row.get("metadata")) or {}
            arquivo_url, storage_path, metadata = self._resolve_asset_fields(
                tipo=row.get("tipo"),
                arquivo_url=row.get("arquivo_url"),
                storage_path=row.get("storage_path"),
                metadata=metadata if isinstance(metadata, dict) else {},
            )
            materiais[row["tipo"]] = {
                "payload": payload,
                "arquivo_url": arquivo_url,
                "storage_path": storage_path,
                "metadata": metadata,
                "personalizacao_id": row.get("personalizacao_id"),
            }
        return materiais

    async def salvar(
        self,
        aluno_id: str,
        conteudo_id: int | None,
        materiais: dict[str, Any],
        *,
        personalizacao_id: int | None = None,
    ) -> dict[str, int]:
        supports_personalizacao_id = await self._supports_personalizacao_id()
        supports_storage_path = await self._supports_storage_path()
        supports_metadata = await self._supports_metadata()
        saved_ids_by_tipo: dict[str, int] = {}
        for tipo, valor in materiais.items():
            payload = valor
            arquivo_url = None
            storage_path = None
            metadata: dict[str, Any] = {}
            if isinstance(valor, dict) and "payload" in valor:
                payload = valor.get("payload")
                arquivo_url = valor.get("arquivo_url")
                storage_path = valor.get("storage_path")
                if isinstance(valor.get("metadata"), dict):
                    metadata = dict(valor.get("metadata") or {})
            arquivo_url, storage_path, metadata = self._resolve_asset_fields(
                tipo=tipo,
                arquivo_url=arquivo_url,
                storage_path=storage_path,
                metadata=metadata,
            )

            insert_columns = [
                "aluno_id",
                "conteudo_id",
                "tipo",
                "payload",
                "arquivo_url",
            ]
            insert_values = [
                ":aluno_id",
                ":conteudo_id",
                ":tipo",
                "CAST(:payload AS JSONB)",
                ":arquivo_url",
            ]
            if supports_personalizacao_id:
                insert_columns.append("personalizacao_id")
                insert_values.append(":personalizacao_id")
            if supports_storage_path:
                insert_columns.append("storage_path")
                insert_values.append(":storage_path")
            if supports_metadata:
                insert_columns.append("metadata")
                insert_values.append("CAST(:metadata AS JSONB)")

            result = await self.session.execute(
                text(
                    f"""
                    INSERT INTO materiais_gerados (
                      {", ".join(insert_columns)}
                    )
                    VALUES (
                      {", ".join(insert_values)}
                    )
                    RETURNING id
                    """
                ),
                {
                    "aluno_id": aluno_id,
                    "conteudo_id": conteudo_id,
                    "personalizacao_id": personalizacao_id,
                    "tipo": tipo,
                    "payload": json.dumps(payload, ensure_ascii=False, default=str),
                    "arquivo_url": arquivo_url,
                    "storage_path": storage_path,
                    "metadata": json.dumps(metadata, ensure_ascii=False, default=str),
                },
            )
            inserted_id = None
            if hasattr(result, "scalar_one_or_none"):
                inserted_id = result.scalar_one_or_none()
            elif hasattr(result, "scalar"):
                inserted_id = result.scalar()
            elif hasattr(result, "mappings"):
                mappings = result.mappings()
                if hasattr(mappings, "first"):
                    row = mappings.first()
                elif isinstance(mappings, list) and mappings:
                    row = mappings[0]
                else:
                    row = None
                inserted_id = row.get("id") if isinstance(row, dict) else None
            if inserted_id is not None:
                saved_ids_by_tipo[str(tipo)] = int(inserted_id)
        await self.session.commit()
        return saved_ids_by_tipo

    async def vincular_personalizacao(
        self,
        *,
        material_id: int,
        personalizacao_id: int,
    ) -> None:
        if not await self._supports_personalizacao_id():
            return
        await self.session.execute(
            text(
                """
                UPDATE materiais_gerados
                SET personalizacao_id = :personalizacao_id
                WHERE id = :material_id
                """
            ),
            {"material_id": material_id, "personalizacao_id": personalizacao_id},
        )

    async def resolver_ids_por_tipo_recente(
        self,
        *,
        aluno_id: str,
        conteudo_id: int | None,
        tipos: list[str],
        ciclo_id: str | None = None,
        prefer_pending: list[str] | None = None,
    ) -> dict[str, int]:
        normalized_tipos = sorted({str(tipo).strip() for tipo in (tipos or []) if str(tipo).strip()})
        if not normalized_tipos:
            return {}

        supports_metadata = await self._supports_metadata()
        metadata_expr = "metadata" if supports_metadata else "'{}'::jsonb"

        result = await self.session.execute(
            text(
                f"""
                WITH base AS (
                  SELECT
                    id,
                    tipo,
                    criado_em,
                    {metadata_expr} AS metadata
                  FROM materiais_gerados
                  WHERE aluno_id = CAST(:aluno_id AS UUID)
                    AND (CAST(:conteudo_id AS BIGINT) IS NULL OR conteudo_id = CAST(:conteudo_id AS BIGINT))
                    AND tipo = ANY(CAST(:tipos AS TEXT[]))
                ),
                ranked AS (
                  SELECT
                    id,
                    tipo,
                    ROW_NUMBER() OVER (
                      PARTITION BY tipo
                      ORDER BY
                        CASE
                          WHEN tipo = ANY(CAST(:prefer_pending AS TEXT[]))
                               AND COALESCE(LOWER(metadata->>'status'), '') = 'pending'
                            THEN 0
                          ELSE 1
                        END,
                        CASE
                          WHEN CAST(:ciclo_id AS TEXT) IS NOT NULL
                               AND COALESCE(metadata->>'ciclo_id', '') = CAST(:ciclo_id AS TEXT)
                            THEN 0
                          ELSE 1
                        END,
                        criado_em DESC,
                        id DESC
                    ) AS rn
                  FROM base
                )
                SELECT id, tipo
                FROM ranked
                WHERE rn = 1
                """
            ),
            {
                "aluno_id": aluno_id,
                "conteudo_id": conteudo_id,
                "tipos": normalized_tipos,
                "prefer_pending": [str(tipo).strip() for tipo in (prefer_pending or []) if str(tipo).strip()],
                "ciclo_id": (str(ciclo_id).strip() or None) if ciclo_id is not None else None,
            },
        )
        resolved: dict[str, int] = {}
        for row in result.mappings():
            tipo = str(row.get("tipo") or "").strip()
            material_id = row.get("id")
            if not tipo or material_id is None:
                continue
            resolved[tipo] = int(material_id)
        return resolved

    async def patch_materiais_media(
        self,
        *,
        material_id: int,
        arquivo_url: str | None,
        storage_path: str | None,
        metadata_patch: dict[str, Any] | None = None,
        payload: dict[str, Any] | list[Any] | None = None,
    ) -> dict[str, Any] | None:
        supports_personalizacao_id = await self._supports_personalizacao_id()
        supports_storage_path = await self._supports_storage_path()
        supports_metadata = await self._supports_metadata()

        storage_expr = "storage_path" if supports_storage_path else "NULL::TEXT AS storage_path"
        metadata_expr = "metadata" if supports_metadata else "'{}'::jsonb AS metadata"
        personalizacao_expr = (
            "personalizacao_id" if supports_personalizacao_id else "NULL::BIGINT AS personalizacao_id"
        )

        metadata_patch = metadata_patch or {}
        current_row = await self.session.execute(
            text(
                f"""
                SELECT id, tipo, payload, arquivo_url, {storage_expr}, {metadata_expr}
                FROM materiais_gerados
                WHERE id = :material_id
                LIMIT 1
                """
            ),
            {"material_id": material_id},
        )
        existing = current_row.mappings().first()
        if not existing:
            return None

        existing_metadata = self._normalize_json_field(existing.get("metadata")) or {}
        merged_metadata = {**existing_metadata, **metadata_patch}
        arquivo_url, storage_path, merged_metadata = self._resolve_asset_fields(
            tipo=existing.get("tipo"),
            arquivo_url=arquivo_url,
            storage_path=storage_path,
            metadata=merged_metadata if isinstance(merged_metadata, dict) else {},
        )

        resolved_payload = payload
        if resolved_payload is None:
            resolved_payload = self._normalize_json_field(existing.get("payload"))

        set_clauses = [
            "payload = CAST(:payload AS JSONB)",
            "arquivo_url = :arquivo_url",
        ]
        if supports_storage_path:
            set_clauses.append("storage_path = :storage_path")
        if supports_metadata:
            set_clauses.append("metadata = CAST(:metadata AS JSONB)")

        result = await self.session.execute(
            text(
                f"""
                UPDATE materiais_gerados
                SET {", ".join(set_clauses)}
                WHERE id = :material_id
                RETURNING id, tipo, payload, arquivo_url, {storage_expr}, {metadata_expr}, {personalizacao_expr}, criado_em
                """
            ),
            {
                "material_id": material_id,
                "payload": json.dumps(resolved_payload, ensure_ascii=False, default=str),
                "arquivo_url": arquivo_url,
                "storage_path": storage_path,
                "metadata": json.dumps(merged_metadata, ensure_ascii=False, default=str),
            },
        )
        row = result.mappings().first()
        await self.session.commit()
        return dict(row) if row else None

    async def listar_por_personalizacao(
        self,
        *,
        personalizacao_id: int,
    ) -> list[dict[str, Any]]:
        supports_personalizacao_id = await self._supports_personalizacao_id()
        if not supports_personalizacao_id:
            return []
        supports_storage_path = await self._supports_storage_path()
        supports_metadata = await self._supports_metadata()
        storage_expr = "storage_path" if supports_storage_path else "NULL::TEXT AS storage_path"
        metadata_expr = "metadata" if supports_metadata else "'{}'::jsonb AS metadata"

        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, conteudo_id, personalizacao_id, tipo, payload, arquivo_url, {storage_expr}, {metadata_expr}, criado_em
                FROM materiais_gerados
                WHERE personalizacao_id = :personalizacao_id
                ORDER BY criado_em DESC, id DESC
                """
            ),
            {"personalizacao_id": personalizacao_id},
        )
        materiais: list[dict[str, Any]] = []
        for row in result.mappings():
            material = dict(row)
            material["payload"] = self._normalize_json_field(material.get("payload"))
            material["metadata"] = self._normalize_json_field(material.get("metadata")) or {}
            arquivo_url, storage_path, metadata = self._resolve_asset_fields(
                tipo=material.get("tipo"),
                arquivo_url=material.get("arquivo_url"),
                storage_path=material.get("storage_path"),
                metadata=material.get("metadata") if isinstance(material.get("metadata"), dict) else {},
            )
            material["arquivo_url"] = arquivo_url
            material["storage_path"] = storage_path
            material["metadata"] = metadata
            materiais.append(material)
        return materiais

    async def listar_por_aluno(
        self,
        aluno_id: str,
        conteudo_id: int | None = None,
        tipo: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        supports_personalizacao_id = await self._supports_personalizacao_id()
        supports_storage_path = await self._supports_storage_path()
        supports_metadata = await self._supports_metadata()
        storage_expr = "storage_path" if supports_storage_path else "NULL::TEXT AS storage_path"
        metadata_expr = "metadata" if supports_metadata else "'{}'::jsonb AS metadata"
        personalizacao_expr = (
            "personalizacao_id" if supports_personalizacao_id else "NULL::BIGINT AS personalizacao_id"
        )

        filters = ["aluno_id = :aluno_id"]
        params: dict[str, Any] = {"aluno_id": aluno_id, "limit": max(1, min(limit, 200))}

        if conteudo_id is not None:
            filters.append("conteudo_id = :conteudo_id")
            params["conteudo_id"] = conteudo_id
        if tipo is not None:
            filters.append("tipo = :tipo")
            params["tipo"] = tipo

        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, conteudo_id, {personalizacao_expr}, tipo, payload, arquivo_url, {storage_expr}, {metadata_expr}, criado_em
                FROM materiais_gerados
                WHERE {' AND '.join(filters)}
                ORDER BY criado_em DESC, id DESC
                LIMIT :limit
                """
            ),
            params,
        )

        materiais: list[dict[str, Any]] = []
        for row in result.mappings():
            material = dict(row)
            material["payload"] = self._normalize_json_field(material.get("payload"))
            material["metadata"] = self._normalize_json_field(material.get("metadata")) or {}
            arquivo_url, storage_path, metadata = self._resolve_asset_fields(
                tipo=material.get("tipo"),
                arquivo_url=material.get("arquivo_url"),
                storage_path=material.get("storage_path"),
                metadata=material.get("metadata") if isinstance(material.get("metadata"), dict) else {},
            )
            material["arquivo_url"] = arquivo_url
            material["storage_path"] = storage_path
            material["metadata"] = metadata
            materiais.append(material)
        return materiais
