import logging

from sqlalchemy import String, bindparam, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


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
            if numeric_reference is not None:
                return f"{prefix}:{numeric_reference}"
            # Sem id numerico a referencia NAO e descartada. Descartar era pior
            # que guardar: a view do rank falha em resolver a classe nos dois
            # casos, mas o `None` apagava tambem a identidade do evento -- ficava
            # uma linha em `eventos_aluno` sem nenhuma pista do que ela marcou.
            #
            # Medido em producao: 13 de 15 `conteudo_concluido` e 9 de 9
            # `conteudo_aberto` gravados com referencia nula, sem como saber a
            # que conteudo se referiam.
            return normalized

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

    async def log_marcador(
        self,
        aluno_id: str,
        tipo: str,
        referencia: str | int | None = None,
        valor: float | None = None,
    ) -> bool:
        """Grava e confirma um evento que só MARCA o andamento (ex.: `ciclo_iniciado`).

        Falha vira aviso, não exceção: a análise não depende da linha. Os gatilhos de
        `eventos_aluno` (conquistas, missões, moedas) rodam nesse INSERT, e um erro neles já
        abortou toda análise de um aluno (prêmio de conquista repetido, `20261120_01`).
        """
        try:
            await self.log(aluno_id=aluno_id, tipo=tipo, referencia=referencia, valor=valor)
            await self.session.commit()
            return True
        except SQLAlchemyError as exc:
            await self.session.rollback()
            logger.warning(
                "Falha ao gravar evento marcador: aluno_id=%s tipo=%s erro=%s",
                aluno_id,
                tipo,
                exc.__class__.__name__,
            )
            return False
