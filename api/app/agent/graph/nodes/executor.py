from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.evento import EventoRepository
from app.repositories.ia_descricao import IADescricaoRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.notificacao import NotificacaoRepository
from app.repositories.perfil import PerfilRepository
from app.repositories.trilha import TrilhaRepository
from app.schemas.notificacao import NotificacaoPayload
from app.schemas.perfil import PerfilUpdate
from app.schemas.texto_gerado import TextoGerado
from app.schemas.trilha_config import TrilhaConfig


async def executor(
    state: dict[str, Any],
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, Any]:
    if state.get("review_decision") == "rejected":
        return {
            "acoes_aplicadas": ["revisao_rejeitada"],
            "completed_nodes": ["executor"],
            "messages": ["executor finalizado sem aplicar mudancas"],
        }

    async with session_factory() as session:
        perfil_repo = PerfilRepository(session)
        trilha_repo = TrilhaRepository(session)
        notificacao_repo = NotificacaoRepository(session)
        ia_repo = IADescricaoRepository(session)
        materiais_repo = MateriaisRepository(session)
        evento_repo = EventoRepository(session)
        acoes: list[str] = []

        try:
            perfil_update = None
            if state.get("perfil_update"):
                perfil_update = PerfilUpdate.model_validate(state["perfil_update"])
                await perfil_repo.atualizar_afinidades(state["aluno_id"], perfil_update)
                acoes.append("perfil_atualizado")

            recomendacao_trilha = None
            if state.get("trilha_config"):
                trilha_config = TrilhaConfig.model_validate(state["trilha_config"])
                await trilha_repo.aplicar_config(state["aluno_id"], trilha_config)
                recomendacao_trilha = trilha_config.justificativa
                acoes.append("trilha_reconfigurada")

            if state.get("notificacao_payload"):
                notificacao = NotificacaoPayload.model_validate(state["notificacao_payload"])
                texto = None
                if state.get("textos_gerados"):
                    texto = TextoGerado.model_validate(state["textos_gerados"][0])
                await notificacao_repo.enfileirar(state["aluno_id"], notificacao, texto)
                acoes.append("notificacao_enfileirada")

            if state.get("materiais_gerados"):
                if state.get("materiais_cache_hit"):
                    acoes.append("materiais_reutilizados")
                else:
                    await materiais_repo.salvar(
                        aluno_id=state["aluno_id"],
                        conteudo_id=state.get("conteudo_foco_id") or (state.get("conteudo_adaptado") or {}).get("conteudo_id"),
                        materiais=state["materiais_gerados"],
                    )
                    acoes.append("materiais_gerados")

            if any(
                state.get(key)
                for key in ["perfil_update", "trilha_config", "ui_config", "conteudo_adaptado", "emocao_atual"]
            ):
                await ia_repo.upsert_cycle_summary(
                    aluno_id=state["aluno_id"],
                    perfil_update=perfil_update,
                    recomendacao_trilha=recomendacao_trilha,
                    insights={
                        "ciclo_id": state["ciclo_id"],
                        "emocao_atual": state.get("emocao_atual"),
                        "ui_config": state.get("ui_config"),
                        "conteudo_adaptado": state.get("conteudo_adaptado"),
                        "review_decision": state.get("review_decision"),
                        "review_feedback": state.get("review_feedback"),
                    },
                )
                acoes.append("ia_descricao_atualizada")

            await evento_repo.log(
                aluno_id=state["aluno_id"],
                tipo="ciclo_executado",
                referencia=state["ciclo_id"],
                valor=float(len(acoes)),
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return {
        "acoes_aplicadas": acoes,
        "completed_nodes": ["executor"],
        "messages": [f"executor aplicou {len(acoes)} acoes"],
    }
