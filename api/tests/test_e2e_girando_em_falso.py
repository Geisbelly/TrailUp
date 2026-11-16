"""`20261115_05`: girando em falso (3 ou mais tentativas corrigidas, a melhor abaixo de 70%).

Turma 1, atividade 500. As views são lidas como `authenticated`, com as claims de quem chama.

| aluno | tentativas (percentual)        | girando? | por quê                                  |
|-------|--------------------------------|----------|------------------------------------------|
| A     | 20, 40, 30                     | sim      | 3 corrigidas, melhor 40                  |
| B     | 20, 40, 70                     | não      | a terceira chegou a 70                   |
| C     | 10, 20                         | não      | só 2 tentativas                          |
| D     | 10, 20, sem nota, não entregue | não      | só 2 corrigidas: sem nota não conta      |
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e

M_ANTES = f5.modulo("20261115_04_metricas_continuidade_turma.py")
M = f5.modulo("20261115_05_girando_em_falso.py")


def _banco():
    return e._banco(*f5.sql_de(M))


def _tentativa(c, aluno, numero: int, percentual, respondida: bool = True, atividade: int = 500,
               classe: int = f5.TURMA) -> None:
    quando = f"2026-11-{numero:02d}T10:00:00Z"
    c.execute(
        "INSERT INTO public.atividade_tentativas (aluno_id, atividade_id, classe_id, numero, iniciada_em,"
        " respondida_em, cronometrada, acertos_percentual) VALUES (%s, %s, %s, %s, %s, %s, false, %s)",
        (aluno, atividade, classe, numero, quando, quando if respondida else None, percentual),
    )


def _semear(c) -> None:
    e._semear(c)
    for n, pct in enumerate((20, 40, 30), start=1):
        _tentativa(c, f5.A, n, pct)
    for n, pct in enumerate((20, 40, 70), start=1):
        _tentativa(c, f5.B, n, pct)
    for n, pct in enumerate((10, 20), start=1):
        _tentativa(c, f5.C, n, pct)
    _tentativa(c, e.D, 1, 10)
    _tentativa(c, e.D, 2, 20)
    _tentativa(c, e.D, 3, None)
    _tentativa(c, e.D, 4, None, respondida=False)


def _girando(c, quem):
    return e._como(
        c, quem,
        "SELECT aluno_id, atividade_id, tentativas, melhor_percentual, ultima_tentativa_em AT TIME ZONE 'UTC'"
        " FROM public.vw_metricas_girando_em_falso ORDER BY aluno_id",
    )


@f5.e2e
def test_so_quem_tem_3_corrigidas_e_melhor_abaixo_de_70() -> None:
    with _banco() as c:
        _semear(c)
        linhas = _girando(c, f5.PROF)
        assert len(linhas) == 1
        aluno, atividade, tentativas, melhor, ultima = linhas[0]
        assert (aluno, atividade, tentativas, melhor) == (f5.A, 500, 3, 40)
        assert str(ultima) == "2026-11-03 10:00:00"


@f5.e2e
def test_sai_do_estado_na_primeira_tentativa_com_70() -> None:
    with _banco() as c:
        _semear(c)
        _tentativa(c, f5.A, 4, 70)
        assert _girando(c, f5.PROF) == []


@f5.e2e
def test_por_atividade_conta_quem_tentou_e_quem_gira() -> None:
    """Tentaram com nota: A, B, C e D → 4. Girando: só A."""
    with _banco() as c:
        _semear(c)
        linhas = e._como(
            c, f5.PROF,
            "SELECT atividade_id, alunos_que_tentaram, alunos_girando_em_falso"
            " FROM public.vw_metricas_girando_em_falso_atividade",
        )
        assert linhas == [(500, 4, 1)]


@f5.e2e
def test_aluno_e_outro_professor_nao_leem_nada() -> None:
    """O aluno lê as próprias tentativas pela policy da tabela; pela view, não lê o próprio rótulo."""
    with _banco() as c:
        _semear(c)
        for quem in (f5.A, e.OUTRO_PROF):
            assert _girando(c, quem) == []
            assert e._como(c, quem, "SELECT count(*) FROM public.vw_metricas_girando_em_falso_atividade") == [(0,)]


@f5.e2e
def test_anon_nao_tem_permissao_e_as_views_sao_security_invoker() -> None:
    import psycopg
    import pytest

    with _banco() as c:
        for view in ("vw_metricas_girando_em_falso", "vw_metricas_girando_em_falso_atividade"):
            opcoes = c.execute("SELECT reloptions FROM pg_class WHERE relname = %s", (view,)).fetchone()[0]
            assert "security_invoker=on" in opcoes
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                e._anon(c, f"SELECT count(*) FROM public.{view}")


@f5.e2e
def test_downgrade_limpa_e_sobe_de_novo() -> None:
    with _banco() as c:
        assert c.execute("SELECT count(*) FROM public.metricas_catalogo WHERE chave = 'prof.girando_em_falso'").fetchone()[0] == 1
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regclass('public.vw_metricas_girando_em_falso')").fetchone()[0] is None
        assert c.execute("SELECT count(*) FROM public.metricas_catalogo WHERE chave = 'prof.girando_em_falso'").fetchone()[0] == 0
        for sql in f5.sql_de(M):
            c.execute(sql)


def test_sql_sem_porcento_nem_parametro_acidental_e_cadeia() -> None:
    from sqlalchemy import text

    assert (M.revision, M.down_revision) == ("20261115_05", M_ANTES.revision)
    for sql in (M.VIEWS, M.CATALOGO, M.DOWNGRADE):
        assert "%" not in sql
        assert text(sql).compile().params == {}
    assert M.VIEWS.count("app_classes_do_professor()") == 2
    assert M.VIEWS.count("WITH (security_invoker = on)") == 2
