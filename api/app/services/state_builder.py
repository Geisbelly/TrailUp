from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.context import ContextRepository
from app.schemas.api import AnalisarPayload


async def build_initial_state(
    session: AsyncSession,
    aluno_id: str,
    payload: AnalisarPayload,
    context_repository_factory: type[ContextRepository] = ContextRepository,
) -> dict:
    context_repo = context_repository_factory(session)
    context = await context_repo.fetch_aluno_context(aluno_id=aluno_id, classe_id=payload.classe_id)
    aluno = context["aluno"]
    desempenho = context["desempenho_recente"]
    conteudo_foco_id = await context_repo.resolve_conteudo_foco_id(
        topico_id=payload.topico_id,
        atividade_id=payload.atividade_id,
        fallback_topico_id=desempenho.get("topico_recente_id"),
    )
    gerar_materiais = bool(
        payload.modo == "prova"
        or float(desempenho.get("media_acertos", 1)) < 0.5
        or bool(desempenho.get("topico_concluido"))
    )

    return {
        "aluno_id": aluno_id,
        "classe_id": payload.classe_id,
        "nome_aluno": aluno["nome"],
        "email_aluno": aluno["email"],
        "modo_operacao": aluno.get("modo_operacao") or "imediato",
        "modo_resposta": aluno.get("modo_resposta") or "imediato",
        "perfil_brainhex": context["perfil_brainhex"],
        "historico_eventos": context["historico_eventos"],
        "progresso_trilha": context["progresso_trilha"],
        "desempenho_recente": context["desempenho_recente"],
        "trilha_atual": context["trilha_atual"],
        "ia_descricao_atual": context["ia_descricao_atual"],
        "emocao_atual": None,
        "emocao_historico": [],
        "frame_b64": payload.frame_b64,
        "eventos_novos": [evento.model_dump(mode="json") for evento in payload.eventos_novos],
        "payload_topico_id": payload.topico_id,
        "payload_atividade_id": payload.atividade_id,
        "payload_modo": payload.modo,
        "conteudo_foco_id": conteudo_foco_id,
        "perfil_update": None,
        "trilha_config": None,
        "conteudo_adaptado": None,
        "materiais_gerados": None,
        "gerar_materiais": gerar_materiais,
        "materiais_cache_hit": False,
        "notificacao_payload": None,
        "ui_config": None,
        "textos_gerados": [],
        "next": [],
        "ciclo_id": str(uuid4()),
        "acoes_aplicadas": [],
        "completed_nodes": [],
        "messages": [],
        "erros": [],
        "review_decision": None,
        "review_feedback": None,
    }
