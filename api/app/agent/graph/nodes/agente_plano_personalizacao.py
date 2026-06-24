from app.core.settings import Settings
from app.services.personalizacao import generate_plano_personalizacao


async def agente_plano_personalizacao(state: dict, settings: Settings) -> dict:
    plano = await generate_plano_personalizacao(state, settings)
    return {
        "plano_personalizacao": plano,
        "completed_nodes": ["agente_plano_personalizacao"],
        "messages": ["plano de personalizacao gerado"],
    }
