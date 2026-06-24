from typing import Any

from app.core.settings import Settings
from app.schemas.conteudo_adaptado import ConteudoAdaptado
from app.services.llm import JsonLLMService


def _fallback_conteudo(state: dict[str, Any]) -> dict[str, Any]:
    desempenho = state.get("desempenho_recente", {})
    media_acertos = float(desempenho.get("media_acertos", 0))
    topico_id = state.get("payload_topico_id") or desempenho.get("topico_recente_id") or 0
    nivel = "reforco" if media_acertos < 0.5 else "equilibrado"
    return {
        "topico_id": int(topico_id),
        "conteudo_id": state.get("conteudo_foco_id"),
        "conteudos": [
            "Resumo em passos curtos",
            "Exercicio guiado com feedback imediato",
        ],
        "nivel": nivel,
        "exemplos": ["Exemplo pratico contextualizado na materia da turma"],
        "observacoes": ["Reduzir carga cognitiva inicial"] if nivel == "reforco" else ["Manter exemplos progressivos"],
    }


async def agente_conteudo(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    result = await llm.ainvoke_json(
        prompt_name="conteudo_adaptado.txt",
        payload={
            "payload_topico_id": state.get("payload_topico_id"),
            "conteudo_foco_id": state.get("conteudo_foco_id"),
            "desempenho_recente": state.get("desempenho_recente", {}),
            "emocao_atual": state.get("emocao_atual"),
            "perfil_brainhex": state.get("perfil_brainhex", []),
        },
        fallback_factory=lambda: _fallback_conteudo(state),
    )
    conteudo = ConteudoAdaptado.model_validate(result)
    return {
        "conteudo_adaptado": conteudo.model_dump(mode="json"),
        "completed_nodes": ["agente_conteudo"],
        "messages": [f"conteudo adaptado para topico {conteudo.topico_id}"],
    }
