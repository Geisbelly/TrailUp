"""Intervencao sugerida ao professor quando um alerta de estudo se repete (#64).

O padrao de risco e a recorrencia que `memoria_aluno` ja detecta: 3 dos ultimos 5
ciclos em `aluno_mental_state_history` com o mesmo alerta (`dificuldade` ou
`abandono`, ver `estado_de_estudo.py`). Sao estados de estudo, nao emocao: a
telemetria nao mede emocao (DAT-45), entao o texto nunca fala em ansiedade ou
frustracao. O no nao
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
from app.services.openai_rag import OpenAIRagService
from app.services.rag_observabilidade import coletar_buscas_rag

logger = logging.getLogger(__name__)

_ESTADO_PT = {
    "dificuldade": "dificuldade nas atividades do tópico",
    "abandono": "atividade aberta e deixada sem concluir",
}
_TIPO_POR_KIND = {
    "dificuldade": "pedagogica",
    "abandono": "engajamento",
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
    "dificuldade": "Vale retomar com o aluno o ponto do tópico em que as atividades erram e oferecer o próximo material em outro formato.",
    "abandono": "Vale reduzir o tamanho da próxima entrega ou dividir a atividade em partes menores.",
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
    return f"{ocorrencias} dos últimos {_JANELA} ciclos de estudo: {_ESTADO_PT[kind]}."


def _texto_da_regra(kind: str, ocorrencias: int) -> str:
    return (
        f"O sistema observou {_ESTADO_PT[kind]} em {ocorrencias} dos últimos {_JANELA} ciclos de estudo do aluno. "
        f"{_ACAO_DA_REGRA[kind]}"
    )


# DAT-45: o sistema nao mede emocao. Texto que a atribua ao aluno cai para o da regra.
_TERMOS_DE_EMOCAO = re.compile(
    r"\b(ansios\w*|ansiedade|frustra\w*|sobrecarregad\w*|sobrecarga|estressad\w*|estresse|"
    r"desmotivad\w*|triste\w*|tristeza)\b",
    re.IGNORECASE,
)


def _sugestao_valida(sugestao: IntervencaoSugestao) -> bool:
    textos = [sugestao.texto, sugestao.notificacao_titulo or "", sugestao.notificacao_corpo or ""]
    return not any(_TERMOS_CLINICOS.search(t) or _TERMOS_DE_EMOCAO.search(t) for t in textos)


def montar_intervencao(
    kind: str,
    ocorrencias: int,
    sugestao: IntervencaoSugestao | None,
    origem_sugestao: str = "modelo",
    fontes_rag: list[str] | None = None,
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
            fontes_rag=fontes_rag or [],
            origem=origem_sugestao,
        )
    # Dificuldade: o professor olha antes; a resposta e pedagogica, e mensagem automatica
    # sobre erro pode soar como vigilancia.
    notifica = kind != "dificuldade"
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

    desempenho = state.get("desempenho_recente") or {}
    sugestao: IntervencaoSugestao | None = None
    origem_sugestao = "modelo"
    llm = JsonLLMService(settings)
    tentativas = [True, False] if OpenAIRagService(settings).is_configured() else [False]
    with coletar_buscas_rag() as buscas:
        for usar_rag in tentativas:
            try:
                sugestao = await llm.ainvoke_structured(
                    prompt_name="intervencao.txt",
                    # Minimizacao: nada que identifique o aluno vai ao modelo.
                    payload={
                        "estado": _ESTADO_PT[kind],
                        "ocorrencias": ocorrencias,
                        "janela": _JANELA,
                        "desempenho_recente": {
                            k: desempenho.get(k) for k in ("media_acertos", "percentual_concluido") if k in desempenho
                        },
                    },
                    schema=IntervencaoSugestao,
                    use_rag=usar_rag,
                )
                origem_sugestao = "rag" if usar_rag else "modelo"
                break
            except StructuredOutputError:
                continue

    fontes_rag = []
    if origem_sugestao == "rag" and sugestao is not None and _sugestao_valida(sugestao):
        fontes_rag = list(
            dict.fromkeys(
                fonte
                for busca in buscas
                for fonte in busca.get("fontes_citadas", [])
                if isinstance(fonte, str) and fonte.strip()
            )
        )[:20]
    intervencao = montar_intervencao(kind, ocorrencias, sugestao, origem_sugestao, fontes_rag)
    return {
        "intervencao_payload": intervencao.model_dump(mode="json"),
        "completed_nodes": ["agente_intervencao"],
        "messages": [f"intervencao sugerida: {intervencao.tipo}/{intervencao.acao} ({intervencao.origem})"],
    }
