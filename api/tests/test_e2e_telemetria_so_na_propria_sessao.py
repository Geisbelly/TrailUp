"""Ponta a ponta da `20261029_08`: o aluno só grava telemetria na própria sessão (e no próprio lote).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. O banco descartável é
o mesmo da `test_e2e_sessao_fecha_pelo_banco.py` (esqueleto da produção, RLS e policies de posse da
`20260831_01`, consentimento RESTRICTIVE da `20261024_02`, gatilho de via da `20261029_01` e a
`20261029_07`), com a `20261029_08` por cima. As policies são exercidas no papel de verdade:
`authenticated` com as claims do aluno, como o PostgREST faz, e não por leitura de código.

O que se mede:

- B não grava lote, evento nem métrica de tempo na sessão de A, nem métrica de tempo no lote de A;
- B não move um evento próprio para a sessão de A pelo upsert de `client_event_id`;
- A grava tudo na própria sessão, pelo mesmo SQL que o caminho direto do app gera;
- a API (`postgres`, pelo `TelemetriaRepository` de verdade) e o `service_role` não são afetados;
- o downgrade tira só o que a migration pôs, e com ele a escrita cruzada volta a passar (as asserções
  de recusa não são vacuosas).

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import os
import uuid
from datetime import timedelta

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e da telemetria na propria sessao recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_sessao_fecha_pelo_banco as f2  # noqa: E402

A, B, T = f2.A, f2.B, f2.T

TABELAS = ("telemetria_lotes", "telemetria_eventos_app", "telemetria_time_metric_entries")
POLICIES = tuple(f"{t}_sessao_propria_{acao}" for t in TABELAS for acao in ("ins", "upd"))
HELPERS = ("app_minha_sessao_de_telemetria(uuid)", "app_meu_lote_de_telemetria(uuid)")


def _m():
    """Carregado tarde: antes da migration existir, só os testes que a usam falham."""
    return base._modulo("20261029_08_telemetria_so_na_propria_sessao.py")


def _upgrade(c) -> None:
    for sql in base._sql_de(_m(), "upgrade"):
        c.execute(sql)


def _downgrade(c) -> None:
    for sql in base._sql_de(_m(), "downgrade"):
        c.execute(sql)


# `supabase.from("telemetria_eventos_app").upsert(rows, {onConflict: "sessao_id,client_event_id"})`
# em `telemetriaApi.ts` (persistTelemetryBatchDirect), recortado às colunas que importam aqui.
EVENTO_DIRETO = """
INSERT INTO public.telemetria_eventos_app
  (client_event_id, sessao_id, aluno_id, classe_id, screen_name, route_name, event_group, event_name,
   event_source, occurred_at, payload)
VALUES (%s, %s, %s, 1, 'tela', '/rota', 'nav', 'abriu', 'mobile_app', %s, '{}'::jsonb)
ON CONFLICT (sessao_id, client_event_id) DO UPDATE SET
  client_event_id = EXCLUDED.client_event_id,
  sessao_id = EXCLUDED.sessao_id,
  aluno_id = EXCLUDED.aluno_id,
  occurred_at = EXCLUDED.occurred_at
RETURNING id
"""

# `supabase.from("telemetria_time_metric_entries").upsert(metricRows, {onConflict:
# "lote_id,scope,entry_key", ignoreDuplicates: true})`. O esqueleto não traz o índice único nem o gatilho
# que preenche `entry_key`, então o INSERT é cru e leva `entry_key` explícito.
METRICA_DIRETA = """
INSERT INTO public.telemetria_time_metric_entries
  (lote_id, sessao_id, aluno_id, classe_id, scope, entry_key, dwell_sec, active_sec, captured_at)
