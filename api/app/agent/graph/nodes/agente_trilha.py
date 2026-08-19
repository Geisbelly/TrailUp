from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agent.graph.guardrails import (
    checar_evidencia_dominio,
    checar_ordem_sequencial,
    checar_topicos_existem,
    gerar_validado,
)
from app.core.settings import Settings
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.ia_decision_logs import IADecisionLogRepository
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
        "ajustes": ["reforcar fundamentos"] if float(state.get("desempenho_recente", {}).get("media_acertos", 100)) < 50 else ["manter progressao"],
        "justificativa": "reorganizacao baseada em progresso e perfil atualizado",
    }


async def agente_trilha(
    state: dict[str, Any],
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, Any]:
    llm = JsonLLMService(settings)

    async with session_factory() as session:
        topicos_classe = await ConteudoClasseRepository(session).listar_topicos_classe(
            state["classe_id"]
        )

        async def _auditar(violacao, fase) -> None:
            await IADecisionLogRepository(session).log(
                aluno_id=state["aluno_id"],
                classe_id=state["classe_id"],
                source="graph",
                stage="agente_trilha",
                trigger_event=fase,
                decision_summary=f"{violacao.regra}: {violacao.mensagem}",
            )
            await session.commit()

        trilha_config = await gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={
                "classe_id": state.get("classe_id"),
                "perfil_update": state.get("perfil_update"),
                "progresso_trilha": state.get("progresso_trilha", {}),
                "desempenho_recente": state.get("desempenho_recente", {}),
            },
            schema=TrilhaConfig,
            guardrails=[checar_ordem_sequencial, checar_topicos_existem, checar_evidencia_dominio],
            fallback_factory=lambda: _fallback_trilha(state),
            contexto={
                "topicos_classe": topicos_classe,
                "progresso_trilha": state.get("progresso_trilha", {}),
                "desempenho_recente": state.get("desempenho_recente", {}),
            },
            on_violation=_auditar,
        )

    return {
        "trilha_config": trilha_config.model_dump(mode="json"),
        "completed_nodes": ["agente_trilha"],
        "messages": [trilha_config.justificativa],
    }
