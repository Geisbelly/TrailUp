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

from app.repositories.sugestao_material import SugestaoMaterialRepository
from app.services.sugestao_material import (
    LIMIAR_MUDANCA_PADRAO,
    MINIMO_EVIDENCIA_PADRAO,
    revisar_ordem_material,
    sugerir_ordem_material,
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
