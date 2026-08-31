from collections.abc import Sequence

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

    _INSERT = """
        INSERT INTO eventos_aluno (aluno_id, tipo, referencia, valor)
        VALUES (:aluno_id, :tipo, :referencia, :valor)
    """

    def _linha(
        self,
        aluno_id: str,
        tipo: str,
        referencia: str | int | None,
        valor: float | None,
    ) -> dict[str, object | None]:
        sanitized_reference = self._sanitize_reference(tipo, referencia)
        if sanitized_reference is not None:
            sanitized_reference = str(sanitized_reference)
        return {
            "aluno_id": aluno_id,
            "tipo": tipo,
            "referencia": sanitized_reference,
            "valor": valor,
        }

    async def log_muitos(
        self,
        aluno_id: str,
        eventos: Sequence[tuple[str, str | int | None, float | None]],
    ) -> None:
        """Grava vários eventos num `execute` só (executemany do driver).

        `log` continua existindo e intocado para quem grava um evento avulso.
        Isto serve ao lote de telemetria, onde os eventos vinham um por
        `execute` — e o Supabase é remoto, então cada ida e volta custa latência
        dentro da requisição que também roda o pipeline de análise.
        """
        if not eventos:
            return

        linhas = [
            self._linha(aluno_id, tipo, referencia, valor)
            for tipo, referencia, valor in eventos
        ]
        await self.session.execute(
            text(self._INSERT).bindparams(bindparam("referencia", type_=String)),
            linhas,
        )

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
