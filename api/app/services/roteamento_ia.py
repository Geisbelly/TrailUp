"""Roteamento de IA por idade do aluno (#195).

Regra de produto: **menor de 18 usa o app normalmente, mas toda a IA dele vai
para a OpenAI, nunca para o Gemini.** Os termos da API do Gemini/Vertex nao
aceitam app usado por menor de 18; a OpenAI tem diretriz para isso.

- Adulto confirmado (`public.aluno_eh_menor(...) IS FALSE`, data de nascimento
  da #613 em `aluno_nascimento`) -> provedor atual (`settings.llm_provider`).
- Menor, data desconhecida, aluno sem id ou consulta que falhou -> OpenAI.
  Fail-closed: na duvida, trata como menor.
- Fluxo de turma (insights, escriba): basta UM aluno nao confirmado adulto para
  a chamada inteira ir para a OpenAI.
- Na rota de menor nao existe fallback para o Gemini. Se a OpenAI falhar (ou
  nao estiver configurada), sobe `IAIndisponivelParaMenor`, com mensagem
  amigavel; os fallbacks locais (texto fixo, sem IA) continuam valendo.
- Na OpenAI vai `store=False` (nada guardado para distill/evals/logs da conta).

A rota vive num `ContextVar`: quem entra num fluxo com dado de aluno abre
`async with rota_ia_para_alunos(session, [aluno_id])` e tudo que for chamado
dali para dentro (JsonLLMService, chamadas HTTP diretas ao Gemini, microservice)
consulta `rota_atual()`. Sem rota aberta (conteudo do professor, material base
por perfil, sem aluno) vale o provedor atual.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterable, Iterator
from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

Rota = Literal["padrao", "menor"]
ROTA_PADRAO: Rota = "padrao"
ROTA_MENOR: Rota = "menor"

MENSAGEM_IA_INDISPONIVEL = (
    "A IA está indisponível agora. Tente de novo em alguns minutos — "
    "suas trilhas, questões e progresso continuam funcionando normalmente."
)

_rota: ContextVar[Rota | None] = ContextVar("trailup_rota_ia", default=None)

# Conta quantos ids nao sao adulto confirmado. `IS DISTINCT FROM false` pega
# menor (true) e desconhecido (NULL, sem data de nascimento).
_SQL_NAO_ADULTOS = text(
    "SELECT count(*) FILTER (WHERE public.aluno_eh_menor(a.id) IS DISTINCT FROM false) AS nao_adultos, "
    "count(*) AS total "
    "FROM unnest(CAST(:ids AS uuid[])) AS a(id)"
)


class IAIndisponivelParaMenor(RuntimeError):
    """A rota de menor so aceita OpenAI e a OpenAI nao respondeu (ou nao esta
    configurada). Nunca cair no Gemini por causa disto."""

    def __init__(self, motivo: str = "") -> None:
        super().__init__(motivo or "openai indisponivel na rota de menor")
        self.motivo = motivo
        self.mensagem = MENSAGEM_IA_INDISPONIVEL


def rota_atual() -> Rota:
    return _rota.get() or ROTA_PADRAO


def rota_de_menor_ativa() -> bool:
    return _rota.get() == ROTA_MENOR


@contextmanager
def usar_rota(rota: Rota) -> Iterator[Rota]:
    """Abre a rota no contexto atual. Rota de menor nunca e rebaixada por uma
    rota interna 'padrao' (um fluxo de menor que chama outro fluxo continua
    de menor)."""
    efetiva: Rota = ROTA_MENOR if (rota == ROTA_MENOR or rota_de_menor_ativa()) else ROTA_PADRAO
    token = _rota.set(efetiva)
    try:
        yield efetiva
    finally:
        try:
            _rota.reset(token)
        except ValueError:
            # Gerador de streaming fechado em outro Context (cliente desconectou):
            # o Context original morre junto, nao ha o que restaurar.
            pass


def _ids_validos(aluno_ids: Iterable[Any]) -> tuple[list[str], bool]:
    ids: list[str] = []
    algum_vazio = False
    for item in aluno_ids:
        valor = str(item).strip() if item is not None else ""
        if not valor or valor.lower() == "none":
            algum_vazio = True
            continue
        if valor not in ids:
            ids.append(valor)
    return ids, algum_vazio


async def decidir_rota(session: AsyncSession | None, aluno_ids: Iterable[Any]) -> Rota:
    """Adulto confirmado para TODOS os ids -> 'padrao'; qualquer outra coisa
    (menor, sem data, id vazio, sessao ausente, erro no banco) -> 'menor'."""
    ids, algum_vazio = _ids_validos(aluno_ids)
    if algum_vazio or not ids or session is None:
        return ROTA_MENOR
    savepoint = getattr(session, "begin_nested", None)
    try:
        if callable(savepoint):
            # SAVEPOINT: se a consulta falhar, so ela e desfeita; escritas
            # pendentes do chamador (status de job etc.) nao se perdem.
            async with session.begin_nested():
                result = await session.execute(_SQL_NAO_ADULTOS, {"ids": ids})
                row = result.mappings().first() if result is not None else None
        else:
            result = await session.execute(_SQL_NAO_ADULTOS, {"ids": ids})
            row = result.mappings().first() if result is not None else None
    except Exception as exc:  # banco fora, funcao ausente, uuid invalido, timeout
        if not callable(savepoint):
            try:
                await session.rollback()
            except Exception:  # pragma: no cover - rollback de sessao ja quebrada
                pass
        logger.warning("roteamento_ia.consulta_falhou: n=%s erro=%s", len(ids), type(exc).__name__)
        return ROTA_MENOR
    if not row:
        return ROTA_MENOR
    try:
        nao_adultos = int(row.get("nao_adultos"))
        total = int(row.get("total"))
    except (TypeError, ValueError):
        return ROTA_MENOR
    if total != len(ids) or nao_adultos != 0:
        return ROTA_MENOR
    return ROTA_PADRAO


@asynccontextmanager
async def rota_ia_para_alunos(session: AsyncSession | None, aluno_ids: Iterable[Any]) -> AsyncIterator[Rota]:
    rota = await decidir_rota(session, list(aluno_ids))
    with usar_rota(rota) as efetiva:
        yield efetiva


@asynccontextmanager
async def rota_ia_para_turma(session: AsyncSession | None, aluno_ids: Iterable[Any]) -> AsyncIterator[Rota]:
    """Turma: um menor (ou desconhecido) basta para tudo ir a OpenAI. Turma
    sem aluno nenhum nao manda dado de aluno -> provedor atual."""
    ids = list(aluno_ids)
    rota = ROTA_PADRAO if not ids else await decidir_rota(session, ids)
    with usar_rota(rota) as efetiva:
        yield efetiva


def bloquear_gemini_na_rota_de_menor(onde: str) -> None:
    """Chamadas diretas ao Gemini (HTTP/SDK) chamam isto antes de sair.
    Na rota de menor sobe `IAIndisponivelParaMenor`; o chamador decide se
    segue sem o recurso (ex.: sem imagem) ou devolve erro amigavel."""
    if rota_de_menor_ativa():
        logger.info("roteamento_ia.gemini_bloqueado_para_menor: %s", onde)
        raise IAIndisponivelParaMenor(f"gemini bloqueado para menor em {onde}")


def provedor_efetivo(solicitado: str | None, padrao: str) -> str:
    """Provedor que de fato sera usado: na rota de menor, sempre openai."""
    if rota_de_menor_ativa():
        return "openai"
    return solicitado or padrao


@asynccontextmanager
async def rota_ia_se_tiver_aluno(session: AsyncSession | None, aluno_id: Any) -> AsyncIterator[Rota]:
    """Material com dono (aluno) -> rota pela idade dele; material sem dono
    (base por perfil BrainHex, sem dado de aluno) -> provedor atual."""
    if aluno_id is None or not str(aluno_id).strip() or str(aluno_id).strip().lower() == "none":
        with usar_rota(ROTA_PADRAO) as efetiva:
            yield efetiva
        return
    async with rota_ia_para_alunos(session, [aluno_id]) as efetiva:
        yield efetiva
