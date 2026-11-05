from typing import Any

from app.adapters.base_emocao import EmocaoAdapter


async def agente_emocao(state: dict[str, Any], adapter: EmocaoAdapter | None) -> dict[str, Any]:
    frame = state.get("frame_b64")
    resultado = None
    if frame and adapter is not None:
        resultado = await adapter.analisar_frame(
            frame,
            metadados={"aluno_id": state["aluno_id"], "classe_id": state.get("classe_id")},
        )

    if resultado is None:
        return {
            "emocao_atual": {"estado_sinal": "indisponivel"},
            "frame_b64": None,
            "completed_nodes": ["agente_emocao"],
            "messages": ["agente_emocao sem resultado visual"],
        }

    resultado_serializado = resultado.model_dump(mode="json")
    historico = state.get("emocao_historico", [])[-9:]
    return {
        "emocao_atual": resultado_serializado,
        "emocao_historico": historico + [resultado_serializado],
        "frame_b64": None,
        "completed_nodes": ["agente_emocao"],
        "messages": [f"analise visual concluida: {resultado.emocao_primaria}"],
    }

