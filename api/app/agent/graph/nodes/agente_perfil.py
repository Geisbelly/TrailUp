from typing import Any

from app.core.settings import Settings
from app.schemas.perfil import PerfilScore, PerfilUpdate
from app.services.llm import JsonLLMService


def _fallback_perfil(state: dict[str, Any]) -> dict[str, Any]:
    existing = {perfil["perfil"]: float(perfil.get("afinidade", 0)) for perfil in state.get("perfil_brainhex", [])}
    for perfil in ["Seeker", "Conqueror", "Daredevil", "Mastermind", "Socialiser", "Achiever", "Survivor"]:
        existing.setdefault(perfil, 10.0)

    desempenho = state.get("desempenho_recente", {})
    eventos = {evento.get("tipo", "").lower() for evento in state.get("eventos_novos", [])}

    if float(desempenho.get("media_acertos", 0)) < 0.5:
        existing["Survivor"] += 20
        existing["Mastermind"] += 10
    if "atividade_concluida" in eventos:
        existing["Achiever"] += 25
        existing["Conqueror"] += 10
    if "video_explorado" in eventos or "conteudo_aberto" in eventos:
        existing["Seeker"] += 15
    if "inatividade" in eventos:
        existing["Survivor"] += 15
    if "forum_interacao" in eventos:
        existing["Socialiser"] += 15

    dominante = max(existing.items(), key=lambda item: item[1])[0]
    suggested_mode = {
        "Achiever": "imediato",
        "Conqueror": "imediato",
        "Mastermind": "analitico",
        "Seeker": "exploratorio",
        "Socialiser": "exploratorio",
        "Survivor": "imediato",
        "Daredevil": "exploratorio",
    }.get(dominante, "imediato")

    perfis = [
        PerfilScore(perfil=nome, afinidade=max(0, min(score, 100))).model_dump()
        for nome, score in sorted(existing.items(), key=lambda item: item[1], reverse=True)
    ]
    return {
        "perfis": perfis,
        "modo_operacao_sugerido": suggested_mode,
        "modo_resposta": "imediato" if suggested_mode == "imediato" else None,
        "justificativa": f"perfil dominante inferido: {dominante}",
    }


async def agente_perfil(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    result = await llm.ainvoke_json(
        prompt_name="perfil_brainhex.txt",
        payload={
            "perfis_atuais": state.get("perfil_brainhex", []),
            "historico_eventos": state.get("historico_eventos", [])[-20:],
            "eventos_novos": state.get("eventos_novos", []),
            "desempenho": state.get("desempenho_recente", {}),
        },
        fallback_factory=lambda: _fallback_perfil(state),
    )
    perfil_update = PerfilUpdate.model_validate(result)
    return {
        "perfil_update": perfil_update.model_dump(mode="json"),
        "completed_nodes": ["agente_perfil"],
        "messages": [perfil_update.justificativa or "perfil atualizado"],
    }

