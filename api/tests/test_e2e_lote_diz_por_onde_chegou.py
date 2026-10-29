"""Ponta a ponta da `20261029_01` (o lote de telemetria diz por onde chegou e por quê).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção (que já tem `telemetria_lotes`) e aplica
o `upgrade()` da migration. As FKs do lote são soltas só nesse banco descartável: o que se mede aqui é o
gatilho e os CHECKs, não a posse das linhas referenciadas.

A API grava como `postgres`, sem claims (`app/repositories/telemetria.py`); o mobile grava pelo PostgREST
como `authenticated`, que preenche `request.jwt.claims`. Os testes reproduzem as duas conexões.

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do lote com via recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402

M_VIA = base._modulo("20261029_01_lote_diz_por_onde_chegou.py")

ALUNO = uuid.UUID(int=21)


@contextmanager
def _banco():
    nome = f"tu_via_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base.DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(base._dsn_para(nome), autocommit=True) as c:
            c.execute(base.PAPEIS)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            for fk in ("fk_telemetria_lotes_classe", "fk_telemetria_lotes_aluno", "fk_telemetria_lotes_sessao"):
                c.execute(f"ALTER TABLE public.telemetria_lotes DROP CONSTRAINT IF EXISTS {fk}")
            base._afrouxa(c, "telemetria_lotes")
            for sql in base._sql_de(M_VIA, "upgrade"):
                c.execute(sql)
            yield c
    finally:
        with psycopg.connect(base.DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _inserir(c, *, motivo: str | None = None, via: str | None = None) -> uuid.UUID:
    lote = uuid.uuid4()
    c.execute(
        """
        INSERT INTO public.telemetria_lotes
          (id, sessao_id, aluno_id, classe_id, screen_name, route_name, flush_reason, captured_at,
           study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count, scroll_distance_px,
           max_depth_px, payload, fallback_motivo, via)
        VALUES (%s, %s, %s, 1, 'tela', '/rota', 'interval', now(), 1, 1, 1, 0, 0, 0, 0, '{}'::jsonb, %s, %s)
        """,
        (lote, uuid.uuid4(), ALUNO, motivo, via),
    )
    return lote


def _como_aluno(c) -> None:
    """Como o PostgREST faz para um JWT de aluno: claims na sessão."""
    claims = json.dumps({"sub": str(ALUNO), "role": "authenticated"})
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (claims,))


def _linha(c, lote) -> tuple[str | None, str | None]:
    return c.execute(
        "SELECT via, fallback_motivo FROM public.telemetria_lotes WHERE id = %s", (lote,)
    ).fetchone()


def test_insert_como_aluno_vira_via_direta():
    with _banco() as c:
        _como_aluno(c)
        lote = _inserir(c, motivo="timeout")
        assert _linha(c, lote) == ("direta", "timeout")


def test_insert_sem_claims_vira_via_api():
    with _banco() as c:
        lote = _inserir(c)
        assert _linha(c, lote) == ("api", None)


def test_conexao_que_ja_viu_claims_vazias_nao_perde_o_lote():
    """`current_setting` devolve '' (não NULL) depois de um SET; `''::jsonb` levantaria e perderia o lote."""
    with _banco() as c:
        c.execute("SELECT set_config('request.jwt.claims', '', false)")
        lote = _inserir(c)
        assert _linha(c, lote) == ("api", None)


def test_service_role_conta_como_api():
    with _banco() as c:
        c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"role": "service_role"}),))
        lote = _inserir(c)
        assert _linha(c, lote) == ("api", None)


def test_build_antigo_sem_motivo_e_aceito():
    """Build antigo grava direto sem `fallback_motivo`: o lote entra (telemetria não se perde) e só a I18 falha."""
    with _banco() as c:
        _como_aluno(c)
        lote = _inserir(c)
        assert _linha(c, lote) == ("direta", None)


def test_aluno_nao_escolhe_a_via():
    """R9: a via do aluno é sempre 'direta', mesmo que o cliente declare 'api' (não se falseia a medida)."""
    with _banco() as c:
        _como_aluno(c)
        lote = _inserir(c, via="api")
        assert _linha(c, lote) == ("direta", None)
        assert _linha(c, _inserir(c, via="direta")) == ("direta", None)


def test_via_informada_por_quem_nao_e_aluno_e_respeitada():
    """service_role e conexão sem claims (script, API) podem declarar a via, ex.: backfill."""
    with _banco() as c:
        assert _linha(c, _inserir(c, via="direta")) == ("direta", None)
        c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"role": "service_role"}),))
        assert _linha(c, _inserir(c, via="direta")) == ("direta", None)
        assert _linha(c, _inserir(c, via="api")) == ("api", None)


def test_insert_com_papel_authenticated_de_verdade_grava_direta():
    """Papel real (`SET LOCAL ROLE authenticated`) com os default privileges do Supabase, não só claims.

    O esqueleto não traz GRANT nem policy de INSERT em `telemetria_lotes`; reproduz-se o padrão do
    Supabase (GRANT ALL a authenticated) e cria-se, só neste banco descartável, a policy mínima de
    INSERT — o que se mede é o gatilho agindo sob o papel real, não a posse da linha.
    """
    with _banco() as c:
        c.execute("GRANT USAGE ON SCHEMA public TO authenticated")
        c.execute("GRANT ALL ON public.telemetria_lotes TO authenticated")
        c.execute("ALTER TABLE public.telemetria_lotes ENABLE ROW LEVEL SECURITY")
        c.execute(
            "CREATE POLICY lote_ins_teste ON public.telemetria_lotes FOR INSERT TO authenticated WITH CHECK (true)"
        )
        lote = uuid.uuid4()
        with c.transaction():
            c.execute("SET LOCAL ROLE authenticated")
            claims = json.dumps({"sub": str(ALUNO), "role": "authenticated"})
            c.execute("SELECT set_config('request.jwt.claims', %s, true)", (claims,))
            c.execute(
                """
                INSERT INTO public.telemetria_lotes
                  (id, sessao_id, aluno_id, classe_id, screen_name, route_name, flush_reason, captured_at,
                   study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count, scroll_distance_px,
                   max_depth_px, payload, fallback_motivo, via)
                VALUES (%s, %s, %s, 1, 't', '/r', 'interval', now(), 1, 1, 1, 0, 0, 0, 0, '{}'::jsonb, 'rede', 'api')
                """,
                (lote, uuid.uuid4(), ALUNO),
            )
        assert _linha(c, lote) == ("direta", "rede")


def test_motivo_fora_da_lista_e_recusado():
    with _banco() as c:
        _como_aluno(c)
        with pytest.raises(psycopg.errors.CheckViolation):
            _inserir(c, motivo="xyz")


def test_via_fora_da_lista_e_recusada():
    with _banco() as c:
        with pytest.raises(psycopg.errors.CheckViolation):
            _inserir(c, via="outra")


def test_todo_motivo_da_lista_e_aceito():
    with _banco() as c:
        _como_aluno(c)
        for motivo in M_VIA.MOTIVOS:
            assert _linha(c, _inserir(c, motivo=motivo)) == ("direta", motivo)


def test_aluno_nao_chama_a_funcao_do_gatilho():
    with _banco() as c:
        c.execute("CREATE ROLE aluno_teste NOLOGIN IN ROLE authenticated")
        try:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    c.execute("SET LOCAL ROLE aluno_teste")
                    c.execute("SELECT public.fn_telemetria_lote_via()")
        finally:
            c.execute("DROP ROLE IF EXISTS aluno_teste")
