"""Amarra o motor de sugestão ao banco: cria, revisa e registra cada decisão.

O motor (``sugestao_material.py``) continua puro, sem saber que banco existe —
é o que o mantém trivialmente testável. Aqui fica a orquestração:

* ``garantir_sugestao`` — a primeira vez cria e loga ``criada``; nas seguintes
  devolve a que já está gravada, sem recalcular. A sugestão é feita **uma vez**;
  mudanças vêm por revisão, não por regeneração silenciosa (regenerar do zero
  apagaria a história que a métrica de efetividade precisa).
* ``revisar_sugestao`` — roda a revisão do ciclo e registra a decisão, inclusive
  quando ela é "não mexer".

Nada aqui levanta exceção por ausência das tabelas: o repositório devolve
``None`` quando a migração não foi aplicada, e a sugestão é camada de consumo —
não pode impedir o material de ser gerado.
"""

from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.context import ContextRepository
from app.repositories.personalizacao_progresso import PersonalizacaoProgressoRepository
from app.repositories.sugestao_material import SugestaoMaterialRepository
from app.services.sugestao_material import (
    LIMIAR_MUDANCA_PADRAO,
    MINIMO_EVIDENCIA_PADRAO,
    revisar_ordem_material,
    sugerir_ordem_material,
)
from app.services.sugestao_sinais import (
    indexar_progresso_por_conteudo,
    sinais_por_formato,
)


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
    )
    if not sugestao["ordem"]:
        # Sem formato gerado ainda não há o que sugerir. Não grava linha vazia:
        # ela viraria "sugestão versão 1" sem conteúdo e sujaria a métrica.
        return None

    salvo = await repo.salvar(
        aluno_id=aluno_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        classe_id=classe_id,
        formato_inicial=sugestao["formato_inicial"],
        ordem=sugestao["ordem"],
        origem="inicial",
        evidencia={"modo_operacao": modo_operacao},
        versao=1,
    )
    if not salvo:
        return None

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
        evidencia={"modo_operacao": modo_operacao},
    )

    return {
        **(salvo or {}),
        "aluno_id": aluno_id,
        "topico_id": topico_id,
        "conteudo_id": conteudo_id,
        "classe_id": classe_id,
        "formato_inicial": sugestao["formato_inicial"],
        "ordem": sugestao["ordem"],
        "origem": "inicial",
    }


async def revisar_sugestao(
    repo: SugestaoMaterialRepository,
    *,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None = None,
    classe_id: int | None = None,
    sinais_por_formato: dict[str, dict[str, Any]] | None = None,
    minimo_evidencia: int = MINIMO_EVIDENCIA_PADRAO,
    limiar_mudanca: float = LIMIAR_MUDANCA_PADRAO,
) -> dict[str, Any] | None:
    """Roda a revisão do ciclo e grava a decisão. Devolve a decisão tomada."""
    atual = await repo.buscar(
        aluno_id=aluno_id, topico_id=topico_id, conteudo_id=conteudo_id
    )
    if not atual:
        return None

    ordem_antes = atual.get("ordem") or []
    decisao = revisar_ordem_material(
        ordem_atual=ordem_antes,
        sinais_por_formato=sinais_por_formato or {},
        minimo_evidencia=minimo_evidencia,
        limiar_mudanca=limiar_mudanca,
    )

    versao_atual = int(atual.get("versao") or 1)

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
            evidencia=decisao["evidencia"],
        )
        return decisao

    nova_ordem = decisao["ordem"]
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
        evidencia=decisao["evidencia"],
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

    Sem ``topico_id`` não há alvo — a sugestão é por (aluno, tópico), e revisar
    "a sugestão do aluno em geral" não significa nada.
    """
    if topico_id is None:
        return None

    materiais = ((telemetry_payload or {}).get("time_metrics") or {}).get("materials") or []
    ritmo = ((stage_outputs or {}).get("reading") or {}).get("reading_material_pace") or []
    if not materiais:
        # Lote sem material aberto não é evidência sobre formato nenhum. Registrar
        # "mantida" aqui encheria o histórico de ciclos que não olharam nada.
        return None

    itens = await PersonalizacaoProgressoRepository(session).listar_por_aluno(
        aluno_id=aluno_id, classe_id=classe_id, topico_id=topico_id
    )

    sinais = sinais_por_formato(
        materiais_telemetria=materiais,
        ritmo_por_material=ritmo,
        progresso_por_conteudo=indexar_progresso_por_conteudo(itens),
    )
    if not sinais:
        return None

    return await revisar_sugestao(
        SugestaoMaterialRepository(session),
        aluno_id=aluno_id,
        topico_id=topico_id,
        classe_id=classe_id,
        sinais_por_formato=sinais,
    )


async def garantir_sugestao_do_aluno(
    session: AsyncSession,
    *,
    aluno_id: str,
    classe_id: int,
    topico_id: int,
    formatos_disponiveis: Iterable[str],
) -> dict[str, Any] | None:
    """Cria (uma vez) a sugestão do aluno para um tópico, ao servir o material.

    Lê perfil e modo de operação do contexto do aluno — as duas entradas do
    motor. Perfil vazio não impede: o motor cai na ordem canônica, que ainda é
    melhor do que nenhuma ordem.
    """
    contexto = await ContextRepository(session).fetch_aluno_context(
        aluno_id=aluno_id, classe_id=classe_id
    )
    aluno = contexto.get("aluno") if isinstance(contexto.get("aluno"), dict) else {}

    return await garantir_sugestao(
        SugestaoMaterialRepository(session),
        aluno_id=aluno_id,
        topico_id=topico_id,
        classe_id=classe_id,
        perfis=contexto.get("perfil_brainhex") or [],
        formatos_disponiveis=formatos_disponiveis,
        modo_operacao=aluno.get("modo_operacao"),
    )
