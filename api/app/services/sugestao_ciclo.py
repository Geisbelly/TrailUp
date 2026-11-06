"""Amarra o motor de sugestão ao banco: cria, revisa e registra cada decisão.

O motor (``sugestao_material.py``) continua puro, sem saber que banco existe —
é o que o mantém trivialmente testável. Aqui fica a orquestração:

* ``garantir_sugestao`` — a primeira vez cria e loga ``criada``; nas seguintes
  devolve a que já está gravada, sem recalcular. A sugestão é feita **uma vez**;
  mudanças vêm por revisão, não por regeneração silenciosa (regenerar do zero
  apagaria a história que a métrica de efetividade precisa).
* ``revisar_sugestao`` — roda a revisão do ciclo e registra a decisão, inclusive
  quando ela é "não mexer".

Toda decisão, de criação ou de revisão, recebe as mesmas três entradas além do
perfil e da telemetria (``_contexto_da_decisao``):

* o que o conteúdo pede (``conteudo_demanda_formato``, ``demanda_formato.py``);
* a dificuldade do aluno no tópico (acerto médio das atividades concluídas);
* o alerta de estudo recorrente (``dificuldade`` ou ``abandono``, ver
  ``estado_de_estudo.py``), que só vai para o log; a dificuldade já entra na ordem
  pela camada 0, com o dado do tópico, e a recorrência não soma de novo.

O banco marca a sugestão para revisão quando o aluno conclui uma atividade ou a
análise do conteúdo muda (``revisao_pendente``, ``20261102_07``). A marca é
atendida na próxima leitura da sugestão (``garantir_sugestao_do_aluno``) ou no
próximo ciclo de telemetria do aluno, mesmo sem material no lote.

Nada aqui levanta exceção por ausência das tabelas: o repositório devolve
``None`` quando a migração não foi aplicada, e a sugestão é camada de consumo —
não pode impedir o material de ser gerado.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.repositories.context import ContextRepository
from app.repositories.mental_state import MentalStateHistoryRepository
from app.repositories.personalizacao_progresso import PersonalizacaoProgressoRepository
from app.repositories.sugestao_material import SugestaoMaterialRepository
from app.services import demanda_formato
from app.services.evidencias_pedagogicas import CATALOGO_VERSAO
from app.services.memoria_aluno import _JANELA_RECORRENCIA, _detectar_recorrencia
from app.services.openai_rag import OpenAIRagError, OpenAIRagService
from app.services.sugestao_material import (
    LIMIAR_MUDANCA_PADRAO,
    MINIMO_EVIDENCIA_PADRAO,
    revisar_ordem_material,
    sugerir_ordem_material,
)
from app.services.sugestao_sinais import (
    indexar_progresso_por_conteudo,
    ordem_de_consumo,
    sinais_por_formato,
)

logger = logging.getLogger(__name__)


def resumo_da_demanda(demanda: dict[str, Any] | None) -> dict[str, Any] | None:
    """O que o log guarda da análise do conteúdo: origem, versão, assinatura e o nível de cada
    dimensão. Sem os motivos, que já estão nos itens da ordem."""
    if not demanda:
        return None
    return {
        "origem": demanda.get("origem"),
        "versao": demanda.get("versao"),
        "assinatura": demanda.get("assinatura"),
        "dimensoes": {
            dimensao: (dado or {}).get("nivel")
            for dimensao, dado in (demanda.get("dimensoes") or {}).items()
        },
    }


async def _ler_demanda(session: AsyncSession, topico_id: int) -> dict[str, Any] | None:
    try:
        async with session.begin_nested():
            return await demanda_formato.ler_do_topico(session, topico_id)
    except Exception as exc:  # noqa: BLE001 - entrada opcional, não pode derrubar a sugestão
        logger.warning("Falha ao ler demanda de formato: topico=%s erro=%s", topico_id, exc)
        return None


async def _estado_mental_recorrente(session: AsyncSession, aluno_id: str) -> dict[str, Any] | None:
    """Mesma regra de ``memoria_aluno`` (3 dos últimos 5 ciclos com o mesmo alerta de estudo)."""
    try:
        async with session.begin_nested():
            registros = await MentalStateHistoryRepository(session).listar_por_aluno(
                aluno_id=aluno_id, limit=_JANELA_RECORRENCIA
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Falha ao ler estado mental para a sugestao: %s", exc)
        return None
    recorrencia = _detectar_recorrencia(registros)
    if not recorrencia.recorrente:
        return None
    return {
        "estado_mental_recorrente": {
            "kind": recorrencia.kind,
            "ocorrencias": recorrencia.ocorrencias,
            "janela": _JANELA_RECORRENCIA,
        }
    }


async def _contexto_da_decisao(
    session: AsyncSession,
    repo: SugestaoMaterialRepository,
    *,
    aluno_id: str,
    topico_id: int,
) -> dict[str, Any]:
    return {
        "demanda": await _ler_demanda(session, topico_id),
        "desempenho_topico": await repo.desempenho_no_topico(aluno_id=aluno_id, topico_id=topico_id),
        "observacoes": await _estado_mental_recorrente(session, aluno_id),
    }


async def _anexar_citacoes_rag(
    ordem: list[dict[str, Any]], *, session: AsyncSession | None
) -> None:
    """Anexa citações públicas à evidência local, sem interferir na decisão."""
    if session is None:
        return
    citacoes_existentes: dict[str, dict[str, Any]] = {}
    for item in ordem:
        for evidencia_item in item.get("evidencias") or []:
            if not isinstance(evidencia_item, dict):
                continue
            for citacao in evidencia_item.get("referencias_rag") or []:
                if not isinstance(citacao, dict):
                    continue
                regra_id = citacao.get("regra")
                fontes_citadas = citacao.get("fontes")
                if (
                    not isinstance(regra_id, str)
                    or not re.fullmatch(r"RD-(?:0[1-9]|1[0-2])", regra_id)
                    or not isinstance(fontes_citadas, list)
                ):
                    continue
                fontes_seguras = sorted(
                    {
                        fonte
                        for fonte in fontes_citadas
                        if isinstance(fonte, str) and re.fullmatch(r"DAT-\d{2}", fonte)
                    }
                )
                if not fontes_seguras:
                    continue
                citacoes_existentes[regra_id] = {
                    "regra": regra_id,
                    "fontes": fontes_seguras,
                    "confianca": str(citacao.get("confianca") or "")[:120],
                }
    fontes_cobertas = {
        fonte for citacao in citacoes_existentes.values() for fonte in citacao["fontes"]
    }
    fontes = sorted(
        {
            fonte
            for item in ordem
            for evidencia_item in item.get("evidencias") or []
            if isinstance(evidencia_item, dict)
            for fonte in evidencia_item.get("fontes") or []
            if isinstance(fonte, str) and fonte not in fontes_cobertas
        }
    )
    citacoes = list(citacoes_existentes.values())
    if fontes:
        try:
            novas = await OpenAIRagService(get_settings()).buscar_evidencias_pedagogicas(
                session=session, fontes=fontes
            )
        except Exception as exc:  # noqa: BLE001 - RAG é apenas enriquecimento opcional.
            logger.info("sugestao.rag_indisponivel tipo=%s", type(exc).__name__)
            novas = []
        citacoes.extend(novas)

    for item in ordem:
        for evidencia_item in item.get("evidencias") or []:
            if not isinstance(evidencia_item, dict):
                continue
            fontes_da_evidencia = {
                fonte
                for fonte in evidencia_item.get("fontes") or []
                if isinstance(fonte, str)
            }
            referencias = [
                citacao
                for citacao in citacoes
                if fontes_da_evidencia.intersection(citacao["fontes"])
            ]
            if referencias:
                evidencia_item["referencias_rag"] = referencias


async def garantir_sugestao(
    repo: SugestaoMaterialRepository,
    *,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None = None,
    classe_id: int | None = None,
    perfis: Iterable[Any] = (),
    formatos_disponiveis: Iterable[str] = (),
    modo_operacao: str | None = None,
    demanda: dict[str, Any] | None = None,
    desempenho_topico: dict[str, Any] | None = None,
    observacoes: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Devolve a sugestão do aluno, criando-a se ainda não existir."""
    existente = await repo.buscar(
        aluno_id=aluno_id, topico_id=topico_id, conteudo_id=conteudo_id
    )
    if existente:
        return existente

    sugestao = sugerir_ordem_material(
        perfis=perfis,
        formatos_disponiveis=formatos_disponiveis,
        modo_operacao=modo_operacao,
        demanda=demanda,
        desempenho_topico=desempenho_topico,
    )
    if not sugestao["ordem"]:
        # Sem formato gerado ainda não há o que sugerir. Não grava linha vazia:
        # ela viraria "sugestão versão 1" sem conteúdo e sujaria a métrica.
        return None
    await _anexar_citacoes_rag(sugestao["ordem"], session=getattr(repo, "session", None))

    # A versão do catálogo vai junto: o "por quê" de cada item cita regras do
    # catálogo, e uma auditoria precisa saber com que texto foi justificado.
    evidencia_inicial: dict[str, Any] = {
        "modo_operacao": modo_operacao,
        "catalogo_versao": CATALOGO_VERSAO,
    }
    if demanda:
        evidencia_inicial["demanda_do_conteudo"] = resumo_da_demanda(demanda)
    if desempenho_topico:
        evidencia_inicial["desempenho_topico"] = desempenho_topico
    if sugestao.get("necessidades"):
        evidencia_inicial["necessidades"] = sugestao["necessidades"]
    if observacoes:
        evidencia_inicial["observacoes"] = observacoes
    salvo = await repo.criar(
        aluno_id=aluno_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        classe_id=classe_id,
        formato_inicial=sugestao["formato_inicial"],
        ordem=sugestao["ordem"],
        evidencia=evidencia_inicial,
    )
    if not salvo:
        # Outra chamada criou entre o ``buscar`` e o INSERT (o app pede a mesma
        # sugestão em paralelo). Ela já logou ``criada``; aqui só devolvemos a
        # linha dela. Logar de novo daria dois ``criada`` para uma sugestão.
        return await repo.buscar(
            aluno_id=aluno_id, topico_id=topico_id, conteudo_id=conteudo_id
        )

    await repo.registrar_log(
        sugestao_id=salvo.get("id"),
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        versao=int(salvo.get("versao") or 1),
        acao="criada",
        ordem_antes=None,
        ordem_depois=sugestao["ordem"],
        motivos=[
            motivo
            for item in sugestao["ordem"]
            for motivo in (item.get("motivos") or [])
        ],
        evidencia=evidencia_inicial,
    )

    return {
        **salvo,
        "aluno_id": aluno_id,
        "topico_id": topico_id,
        "conteudo_id": conteudo_id,
        "classe_id": classe_id,
        "formato_inicial": sugestao["formato_inicial"],
        "ordem": sugestao["ordem"],
        "origem": "inicial",
        "evidencia": evidencia_inicial,
        "revisao_pendente": False,
    }


