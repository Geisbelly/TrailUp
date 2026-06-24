from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.settings import Settings
from app.schemas.notificacao import NotificacaoPayload
from app.services.llm import JsonLLMService


def _fallback_notificacao(state: dict[str, Any]) -> dict[str, Any]:
    emocao = state.get("emocao_atual") or {}
    valencia = float(emocao.get("valencia", 0))
    horario = datetime.now(UTC) + timedelta(minutes=5 if valencia < -0.4 else 30)

    if valencia < -0.4:
        return {
            "tipo": "suporte",
            "titulo": "Vamos ajustar o ritmo",
            "corpo": "Percebemos sinais de friccao. O proximo passo sera mais guiado e curto.",
            "horario": horario.isoformat(),
            "prioridade": 2,
            "contexto": {"motivo": "emocao_negativa"},
        }

    return {
        "tipo": "lembrete",
        "titulo": "Sua trilha esta pronta",
        "corpo": "Ha uma sugestao de proximo passo esperando por voce.",
        "horario": horario.isoformat(),
        "prioridade": 1,
        "contexto": {"motivo": "engajamento"},
    }


async def agente_notificacao(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    result = await llm.ainvoke_json(
        prompt_name="notificacao.txt",
        payload={
            "emocao_atual": state.get("emocao_atual"),
            "eventos_novos": state.get("eventos_novos", []),
            "desempenho_recente": state.get("desempenho_recente", {}),
        },
        fallback_factory=lambda: _fallback_notificacao(state),
    )
    notificacao = NotificacaoPayload.model_validate(result)
    return {
        "notificacao_payload": notificacao.model_dump(mode="json"),
        "completed_nodes": ["agente_notificacao"],
        "messages": [f"notificacao definida: {notificacao.tipo}"],
    }

