from typing import Any

from app.agent.graph.routing import build_state_summary, compute_personalizacao_next, compute_supervisor_next
from app.core.settings import Settings
from app.services.llm import JsonLLMService


VALID_NEXT = {
    "agente_emocao",
    "agente_perfil",
    "agente_trilha",
    "agente_conteudo",
    "agente_geracao_midia",
    "agente_notificacao",
    "agente_ui",
    "agente_texto",
    "agente_plano_personalizacao",
    "agente_ai_patch",
    "agente_boss_visual",
    "agente_midias_personalizadas",
    "persist_personalizacao",
    "executor",
    "finish",
}


async def supervisor(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    if state.get("workflow_kind") == "personalizar":
        next_nodes = compute_personalizacao_next(state)
        return {
            "next": next_nodes,
            "messages": ["roteamento deterministico de personalizacao"],
        }

    llm = JsonLLMService(settings)
    deterministic_next = compute_supervisor_next(state)
    summary = build_state_summary(state)

    result = await llm.ainvoke_json(
        prompt_name="supervisor.txt",
        payload=summary,
        model=settings.active_model_supervisor,
        fallback_factory=lambda: {
            "next": deterministic_next,
            "justificativa": "roteamento deterministico do MVP",
        },
    )
    next_nodes = [node for node in result.get("next", []) if node in VALID_NEXT]
    if not next_nodes:
        next_nodes = deterministic_next

    return {
        "next": next_nodes,
        "messages": [result.get("justificativa", "supervisor executado")],
    }
