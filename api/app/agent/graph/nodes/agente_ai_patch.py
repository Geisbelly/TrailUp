from app.core.settings import Settings
from app.services.personalizacao import generate_ai_patch_personalizacao


async def agente_ai_patch(state: dict, settings: Settings) -> dict:
    ai_patch = await generate_ai_patch_personalizacao(state, settings)
    return {
        "ai_patch": ai_patch,
        "completed_nodes": ["agente_ai_patch"],
        "messages": ["aiPatch item-first gerado"],
    }
