import logging

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

FUNCAO_INEXISTENTE = "42883"  # undefined_function


def _funcao_ausente(exc: BaseException) -> bool:
    orig = getattr(exc, "orig", None)
    codigo = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    return codigo == FUNCAO_INEXISTENTE


class EstudoRepository:
    """A API pergunta ao banco se a turma está com a personalização retida pelo estudo (#13).

    A regra (retida desde o registro em `estudo_coorte`; libera no corte, ou depois do fim na
    turma de comparação) mora em `estudo_coorte_retem` (20261102_05). A RLS esconde do aluno o
    material; a API só segura o que ela mesma entrega na hora: `POST /personalizar`, a sugestão de
    ordem e a adequação do ciclo de análise.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def personalizacao_retida(self, classe_id: int | None) -> bool:
        if not classe_id:
            return False
        consulta = text("SELECT public.estudo_personalizacao_retida(CAST(:classe_id AS BIGINT))")
        params = {"classe_id": int(classe_id)}
        try:
            if callable(getattr(self.session, "begin_nested", None)):
                # Savepoint: banco sem a 20261102_05 não pode abortar a transação de quem chama.
                async with self.session.begin_nested():
                    result = await self.session.execute(consulta, params)
            else:
                result = await self.session.execute(consulta, params)
        except DBAPIError as exc:
            if not _funcao_ausente(exc):
                raise
            # Sem a função não existe estudo registrado: nada a reter.
            logger.warning("estudo.trava_ausente: banco sem estudo_personalizacao_retida")
            return False
        return bool(result.scalar()) if result is not None else False
