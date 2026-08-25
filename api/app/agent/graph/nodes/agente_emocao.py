from typing import Any

from app.adapters.base_emocao import EmocaoAdapter
from app.schemas.common import Evento


async def agente_emocao(state: dict[str, Any], adapter: EmocaoAdapter) -> dict[str, Any]:
    eventos = [Evento.model_validate(evento) for evento in state.get("eventos_novos", [])]
    resultado = None

    if state.get("frame_b64"):
        resultado = await adapter.analisar_frame(
            state["frame_b64"],
            metadados={"aluno_id": state["aluno_id"], "classe_id": state.get("classe_id")},
        )
    elif eventos:
        resultado = await adapter.analisar_comportamento(eventos)

    if resultado is None:
        return {
            "completed_nodes": ["agente_emocao"],
            "messages": ["agente_emocao sem insumos"],
        }

    historico = state.get("emocao_historico", [])[-9:]
    return {
        "emocao_atual": resultado.model_dump(mode="json"),
        "emocao_historico": historico + [resultado.model_dump(mode="json")],
        "frame_b64": None,
        "completed_nodes": ["agente_emocao"],
        "messages": [f"emocao detectada: {resultado.emocao_primaria}"],
    }

