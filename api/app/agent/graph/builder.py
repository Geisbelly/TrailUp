from functools import partial
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.adapters.mock_emocao import MockEmocaoAdapter
from app.agent.graph import nodes, routing
from app.agent.graph.state import TrailUpState
from app.core.settings import Settings

from langgraph.graph import END, START, StateGraph


def build_graph(
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
    checkpointer: Any,
    interrupt_before: list[str] | None = None,
):
    graph = StateGraph(TrailUpState)

    graph.add_node("supervisor", partial(nodes.supervisor, settings=settings))
    graph.add_node("agente_plano_personalizacao", partial(nodes.agente_plano_personalizacao, settings=settings))
    graph.add_node("agente_ai_patch", partial(nodes.agente_ai_patch, settings=settings))
    graph.add_node("agente_boss_visual", partial(nodes.agente_boss_visual, settings=settings))
    graph.add_node(
        "agente_midias_personalizadas",
        partial(nodes.agente_midias_personalizadas, settings=settings, session_factory=session_factory),
    )
    graph.add_node("agente_emocao", partial(nodes.agente_emocao, adapter=MockEmocaoAdapter()))
    graph.add_node("agente_perfil", partial(nodes.agente_perfil, settings=settings))
    graph.add_node("agente_trilha", partial(nodes.agente_trilha, settings=settings))
    graph.add_node("agente_conteudo", partial(nodes.agente_conteudo, settings=settings))
    graph.add_node("agente_geracao_midia", partial(nodes.agente_geracao_midia, settings=settings, session_factory=session_factory))
    graph.add_node("agente_notificacao", partial(nodes.agente_notificacao, settings=settings))
    graph.add_node("agente_ui", partial(nodes.agente_ui, settings=settings))
    graph.add_node("agente_texto", partial(nodes.agente_texto, settings=settings))
    graph.add_node("persist_personalizacao", partial(nodes.persist_personalizacao, session_factory=session_factory, settings=settings))
    graph.add_node("executor", partial(nodes.executor, session_factory=session_factory))

    graph.add_edge(START, "supervisor")
    graph.add_conditional_edges(
        "supervisor",
        routing.route_from_state,
        {
            "agente_emocao": "agente_emocao",
            "agente_perfil": "agente_perfil",
            "agente_trilha": "agente_trilha",
            "agente_conteudo": "agente_conteudo",
            "agente_geracao_midia": "agente_geracao_midia",
            "agente_plano_personalizacao": "agente_plano_personalizacao",
            "agente_ai_patch": "agente_ai_patch",
            "agente_boss_visual": "agente_boss_visual",
            "agente_midias_personalizadas": "agente_midias_personalizadas",
            "agente_notificacao": "agente_notificacao",
            "agente_ui": "agente_ui",
            "agente_texto": "agente_texto",
            "persist_personalizacao": "persist_personalizacao",
            "executor": "executor",
            "finish": END,
        },
    )

    for specialist in routing.SPECIALIST_NODES:
        graph.add_edge(specialist, "supervisor")

    graph.add_edge("persist_personalizacao", END)
    graph.add_edge("executor", END)

    compile_kwargs = {"checkpointer": checkpointer}
    if interrupt_before:
        compile_kwargs["interrupt_before"] = interrupt_before
    return graph.compile(**compile_kwargs)
