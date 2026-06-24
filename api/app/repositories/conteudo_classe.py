import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ConteudoClasseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _normalize_profile_key(value: str | None) -> str:
        normalized = (value or "").strip().lower()
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

    async def listar_topicos_classe(self, classe_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT id, classe_id, nome, descricao, ordem
                FROM topicos
                WHERE classe_id = :classe_id
                ORDER BY ordem NULLS LAST, id
                """
            ),
            {"classe_id": classe_id},
        )
        return [dict(row._mapping) for row in result]

    async def listar_alunos_classe(self, classe_id: int) -> list[str]:
        result = await self.session.execute(
            text(
                """
                SELECT aluno_id
                FROM classe_aluno
                WHERE classe_id = :classe_id
                ORDER BY aluno_id
                """
            ),
            {"classe_id": classe_id},
        )
        return [str(row._mapping["aluno_id"]) for row in result if row._mapping.get("aluno_id") is not None]

    async def listar_alunos_classe_com_perfil_dominante(self, classe_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                WITH alunos_turma AS (
                  SELECT DISTINCT ca.aluno_id
                  FROM classe_aluno ca
                  WHERE ca.classe_id = :classe_id
                ),
                perfis_ordenados AS (
                  SELECT
                    ap.aluno_id,
                    p.nome AS perfil_nome,
                    ap.afinidade,
                    ROW_NUMBER() OVER (
                      PARTITION BY ap.aluno_id
                      ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
                    ) AS rn
                  FROM aluno_perfil ap
                  JOIN perfil p ON p.id = ap.perfil_id
                  JOIN alunos_turma at ON at.aluno_id = ap.aluno_id
                )
                SELECT
                  at.aluno_id,
                  po.perfil_nome,
                  po.afinidade
                FROM alunos_turma at
                LEFT JOIN perfis_ordenados po
                  ON po.aluno_id = at.aluno_id
                 AND po.rn = 1
                ORDER BY at.aluno_id
                """
            ),
            {"classe_id": classe_id},
        )
        alunos: list[dict[str, Any]] = []
        for row in result.mappings():
            aluno_id = row.get("aluno_id")
            if aluno_id is None:
                continue
            perfil_key = self._normalize_profile_key(str(row.get("perfil_nome") or "mastermind"))
            alunos.append(
                {
                    "aluno_id": str(aluno_id),
                    "perfil_dominante": perfil_key,
                    "afinidade": float(row.get("afinidade") or 0),
                }
            )
        return alunos

    async def resolve_topico_ids_por_conteudos(self, conteudo_ids: list[int]) -> list[int]:
        if not conteudo_ids:
            return []
        result = await self.session.execute(
            text(
                """
                SELECT DISTINCT topico_id
                FROM conteudos
                WHERE id = ANY(:conteudo_ids)
                ORDER BY topico_id
                """
            ),
            {"conteudo_ids": conteudo_ids},
        )
        return [int(row._mapping["topico_id"]) for row in result if row._mapping.get("topico_id") is not None]

    async def mapear_conteudos_por_topico(self, conteudo_ids: list[int]) -> dict[int, list[int]]:
        if not conteudo_ids:
            return {}
        result = await self.session.execute(
            text(
                """
                SELECT id, topico_id
                FROM conteudos
                WHERE id = ANY(:conteudo_ids)
                """
            ),
            {"conteudo_ids": conteudo_ids},
        )
        mapping: dict[int, list[int]] = {}
        for row in result:
            conteudo_id = row._mapping.get("id")
            topico_id = row._mapping.get("topico_id")
            if conteudo_id is None or topico_id is None:
                continue
            mapping.setdefault(int(topico_id), []).append(int(conteudo_id))
        return mapping

    async def buscar_conteudos_topico(self, topico_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT id, titulo, tipo, conteudo, ordem, metadata
                FROM conteudos
                WHERE topico_id = :topico_id
                ORDER BY ordem NULLS LAST, id
                LIMIT 20
                """
            ),
            {"topico_id": topico_id},
        )
        return [dict(row._mapping) for row in result]

    async def buscar_atividades_topico(self, topico_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT id, titulo, descricao, tipo, pontuacao_maxima, metadata
                FROM atividades
                WHERE topico_id = :topico_id
                ORDER BY id
                LIMIT 20
                """
            ),
            {"topico_id": topico_id},
        )
        return [dict(row._mapping) for row in result]

    async def buscar_cards_conteudo(self, conteudo_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT id, titulo, descricao, imagem_url, cor, ordem
                FROM cards
                WHERE conteudo_id = :conteudo_id
                ORDER BY ordem NULLS LAST, id
                LIMIT 30
                """
            ),
            {"conteudo_id": conteudo_id},
        )
        return [dict(row._mapping) for row in result]

    async def buscar_cards_topico(self, topico_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT
                  c.id,
                  c.conteudo_id,
                  c.titulo,
                  c.descricao,
                  c.imagem_url,
                  c.cor,
                  c.ordem
                FROM cards c
                JOIN conteudos ct ON ct.id = c.conteudo_id
                WHERE ct.topico_id = :topico_id
                ORDER BY ct.ordem NULLS LAST, c.ordem NULLS LAST, c.id
                LIMIT 200
                """
            ),
            {"topico_id": topico_id},
        )
        return [dict(row._mapping) for row in result]

    async def buscar_midias_topico(self, topico_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT
                  m.id,
                  m.conteudo_id,
                  m.tipo,
                  m.url,
                  m.legenda,
                  m.metadata,
                  m.ordem,
                  c.titulo AS conteudo_titulo
                FROM midias m
                JOIN conteudos c ON c.id = m.conteudo_id
                WHERE c.topico_id = :topico_id
                ORDER BY c.ordem NULLS LAST, m.ordem NULLS LAST, m.id
                LIMIT 80
                """
            ),
            {"topico_id": topico_id},
        )
        return [dict(row._mapping) for row in result]

    async def buscar_questoes_topico(self, topico_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT q.id, q.atividade_id, q.enunciado, q.tipo, q.nota_estabelecida
                FROM questoes q
                JOIN atividades a ON a.id = q.atividade_id
                WHERE a.topico_id = :topico_id
                ORDER BY q.atividade_id, q.id
                LIMIT 200
                """
            ),
            {"topico_id": topico_id},
        )
        return [dict(row._mapping) for row in result]

    async def buscar_topico(self, topico_id: int) -> dict[str, Any] | None:
        result = await self.session.execute(
            text("SELECT id, nome, descricao FROM topicos WHERE id = :id"),
            {"id": topico_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def buscar_topico_id_por_conteudo(self, conteudo_id: int) -> int | None:
        result = await self.session.execute(
            text("SELECT topico_id FROM conteudos WHERE id = :id"),
            {"id": conteudo_id},
        )
        value = result.scalar()
        return int(value) if value is not None else None

    async def atualizar_metadata_midia(self, midia_id: int, metadata: dict[str, Any]) -> None:
        await self.session.execute(
            text(
                """
                UPDATE midias
                SET metadata = CAST(:metadata AS JSONB)
                WHERE id = :midia_id
                """
            ),
            {"midia_id": midia_id, "metadata": json.dumps(metadata, ensure_ascii=False, default=str)},
        )
        await self.session.commit()

    async def atualizar_metadata_conteudo(self, conteudo_id: int, metadata: dict[str, Any]) -> None:
        await self.session.execute(
            text(
                """
                UPDATE conteudos
                SET metadata = CAST(:metadata AS JSONB)
                WHERE id = :conteudo_id
                """
            ),
            {"conteudo_id": conteudo_id, "metadata": json.dumps(metadata, ensure_ascii=False, default=str)},
        )
        await self.session.commit()

    async def buscar_classe_id_por_topico(self, topico_id: int) -> int | None:
        result = await self.session.execute(
            text("SELECT classe_id FROM topicos WHERE id = :id"),
            {"id": topico_id},
        )
        value = result.scalar()
        return int(value) if value is not None else None

    async def buscar_classe_id_por_conteudo(self, conteudo_id: int) -> int | None:
        result = await self.session.execute(
            text(
                """
                SELECT t.classe_id
                FROM conteudos c
                JOIN topicos t ON t.id = c.topico_id
                WHERE c.id = :id
                """
            ),
            {"id": conteudo_id},
        )
        value = result.scalar()
        return int(value) if value is not None else None
