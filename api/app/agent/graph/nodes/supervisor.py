from typing import Any

from app.agent.graph.routing import (
    SPECIALIST_NODES,
    build_state_summary,
    compute_personalizacao_next,
    compute_supervisor_next,
)
from app.core.settings import Settings
from app.schemas.supervisor_decision import SupervisorDecision
from app.services.llm import JsonLLMService, StructuredOutputError

# Derivada dos nós do grafo: a lista escrita à mão deixou `agente_intervencao` e
# `agente_cronometro` de fora, e com o modelo respondendo eles nunca rodavam.
VALID_NEXT = SPECIALIST_NODES | {"persist_personalizacao", "executor", "finish"}

TERMINAIS = {"executor", "finish"}


def escolha_do_modelo(sugeridos: list[str], candidatos: list[str]) -> list[str]:
    """O modelo só ordena os candidatos da regra; não acrescenta nem pula nenhum.

    Em produção (27 ciclos medidos em 01/11) o modelo, vendo os outputs prontos,
    pedia `agente_ui` "para consolidar a interface" de novo a cada volta: 232
    execuções, uma delas com 139 seguidas, e 16 ciclos terminando em `finish`
    sem passar pelo `executor`. Nome fora dos candidatos é descartado: nó já
    concluído não volta, e `finish` não pula o `executor` nem um nó que a regra
    ainda pede. O que o modelo deixar para depois segue candidato na volta
    seguinte, então nada que a regra pede deixa de rodar.
    """
    permitidos = set(candidatos)
    escolhidos = list(dict.fromkeys(node for node in sugeridos if node in permitidos))
    return escolhidos or candidatos


async def supervisor(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    if state.get("workflow_kind") == "personalizar":
        next_nodes = compute_personalizacao_next(state)
        return {
            "next": next_nodes,
            "messages": ["roteamento deterministico de personalizacao"],
        }

    candidatos = compute_supervisor_next(state)
    # Sem escolha a fazer (um nó só, ou o fim), o modelo não é consultado: cada
    # volta do supervisor é uma chamada na cota do tier free.
    if len(candidatos) == 1 or set(candidatos) <= TERMINAIS:
        return {"next": candidatos, "messages": ["roteamento deterministico: sem escolha"]}

    llm = JsonLLMService(settings)
    try:
        decisao = await llm.ainvoke_structured(
            prompt_name="supervisor.txt",
            payload={**build_state_summary(state), "candidatos": candidatos},
            schema=SupervisorDecision,
            model=settings.active_model_supervisor,
        )
    except StructuredOutputError:
        decisao = SupervisorDecision(next=candidatos, justificativa="roteamento deterministico do MVP")

    return {
        "next": escolha_do_modelo([node for node in decisao.next if node in VALID_NEXT], candidatos),
        "messages": [decisao.justificativa or "supervisor executado"],
    }
