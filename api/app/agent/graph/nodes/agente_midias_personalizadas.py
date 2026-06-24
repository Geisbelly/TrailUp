from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.settings import Settings
from app.services.personalizacao import generate_materiais_personalizados


async def agente_midias_personalizadas(
    state: dict,
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
) -> dict:
    materiais = await generate_materiais_personalizados(
        state,
        settings,
        session_factory=session_factory,
        phase="fast_only",
    )
    propagated_state: dict[str, object] = {}
    for key in (
        "midias_em_processamento",
        "materiais_saved_ids",
        "media_pending_payload",
        "media_status",
        "media_generation_warnings",
        "media_render_job_id",
    ):
        if key in state:
            propagated_state[key] = state.get(key)
    return {
        "materiais_personalizados": materiais,
        **propagated_state,
        "completed_nodes": ["agente_midias_personalizadas"],
        "messages": ["materiais rapidos gerados e midias lentas enfileiradas"],
    }
