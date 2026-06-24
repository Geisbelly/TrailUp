from typing import Any

from app.core.settings import Settings
from app.schemas.ui_config import UIConfig
from app.services.llm import JsonLLMService


EMOCAO_TEMA = {
    "frustrado": {"tema": "focus", "ritmo_conteudo": "lento", "tom_feedbacks": "suporte", "tipo_modal": "suporte"},
    "entediado": {"tema": "energetic", "ritmo_conteudo": "acelerado", "tom_feedbacks": "desafiador", "tipo_modal": "desafio"},
    "animado": {"tema": "energetic", "ritmo_conteudo": "acelerado", "tom_feedbacks": "desafiador", "tipo_modal": "conquista"},
    "concentrado": {"tema": "dark", "ritmo_conteudo": "normal", "tom_feedbacks": "neutro", "tipo_modal": "dica"},
    "ansioso": {"tema": "light", "ritmo_conteudo": "lento", "tom_feedbacks": "suporte", "tipo_modal": "suporte"},
}


def _fallback_ui(state: dict[str, Any]) -> dict[str, Any]:
    emocao = state.get("emocao_atual") or {}
    base = EMOCAO_TEMA.get(
        emocao.get("emocao_primaria", "concentrado"),
        EMOCAO_TEMA["concentrado"],
    )
    return {
        "tema": base["tema"],
        "ritmo_conteudo": base["ritmo_conteudo"],
        "complexidade_visual": "minima" if base["tom_feedbacks"] == "suporte" else "normal",
        "elementos_gamificacao": "sutis" if base["tom_feedbacks"] != "desafiador" else "destacados",
        "tom_feedbacks": base["tom_feedbacks"],
        "precisa_texto": True,
        "tipo_modal": base["tipo_modal"],
        "contexto_texto": {
            "emocao": emocao.get("emocao_primaria"),
            "ciclo_id": state.get("ciclo_id"),
        },
    }


async def agente_ui(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    result = await llm.ainvoke_json(
        prompt_name="ui_adaptativa.txt",
        payload={
            "emocao": state.get("emocao_atual"),
            "perfil": state.get("perfil_brainhex", []),
            "desempenho": state.get("desempenho_recente", {}),
        },
        fallback_factory=lambda: _fallback_ui(state),
    )
    ui_config = UIConfig.model_validate(result)
    return {
        "ui_config": ui_config.model_dump(mode="json"),
        "completed_nodes": ["agente_ui"],
        "messages": [f"ui adaptada com tema {ui_config.tema}"],
    }

