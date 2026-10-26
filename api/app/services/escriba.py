"""Escriba: o assistente de IA do professor no console.

Responde perguntas sobre as turmas do professor autenticado, com base nos
mesmos dados agregados que o dashboard mostra (views de métricas da turma) e
no retrato por aluno/tópico que os Insights já montam. Nada é gravado: a
conversa vive no navegador e volta aqui como `historico` a cada pergunta.

A turma pedida é conferida contra a lista de turmas DO PROFESSOR antes de
qualquer leitura — o modelo nunca recebe dado de turma alheia, então não
tem como responder sobre ela mesmo que a pergunta insista.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.escriba import EscribaSaida, PerguntaEscriba, RespostaEscriba
from app.services.insights_turma import InsightsTurmaService
from app.services.llm import JsonLLMService, StructuredOutputError
from app.services.pseudonimizacao import pseudonimizar_texto, restaurar_refs
from app.services.roteamento_ia import rota_ia_para_turma

logger = logging.getLogger(__name__)

# "Todas as turmas" com muitas turmas estouraria o contexto do modelo.
MAX_TURMAS = 5
MAX_RESPOSTA = 1500
MAX_HISTORICO = 8

_GERAL = (
    "total_alunos, taxa_media_conclusao_pct, media_nota_turma, taxa_media_acertos_pct, "
    "taxa_media_acertos_sem_erro_pct, taxa_media_abandono_pct, taxa_media_retorno_pct, "
    "sessoes_medias_por_aluno, tempo_medio_uso_seg, media_tentativas_por_questao, taxa_media_uso_chat_pct"
)
_POR_PERFIL = (
    "perfil_nome, total_alunos_segmento, taxa_conclusao_topicos_pct, media_nota, taxa_acertos_pct, "
    "taxa_abandono_pct, taxa_retorno_pct"
)


class TurmaNaoPermitida(Exception):
    """A turma pedida não é do professor autenticado."""


class EscribaIndisponivel(Exception):
    """O modelo não respondeu; não existe resposta de reserva."""


def _limpo(valor: Any) -> Any:
    if isinstance(valor, bool) or valor is None:
        return valor
    try:
        return round(float(valor), 1)
    except (TypeError, ValueError):
        return valor


def _linha(row: dict[str, Any]) -> dict[str, Any]:
    linha = {k: _limpo(v) if k not in ("perfil_nome", "metrica", "faixa") else v for k, v in row.items()}
    # As views devolvem nota 0 quando não há nota nenhuma; o dashboard mostra
    # "—" nesse caso (Fase 2) e o modelo não pode ler isso como "tirou zero".
    for chave in ("media_nota_turma", "media_nota"):
        if linha.get(chave) == 0:
            linha[chave] = None
    return linha


def _renumerar_refs(contextos: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Cada retrato numera A1... da própria turma; com várias turmas no mesmo
    payload, a ref precisa ser única. Devolve os contextos sem o mapa de nomes
    (que não vai ao modelo) e o mapa ref global -> nome."""
    nomes_por_ref: dict[str, Any] = {}
    saida: list[dict[str, Any]] = []
    n = 0
    for contexto in contextos:
        contexto = dict(contexto)
        locais = contexto.pop("_nomes_por_ref", None) or {}
        alunos = []
        for aluno in contexto.get("alunos") or []:
            n += 1
            nova = f"A{n}"
            nomes_por_ref[nova] = locais.get(aluno.get("ref"))
            alunos.append({**{k: v for k, v in aluno.items() if k not in ("nome", "email")}, "ref": nova})
        contexto["alunos"] = alunos
        saida.append(contexto)
    return saida, nomes_por_ref


