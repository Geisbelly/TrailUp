"""Ponta a ponta da `20261102_09`: o lote gravado direto pelo app entra na fila vencido.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. O banco descartável é
o de `test_e2e_analise_de_lote_pela_fila.py` (com o gatilho de via da `20261029_01` e a fila da
`20261029_09`), com a `20261102_09` por cima.

O que se mede:

- o lote direto (como `authenticated`) vence na hora e a primeira reivindicação já o devolve;
- o aluno que declara `via = 'api'` continua direto e vence na hora (a via é do gatilho BEFORE);
- o lote da API mantém os 5 min de folga e a reivindicação não o pega;
- o downgrade devolve os 5 min também ao lote direto.

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from tests import test_e2e_analise_de_lote_pela_fila as fila
from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base
from tests import test_e2e_sessao_fecha_pelo_banco as f2

pytestmark = fila.pytestmark

A, T = f2.A, f2.T

# O INSERT do PostgREST com a via que o cliente declarou (o gatilho BEFORE a ignora para `authenticated`).
LOTE_DIRETO_DECLARANDO_API = """
INSERT INTO public.telemetria_lotes
  (id, sessao_id, aluno_id, classe_id, screen_name, route_name, flush_reason, captured_at,
   study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count, scroll_distance_px,
   max_depth_px, frame_sent, payload, via, fallback_motivo)
VALUES (%s, %s, %s, 1, 'tela', '/rota', 'interval', %s, 1, 1, 1, 0, 0, 0, 0, false, '{}'::jsonb, 'api', 'rede')
RETURNING id
"""


def _m():
    return base._modulo("20261102_09_lote_direto_sem_folga.py")


def _upgrade(c) -> None:
    for sql in base._sql_de(_m(), "upgrade"):
        c.execute(sql)


def _downgrade(c) -> None:
    for sql in base._sql_de(_m(), "downgrade"):
        c.execute(sql)


@pytest.fixture
def banco():
    with fila._banco() as (c, sessao):
        _upgrade(c)
        yield c, sessao


def _via(c, lote: uuid.UUID) -> str:
    return c.execute("SELECT via FROM public.telemetria_lotes WHERE id = %s", (lote,)).fetchone()[0]


def test_lote_direto_vence_na_hora_e_o_worker_o_pega(banco):
    c, sessao = banco
    lote = f2._lote_direto(c, sessao, "interval", T, aluno=A)[0]
    assert _via(c, lote) == "direta"
    item = fila._item(c, lote)
    assert item is not None
    assert -1 < item["espera_min"] <= 0
    assert fila._reivindicar(c) == [lote]


def test_aluno_que_declara_api_continua_direto_e_vence_na_hora(banco):
    c, sessao = banco
    with c.transaction():
        f2._como_aluno(c, A)
        lote = c.execute(LOTE_DIRETO_DECLARANDO_API, (uuid.uuid4(), sessao, A, T + timedelta(minutes=1))).fetchone()[0]
    assert _via(c, lote) == "direta"
    assert fila._item(c, lote)["espera_min"] <= 0


def test_lote_da_api_mantem_a_folga(banco):
    c, sessao = banco
    lote = fila._lote(c, sessao)
    assert _via(c, lote) == "api"
    assert 4 < fila._item(c, lote)["espera_min"] < 6
    assert fila._reivindicar(c) == []


def test_os_dois_caminhos_juntos_so_o_direto_sai(banco):
    c, sessao = banco
    pela_api = fila._lote(c, sessao)
    direto = f2._lote_direto(c, sessao, "interval", T, aluno=A)[0]
    assert fila._reivindicar(c) == [direto]
    assert fila._item(c, pela_api)["travado_em"] is None


def test_downgrade_devolve_a_folga_ao_lote_direto(banco):
    c, sessao = banco
    _downgrade(c)
    lote = f2._lote_direto(c, sessao, "interval", T, aluno=A)[0]
    assert 4 < fila._item(c, lote)["espera_min"] < 6


def test_upgrade_e_idempotente(banco):
    c, sessao = banco
    _upgrade(c)
    lote = f2._lote_direto(c, sessao, "interval", T, aluno=A)[0]
    assert fila._item(c, lote)["espera_min"] <= 0
