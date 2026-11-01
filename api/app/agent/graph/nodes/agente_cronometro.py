"""A IA desliga o cronometro das atividades de um aluno (#136, fase 4).

Regra fixa, sem modelo de linguagem: `tentativas_atividade.decidir_desligar_cronometro`. O no so
transforma a decisao em payload; quem grava e o executor, em `aluno_cronometro` (origem `ia`, com o
motivo), e so se o aluno nao tiver escolhido. O professor e avisado por `intervencoes`.
"""

from typing import Any

from app.services.tentativas_atividade import decidir_desligar_cronometro


def decisao_do_estado(state: dict[str, Any]):
    tentativas = (state.get("desempenho_recente") or {}).get("tentativas")
    return decidir_desligar_cronometro(tentativas, state.get("memoria_aluno"))


async def agente_cronometro(state: dict[str, Any]) -> dict[str, Any]:
    decisao = decisao_do_estado(state)
    if decisao is None:
        return {"completed_nodes": ["agente_cronometro"], "messages": ["cronometro mantido"]}
    return {
        "cronometro_payload": decisao.model_dump(mode="json"),
        "completed_nodes": ["agente_cronometro"],
        "messages": [f"cronometro: desligar ({decisao.criterio})"],
    }
