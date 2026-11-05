import logging
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.context import ContextRepository
from app.schemas.api import AnalisarPayload
from app.services.memoria_aluno import ler_memoria

logger = logging.getLogger(__name__)


async def _foco_de_estudo(context_repo: Any, **kwargs: Any) -> dict[str, Any] | None:
    """Tópico e próximo conteúdo para o texto da notificação. Nunca derruba o ciclo.

    É só texto: sem ele a notificação sai sem o nome do tópico, como antes.
    """
    buscar = getattr(context_repo, "fetch_foco_de_estudo", None)
    if buscar is None:
        return None
    try:
        return await buscar(**kwargs)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Falha ao ler o foco de estudo do aluno: %s", exc)
        return None


async def _arco_narrativo(context_repo: Any, *, classe_id: int | None) -> str | None:
    """Arco da turma (#145) para os prompts de geração do grafo. Nunca derruba o ciclo.

    Sem ele o material do caminho Python sai sem a história da turma, como antes. O caminho
    principal (worker + microservice) lê o arco por conta própria, em `fetch_personalizacao_context`.
    """
    buscar = getattr(context_repo, "fetch_arco_narrativo", None)
    if buscar is None:
        return None
    try:
        return await buscar(classe_id=classe_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Falha ao ler o arco narrativo da turma: %s", exc)
        return None


async def _personalizacao_retida(context_repo: Any, *, classe_id: int | None) -> bool:
    """Turma retida pelo estudo (#13): o grafo só mede. Repositório sem o método (testes) = não retida.

    Ao contrário do foco, erro aqui sobe: decidir "não retida" por falha de leitura entregaria
    adequação ao grupo de comparação sem ninguém ver.
    """
    buscar = getattr(context_repo, "fetch_personalizacao_retida", None)
    if buscar is None:
        return False
    return bool(await buscar(classe_id=classe_id))


async def build_initial_state(
    session: AsyncSession,
    aluno_id: str,
    payload: AnalisarPayload,
    context_repository_factory: type[ContextRepository] = ContextRepository,
) -> dict:
    context_repo = context_repository_factory(session)
    context = await context_repo.fetch_aluno_context(aluno_id=aluno_id, classe_id=payload.classe_id)
    memoria = await ler_memoria(session, aluno_id=aluno_id, classe_id=payload.classe_id)
    aluno = context["aluno"]
    desempenho = context["desempenho_recente"]
    conteudo_foco_id = await context_repo.resolve_conteudo_foco_id(
        topico_id=payload.topico_id,
        atividade_id=payload.atividade_id,
        fallback_topico_id=desempenho.get("topico_recente_id"),
    )
    foco_estudo = await _foco_de_estudo(
        context_repo,
        aluno_id=aluno_id,
        classe_id=payload.classe_id,
        topico_id=payload.topico_id or desempenho.get("topico_recente_id"),
    )
    personalizacao_retida = await _personalizacao_retida(context_repo, classe_id=payload.classe_id)
    arco_narrativo = await _arco_narrativo(context_repo, classe_id=payload.classe_id)
    gerar_materiais = bool(
        payload.modo == "prova"
        or float(desempenho.get("media_acertos", 100)) < 50
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
        "perfil_ativo": aluno.get("perfil_ativo"),
        "historico_eventos": context["historico_eventos"],
        "progresso_trilha": context["progresso_trilha"],
        "desempenho_recente": context["desempenho_recente"],
        "trilha_atual": context["trilha_atual"],
        "ia_descricao_atual": context["ia_descricao_atual"],
        "memoria_aluno": memoria.model_dump(mode="json"),
        "foco_estudo": foco_estudo,
        "personalizacao_retida": personalizacao_retida,
        "arco_narrativo_turma": arco_narrativo,
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
        "m2_overrides": None,
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
