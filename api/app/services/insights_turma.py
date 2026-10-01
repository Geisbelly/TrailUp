"""Insights da turma: sinteses que a IA escreve para o professor (aba Insights).

Monta um retrato compacto da turma lendo o banco, pede ao modelo ate
`MAX_INSIGHTS` itens e grava o lote em `intervencoes` com um `geracao_id`
comum. O console le a tabela direto do Supabase — a API so entra aqui porque
escrever a sintese e trabalho de modelo de linguagem.

Cada parte do retrato e lida de forma independente: uma view que falte num
banco (ou que falhe) vira ausencia daquele sinal, nao falha da geracao. Campo
sem dado segue como None ate o modelo, que e instruido a nao transformar
ausencia em numero.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.insights import InsightGerado, InsightsTurmaSaida
from app.services.group_analysis import GroupAnalysisService
from app.services.llm import JsonLLMService, StructuredOutputError

logger = logging.getLogger(__name__)

MAX_INSIGHTS = 6
MAX_TEXTO = 280
MAX_BASE = 240
JANELA_RESPOSTAS_DIAS = 30
# Pedir de novo logo depois de gerar so gasta modelo: os dados nao mudaram.
INTERVALO_MINIMO = timedelta(minutes=5)


class InsightsIndisponiveis(Exception):
    """O banco ainda nao tem o esquema de insights (migration nao aplicada)."""


def _num(value: Any) -> float | None:
    try:
        return None if value is None else round(float(value), 1)
    except (TypeError, ValueError):
        return None


def _primeiro_nome(nome: Any) -> str | None:
    partes = str(nome or "").split()
    return partes[0] if partes else None


def montar_payload(
    alunos: list[dict[str, Any]],
    nomes: dict[str, str | None],
    abandono: dict[str, float | None],
    ultima_sessao: dict[str, date],
    respostas: dict[str, dict[str, Any]],
    topicos: list[dict[str, Any]],
    descartados: list[dict[str, Any]],
    hoje: date,
) -> tuple[dict[str, Any], dict[str, str]]:
    """Payload do modelo e o mapa ref -> aluno_id para traduzir a resposta."""
    refs: dict[str, str] = {}
    linhas: list[dict[str, Any]] = []
    perfis: dict[str, int] = {}
    for i, aluno in enumerate(sorted(alunos, key=lambda a: str(a.get("aluno_id"))), start=1):
        aluno_id = str(aluno["aluno_id"])
        ref = f"A{i}"
        refs[ref] = aluno_id
        perfil = aluno.get("perfil")
        if perfil:
            perfis[str(perfil)] = perfis.get(str(perfil), 0) + 1
        resp = respostas.get(aluno_id) or {}
        sessao = ultima_sessao.get(aluno_id)
        linhas.append(
            {
                "ref": ref,
                "nome": _primeiro_nome(nomes.get(aluno_id)),
                "perfil": perfil,
                "conclusao_pct": _num(aluno.get("percentual_concluido")),
                "respostas_30d": int(resp.get("respostas") or 0),
                "acertos_30d_pct": _num(resp.get("acertos_pct")),
                "abandono_material_pct": abandono.get(aluno_id),
                "dias_sem_sessao": (hoje - sessao).days if sessao else None,
            }
        )
    payload = {
        "turma": {"total_alunos": len(linhas), "perfis": perfis},
        "alunos": linhas,
        "topicos": topicos,
        "descartados_recentes": descartados,
    }
    return payload, refs


def validar_insights(saida: InsightsTurmaSaida, refs: dict[str, str]) -> list[dict[str, Any]]:
    """Descarta o que nao da para mostrar com seguranca: aluno fora da turma,
    texto vazio, repetido. Corta excesso em vez de rejeitar o lote inteiro."""
    validos: list[dict[str, Any]] = []
    vistos: set[str] = set()
    for item in saida.insights:
        texto_limpo = " ".join(item.texto.split())[:MAX_TEXTO]
        base = " ".join(item.base.split())[:MAX_BASE]
        if not texto_limpo or texto_limpo.lower() in vistos:
            continue
        aluno_id: str | None = None
        if item.escopo == "aluno":
            aluno_id = refs.get((item.aluno_ref or "").strip().upper())
            if aluno_id is None:
                logger.info("Insight descartado: aluno_ref %r fora da turma", item.aluno_ref)
                continue
        vistos.add(texto_limpo.lower())
        validos.append(
            {
                "natureza": item.natureza,
                "escopo": item.escopo,
                "aluno_id": aluno_id,
                "tipo": item.tipo,
                "texto": texto_limpo,
                "base": base or None,
            }
        )
        if len(validos) == MAX_INSIGHTS:
            break
    return validos


class InsightsTurmaService:
    def __init__(self, session: AsyncSession, llm: JsonLLMService) -> None:
        self.session = session
        self.llm = llm

    async def _ler(self, rotulo: str, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            result = await self.session.execute(text(sql), params)
            return [dict(row) for row in result.mappings()]
        except Exception as exc:
            logger.warning("Insights: sem '%s' (%s)", rotulo, exc)
            await self.session.rollback()
            return []

    async def ultima_geracao_em(self, classe_id: int) -> datetime | None:
        """Levanta `InsightsIndisponiveis` se `intervencoes` ainda nao tem as
        colunas de `20260929_01` — gerar agora so falharia no INSERT."""
        try:
            result = await self.session.execute(
                text(
                    """
                    SELECT MAX(created_at) FROM intervencoes
                     WHERE classe_id = :classe_id AND geracao_id IS NOT NULL
                    """
                ),
                {"classe_id": classe_id},
            )
        except ProgrammingError as exc:
            await self.session.rollback()
            raise InsightsIndisponiveis(str(exc)) from exc
        return result.scalar()

    async def coletar_contexto(self, classe_id: int, agora: datetime) -> tuple[dict[str, Any], dict[str, str]]:
        try:
            alunos = await GroupAnalysisService(self.session).fetch_alunos(classe_id)
        except Exception as exc:
            logger.warning("Insights: sem roster da classe %s (%s)", classe_id, exc)
            await self.session.rollback()
            alunos = []
        ids = [str(a["aluno_id"]) for a in alunos]
        if not ids:
            return montar_payload([], {}, {}, {}, {}, [], [], agora.date())

        params = {"classe_id": classe_id, "ids": ids}
        desde = (agora - timedelta(days=JANELA_RESPOSTAS_DIAS)).replace(tzinfo=None)

        nomes = {
            str(r["id"]): r["nome"]
            for r in await self._ler(
                "nomes", "SELECT id, nome FROM alunos WHERE CAST(id AS text) = ANY(:ids)", params
            )
        }
        abandono = {
            str(r["aluno_id"]): _num(r["taxa_abandono_pct"])
            for r in await self._ler(
                "abandono",
                """
                SELECT aluno_id, taxa_abandono_pct FROM vw_metricas_engajamento_aluno_classe
                 WHERE classe_id = :classe_id
                """,
                {"classe_id": classe_id},
            )
        }
        ultima_sessao = {
            str(r["aluno_id"]): r["ultimo_dia"]
            for r in await self._ler(
                "sessoes",
                """
                SELECT aluno_id, MAX(dia) AS ultimo_dia FROM vw_metricas_sessoes_aluno_dia
                 WHERE classe_id = :classe_id
                 GROUP BY aluno_id
                """,
                {"classe_id": classe_id},
            )
            if r["ultimo_dia"] is not None
        }
        # Respostas vem de eventos_aluno ("atividade:<id>"), que guarda a data
        # de cada uma; so contam atividades desta turma.
        respostas_sql = """
            WITH resp AS (
              SELECT e.aluno_id, t.id AS topico_id, t.nome AS topico, t.ordem,
                     (e.tipo = 'atividade_acertada') AS acertou
                FROM eventos_aluno e
                JOIN atividades a ON e.referencia = 'atividade:' || CAST(a.id AS text)
                JOIN topicos t ON t.id = a.topico_id
               WHERE t.classe_id = :classe_id
                 AND e.tipo IN ('atividade_acertada', 'atividade_errada')
                 AND e.criado_em >= CAST(:desde AS timestamp)
                 AND CAST(e.aluno_id AS text) = ANY(:ids)
            )
        """
        respostas = {
            str(r["aluno_id"]): r
            for r in await self._ler(
                "respostas por aluno",
                respostas_sql
                + """
                SELECT aluno_id, COUNT(*) AS respostas,
                       100.0 * AVG(CASE WHEN acertou THEN 1 ELSE 0 END) AS acertos_pct
                  FROM resp GROUP BY aluno_id
                """,
                {**params, "desde": desde},
            )
        }
        topicos = [
            {
                "topico": r["topico"],
                "respostas": int(r["respostas"]),
                "acertos_pct": _num(r["acertos_pct"]),
                "alunos_que_responderam": int(r["alunos"]),
            }
            for r in await self._ler(
                "respostas por topico",
                respostas_sql
                + """
                SELECT topico, MIN(ordem) AS ordem, COUNT(*) AS respostas,
                       COUNT(DISTINCT aluno_id) AS alunos,
                       100.0 * AVG(CASE WHEN acertou THEN 1 ELSE 0 END) AS acertos_pct
                  FROM resp GROUP BY topico_id, topico ORDER BY MIN(ordem), topico
                """,
                {**params, "desde": desde},
            )
        ]
        descartados = [
            {"texto": r["texto"], "motivo": r["motivo_descarte"]}
            for r in await self._ler(
                "descartados",
                """
                SELECT texto, motivo_descarte FROM intervencoes
                 WHERE classe_id = :classe_id AND status = 'dismissed'
                   AND resolved_at >= CAST(:desde AS timestamptz)
                 ORDER BY resolved_at DESC LIMIT 10
                """,
                {"classe_id": classe_id, "desde": agora - timedelta(days=JANELA_RESPOSTAS_DIAS)},
            )
        ]
        return montar_payload(alunos, nomes, abandono, ultima_sessao, respostas, topicos, descartados, agora.date())

    async def gravar(self, classe_id: int, itens: list[dict[str, Any]]) -> uuid.UUID:
        geracao_id = uuid.uuid4()
        for item in itens:
            await self.session.execute(
                text(
                    """
                    INSERT INTO intervencoes (
                      aluno_id, classe_id, escopo, natureza, tipo, texto, base,
                      contexto, geracao_id, status
                    ) VALUES (
                      CAST(:aluno_id AS uuid), :classe_id, :escopo, :natureza, :tipo, :texto, :base,
                      CAST(:contexto AS jsonb), CAST(:geracao_id AS uuid), 'pending'
                    )
                    """
                ),
                {
                    **item,
                    "classe_id": classe_id,
                    "contexto": json.dumps({"origem": "insights_turma"}),
                    "geracao_id": str(geracao_id),
                },
            )
        await self.session.commit()
        return geracao_id

    async def gerar(self, classe_id: int, agora: datetime | None = None) -> tuple[str, int]:
        """Gera e grava um lote. Devolve (status, itens gravados), com status
        `concluido`, `sem_dados` (turma vazia ou nada a dizer) ou `falhou`.

        Modelo indisponivel nao grava nada: nenhum insight de reserva e
        escrito, porque texto sem dado por tras seria inventado.
        """
        agora = agora or datetime.now(UTC)
        payload, refs = await self.coletar_contexto(classe_id, agora)
        if not refs:
            logger.info("Insights: classe %s sem alunos, nada a gerar", classe_id)
            return "sem_dados", 0
        try:
            saida = await self.llm.ainvoke_structured(
                prompt_name="insights_turma.txt",
                payload=payload,
                schema=InsightsTurmaSaida,
            )
        except StructuredOutputError as exc:
            logger.warning("Insights: modelo falhou para a classe %s: %s", classe_id, exc)
            return "falhou", 0
        itens = validar_insights(saida, refs)
        if not itens:
            return "sem_dados", 0
        await self.gravar(classe_id, itens)
        return "concluido", len(itens)


__all__ = [
    "INTERVALO_MINIMO",
    "InsightGerado",
    "InsightsIndisponiveis",
    "InsightsTurmaService",
    "montar_payload",
    "validar_insights",
]
