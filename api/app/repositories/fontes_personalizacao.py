import json
from typing import Any

from sqlalchemy import BigInteger, Boolean, String, bindparam, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession


class FontesPersonalizacaoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._table_exists: bool | None = None
        self._conteudos_has_url_column: bool | None = None

    async def _fontes_table_exists(self) -> bool:
        if self._table_exists is not None:
            return self._table_exists

        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = 'fontes_personalizacao'
                )
                """
            )
        )
        self._table_exists = bool(result.scalar())
        return self._table_exists

    async def _conteudos_table_has_url_column(self) -> bool:
        if self._conteudos_has_url_column is not None:
            return self._conteudos_has_url_column

        try:
            result = await self.session.execute(
                text(
                    """
                    SELECT EXISTS (
                      SELECT 1
                      FROM information_schema.columns
                      WHERE table_schema = 'public'
                        AND table_name = 'conteudos'
                        AND column_name = 'url'
                    )
                    """
                )
            )
            self._conteudos_has_url_column = bool(result.scalar())
        except Exception:
            self._conteudos_has_url_column = False

        return self._conteudos_has_url_column

    @staticmethod
    def _conteudo_asset_ref_sql(*, has_conteudos_url: bool) -> str:
        conteudo_url_sql = "NULLIF(BTRIM(c.url), '')" if has_conteudos_url else "NULL::text"
        return (
            f"""
            COALESCE(
              {conteudo_url_sql},
              CASE
                WHEN LOWER(COALESCE(NULLIF(BTRIM(c.tipo), ''), '')) = 'arquivo'
                  THEN NULLIF(BTRIM(c.conteudo), '')
                ELSE NULL
              END
            )
            """
        )

    @staticmethod
    def _legacy_descricao_storage_path_sql() -> str:
        return (
            """
            CASE
              WHEN fp.origem = 'sync_conteudo'
               AND NULLIF(BTRIM(fp.descricao), '') IS NOT NULL
               AND NULLIF(BTRIM(fp.descricao), '') !~* '^https?://'
               AND NULLIF(BTRIM(fp.descricao), '') ~ '[/\\\\]'
                THEN NULLIF(BTRIM(fp.descricao), '')
              ELSE NULL
            END
            """
        )

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

    async def salvar(
        self,
        *,
        classe_id: int,
        topico_id: int | None,
        conteudo_id: int | None,
        aluno_id: str | None,
        professor_id: str | None,
        visibilidade: str,
        tipo: str,
        titulo: str | None,
        descricao: str | None,
        arquivo_url: str | None,
        storage_path: str | None,
        mime_type: str | None,
        nome_arquivo: str | None,
        tamanho_bytes: int | None,
        origem: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not await self._fontes_table_exists():
            raise RuntimeError("Tabela fontes_personalizacao indisponivel.")

        result = await self.session.execute(
            text(
                """
                INSERT INTO fontes_personalizacao (
                  classe_id,
                  topico_id,
                  conteudo_id,
                  aluno_id,
                  professor_id,
                  visibilidade,
                  tipo,
                  titulo,
                  descricao,
                  arquivo_url,
                  storage_path,
                  mime_type,
                  nome_arquivo,
                  tamanho_bytes,
                  origem,
                  metadata
                )
                VALUES (
                  :classe_id,
                  :topico_id,
                  :conteudo_id,
                  :aluno_id,
                  :professor_id,
                  :visibilidade,
                  :tipo,
                  :titulo,
                  :descricao,
                  :arquivo_url,
                  :storage_path,
                  :mime_type,
                  :nome_arquivo,
                  :tamanho_bytes,
                  :origem,
                  CAST(:metadata AS JSONB)
                )
                RETURNING
                  id,
                  classe_id,
                  topico_id,
                  conteudo_id,
                  aluno_id,
                  professor_id,
                  visibilidade,
                  tipo,
                  titulo,
                  descricao,
                  arquivo_url,
                  storage_path,
                  mime_type,
                  nome_arquivo,
                  tamanho_bytes,
                  origem,
                  metadata,
                  criado_em
                """
            ),
            {
                "classe_id": classe_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "aluno_id": aluno_id,
                "professor_id": professor_id,
                "visibilidade": visibilidade,
                "tipo": tipo,
                "titulo": titulo,
                "descricao": descricao,
                "arquivo_url": arquivo_url,
                "storage_path": storage_path,
                "mime_type": mime_type,
                "nome_arquivo": nome_arquivo,
                "tamanho_bytes": tamanho_bytes,
                "origem": origem,
                "metadata": json.dumps(metadata or {}, ensure_ascii=False, default=str),
            },
        )
        await self.session.commit()
        return self._hydrate_record(dict(result.mappings().one()))

    async def atualizar_enriquecimento(
        self,
        *,
        fonte_id: int,
        descricao: str | None = None,
        arquivo_url: str | None = None,
        storage_path: str | None = None,
        mime_type: str | None = None,
        nome_arquivo: str | None = None,
        tamanho_bytes: int | None = None,
        metadata_patch: dict[str, Any] | None = None,
    ) -> bool:
        if not await self._fontes_table_exists():
            return False

        metadata_payload = metadata_patch or None
        if (
            descricao is None
            and arquivo_url is None
            and storage_path is None
            and mime_type is None
            and nome_arquivo is None
            and tamanho_bytes is None
            and metadata_payload is None
        ):
            return False

        result = await self.session.execute(
            text(
                """
                UPDATE fontes_personalizacao
                SET
                  descricao = COALESCE(CAST(:descricao AS TEXT), descricao),
                  arquivo_url = COALESCE(CAST(:arquivo_url AS TEXT), arquivo_url),
                  storage_path = COALESCE(CAST(:storage_path AS TEXT), storage_path),
                  mime_type = COALESCE(CAST(:mime_type AS TEXT), mime_type),
                  nome_arquivo = COALESCE(CAST(:nome_arquivo AS TEXT), nome_arquivo),
                  tamanho_bytes = COALESCE(CAST(:tamanho_bytes AS BIGINT), tamanho_bytes),
                  metadata = CASE
                    WHEN CAST(:metadata_patch_present AS BOOLEAN) THEN COALESCE(metadata, '{}'::jsonb) || COALESCE(CAST(:metadata_patch AS JSONB), '{}'::jsonb)
                    ELSE COALESCE(metadata, '{}'::jsonb)
                  END
                WHERE id = CAST(:fonte_id AS BIGINT)
                  AND (
                    (CAST(:descricao AS TEXT) IS NOT NULL AND COALESCE(descricao, '') IS DISTINCT FROM CAST(:descricao AS TEXT))
                    OR (CAST(:arquivo_url AS TEXT) IS NOT NULL AND COALESCE(arquivo_url, '') IS DISTINCT FROM CAST(:arquivo_url AS TEXT))
                    OR (CAST(:storage_path AS TEXT) IS NOT NULL AND COALESCE(storage_path, '') IS DISTINCT FROM CAST(:storage_path AS TEXT))
                    OR (CAST(:mime_type AS TEXT) IS NOT NULL AND COALESCE(mime_type, '') IS DISTINCT FROM CAST(:mime_type AS TEXT))
                    OR (CAST(:nome_arquivo AS TEXT) IS NOT NULL AND COALESCE(nome_arquivo, '') IS DISTINCT FROM CAST(:nome_arquivo AS TEXT))
                    OR (CAST(:tamanho_bytes AS BIGINT) IS NOT NULL AND tamanho_bytes IS DISTINCT FROM CAST(:tamanho_bytes AS BIGINT))
                    OR (CAST(:metadata_patch_present AS BOOLEAN))
                  )
                RETURNING id
                """
            ).bindparams(
                bindparam("descricao", type_=String()),
                bindparam("arquivo_url", type_=String()),
                bindparam("storage_path", type_=String()),
                bindparam("mime_type", type_=String()),
                bindparam("nome_arquivo", type_=String()),
                bindparam("tamanho_bytes", type_=BigInteger()),
                bindparam("metadata_patch_present", type_=Boolean()),
                bindparam("metadata_patch", type_=JSONB),
                bindparam("fonte_id", type_=BigInteger()),
            ),
            {
                "fonte_id": int(fonte_id),
                "descricao": descricao,
                "arquivo_url": arquivo_url,
                "storage_path": storage_path,
                "mime_type": mime_type,
                "nome_arquivo": nome_arquivo,
                "tamanho_bytes": tamanho_bytes,
                "metadata_patch": metadata_payload,
                "metadata_patch_present": metadata_payload is not None,
            },
        )
        await self.session.commit()
        return bool(result.scalar())

    async def listar_para_contexto(
        self,
        *,
        classe_id: int,
        topico_id: int | None,
        conteudo_id: int | None,
        aluno_id: str,
        limit: int = 40,
    ) -> list[dict[str, Any]]:
        if not await self._fontes_table_exists():
            return []

        has_conteudos_url = await self._conteudos_table_has_url_column()
        conteudo_asset_ref_sql = self._conteudo_asset_ref_sql(has_conteudos_url=has_conteudos_url)
        legacy_descricao_storage_path_sql = self._legacy_descricao_storage_path_sql()

        result = await self.session.execute(
            text(
                f"""
                WITH params AS (
                  SELECT
                    CAST(:classe_id AS BIGINT) AS classe_id,
                    CAST(:aluno_id AS UUID) AS aluno_id,
                    CAST(:conteudo_id AS BIGINT) AS conteudo_id,
                    CAST(:topico_id AS BIGINT) AS topico_id
                )
                SELECT
                  fp.id,
                  ('fonte:' || fp.id::text) AS source_id,
                  fp.origem,
                  fp.classe_id,
                  fp.topico_id,
                  fp.conteudo_id,
                  fp.aluno_id,
                  fp.professor_id,
                  fp.visibilidade,
                  fp.tipo,
                  fp.titulo,
                  fp.descricao,
                  COALESCE(
                    fp.arquivo_url,
                    CASE
                      WHEN fp.origem = 'sync_conteudo' AND {conteudo_asset_ref_sql} ~* '^https?://' THEN {conteudo_asset_ref_sql}
                      WHEN fp.origem = 'sync_conteudo' AND NULLIF(BTRIM(fp.descricao), '') ~* '^https?://' THEN NULLIF(BTRIM(fp.descricao), '')
                      ELSE NULL
                    END
                  ) AS url,
                  COALESCE(
                    fp.arquivo_url,
                    CASE
                      WHEN fp.origem = 'sync_conteudo' AND {conteudo_asset_ref_sql} ~* '^https?://' THEN {conteudo_asset_ref_sql}
                      WHEN fp.origem = 'sync_conteudo' AND NULLIF(BTRIM(fp.descricao), '') ~* '^https?://' THEN NULLIF(BTRIM(fp.descricao), '')
                      ELSE NULL
                    END
                  ) AS arquivo_url,
                  COALESCE(
                    fp.storage_path,
                    CASE
                      WHEN fp.origem = 'sync_conteudo' AND {conteudo_asset_ref_sql} !~* '^https?://' THEN {conteudo_asset_ref_sql}
                      ELSE NULL
                    END,
                    {legacy_descricao_storage_path_sql}
                  ) AS storage_path,
                  CASE
                    WHEN fp.metadata->>'bucket' IS NOT NULL THEN fp.metadata->>'bucket'
                    WHEN fp.origem = 'sync_conteudo'
                      AND (
                        fp.storage_path IS NOT NULL
                        OR {legacy_descricao_storage_path_sql} IS NOT NULL
                        OR ({conteudo_asset_ref_sql} IS NOT NULL AND {conteudo_asset_ref_sql} !~* '^https?://')
                      )
                      THEN 'conteudos'
                    WHEN fp.storage_path IS NOT NULL THEN 'conteudo_aluno'
                    ELSE NULL
                  END AS bucket,
                  fp.mime_type,
                  fp.nome_arquivo,
                  fp.tamanho_bytes,
                  fp.metadata,
                  CASE
                    WHEN COALESCE(NULLIF(BTRIM(fp.descricao), ''), '') ~* '^https?://'
                      OR COALESCE(NULLIF(BTRIM(fp.descricao), ''), '') ~ '[/\\\\][^\\s]+\\.[a-z0-9]{2,5}$'
                      OR COALESCE(NULLIF(BTRIM(fp.descricao), ''), '') ~ '^[a-f0-9-]{8,}/\\d+/\\d+_.+\\.[a-z0-9]{2,5}$'
                      THEN COALESCE(NULLIF(BTRIM(fp.titulo), ''), NULLIF(BTRIM(c.titulo), ''))
                    ELSE COALESCE(NULLIF(BTRIM(fp.descricao), ''), NULLIF(BTRIM(fp.titulo), ''), NULLIF(BTRIM(c.titulo), ''))
                  END AS texto_base,
                  fp.criado_em
                FROM fontes_personalizacao fp
                LEFT JOIN conteudos c ON c.id = fp.conteudo_id
                CROSS JOIN params
                WHERE fp.classe_id = params.classe_id
                  AND (
                    fp.visibilidade = 'classe'
                    OR (fp.visibilidade = 'aluno' AND fp.aluno_id = params.aluno_id)
                  )
                  AND (
                    (params.conteudo_id IS NOT NULL AND fp.conteudo_id = params.conteudo_id)
                    OR (params.topico_id IS NOT NULL AND fp.conteudo_id IS NULL AND fp.topico_id = params.topico_id)
                    OR (fp.conteudo_id IS NULL AND fp.topico_id IS NULL)
                  )
                ORDER BY
                  CASE
                    WHEN params.conteudo_id IS NOT NULL AND fp.conteudo_id = params.conteudo_id THEN 0
                    WHEN params.topico_id IS NOT NULL AND fp.conteudo_id IS NULL AND fp.topico_id = params.topico_id THEN 1
                    ELSE 2
                  END,
                  fp.criado_em DESC,
                  fp.id DESC
                LIMIT CAST(:limit AS INTEGER)
                """
            ),
            {
                "classe_id": classe_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "aluno_id": aluno_id,
                "limit": limit,
            },
        )
        return [self._hydrate_record(dict(row)) for row in result.mappings()]

    async def seed_from_class_content(
        self,
        *,
        classe_id: int,
        topico_ids: list[int] | None = None,
    ) -> dict[str, int]:
        if not await self._fontes_table_exists():
            return {"conteudos": 0, "midias": 0, "total": 0}

        topicos = [int(item) for item in (topico_ids or []) if item is not None]
        has_conteudos_url = await self._conteudos_table_has_url_column()
        conteudo_asset_ref_sql = self._conteudo_asset_ref_sql(has_conteudos_url=has_conteudos_url)

        insert_conteudos = await self.session.execute(
            text(
                f"""
                WITH params AS (
                  SELECT
                    CAST(:classe_id AS BIGINT) AS classe_id,
                    CAST(:topico_ids AS BIGINT[]) AS topico_ids
                ),
                candidatos AS (
                  SELECT
                    c.id AS conteudo_id,
                    c.topico_id,
                    COALESCE(NULLIF(BTRIM(c.titulo), ''), ('Conteudo ' || c.id::text)) AS titulo,
                    CASE
                      WHEN LOWER(COALESCE(NULLIF(BTRIM(c.tipo), ''), '')) = 'arquivo'
                        THEN COALESCE(NULLIF(BTRIM(c.titulo), ''), ('Conteudo ' || c.id::text))
                      ELSE LEFT(COALESCE(NULLIF(BTRIM(c.conteudo), ''), NULLIF(BTRIM(c.titulo), ''), ''), 4000)
                    END AS descricao,
                    LOWER(COALESCE(NULLIF(BTRIM(c.tipo), ''), 'documento')) AS tipo,
                    {conteudo_asset_ref_sql} AS asset_ref
                  FROM conteudos c
                  JOIN topicos t ON t.id = c.topico_id
                  CROSS JOIN params
                  WHERE t.classe_id = params.classe_id
                    AND (
                      COALESCE(array_length(params.topico_ids, 1), 0) = 0
                      OR c.topico_id = ANY(params.topico_ids)
                    )
                )
                INSERT INTO fontes_personalizacao (
                  classe_id,
                  topico_id,
                  conteudo_id,
                  aluno_id,
                  professor_id,
                  visibilidade,
                  tipo,
                  titulo,
                  descricao,
                  arquivo_url,
                  storage_path,
                  mime_type,
                  nome_arquivo,
                  tamanho_bytes,
                  origem,
                  metadata
                )
                SELECT
                  CAST(:classe_id AS BIGINT),
                  c.topico_id,
                  c.conteudo_id,
                  NULL,
                  NULL,
                  'classe',
                  c.tipo,
                  c.titulo,
                  c.descricao,
                  CASE WHEN c.asset_ref ~* '^https?://' THEN c.asset_ref ELSE NULL END AS arquivo_url,
                  CASE WHEN c.asset_ref ~* '^https?://' THEN NULL ELSE c.asset_ref END AS storage_path,
                  NULL,
                  NULL,
                  NULL,
                  'sync_conteudo',
                  jsonb_build_object(
                    'source', 'sync_classe',
                    'bucket', 'conteudos',
                    'seeded', true
                  )
                FROM candidatos c
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM fontes_personalizacao fp
                  WHERE fp.classe_id = CAST(:classe_id AS BIGINT)
                    AND fp.visibilidade = 'classe'
                    AND fp.origem = 'sync_conteudo'
                    AND fp.conteudo_id = c.conteudo_id
                    AND fp.topico_id = c.topico_id
                    AND COALESCE(fp.titulo, '') = COALESCE(c.titulo, '')
                )
                """
            ),
            {"classe_id": classe_id, "topico_ids": topicos},
        )
        await self.session.execute(
            text(
                f"""
                WITH params AS (
                  SELECT
                    CAST(:classe_id AS BIGINT) AS classe_id,
                    CAST(:topico_ids AS BIGINT[]) AS topico_ids
                ),
                candidatos AS (
                  SELECT
                    c.id AS conteudo_id,
                    c.topico_id,
                    COALESCE(NULLIF(BTRIM(c.titulo), ''), ('Conteudo ' || c.id::text)) AS titulo,
                    CASE
                      WHEN LOWER(COALESCE(NULLIF(BTRIM(c.tipo), ''), '')) = 'arquivo'
                        THEN COALESCE(NULLIF(BTRIM(c.titulo), ''), ('Conteudo ' || c.id::text))
                      ELSE LEFT(COALESCE(NULLIF(BTRIM(c.conteudo), ''), NULLIF(BTRIM(c.titulo), ''), ''), 4000)
                    END AS descricao,
                    LOWER(COALESCE(NULLIF(BTRIM(c.tipo), ''), 'documento')) AS tipo,
                    {conteudo_asset_ref_sql} AS asset_ref
                  FROM conteudos c
                  JOIN topicos t ON t.id = c.topico_id
                  CROSS JOIN params
                  WHERE t.classe_id = params.classe_id
                    AND (
                      COALESCE(array_length(params.topico_ids, 1), 0) = 0
                      OR c.topico_id = ANY(params.topico_ids)
                    )
                )
                UPDATE fontes_personalizacao fp
                SET tipo = c.tipo,
                    titulo = c.titulo,
                    descricao = c.descricao,
                    arquivo_url = CASE WHEN c.asset_ref ~* '^https?://' THEN c.asset_ref ELSE NULL END,
                    storage_path = CASE WHEN c.asset_ref ~* '^https?://' THEN NULL ELSE c.asset_ref END,
                    metadata = COALESCE(fp.metadata, '{{}}'::jsonb) || jsonb_build_object(
                      'source', 'sync_classe',
                      'bucket', 'conteudos',
                      'seeded', true
                    )
                FROM candidatos c
                WHERE fp.classe_id = CAST(:classe_id AS BIGINT)
                  AND fp.visibilidade = 'classe'
                  AND fp.origem = 'sync_conteudo'
                  AND fp.conteudo_id = c.conteudo_id
                  AND fp.topico_id = c.topico_id
                  AND (
                    COALESCE(fp.tipo, '') IS DISTINCT FROM COALESCE(c.tipo, '')
                    OR COALESCE(fp.titulo, '') IS DISTINCT FROM COALESCE(c.titulo, '')
                    OR COALESCE(fp.descricao, '') IS DISTINCT FROM COALESCE(c.descricao, '')
                    OR COALESCE(fp.arquivo_url, '') IS DISTINCT FROM COALESCE(CASE WHEN c.asset_ref ~* '^https?://' THEN c.asset_ref ELSE NULL END, '')
                    OR COALESCE(fp.storage_path, '') IS DISTINCT FROM COALESCE(CASE WHEN c.asset_ref ~* '^https?://' THEN NULL ELSE c.asset_ref END, '')
                    OR COALESCE(fp.metadata->>'bucket', '') IS DISTINCT FROM 'conteudos'
                  )
                """
            ),
            {"classe_id": classe_id, "topico_ids": topicos},
        )

        insert_midias = await self.session.execute(
            text(
                """
                WITH params AS (
                  SELECT
                    CAST(:classe_id AS BIGINT) AS classe_id,
                    CAST(:topico_ids AS BIGINT[]) AS topico_ids
                ),
                candidatos AS (
                  SELECT
                    m.id AS midia_id,
                    c.id AS conteudo_id,
                    c.topico_id,
                    LOWER(COALESCE(NULLIF(BTRIM(m.tipo), ''), 'arquivo')) AS tipo,
                    COALESCE(NULLIF(BTRIM(m.legenda), ''), ('Midia ' || m.id::text)) AS titulo,
                    LEFT(COALESCE(NULLIF(BTRIM(m.legenda), ''), NULLIF(BTRIM(c.titulo), ''), ''), 2000) AS descricao,
                    NULLIF(BTRIM(m.url), '') AS url
                  FROM midias m
                  JOIN conteudos c ON c.id = m.conteudo_id
                  JOIN topicos t ON t.id = c.topico_id
                  CROSS JOIN params
                  WHERE t.classe_id = params.classe_id
                    AND (
                      COALESCE(array_length(params.topico_ids, 1), 0) = 0
                      OR c.topico_id = ANY(params.topico_ids)
                    )
                    AND NULLIF(BTRIM(m.url), '') IS NOT NULL
                )
                INSERT INTO fontes_personalizacao (
                  classe_id,
                  topico_id,
                  conteudo_id,
                  aluno_id,
                  professor_id,
                  visibilidade,
                  tipo,
                  titulo,
                  descricao,
                  arquivo_url,
                  storage_path,
                  mime_type,
                  nome_arquivo,
                  tamanho_bytes,
                  origem,
                  metadata
                )
                SELECT
                  CAST(:classe_id AS BIGINT),
                  c.topico_id,
                  c.conteudo_id,
                  NULL,
                  NULL,
                  'classe',
                  c.tipo,
                  c.titulo,
                  c.descricao,
                  CASE WHEN c.url ~* '^https?://' THEN c.url ELSE NULL END AS arquivo_url,
                  CASE WHEN c.url ~* '^https?://' THEN NULL ELSE c.url END AS storage_path,
                  NULL,
                  NULL,
                  NULL,
                  'sync_midia',
                  jsonb_build_object(
                    'source', 'sync_classe',
                    'bucket', 'conteudos',
                    'seeded', true
                  )
                FROM candidatos c
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM fontes_personalizacao fp
                  WHERE fp.classe_id = CAST(:classe_id AS BIGINT)
                    AND fp.visibilidade = 'classe'
                    AND fp.origem = 'sync_midia'
                    AND fp.conteudo_id = c.conteudo_id
                    AND fp.topico_id = c.topico_id
                    AND COALESCE(fp.arquivo_url, '') = COALESCE(CASE WHEN c.url ~* '^https?://' THEN c.url ELSE NULL END, '')
                    AND COALESCE(fp.storage_path, '') = COALESCE(CASE WHEN c.url ~* '^https?://' THEN NULL ELSE c.url END, '')
                )
                """
            ),
            {"classe_id": classe_id, "topico_ids": topicos},
        )
        await self.session.execute(
            text(
                """
                WITH params AS (
                  SELECT
                    CAST(:classe_id AS BIGINT) AS classe_id,
                    CAST(:topico_ids AS BIGINT[]) AS topico_ids
                ),
                candidatos AS (
                  SELECT
                    c.id AS conteudo_id,
                    c.topico_id,
                    LOWER(COALESCE(NULLIF(BTRIM(m.tipo), ''), 'arquivo')) AS tipo,
                    COALESCE(NULLIF(BTRIM(m.legenda), ''), ('Midia ' || m.id::text)) AS titulo,
                    LEFT(COALESCE(NULLIF(BTRIM(m.legenda), ''), NULLIF(BTRIM(c.titulo), ''), ''), 2000) AS descricao,
                    NULLIF(BTRIM(m.url), '') AS url
                  FROM midias m
                  JOIN conteudos c ON c.id = m.conteudo_id
                  JOIN topicos t ON t.id = c.topico_id
                  CROSS JOIN params
                  WHERE t.classe_id = params.classe_id
                    AND (
                      COALESCE(array_length(params.topico_ids, 1), 0) = 0
                      OR c.topico_id = ANY(params.topico_ids)
                    )
                    AND NULLIF(BTRIM(m.url), '') IS NOT NULL
                )
                UPDATE fontes_personalizacao fp
                SET tipo = c.tipo,
                    titulo = c.titulo,
                    descricao = c.descricao,
                    arquivo_url = CASE WHEN c.url ~* '^https?://' THEN c.url ELSE NULL END,
                    storage_path = CASE WHEN c.url ~* '^https?://' THEN NULL ELSE c.url END,
                    metadata = COALESCE(fp.metadata, '{}'::jsonb) || jsonb_build_object(
                      'source', 'sync_classe',
                      'bucket', 'conteudos',
                      'seeded', true
                    )
                FROM candidatos c
                WHERE fp.classe_id = CAST(:classe_id AS BIGINT)
                  AND fp.visibilidade = 'classe'
                  AND fp.origem = 'sync_midia'
                  AND fp.conteudo_id = c.conteudo_id
                  AND fp.topico_id = c.topico_id
                  AND (
                    COALESCE(fp.tipo, '') IS DISTINCT FROM COALESCE(c.tipo, '')
                    OR COALESCE(fp.titulo, '') IS DISTINCT FROM COALESCE(c.titulo, '')
                    OR COALESCE(fp.descricao, '') IS DISTINCT FROM COALESCE(c.descricao, '')
                    OR COALESCE(fp.arquivo_url, '') IS DISTINCT FROM COALESCE(CASE WHEN c.url ~* '^https?://' THEN c.url ELSE NULL END, '')
                    OR COALESCE(fp.storage_path, '') IS DISTINCT FROM COALESCE(CASE WHEN c.url ~* '^https?://' THEN NULL ELSE c.url END, '')
                    OR COALESCE(fp.metadata->>'bucket', '') IS DISTINCT FROM 'conteudos'
                  )
                """
            ),
            {"classe_id": classe_id, "topico_ids": topicos},
        )

        await self.session.commit()
        conteudos_count = max(0, int(getattr(insert_conteudos, "rowcount", 0) or 0))
        midias_count = max(0, int(getattr(insert_midias, "rowcount", 0) or 0))
        return {
            "conteudos": conteudos_count,
            "midias": midias_count,
            "total": conteudos_count + midias_count,
        }
