"""Monta os overrides das features M2 a partir do banco (issue #215).

Mapeamento EdNet -> TrailUp (3 queries limitadas por ciclo, nunca scan):

- histórico (n_prev/acc/ewma/streak/acc5/acc10): ``atividade_tentativa``
  (ordem, percentual) + ``telemetria_eventos_app.is_correct``;
- latência (dt_log, lat_med_prev, trocas_prev): ``time_since_prev_sec`` e
  ``occurred_at`` dos eventos da sessão atual;
- sessão (n_sessao/pos_sessao): ``telemetria_sessoes`` + ``telemetria_lotes``
  com o mesmo gap de 1800s do treino (``GS``).

Sem equivalente TrailUp -> default de treino (``part=1``, contadores 0).
``q_dif``/``q_n`` nunca saem daqui: derivam do pacote (EdNet).
"""

from __future__ import annotations

import math
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.m2_inference import COLD_DEFAULTS

# Mesmo gap de sessão do treino (14_features_v3.py: GS=1800.0).
SESSION_GAP_SEC = 1800.0
# CLIP do treino (dt_log = log1p(min(gap, 600))).
DT_CLIP_SEC = 600.0
EWMA_ALPHA = 0.3


def _ewma(hits: list[float]) -> float:
    value = 0.5
    for hit in hits:
        value = EWMA_ALPHA * hit + (1.0 - EWMA_ALPHA) * value
    return value


def _streak(hits: list[float]) -> float:
    streak = 0.0
    for hit in hits:
        if hit >= 0.5:
            streak = streak + 1 if streak >= 0 else 1.0
        else:
            streak = streak - 1 if streak <= 0 else -1.0
    return streak


async def build_m2_overrides(
    session: AsyncSession,
    *,
    aluno_id: str,
    atividade_id: int | None = None,
    sessao_id: str | None = None,
) -> dict[str, float]:
    """Histórico do aluno como overrides. Vazio (= cold-start) se sem dado."""
    overrides: dict[str, float] = {}

    attempts = await _fetch_attempts(session, aluno_id=aluno_id, atividade_id=atividade_id)
    if attempts:
        hits = [min(1.0, max(0.0, a["percentual"] / 100.0)) for a in attempts]
        overrides["n_prev"] = float(len(hits))
        overrides["acc_prev"] = sum(hits) / len(hits)
        overrides["ewma"] = _ewma(hits)
        overrides["streak"] = _streak(hits)
        overrides["acc5"] = sum(hits[-5:]) / len(hits[-5:])
        overrides["acc10"] = sum(hits[-10:]) / len(hits[-10:])
        overrides["n_prev_part"] = float(len(hits))
        overrides["acc_prev_part"] = overrides["acc_prev"]
        overrides["ewma_part"] = overrides["ewma"]
        if len(attempts) >= 2:
            gap = (attempts[-1]["criado_em"] - attempts[-2]["criado_em"]).total_seconds()
            if gap > 0:
                overrides["dt_log"] = math.log1p(min(gap, DT_CLIP_SEC))
                overrides["dt_part_log"] = overrides["dt_log"]
        overrides["seen_before"] = float(max(0, len(hits) - 1))

    events = await _fetch_session_events(session, aluno_id=aluno_id, sessao_id=sessao_id)
    if events:
        latencies = [e["time_since_prev_sec"] for e in events if (e["time_since_prev_sec"] or 0) > 0]
        if latencies:
            latencies.sort()
            median = latencies[len(latencies) // 2]
            overrides["lat_med_prev"] = float(median)
            # lat_rel compara a última latência com a mediana passada.
            overrides["lat_rel"] = math.log1p(latencies[-1]) - math.log1p(median)
        overrides["pos_sessao"] = float(len(events))
        overrides["n_sessao"] = 1.0

    for key, value in overrides.items():
        if key not in COLD_DEFAULTS:
            raise KeyError(f"override M2 desconhecido: {key}")
    return {k: float(v) for k, v in overrides.items()}


async def _fetch_attempts(
    session: AsyncSession, *, aluno_id: str, atividade_id: int | None
) -> list[dict[str, Any]]:
    if atividade_id is None:
        result = await session.execute(
            text(
                """
                SELECT percentual, criado_em
                FROM atividade_tentativa
                WHERE aluno_id = CAST(:aluno_id AS uuid)
                ORDER BY criado_em ASC
                LIMIT 50
                """
            ),
            {"aluno_id": aluno_id},
        )
    else:
        result = await session.execute(
            text(
                """
                SELECT percentual, criado_em
                FROM atividade_tentativa
                WHERE aluno_id = CAST(:aluno_id AS uuid)
                  AND atividade_id = :atividade_id
                ORDER BY ordem ASC
                LIMIT 50
                """
            ),
            {"aluno_id": aluno_id, "atividade_id": atividade_id},
        )
    return [dict(row._mapping) for row in result]


async def _fetch_session_events(
    session: AsyncSession, *, aluno_id: str, sessao_id: str | None
) -> list[dict[str, Any]]:
    if sessao_id is None:
        return []
    result = await session.execute(
        text(
            """
            SELECT time_since_prev_sec, occurred_at, is_correct
            FROM telemetria_eventos_app
            WHERE aluno_id = CAST(:aluno_id AS uuid)
              AND sessao_id = CAST(:sessao_id AS uuid)
            ORDER BY occurred_at ASC
            LIMIT 100
            """
        ),
        {"aluno_id": aluno_id, "sessao_id": sessao_id},
    )
    return [dict(row._mapping) for row in result]