VALUES (%s, %s, %s, 1, 'topic', 'topic:1', 10, 10, %s)
RETURNING id
"""


def _evento(c, sessao: uuid.UUID, *, aluno: uuid.UUID, client_event_id: str = "ev-1"):
    with c.transaction():
        f2._como_aluno(c, aluno)
        return c.execute(EVENTO_DIRETO, (client_event_id, sessao, aluno, T)).fetchone()


def _metrica(c, lote: uuid.UUID, sessao: uuid.UUID, *, aluno: uuid.UUID):
    with c.transaction():
        f2._como_aluno(c, aluno)
        return c.execute(METRICA_DIRETA, (lote, sessao, aluno, T)).fetchone()


def _lote_de(c, sessao: uuid.UUID) -> uuid.UUID:
    return c.execute(
        "SELECT id FROM public.telemetria_lotes WHERE sessao_id = %s ORDER BY captured_at LIMIT 1", (sessao,)
    ).fetchone()[0]


def _contagem(c, tabela: str, *, aluno: uuid.UUID, sessao: uuid.UUID) -> int:
    return c.execute(
        f"SELECT count(*) FROM public.{tabela} WHERE aluno_id = %s AND sessao_id = %s", (aluno, sessao)
    ).fetchone()[0]


@pytest.fixture
def banco():
    """A e B, cada um com uma sessão aberta pelo caminho direto do app (upsert + lote `interval`)."""
    with f2._banco() as c:
        _upgrade(c)
        sa, sb = uuid.uuid4(), uuid.uuid4()
        f2._abre(c, sa, aluno=A)
        f2._abre(c, sb, aluno=B)
        yield c, sa, sb


def _recusado(fn, *args, **kwargs) -> None:
    with pytest.raises(psycopg.errors.InsufficientPrivilege, match="row-level security"):
        fn(*args, **kwargs)


def test_b_nao_grava_lote_na_sessao_de_a(banco):
    c, sa, _ = banco
    _recusado(f2._lote_direto, c, sa, "session_end", T, aluno=B)
    assert _contagem(c, "telemetria_lotes", aluno=B, sessao=sa) == 0
    # e por isso a sessão de A não fica com lote alheio para a I17 acusar
    assert f2._sessao(c, sa)["ended_at"] is None
    assert f2._i17(c) == []


def test_a_grava_lote_na_propria_sessao(banco):
    c, sa, _ = banco
    assert f2._lote_direto(c, sa, "session_end", T, aluno=A) is not None
    assert f2._sessao(c, sa)["ended_at"] == T


def test_b_nao_grava_evento_na_sessao_de_a(banco):
    c, sa, _ = banco
    _recusado(_evento, c, sa, aluno=B)
    assert _contagem(c, "telemetria_eventos_app", aluno=B, sessao=sa) == 0


def test_a_grava_e_regrava_evento_na_propria_sessao(banco):
    """O reenvio do mesmo `client_event_id` (upsert) passa pelo ramo de UPDATE, e também é permitido."""
    c, sa, _ = banco
    primeiro = _evento(c, sa, aluno=A)
    assert primeiro is not None
    assert _evento(c, sa, aluno=A) == primeiro
    assert _contagem(c, "telemetria_eventos_app", aluno=A, sessao=sa) == 1


def test_b_nao_move_evento_proprio_para_a_sessao_de_a(banco):
    """O `_update_own` só confere `aluno_id`; a `_sessao_propria_upd` confere para onde o evento vai."""
    c, sa, sb = banco
    _evento(c, sb, aluno=B)
    with pytest.raises(psycopg.errors.InsufficientPrivilege, match="row-level security"):
        with c.transaction():
            f2._como_aluno(c, B)
            c.execute(
                "UPDATE public.telemetria_eventos_app SET sessao_id = %s WHERE sessao_id = %s AND aluno_id = %s",
                (sa, sb, B),
            )
    assert _contagem(c, "telemetria_eventos_app", aluno=B, sessao=sb) == 1


def test_b_nao_grava_metrica_na_sessao_nem_no_lote_de_a(banco):
    c, sa, sb = banco
    lote_a, lote_b = _lote_de(c, sa), _lote_de(c, sb)
    # sessão de A com o lote de A
    _recusado(_metrica, c, lote_a, sa, aluno=B)
    # sessão própria, lote de A: a sessão sozinha não basta
    _recusado(_metrica, c, lote_a, sb, aluno=B)
    # lote próprio, sessão de A: o lote sozinho também não
    _recusado(_metrica, c, lote_b, sa, aluno=B)
    assert c.execute(
        "SELECT count(*) FROM public.telemetria_time_metric_entries WHERE aluno_id = %s", (B,)
    ).fetchone()[0] == 0


def test_a_grava_metrica_no_proprio_lote(banco):
    c, sa, _ = banco
    assert _metrica(c, _lote_de(c, sa), sa, aluno=A) is not None
    assert _contagem(c, "telemetria_time_metric_entries", aluno=A, sessao=sa) == 1


def test_caminho_da_api_nao_e_afetado(monkeypatch):
    """A API grava como `postgres`, pelo `TelemetriaRepository` de verdade; a RLS não se aplica a ela."""
    with f2._banco() as c:
        _upgrade(c)
        s = uuid.uuid4()
        passos = [("interval", T - timedelta(seconds=30)), ("screen_blur", T)]
        f2._pelo_repositorio(base._dsn_para(c.info.dbname), s, passos, monkeypatch)
        assert _contagem(c, "telemetria_lotes", aluno=A, sessao=s) == 2
        assert f2._sessao(c, s)["ended_at"] == T


def test_service_role_nao_e_afetado(banco):
    """`service_role` tem BYPASSRLS: grava em qualquer sessão (é o papel de manutenção e dos jobs)."""
    c, sa, _ = banco
    with c.transaction():
        c.execute("SET LOCAL ROLE service_role")
        c.execute(f2.LOTE_DIRETO, (uuid.uuid4(), sa, B, "interval", T))
        c.execute(EVENTO_DIRETO, ("ev-svc", sa, B, T))
    assert _contagem(c, "telemetria_lotes", aluno=B, sessao=sa) == 1
    assert _contagem(c, "telemetria_eventos_app", aluno=B, sessao=sa) == 1


def test_helpers_so_para_authenticated(banco):
    """O Supabase dá EXECUTE em função nova para `anon` por padrão; a migration tira. As policies chamam
    os helpers no papel de quem escreve, então `authenticated` precisa de EXECUTE."""
    c, _, _ = banco
    for helper in HELPERS:
        pode = dict(
            c.execute(
                "SELECT r, has_function_privilege(r, %s, 'EXECUTE') FROM unnest(ARRAY['anon','authenticated']) r",
                (f"public.{helper}",),
            ).fetchall()
        )
        assert pode == {"anon": False, "authenticated": True}, helper


def test_helper_so_responde_pela_propria_posse(banco):
    c, sa, sb = banco
    lote_a, lote_b = _lote_de(c, sa), _lote_de(c, sb)  # antes de virar B: a RLS esconderia o de A
    with c.transaction():
        f2._como_aluno(c, B)
        assert c.execute("SELECT public.app_minha_sessao_de_telemetria(%s)", (sb,)).fetchone()[0] is True
        assert c.execute("SELECT public.app_minha_sessao_de_telemetria(%s)", (sa,)).fetchone()[0] is False
        assert c.execute("SELECT public.app_minha_sessao_de_telemetria(%s)", (uuid.uuid4(),)).fetchone()[0] is False
        assert c.execute("SELECT public.app_meu_lote_de_telemetria(%s)", (lote_b,)).fetchone()[0] is True
        assert c.execute("SELECT public.app_meu_lote_de_telemetria(%s)", (lote_a,)).fetchone()[0] is False


def test_downgrade_tira_policies_e_helpers_e_reabre(banco):
    c, sa, _ = banco
    _downgrade(c)
    assert c.execute(
        "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND policyname = ANY(%s)", (list(POLICIES),)
    ).fetchall() == []
    assert c.execute(
        "SELECT proname FROM pg_proc WHERE proname IN ('app_minha_sessao_de_telemetria', 'app_meu_lote_de_telemetria')"
    ).fetchall() == []
    # as policies de posse anteriores continuam lá
    restantes = {
        r[0]
        for r in c.execute(
            "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telemetria_lotes'"
        ).fetchall()
    }
    assert {"telemetria_lotes_insert_own", "telemetria_lotes_consentimento_ins"} <= restantes
    # sem a migration, a escrita cruzada volta a passar: é ela que recusa nos testes acima
    assert f2._lote_direto(c, sa, "interval", T, aluno=B) is not None
    assert _evento(c, sa, aluno=B) is not None


def test_upgrade_e_idempotente(banco):
    c, sa, _ = banco
    _upgrade(c)
    assert c.execute(
        "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname = ANY(%s)", (list(POLICIES),)
    ).fetchone()[0] == len(POLICIES)
    _recusado(f2._lote_direto, c, sa, "interval", T, aluno=B)
