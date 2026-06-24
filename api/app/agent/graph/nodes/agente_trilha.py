from typing import Any

from app.core.settings import Settings
from app.schemas.trilha_config import TrilhaConfig
from app.services.llm import JsonLLMService


def _fallback_trilha(state: dict[str, Any]) -> dict[str, Any]:
    progresso = state.get("progresso_trilha", {})
    ordered_ids = sorted(int(topico_id) for topico_id in progresso.keys()) if progresso else []
    incompletos = [
        topico_id
        for topico_id in ordered_ids
        if float(progresso[str(topico_id)].get("percentual_concluido", 0)) < 100
    ]
    foco = state.get("payload_topico_id") or (incompletos[0] if incompletos else None)
    proximos = incompletos[:3] if incompletos else ([foco] if foco else [])
    return {
        "classe_id": state["classe_id"],
        "topico_foco": foco,
        "proximos_topicos": proximos,
        "ajustes": ["reforcar fundamentos"] if float(state.get("desempenho_recente", {}).get("media_acertos", 1)) < 0.5 else ["manter progressao"],
        "justificativa": "reorganizacao baseada em progresso e perfil atualizado",
    }


async def agente_trilha(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    result = await llm.ainvoke_json(
        prompt_name="trilha_config.txt",
        payload={
            "classe_id": state.get("classe_id"),
            "perfil_update": state.get("perfil_update"),
            "progresso_trilha": state.get("progresso_trilha", {}),
            "desempenho_recente": state.get("desempenho_recente", {}),
        },
        fallback_factory=lambda: _fallback_trilha(state),
    )
    trilha_config = TrilhaConfig.model_validate(result)
    return {
        "trilha_config": trilha_config.model_dump(mode="json"),
        "completed_nodes": ["agente_trilha"],
        "messages": [trilha_config.justificativa],
    }