class EscribaService:
    def __init__(self, session: AsyncSession, llm: JsonLLMService) -> None:
        self.session = session
        self.llm = llm

    async def turmas_do_professor(self, professor_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text("SELECT id, descricao FROM classe WHERE professor_id = CAST(:professor_id AS uuid) ORDER BY id"),
            {"professor_id": professor_id},
        )
        return [dict(r) for r in result.mappings()]

    async def _ler(self, rotulo: str, sql: str, classe_id: int) -> list[dict[str, Any]]:
        try:
            result = await self.session.execute(text(sql), {"classe_id": classe_id})
            return [_linha(dict(r)) for r in result.mappings()]
        except Exception as exc:
            logger.warning("Escriba: sem '%s' da classe %s (%s)", rotulo, classe_id, exc)
            await self.session.rollback()
            return []

    async def contexto_da_turma(self, turma: dict[str, Any], agora: datetime) -> dict[str, Any]:
        classe_id = int(turma["id"])
        geral = await self._ler(
            "geral", f"SELECT {_GERAL} FROM vw_metricas_turma_geral_classe WHERE classe_id = :classe_id", classe_id
        )
        por_perfil = await self._ler(
            "por perfil",
            # Mesmo recorte padrão do gráfico do dashboard: o perfil majoritário de
            # cada aluno. Os outros segmentos repetem o perfil com outro critério.
            f"SELECT {_POR_PERFIL} FROM vw_metricas_turma_perfil_classe "
            "WHERE classe_id = :classe_id AND segmento = 'majoritario' ORDER BY perfil_nome",
            classe_id,
        )
        distribuicao = await self._ler(
            "distribuicao",
            "SELECT metrica, faixa, total_alunos, percentual FROM vw_metricas_distribuicao_turma_classe "
            "WHERE classe_id = :classe_id ORDER BY metrica, faixa",
            classe_id,
        )
        retrato, refs_turma, nomes_por_ref = await InsightsTurmaService(self.session, self.llm).coletar_contexto(
            classe_id, agora, incluir_descartados=False
        )
        return {
            "turma": turma.get("descricao") or f"Turma {classe_id}",
            "geral": geral[0] if geral else None,
            "por_perfil": por_perfil,
            "distribuicao": distribuicao,
            # Só a ref (A1...) vai ao modelo (#195); `perguntar` renumera entre
            # turmas e troca as refs da resposta pelos nomes.
            "alunos": retrato.get("alunos", []),
            "topicos": retrato.get("topicos", []),
            "_nomes_por_ref": nomes_por_ref,
            # Privado: so para a rota de IA por idade (#195); sai antes do payload.
            "_aluno_ids": list(refs_turma.values()) if isinstance(refs_turma, dict) else [],
        }

    async def perguntar(self, professor_id: str, pedido: PerguntaEscriba, agora: datetime | None = None) -> RespostaEscriba:
        agora = agora or datetime.now(UTC)
        turmas = await self.turmas_do_professor(professor_id)
        if pedido.classe_id is not None:
            escopo = [t for t in turmas if int(t["id"]) == pedido.classe_id]
            if not escopo:
                raise TurmaNaoPermitida(str(pedido.classe_id))
        else:
            escopo = turmas[:MAX_TURMAS]

        if not escopo:
            return RespostaEscriba(
                resposta="Você ainda não tem turmas no TrailUp. Quando criar uma e os alunos começarem a estudar, eu consigo ler os dados dela.",
                turmas=[],
                gerado_em=agora,
            )

        contextos = [await self.contexto_da_turma(t, agora) for t in escopo]
        # #195: ids so para a rota de IA por idade; nunca vao ao modelo.
        aluno_ids = [i for c in contextos for i in (c.get("_aluno_ids") or [])]
        turmas_payload, nomes_por_ref = _renumerar_refs(contextos)
        # Pergunta e histórico do professor citam alunos pelo nome (e o histórico
        # volta com os nomes que restauramos): vão ao modelo como refs.
        payload = {
            "pergunta": pseudonimizar_texto(pedido.pergunta.strip(), nomes_por_ref),
            "historico": [
                {**m.model_dump(), "texto": pseudonimizar_texto(m.texto, nomes_por_ref)}
                for m in pedido.historico[-MAX_HISTORICO:]
            ],
            "turmas": turmas_payload,
        }
        for turma_payload in payload["turmas"]:
            turma_payload.pop("_aluno_ids", None)
        try:
            # #195: basta um aluno menor (ou sem data) nas turmas -> so OpenAI.
            async with rota_ia_para_turma(self.session, aluno_ids):
                saida = await self.llm.ainvoke_structured(prompt_name="escriba.txt", payload=payload, schema=EscribaSaida)
        except StructuredOutputError as exc:
            logger.warning("Escriba: modelo falhou: %s", exc)
            raise EscribaIndisponivel(str(exc)) from exc

        resposta = (restaurar_refs(saida.resposta, nomes_por_ref) or "").strip()[:MAX_RESPOSTA]
        if not resposta:
            raise EscribaIndisponivel("resposta vazia")
        return RespostaEscriba(resposta=resposta, turmas=[int(t["id"]) for t in escopo], gerado_em=agora)
