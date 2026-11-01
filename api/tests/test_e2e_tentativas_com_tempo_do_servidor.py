"""`20261101_13`: tentativas de atividade com o relógio do servidor (#136, fase 1).

Banco local com o esqueleto de produção, `fn_prazo_efetivo` e os helpers de posse reais, e as RPCs
chamadas como `authenticated` com as claims do aluno, como o PostgREST faria.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_abandono_pelo_modelo_do_core import _prazo
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M = f5.modulo("20261101_13_tentativas_com_tempo_do_servidor.py")
ALUNOS_DO_PROF = _trecho(
    "20260826_09_rls_posse_por_tabela.py", "CREATE OR REPLACE FUNCTION public.app_alunos_do_professor()", "$$;"
)
RETENCAO = _trecho("20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_politica (", "\n);")
GRANTS = (
    "GRANT USAGE ON SCHEMA public TO authenticated, anon;"
    "GRANT SELECT ON public.atividade_aluno, public.eventos_aluno TO authenticated;"
    "GRANT INSERT ON public.eventos_aluno TO authenticated;"
    "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
)
ATIVIDADE = 500
OUTRO = uuid.UUID(int=31)  # aluno sem matrícula na turma


def _banco(*depois: str):
    return f5.banco(POSSE, ALUNOS_DO_PROF, _prazo(), RETENCAO, GRANTS, *f5.sql_de(M), *depois)


def _semear(c, *, tentativas_max=None, prazo: str = "NULL") -> None:
    f5.semear_turma(c)
    f5.afrouxa(c, "atividades")
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo, pontuacao_maxima, tentativas_max, data_entrega)"
        f" OVERRIDING SYSTEM VALUE VALUES (%s, 10, 'Quiz', 10, %s, {prazo})",
        (ATIVIDADE, tentativas_max),
    )
    c.execute("INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Achiever'), (2, 'Seeker')")
    # A: Achiever dominante (cronômetro ligado). B: Seeker dominante (desligado).
    c.execute(
        "INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES"
        " (%s, 1, 80), (%s, 2, 30), (%s, 2, 90), (%s, 1, 10)",
        (f5.A, f5.A, f5.B, f5.B),
    )
    c.execute(
        f"INSERT INTO auth.users (id, email) VALUES ('{OUTRO}', 'o@teste.invalid');"
        f"INSERT INTO public.alunos (id, nome, email) VALUES ('{OUTRO}', 'O', 'o@teste.invalid');"
    )


def _como(c, quem, sql: str, params=()):
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        r = c.execute(sql, params).fetchall()
        c.execute("COMMIT")
        return r
    except Exception:
        c.execute("ROLLBACK")
        raise


def _iniciar(c, quem=f5.A) -> dict:
    return _como(c, quem, "SELECT public.atividade_iniciar_tentativa(%s)", (ATIVIDADE,))[0][0]


def _responder(c, tentativa: int, acertos, pontos, meta=None, quem=f5.A) -> dict:
    return _como(
        c,
        quem,
        "SELECT public.atividade_responder_tentativa(%s, %s, %s, %s::jsonb)",
        (tentativa, acertos, pontos, None if meta is None else psycopg.types.json.Json(meta)),
    )[0][0]


def _atrasar(c, tentativa: int, segundos: int) -> None:
    c.execute(
        "UPDATE public.atividade_tentativas SET iniciada_em = now() - make_interval(secs => %s) WHERE id = %s",
        (segundos, tentativa),
    )


def _bonus(c, aluno=f5.A) -> list[str]:
    return [
        r[0]
        for r in c.execute(
            "SELECT tipo FROM public.eventos_aluno WHERE aluno_id = %s AND tipo LIKE 'atividade_no_tempo_%%' ORDER BY tipo",
            (aluno,),
        ).fetchall()
    ]


def _nota(c, aluno=f5.A):
    return c.execute(
        "SELECT pontuacao_obtida, acertos_percentual FROM public.atividade_aluno WHERE aluno_id = %s AND atividade_id = %s",
        (aluno, ATIVIDADE),
    ).fetchone()


@f5.e2e
def test_cronometro_pelo_perfil_e_reabrir_nao_zera_o_relogio() -> None:
    with _banco() as c:
        _semear(c)
        a = _iniciar(c)
        assert (a["cronometrada"], a["limite_seg"], a["numero"]) == (True, 120, 1)
        assert _iniciar(c)["tentativa_id"] == a["tentativa_id"]  # a mesma tentativa, o mesmo início
        b = _iniciar(c, f5.B)
        assert (b["cronometrada"], b["limite_seg"]) == (False, None)  # Seeker: sem pressão de tempo


@f5.e2e
def test_no_tempo_paga_por_faixa_uma_vez_e_a_nota_e_da_ultima_tentativa() -> None:
    with _banco() as c:
        _semear(c)
        t1 = _iniciar(c)["tentativa_id"]
        r1 = _responder(c, t1, 85, Decimal("8.5"))
        assert (r1["no_tempo"], r1["acertos_percentual"]) == (True, 85)
        assert _bonus(c) == ["atividade_no_tempo_70", "atividade_no_tempo_80"]

        t2 = _iniciar(c)["tentativa_id"]
        assert t2 != t1
        _responder(c, t2, 95, Decimal("9.5"))
        assert _bonus(c) == ["atividade_no_tempo_70", "atividade_no_tempo_80", "atividade_no_tempo_90"]

        t3 = _iniciar(c)["tentativa_id"]
        _responder(c, t3, 40, 4)
        # Vale a última, mesmo pior; o bônus já pago fica, e não paga de novo.
        assert _nota(c) == (Decimal("4"), Decimal("40"))
        assert len(_bonus(c)) == 3


@f5.e2e
def test_fora_do_tempo_vale_a_nota_mas_nao_o_bonus() -> None:
    with _banco() as c:
        _semear(c)
        t = _iniciar(c)["tentativa_id"]
        _atrasar(c, t, 126)  # 120 s + 5 s de tolerância já passaram
        r = _responder(c, t, 100, 10)
        assert r["no_tempo"] is False and r["xp_bonus"] == 0
        assert _bonus(c) == []
        assert _nota(c) == (Decimal("10"), Decimal("100"))


@f5.e2e
def test_sem_cronometro_nao_ha_bonus() -> None:
    with _banco() as c:
        _semear(c)
        t = _iniciar(c, f5.B)["tentativa_id"]
        assert _responder(c, t, 100, 10, quem=f5.B)["no_tempo"] is False
        assert _bonus(c, f5.B) == []


@f5.e2e
def test_prazo_vencido_e_recusado_pelo_relogio_do_banco() -> None:
    with _banco() as c:
        _semear(c, prazo="now() + interval '1 hour'")
        t = _iniciar(c)["tentativa_id"]
        c.execute("UPDATE public.atividades SET data_entrega = now() - interval '1 minute' WHERE id = %s", (ATIVIDADE,))
        # Nenhuma RPC recebe hora do aparelho: relógio adiantado não tem por onde entrar.
        with pytest.raises(psycopg.errors.RaiseException, match="prazo_expirado"):
            _responder(c, t, 100, 10)
        with pytest.raises(psycopg.errors.RaiseException, match="prazo_expirado"):
            _iniciar(c)
        assert _nota(c) is None


@f5.e2e
def test_tentativas_esgotadas_sao_recusadas() -> None:
    with _banco() as c:
        _semear(c, tentativas_max=2)
        for esperado in (1, 0):
            t = _iniciar(c)
            assert t["restantes"] == esperado
            assert _responder(c, t["tentativa_id"], 50, 5)["restantes"] == esperado
        with pytest.raises(psycopg.errors.RaiseException, match="sem_tentativas"):
            _iniciar(c)


@f5.e2e
def test_responder_duas_vezes_a_mesma_tentativa_e_recusado() -> None:
    with _banco() as c:
        _semear(c)
        t = _iniciar(c)["tentativa_id"]
        _responder(c, t, 50, 5)
        with pytest.raises(psycopg.errors.RaiseException, match="tentativa_ja_respondida"):
            _responder(c, t, 100, 10)


@f5.e2e
def test_limites_e_a_chave_do_professor_nao_vem_do_app() -> None:
    with _banco() as c:
        _semear(c)
        t = _iniciar(c)["tentativa_id"]
        r = _responder(c, t, 150, 999, {"professor": {"avaliado_por": "eu"}, "grading_rules": {"x": 1}})
        assert (r["acertos_percentual"], r["pontuacao_obtida"]) == (100, 10)
        meta = c.execute(
            "SELECT avaliacao_metadata FROM public.atividade_aluno WHERE aluno_id = %s", (f5.A,)
        ).fetchone()[0]
        assert "professor" not in meta and meta["grading_rules"] == {"x": 1}
        assert meta["tentativa"]["numero"] == 1


@f5.e2e
def test_o_app_nao_grava_o_bonus_sozinho() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="bonus de tempo"):
            _como(
                c, f5.A, "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) VALUES (%s, 'atividade_no_tempo_90', 'atividade:500') RETURNING id",
                (f5.A,),
            )
        _como(c, f5.A, "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) VALUES (%s, 'atividade_iniciada', 'atividade:500') RETURNING id", (f5.A,))


@f5.e2e
def test_aluno_desliga_o_cronometro_e_so_ele_e_o_professor_veem() -> None:
    with _banco() as c:
        _semear(c)
        assert _como(c, f5.A, "SELECT public.aluno_definir_cronometro(false)")[0][0] is False
        assert _iniciar(c)["cronometrada"] is False
        assert _como(c, f5.A, "SELECT ligado, origem FROM public.aluno_cronometro") == [(False, "aluno")]
        assert _como(c, f5.B, "SELECT count(*) FROM public.aluno_cronometro")[0][0] == 0
        assert _como(c, f5.PROF, "SELECT count(*) FROM public.aluno_cronometro")[0][0] == 1
        assert _como(c, f5.B, "SELECT count(*) FROM public.atividade_tentativas")[0][0] == 0
        assert _como(c, f5.PROF, "SELECT count(*) FROM public.atividade_tentativas")[0][0] == 1


@f5.e2e
def test_sem_sessao_ou_sem_matricula_e_recusado() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="sem_matricula"):
            _iniciar(c, OUTRO)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="sem_sessao"):
            _iniciar(c, None)
        c.execute("BEGIN")
        try:
            c.execute("SET LOCAL ROLE anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT public.atividade_iniciar_tentativa(%s)", (ATIVIDADE,))
        finally:
            c.execute("ROLLBACK")


@f5.e2e
def test_downgrade_tira_tudo() -> None:
    with _banco(*f5.sql_de(M, "downgrade")) as c:
        assert c.execute("SELECT to_regclass('public.atividade_tentativas'), to_regclass('public.aluno_cronometro')").fetchone() == (None, None)
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('atividade_iniciar_tentativa', 'atividade_responder_tentativa',"
            " 'aluno_definir_cronometro', 'fn_cronometro_ligado')"
        ).fetchone()[0] == 0
