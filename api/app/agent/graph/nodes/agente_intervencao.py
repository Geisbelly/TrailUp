"""Intervencao sugerida ao professor quando um estado negativo se repete (#64).

O padrao de risco e a recorrencia que `memoria_aluno` ja detecta: 3 dos ultimos 5
registros de `aluno_mental_state_history` com o mesmo `kind` negativo. O no nao
recalcula isso; le o resultado do estado, e a evidencia (kind, ocorrencias, tipo)
vai para a intervencao sem passar pelo modelo. O modelo so redige o texto ao
professor e, se for o caso, a mensagem de apoio ao aluno.

Quem grava e o executor: `intervencoes` (o professor le pela RLS da turma) e,
quando a acao e notificacao, `notificacoes_ia` (o banco entrega).
"""

import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.settings import Settings
from app.repositories.intervencao import IntervencaoRepository
from app.schemas.intervencao import IntervencaoPayload, IntervencaoSugestao
from app.services.llm import JsonLLMService, StructuredOutputError

logger = logging.getLogger(__name__)

_ESTADO_PT = {
    "frustrated": "frustração",
    "anxious": "ansiedade",
    "overwhelmed": "sobrecarga",
    "tired": "cansaço",
}
_TIPO_POR_KIND = {
    "frustrated": "emocional",
    "anxious": "emocional",
    "overwhelmed": "emocional",
    "tired": "engajamento",
}
# Mesma janela de `memoria_aluno._JANELA_RECORRENCIA`: a base cita "dos ultimos N".
_JANELA = 5

# Guardrail: o texto descreve o estudo, nunca a saude do aluno. Se o modelo
# escapar disso, vale o texto da regra.
_TERMOS_CLINICOS = re.compile(
    r"\b(diagn[oó]stic\w*|transtorno\w*|doen[cç]a\w*|depress\w*|terapia\w*|terap[eê]ut\w*|"
    r"medica[cç]\w*|medicament\w*|psiqui[aá]tr\w*|patolog\w*)\b",
    re.IGNORECASE,
)

_ACAO_DA_REGRA = {
    "frustrated": "Vale conversar com o aluno no início da próxima aula e oferecer o próximo material em outro formato.",
    "anxious": "Vale olhar com o aluno o que vem a seguir e combinar a próxima entrega com calma.",
    "overwhelmed": "Vale reduzir o tamanho da próxima entrega ou dividir o tópico em partes menores.",
    "tired": "Vale propor sessões mais curtas e retomar o ritmo aos poucos.",
}
_NOTIFICACAO_DA_REGRA = {
    "titulo": "Um passo de cada vez",
    "corpo": "Seu próximo passo na trilha está mais curto e guiado. Volte quando quiser, no seu ritmo.",
}


def _recorrencia(state: dict[str, Any]) -> dict[str, Any] | None:
    memoria = state.get("memoria_aluno") or {}
    recorrencia = memoria.get("mental_state_recorrente") or {}
    kind = str(recorrencia.get("kind") or "")
    if not recorrencia.get("recorrente") or kind not in _TIPO_POR_KIND:
        return None
    return {"kind": kind, "ocorrencias": int(recorrencia.get("ocorrencias") or 0) or 1}


def _base(kind: str, ocorrencias: int) -> str:
    return f"{ocorrencias} dos últimos {_JANELA} registros de estado mental: {_ESTADO_PT[kind]}."


def _texto_da_regra(kind: str, ocorrencias: int) -> str:
    return (
        f"O aluno registrou {_ESTADO_PT[kind]} em {ocorrencias} dos últimos {_JANELA} ciclos de estudo. "
        f"{_ACAO_DA_REGRA[kind]}"
    )


def _sugestao_valida(sugestao: IntervencaoSugestao) -> bool:
    textos = [sugestao.texto, sugestao.notificacao_titulo or "", sugestao.notificacao_corpo or ""]
    return not any(_TERMOS_CLINICOS.search(t) for t in textos)


