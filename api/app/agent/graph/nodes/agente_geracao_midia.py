from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.settings import Settings
from app.repositories.materiais import MateriaisRepository
from app.services.personalizacao import generate_materiais_personalizados


async def agente_geracao_midia(
    state: dict[str, Any],
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, Any]:
    if not state.get("gerar_materiais"):
        return {}

    conteudo = state.get("conteudo_adaptado") or {}
    conteudo_id = conteudo.get("conteudo_id") or state.get("conteudo_foco_id")

    async with session_factory() as session:
        cached = await MateriaisRepository(session).buscar_por_conteudo(
            aluno_id=state["aluno_id"],
            conteudo_id=conteudo_id,
        )

    if cached:
        return {
            "materiais_gerados": cached,
            "materiais_cache_hit": True,
            "completed_nodes": ["agente_geracao_midia"],
            "messages": ["materiais reutilizados do cache"],
        }

    materiais = await generate_materiais_personalizados(
        state,
        settings,
        session_factory=session_factory,
    )
    return {
        "materiais_gerados": materiais,
        "materiais_cache_hit": False,
        "completed_nodes": ["agente_geracao_midia"],
        "messages": ["materiais personalizados gerados"],
    }
