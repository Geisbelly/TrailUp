from sqlalchemy import String, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession


class EventoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _infer_reference_prefix(tipo: str) -> str | None:
        normalized = str(tipo or "").strip().lower()
        if normalized.startswith("topico_"):
            return "topico"
        if normalized.startswith("conteudo_"):
            return "conteudo"
        if normalized.startswith("atividade_"):
            return "atividade"
        return None

    @staticmethod
    def _extract_numeric_reference(referencia: str | int | None) -> str | None:
        if referencia is None:
            return None
        normalized = str(referencia).strip()
        if not normalized:
            return None
        numeric_match = normalized.rsplit(":", 1)
        if len(numeric_match) == 2 and numeric_match[1].isdigit():
            return numeric_match[1]
        if normalized.isdigit():
            return normalized
        return None

    @classmethod
    def _sanitize_reference(cls, tipo: str, referencia: str | int | None) -> str | None:
        if referencia is None:
            return None
        normalized = str(referencia).strip()
        if not normalized:
            return None

        prefix = cls._infer_reference_prefix(tipo)
        numeric_reference = cls._extract_numeric_reference(normalized)

        if prefix is not None:
            return f"{prefix}:{numeric_reference}" if numeric_reference is not None else None

        if numeric_reference is not None:
            return numeric_reference

        return normalized

    async def log(
        self,
        aluno_id: str,
        tipo: str,
        referencia: str | int | None = None,
        valor: float | None = None,
    ) -> None:
        sanitized_reference = self._sanitize_reference(tipo, referencia)
        if sanitized_reference is not None:
            sanitized_reference = str(sanitized_reference)
        await self.session.execute(
            text(
                """
                INSERT INTO eventos_aluno (aluno_id, tipo, referencia, valor)
                VALUES (:aluno_id, :tipo, :referencia, :valor)
                """
            ).bindparams(bindparam("referencia", type_=String)),
            {
                "aluno_id": aluno_id,
                "tipo": tipo,
                "referencia": sanitized_reference,
                "valor": valor,
            },
        )