def montar_intervencao(
    kind: str, ocorrencias: int, sugestao: IntervencaoSugestao | None
) -> IntervencaoPayload:
    """Pura. Sem sugestao valida do modelo, vale a regra (nunca fica sem intervencao:
    a recorrencia e dado, nao opiniao do modelo)."""
    comum = {
        "tipo": _TIPO_POR_KIND[kind],
        "kind": kind,
        "ocorrencias": ocorrencias,
        "janela": _JANELA,
        "base": _base(kind, ocorrencias),
    }
    if sugestao is not None and _sugestao_valida(sugestao):
        notifica = (
            sugestao.acao == "notificacao"
            and bool((sugestao.notificacao_titulo or "").strip())
            and bool((sugestao.notificacao_corpo or "").strip())
        )
        return IntervencaoPayload(
            **comum,
            texto=sugestao.texto.strip(),
            acao="notificacao" if notifica else "acompanhar",
            notificacao_titulo=sugestao.notificacao_titulo.strip() if notifica else None,
            notificacao_corpo=sugestao.notificacao_corpo.strip() if notifica else None,
            origem="modelo",
        )
    # Ansiedade: o professor olha antes; mensagem automatica pode soar como vigilancia.
    notifica = kind != "anxious"
    return IntervencaoPayload(
        **comum,
        texto=_texto_da_regra(kind, ocorrencias),
        acao="notificacao" if notifica else "acompanhar",
        notificacao_titulo=_NOTIFICACAO_DA_REGRA["titulo"] if notifica else None,
        notificacao_corpo=_NOTIFICACAO_DA_REGRA["corpo"] if notifica else None,
        origem="regra",
    )


async def _ja_pendente(
    session_factory: async_sessionmaker[AsyncSession], state: dict[str, Any], kind: str
) -> bool:
    """A recorrencia dura varios ciclos; sem isto cada ciclo pagaria uma chamada
    ao modelo so para o executor descartar. Falha de leitura nao bloqueia: o
    executor deduplica de novo no INSERT."""
    try:
        async with session_factory() as session:
            return await IntervencaoRepository(session).existe_pendente(
                aluno_id=state["aluno_id"], classe_id=int(state["classe_id"]), kind=kind
            )
    except Exception as exc:
        logger.warning("agente_intervencao: falha ao ler intervencoes pendentes: %s", exc)
        return False


async def agente_intervencao(
    state: dict[str, Any],
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, Any]:
    recorrencia = _recorrencia(state)
    if recorrencia is None:
        return {"completed_nodes": ["agente_intervencao"], "messages": ["sem padrao de risco"]}
    kind, ocorrencias = recorrencia["kind"], recorrencia["ocorrencias"]
    if await _ja_pendente(session_factory, state, kind):
        return {"completed_nodes": ["agente_intervencao"], "messages": ["intervencao ja pendente"]}

    emocao = state.get("emocao_atual") or {}
    desempenho = state.get("desempenho_recente") or {}
    sugestao: IntervencaoSugestao | None = None
    try:
        sugestao = await JsonLLMService(settings).ainvoke_structured(
            prompt_name="intervencao.txt",
            # Minimizacao: nada que identifique o aluno vai ao modelo.
            payload={
                "estado": _ESTADO_PT[kind],
                "ocorrencias": ocorrencias,
                "janela": _JANELA,
                "emocao_atual": emocao.get("emocao_primaria"),
                "desempenho_recente": {
                    k: desempenho.get(k) for k in ("media_acertos", "percentual_concluido") if k in desempenho
                },
            },
            schema=IntervencaoSugestao,
        )
    except StructuredOutputError:
        sugestao = None

    intervencao = montar_intervencao(kind, ocorrencias, sugestao)
    return {
        "intervencao_payload": intervencao.model_dump(mode="json"),
        "completed_nodes": ["agente_intervencao"],
        "messages": [f"intervencao sugerida: {intervencao.tipo}/{intervencao.acao} ({intervencao.origem})"],
    }
