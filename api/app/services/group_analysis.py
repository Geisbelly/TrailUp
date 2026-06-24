"""Adequacao de grupo: analisa a distribuicao de perfis BrainHex por classe.

Diferente da adequacao por individuo (agentes/behavioral_personalization),
este servico observa as necessidades agregadas de uma turma inteira: quais
perfis predominam, como o desempenho medio se distribui e qual o perfil
predominante da classe. O resultado e materializado em classe_perfil_summary
para consumo rapido pelo endpoint docente.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Perfis BrainHex canonicos (chave normalizada -> rotulo de exibicao).
BRAINHEX_PROFILES: dict[str, str] = {
    "seeker": "Seeker",
    "survivor": "Survivor",
    "daredevil": "Daredevil",
    "mastermind": "Mastermind",
    "conqueror": "Conqueror",
    "socializer": "Socializer",
    "achiever": "Achiever",
}

# Aliases de grafia que devem ser mapeados para o perfil canonico.
_PROFILE_ALIASES: dict[str, str] = {
    "socialiser": "socializer",
}


def _normalize_profile(nome: str | None) -> str | None:
    if not nome:
        return None
    chave = str(nome).strip().lower()
    chave = _PROFILE_ALIASES.get(chave, chave)
    return chave if chave in BRAINHEX_PROFILES else None


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def compute_distribuicao(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Computa contagem/percentual por perfil a partir do perfil dominante de cada aluno.

    `rows` deve conter um registro por aluno com a chave `perfil` (perfil dominante
    ja resolvido) e, opcionalmente, metricas de desempenho.
    """
    contagem: dict[str, int] = {chave: 0 for chave in BRAINHEX_PROFILES}
    total_alunos = 0
    desempenhos: list[dict[str, float]] = []

    for row in rows:
        chave = _normalize_profile(row.get("perfil"))
        total_alunos += 1
        if chave is not None:
            contagem[chave] += 1
        desempenhos.append(
            {
                "media_acertos": _safe_float(row.get("media_acertos")),
                "percentual_concluido": _safe_float(row.get("percentual_concluido")),
                "nota_media": _safe_float(row.get("nota_media")),
            }
        )

    com_perfil = sum(contagem.values())
    distribuicao: dict[str, dict[str, Any]] = {}
    for chave, label in BRAINHEX_PROFILES.items():
        quantidade = contagem[chave]
        percentual = round((quantidade / com_perfil) * 100, 2) if com_perfil else 0.0
        distribuicao[chave] = {
            "perfil": label,
            "quantidade": quantidade,
            "percentual": percentual,
        }

    perfil_predominante: str | None = None
    if com_perfil:
        chave_top = max(BRAINHEX_PROFILES, key=lambda c: (contagem[c], c))
        if contagem[chave_top] > 0:
            perfil_predominante = BRAINHEX_PROFILES[chave_top]

    if desempenhos:
        media_desempenho = {
            "media_acertos": round(sum(d["media_acertos"] for d in desempenhos) / len(desempenhos), 2),
            "percentual_concluido": round(
                sum(d["percentual_concluido"] for d in desempenhos) / len(desempenhos), 2
            ),
            "nota_media": round(sum(d["nota_media"] for d in desempenhos) / len(desempenhos), 2),
        }
    else:
        media_desempenho = {"media_acertos": 0.0, "percentual_concluido": 0.0, "nota_media": 0.0}

    return {
        "distribuicao": distribuicao,
        "perfil_predominante": perfil_predominante,
        "total_alunos": total_alunos,
        "media_desempenho": media_desempenho,
    }


class GroupAnalysisService:
    """Computa e persiste o summary de perfis BrainHex de uma classe."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _fetch_rows(self, classe_id: int) -> list[dict[str, Any]]:
        """Busca, por aluno da classe, o perfil dominante e o desempenho agregado."""
        result = await self.session.execute(
            text(
                """
                WITH roster AS (
                  SELECT DISTINCT ca.aluno_id
                  FROM classe_aluno ca
                  WHERE ca.classe_id = :classe_id
                ),
                perfil_dominante AS (
                  SELECT DISTINCT ON (ap.aluno_id)
                    ap.aluno_id,
                    p.nome AS perfil,
                    ap.afinidade
                  FROM aluno_perfil ap
                  JOIN perfil p ON p.id = ap.perfil_id
                  JOIN roster r ON r.aluno_id = ap.aluno_id
                  ORDER BY ap.aluno_id, ap.afinidade DESC, p.nome ASC
                ),
                desempenho AS (
                  SELECT
                    ca.aluno_id,
                    AVG(COALESCE(ca.acertospercentual, 0)) AS media_acertos,
                    AVG(COALESCE(ca.porcentagemconcluida, 0)) AS percentual_concluido,
                    AVG(COALESCE(ca.notamedia, 0)) AS nota_media
                  FROM classe_aluno ca
                  WHERE ca.classe_id = :classe_id
                  GROUP BY ca.aluno_id
                )
                SELECT
                  r.aluno_id,
                  pd.perfil,
                  d.media_acertos,
                  d.percentual_concluido,
                  d.nota_media
                FROM roster r
                LEFT JOIN perfil_dominante pd ON pd.aluno_id = r.aluno_id
                LEFT JOIN desempenho d ON d.aluno_id = r.aluno_id
                """
            ),
            {"classe_id": classe_id},
        )
        return [dict(row) for row in result.mappings()]

    async def compute_summary(self, classe_id: int) -> dict[str, Any]:
        rows = await self._fetch_rows(classe_id)
        summary = compute_distribuicao(rows)
        summary["classe_id"] = classe_id
        return summary

    async def upsert_summary(self, classe_id: int, summary: dict[str, Any] | None = None) -> dict[str, Any]:
        if summary is None:
            summary = await self.compute_summary(classe_id)

        result = await self.session.execute(
            text(
                """
                INSERT INTO classe_perfil_summary (
                  classe_id,
                  distribuicao,
                  perfil_predominante,
                  total_alunos,
                  media_desempenho,
                  atualizado_em
                )
                VALUES (
                  :classe_id,
                  CAST(:distribuicao AS JSONB),
                  :perfil_predominante,
                  :total_alunos,
                  CAST(:media_desempenho AS JSONB),
                  NOW()
                )
                ON CONFLICT (classe_id)
                DO UPDATE SET
                  distribuicao = EXCLUDED.distribuicao,
                  perfil_predominante = EXCLUDED.perfil_predominante,
                  total_alunos = EXCLUDED.total_alunos,
                  media_desempenho = EXCLUDED.media_desempenho,
                  atualizado_em = NOW()
                RETURNING atualizado_em
                """
            ),
            {
                "classe_id": classe_id,
                "distribuicao": json.dumps(summary.get("distribuicao", {}), ensure_ascii=False, default=str),
                "perfil_predominante": summary.get("perfil_predominante"),
                "total_alunos": summary.get("total_alunos", 0),
                "media_desempenho": json.dumps(summary.get("media_desempenho", {}), ensure_ascii=False, default=str),
            },
        )
        row = result.mappings().first()
        if row is not None:
            summary["atualizado_em"] = row["atualizado_em"]
        return summary
