from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class AccessRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def resolve_user_identity(self, user_id: str) -> dict | None:
        result = await self.session.execute(
            text(
                """
                SELECT
                  EXISTS (SELECT 1 FROM alunos WHERE id = :user_id) AS is_aluno,
                  EXISTS (SELECT 1 FROM professor WHERE id = :user_id) AS is_professor,
                  COALESCE((SELECT liberado FROM professor WHERE id = :user_id), FALSE) AS professor_liberado
                """
            ),
            {"user_id": user_id},
        )
        row = result.mappings().one()
        is_aluno = bool(row["is_aluno"])
        is_professor = bool(row["is_professor"])
        if not (is_aluno or is_professor):
            return None

        return {
            "role": "aluno" if is_aluno else "professor",
            "is_aluno": is_aluno,
            "is_professor": is_professor,
            "liberado": bool(row["professor_liberado"]) if is_professor else True,
        }

    async def resolve_user_role(self, user_id: str) -> str | None:
        identity = await self.resolve_user_identity(user_id)
        return identity["role"] if identity else None

    async def professor_can_access(self, professor_id: str, aluno_id: str) -> bool:
        direct_result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM professor_aluno
                  WHERE professor_id = :professor_id
                    AND aluno_id = :aluno_id
                    AND has_acesso = TRUE
                ) AS allowed
                """
            ),
            {"professor_id": professor_id, "aluno_id": aluno_id},
        )
        if bool(direct_result.scalar()):
            return True

        owned_class_result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM classe c
                  JOIN classe_aluno ca ON ca.classe_id = c.id
                  WHERE c.professor_id = :professor_id
                    AND ca.aluno_id = :aluno_id
                ) AS allowed
                """
            ),
            {"professor_id": professor_id, "aluno_id": aluno_id},
        )
        return bool(owned_class_result.scalar())

    async def professor_owns_classe(self, professor_id: str, classe_id: int) -> bool:
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM classe
                  WHERE id = :classe_id
                    AND professor_id = :professor_id
                ) AS allowed
                """
            ),
            {"professor_id": professor_id, "classe_id": classe_id},
        )
        return bool(result.scalar())

    async def aluno_belongs_to_classe(self, aluno_id: str, classe_id: int) -> bool:
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM classe_aluno
                  WHERE aluno_id = :aluno_id
                    AND classe_id = :classe_id
                ) AS allowed
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        return bool(result.scalar())

    async def get_professor_profile(self, professor_id: str) -> dict | None:
        result = await self.session.execute(
            text(
                """
                SELECT id, liberado, instituicao, disciplina
                FROM professor
                WHERE id = :professor_id
                """
            ),
            {"professor_id": professor_id},
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def get_professor_access(self, professor_id: str, aluno_id: str) -> dict:
        direct_result = await self.session.execute(
            text(
                """
                SELECT COALESCE(has_acesso, FALSE) AS allowed
                FROM professor_aluno
                WHERE professor_id = :professor_id
                  AND aluno_id = :aluno_id
                """
            ),
            {"professor_id": professor_id, "aluno_id": aluno_id},
        )
        direct_row = direct_result.mappings().first()
        if direct_row and bool(direct_row["allowed"]):
            return {"possui_acesso": True, "acesso_origem": "professor_aluno"}

        class_result = await self.session.execute(
            text(
                """
                SELECT c.id AS classe_id
                FROM classe c
                JOIN classe_aluno ca ON ca.classe_id = c.id
                WHERE c.professor_id = :professor_id
                  AND ca.aluno_id = :aluno_id
                ORDER BY c.id
                LIMIT 1
                """
            ),
            {"professor_id": professor_id, "aluno_id": aluno_id},
        )
        class_row = class_result.mappings().first()
        if class_row:
            return {"possui_acesso": True, "acesso_origem": "classe"}

        return {"possui_acesso": False, "acesso_origem": None}

    async def list_accessible_students(self, professor_id: str) -> list[dict]:
        result = await self.session.execute(
            text(
                """
                WITH direct_access AS (
                  SELECT
                    a.id AS aluno_id,
                    a.nome,
                    a.email,
                    NULL::bigint AS classe_id,
                    NULL::text AS classe_descricao,
                    'professor_aluno' AS acesso_origem
                  FROM professor_aluno pa
                  JOIN alunos a ON a.id = pa.aluno_id
                  WHERE pa.professor_id = :professor_id
                    AND pa.has_acesso = TRUE
                ),
                class_access AS (
                  SELECT
                    a.id AS aluno_id,
                    a.nome,
                    a.email,
                    c.id AS classe_id,
                    c.descricao AS classe_descricao,
                    'classe' AS acesso_origem
                  FROM classe c
                  JOIN classe_aluno ca ON ca.classe_id = c.id
                  JOIN alunos a ON a.id = ca.aluno_id
                  WHERE c.professor_id = :professor_id
                ),
                merged AS (
                  SELECT * FROM direct_access
                  UNION ALL
                  SELECT * FROM class_access
                )
                SELECT DISTINCT ON (aluno_id)
                  aluno_id,
                  nome,
                  email,
                  classe_id,
                  classe_descricao,
                  acesso_origem
                FROM merged
                ORDER BY aluno_id, CASE acesso_origem WHEN 'professor_aluno' THEN 0 ELSE 1 END, classe_id NULLS LAST
                """
            ),
            {"professor_id": professor_id},
        )
        return [dict(row) for row in result.mappings()]

    async def list_admin_professors(self) -> list[dict]:
        result = await self.session.execute(
            text(
                """
                SELECT id AS professor_id, nome, descricao, instituicao, disciplina, liberado
                FROM professor
                ORDER BY COALESCE(nome, ''), id
                """
            )
        )
        return [dict(row) for row in result.mappings()]

    async def list_admin_students(self) -> list[dict]:
        result = await self.session.execute(
            text(
                """
                SELECT id AS aluno_id, nome, email
                FROM alunos
                ORDER BY COALESCE(nome, ''), id
                """
            )
        )
        return [dict(row) for row in result.mappings()]

    async def list_direct_professor_assignments(self) -> list[dict]:
        result = await self.session.execute(
            text(
                """
                SELECT
                  pa.professor_id,
                  a.id AS aluno_id,
                  a.nome,
                  a.email
                FROM professor_aluno pa
                JOIN alunos a ON a.id = pa.aluno_id
                WHERE pa.has_acesso = TRUE
                ORDER BY pa.professor_id, COALESCE(a.nome, ''), a.id
                """
            )
        )
        return [dict(row) for row in result.mappings()]

    async def professor_exists(self, professor_id: str) -> bool:
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM professor
                  WHERE id = :professor_id
                ) AS found
                """
            ),
            {"professor_id": professor_id},
        )
        return bool(result.scalar())

    async def aluno_exists(self, aluno_id: str) -> bool:
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM alunos
                  WHERE id = :aluno_id
                ) AS found
                """
            ),
            {"aluno_id": aluno_id},
        )
        return bool(result.scalar())

    async def set_professor_liberado(self, professor_id: str, liberado: bool) -> None:
        await self.session.execute(
            text(
                """
                UPDATE professor
                SET liberado = :liberado
                WHERE id = :professor_id
                """
            ),
            {"professor_id": professor_id, "liberado": liberado},
        )

    async def set_professor_student_access(
        self,
        professor_id: str,
        aluno_id: str,
        has_acesso: bool,
    ) -> None:
        await self.session.execute(
            text(
                """
                INSERT INTO professor_aluno (
                  professor_id,
                  aluno_id,
                  has_acesso
                )
                VALUES (
                  :professor_id,
                  :aluno_id,
                  :has_acesso
                )
                ON CONFLICT (professor_id, aluno_id)
                DO UPDATE SET has_acesso = EXCLUDED.has_acesso
                """
            ),
            {
                "professor_id": professor_id,
                "aluno_id": aluno_id,
                "has_acesso": has_acesso,
            },
        )