async def revisar_sugestao(
    repo: SugestaoMaterialRepository,
    *,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None = None,
    classe_id: int | None = None,
    sinais_por_formato: dict[str, dict[str, Any]] | None = None,
    evidencia_extra: dict[str, Any] | None = None,
    minimo_evidencia: int = MINIMO_EVIDENCIA_PADRAO,
    limiar_mudanca: float = LIMIAR_MUDANCA_PADRAO,
    desempenho_topico: dict[str, Any] | None = None,
    demanda: dict[str, Any] | None = None,
    observacoes: dict[str, Any] | None = None,
    atual: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Roda a revisão do ciclo e grava a decisão. Devolve a decisão tomada.

    Se o banco tinha marcado a sugestão para revisão, o motivo vai para o log como
    ``gatilho`` e a marca é tirada depois da decisão, seja ela qual for.
    """
    if atual is None:
        atual = await repo.buscar(
            aluno_id=aluno_id, topico_id=topico_id, conteudo_id=conteudo_id
        )
    if not atual:
        return None
    pendente = bool(atual.get("revisao_pendente"))
    if pendente and atual.get("revisao_motivo"):
        evidencia_extra = {**(evidencia_extra or {}), "gatilho": atual.get("revisao_motivo")}

    ordem_antes = atual.get("ordem") or []
    decisao = revisar_ordem_material(
        ordem_atual=ordem_antes,
        sinais_por_formato=sinais_por_formato or {},
        minimo_evidencia=minimo_evidencia,
        limiar_mudanca=limiar_mudanca,
        desempenho_topico=desempenho_topico,
        demanda=demanda,
        observacoes=observacoes,
    )

    versao_atual = int(atual.get("versao") or 1)
    # A evidência extra entra no LOG, não na decisão: são observações do ciclo
    # (ex.: a ordem em que o aluno abriu o material) que o motor não usa para
    # decidir, mas sem as quais a aderência não seria mensurável depois.
    evidencia_do_log = {**decisao["evidencia"], **(evidencia_extra or {})}

    if decisao["acao"] != "revisada":
        # "Mantida" NÃO toca na sugestão — nem para atualizar o timestamp: um
        # UPDATE aqui incrementaria a versão e faria o histórico parecer cheio
        # de revisões que nunca aconteceram.
        await repo.registrar_log(
            sugestao_id=atual.get("id"),
            aluno_id=aluno_id,
            classe_id=classe_id or atual.get("classe_id"),
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            versao=versao_atual,
            acao="mantida",
            ordem_antes=ordem_antes,
            ordem_depois=None,
            motivos=decisao["motivos"],
            evidencia=evidencia_do_log,
        )
        if pendente:
            await repo.limpar_revisao_pendente(
                sugestao_id=int(atual["id"]), marcada_em=atual.get("revisao_pendente_em")
            )
        return decisao

    nova_ordem = decisao["ordem"]
    await _anexar_citacoes_rag(nova_ordem, session=getattr(repo, "session", None))
    salvo = await repo.salvar(
        aluno_id=aluno_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        classe_id=classe_id or atual.get("classe_id"),
        formato_inicial=nova_ordem[0]["formato"] if nova_ordem else None,
        ordem=nova_ordem,
        origem="revisao",
        evidencia=decisao["evidencia"],
    )

    await repo.registrar_log(
        sugestao_id=(salvo or {}).get("id") or atual.get("id"),
        aluno_id=aluno_id,
        classe_id=classe_id or atual.get("classe_id"),
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        # A versão que vai pro log é a que o banco devolveu, não versao_atual+1
        # calculado aqui: o incremento acontece no UPDATE, e é ele que manda.
        versao=int((salvo or {}).get("versao") or versao_atual + 1),
        acao="revisada",
        ordem_antes=ordem_antes,
        ordem_depois=nova_ordem,
        motivos=decisao["motivos"],
        evidencia=evidencia_do_log,
    )
    if pendente:
        await repo.limpar_revisao_pendente(
            sugestao_id=int(atual["id"]), marcada_em=atual.get("revisao_pendente_em")
        )

    return decisao


async def revisar_sugestoes_do_ciclo(
    session: AsyncSession,
    *,
    aluno_id: str,
    classe_id: int,
    topico_id: int | None,
    telemetry_payload: dict[str, Any] | None,
    stage_outputs: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Ponto de entrada do ciclo de análise: revisa a sugestão com a telemetria.

    Duas fontes de revisão, que se somam:

    * a telemetria do lote, para o tópico do lote. Lote sem material aberto não é
      evidência sobre formato nenhum e não revisa por si;
    * as sugestões do aluno nesta turma que o banco marcou para revisão (atividade
      concluída, análise do conteúdo nova), em qualquer tópico, mesmo sem material
      no lote. Antes a atividade concluída não revisava nada.

    Devolve a decisão do tópico do lote, quando houve.
    """
    repo = SugestaoMaterialRepository(session)
    decisao: dict[str, Any] | None = None

    materiais = ((telemetry_payload or {}).get("time_metrics") or {}).get("materials") or []
    ritmo = ((stage_outputs or {}).get("reading") or {}).get("reading_material_pace") or []
    if topico_id is not None and materiais:
        itens = await PersonalizacaoProgressoRepository(session).listar_por_aluno(
            aluno_id=aluno_id, classe_id=classe_id, topico_id=topico_id
        )
        sinais = sinais_por_formato(
            materiais_telemetria=materiais,
            ritmo_por_material=ritmo,
            progresso_por_conteudo=indexar_progresso_por_conteudo(itens),
        )
        if sinais:
            decisao = await revisar_sugestao(
                repo,
                aluno_id=aluno_id,
                topico_id=topico_id,
                classe_id=classe_id,
                sinais_por_formato=sinais,
                evidencia_extra={"ordem_observada": ordem_de_consumo(materiais)},
                **await _contexto_da_decisao(
                    session, repo, aluno_id=aluno_id, topico_id=topico_id
                ),
            )

    for pendente in await repo.topicos_com_revisao_pendente(aluno_id=aluno_id, classe_id=classe_id):
        resultado = await revisar_sugestao(
            repo,
            aluno_id=aluno_id,
            topico_id=pendente,
            classe_id=classe_id,
            **await _contexto_da_decisao(session, repo, aluno_id=aluno_id, topico_id=pendente),
        )
        if pendente == topico_id and decisao is None:
            decisao = resultado

    return decisao


async def garantir_sugestao_do_aluno(
    session: AsyncSession,
    *,
    aluno_id: str,
    classe_id: int,
    topico_id: int,
    formatos_disponiveis: Iterable[str],
) -> dict[str, Any] | None:
    """Cria (uma vez) a sugestão do aluno para um tópico, ao servir o material.

    Lê perfil e modo de operação do contexto do aluno, as entradas de preferência
    do motor. Perfil vazio não impede: o motor cai na ordem canônica, que ainda é
    melhor do que nenhuma ordem. Se o banco marcou a sugestão para revisão, revisa
    antes de devolver: o aluno recebe a ordem que já considera o que mudou.
    """
    repo = SugestaoMaterialRepository(session)
    existente = await repo.buscar(aluno_id=aluno_id, topico_id=topico_id)
    if existente and not existente.get("revisao_pendente"):
        return existente

    decisao_ctx = await _contexto_da_decisao(session, repo, aluno_id=aluno_id, topico_id=topico_id)
    if existente:
        await revisar_sugestao(
            repo,
            aluno_id=aluno_id,
            topico_id=topico_id,
            classe_id=classe_id,
            atual=existente,
            **decisao_ctx,
        )
        return await repo.buscar(aluno_id=aluno_id, topico_id=topico_id)

    contexto = await ContextRepository(session).fetch_aluno_context(
        aluno_id=aluno_id, classe_id=classe_id
    )
    aluno = contexto.get("aluno") if isinstance(contexto.get("aluno"), dict) else {}

    return await garantir_sugestao(
        repo,
        aluno_id=aluno_id,
        topico_id=topico_id,
        classe_id=classe_id,
        perfis=contexto.get("perfil_brainhex") or [],
        formatos_disponiveis=formatos_disponiveis,
        modo_operacao=aluno.get("modo_operacao"),
        **decisao_ctx,
    )
