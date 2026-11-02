"""`20261101_03`: sinal de risco de reprovação por aluno, só para o professor da turma (#135).

A `20261102_11` troca o fator de estado mental por `abandono_recorrente` (DAT-45); os testes
rodam com as duas aplicadas, como em produção."""

from __future__ import annotations

import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_abandono_pelo_modelo_do_core import _prazo
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M = f5.modulo("20261101_03_risco_de_reprovacao.py")
M11 = f5.modulo("20261102_11_risco_le_estado_de_estudo.py")
CREDITADO = _trecho("20261025_01_pontos_do_evento_no_rank.py", "CREATE OR REPLACE FUNCTION public.fn_evento_creditado", "$fn$;")
OUTRO_PROF = uuid.UUID(int=12)


def _banco():
    return f5.banco(POSSE, CREDITADO, _prazo(), *f5.sql_de(M), *f5.sql_de(M11))


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("eventos_aluno", "atividades", "questao_aluno", "aluno_mental_state_history"):
        f5.afrouxa(c, t)


def _risco(c, quem=f5.PROF) -> dict:
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        linhas = c.execute(
            "SELECT aluno_id, sinalizado, fatores_disparados, fatores FROM public.professor_risco_reprovacao_turma(%s)",
            (f5.TURMA,),
        ).fetchall()
    finally:
        c.execute("ROLLBACK")
    return {r[0]: {"sinalizado": r[1], "n": r[2], "fatores": {f["fator"]: f for f in r[3]}} for r in linhas}


def _eventos(c, aluno, n: int, dias_atras: int, tipo: str = "topico_aberto") -> None:
    for i in range(n):
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)"
            " VALUES (%s, %s, %s, %s, 1, localtimestamp - make_interval(days => %s))",
            (aluno, f5.TURMA, tipo, f"x:{uuid.uuid4()}", dias_atras),
        )


def _respostas(c, aluno, certas: int, erradas: int) -> None:
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (900, 10, 'Q')"
        " ON CONFLICT DO NOTHING"
    )
    f5.afrouxa(c, "questoes")
    for i in range(certas + erradas):
        c.execute(
            "INSERT INTO public.questoes (id, atividade_id) OVERRIDING SYSTEM VALUE VALUES (%s, 900)"
            " ON CONFLICT DO NOTHING",
            (1000 + i,),
        )
        c.execute(
            "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, resposta, correta, criado_em)"
            " VALUES (%s, %s, 900, 'r', %s, now() - interval '2 days')",
            (aluno, 1000 + i, i < certas),
        )


def _aula(c, dia: int, presentes) -> None:
    for aluno in presentes:
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)"
            " VALUES (%s, 'presenca_aula', %s, 10, localtimestamp - make_interval(days => %s))",
            (aluno, f"classe:{f5.TURMA}:2026-10-{10 + dia:02d}", dia),
        )


def _prazos_vencidos(c, n: int) -> None:
    for i in range(n):
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo, data_entrega) OVERRIDING SYSTEM VALUE"
            f" VALUES ({700 + i}, 10, 'Lista', now() - interval '3 days')"
        )


def _estado(c, aluno, kinds) -> None:
    for i, kind in enumerate(kinds):
        c.execute(
            "INSERT INTO public.aluno_mental_state_history (aluno_id, kind, created_at)"
            " VALUES (%s, %s, now() - make_interval(mins => %s))",
            (aluno, kind, i),
        )


@f5.e2e
def test_cada_fator_dispara_sozinho_com_o_fato_que_o_sustenta() -> None:
    with _banco() as c:
        _semear(c)
        # A: 12 eventos nas 3 semanas anteriores (média 4) e 1 nesta → queda.
        _eventos(c, f5.A, 12, 14)
        _eventos(c, f5.A, 1, 2)
        # B: 1 de 6 certas → acertos baixos.
        _respostas(c, f5.B, 1, 5)
        # C: presente em 1 de 3 aulas (A e B foram às 3).
        _aula(c, 3, [f5.A, f5.B, f5.C])
        _aula(c, 10, [f5.A, f5.B])
        _aula(c, 17, [f5.A, f5.B])
        r = _risco(c)
        assert set(r[f5.A]["fatores"]) == {"queda_de_atividade"}
        assert r[f5.A]["fatores"]["queda_de_atividade"]["texto"].startswith("1 eventos nos últimos 7 dias, contra média de 4.0")
        assert set(r[f5.B]["fatores"]) == {"acertos_baixos"}
        assert r[f5.B]["fatores"]["acertos_baixos"]["texto"] == "17% de acerto em 6 questões nos últimos 30 dias"
        assert set(r[f5.C]["fatores"]) == {"faltas"}
        assert r[f5.C]["fatores"]["faltas"]["texto"] == "Presente em 1 de 3 aulas nas últimas 4 semanas"
        # Um fator só não sinaliza (mínimo padrão: 2).
        assert not any(v["sinalizado"] for v in r.values())


@f5.e2e
def test_dois_fatores_sinalizam_e_o_limiar_vem_da_config() -> None:
    with _banco() as c:
        _semear(c)
        _prazos_vencidos(c, 2)  # vale para os três alunos: ninguém entregou
        _estado(c, f5.A, ["abandono", "abandono", "sem_alerta", "abandono", "dificuldade"])
        # `dificuldade` recorrente não é fator: `acertos_baixos` já conta o acerto baixo.
        _estado(c, f5.B, ["dificuldade", "dificuldade", "dificuldade", "sem_alerta", "sem_alerta"])
        r = _risco(c)
        assert set(r[f5.A]["fatores"]) == {"prazos_perdidos", "abandono_recorrente"}
        assert r[f5.A]["fatores"]["abandono_recorrente"]["texto"] == (
            "Atividade aberta e deixada sem concluir em 3 dos últimos 5 ciclos de estudo"
        )
        assert r[f5.A]["sinalizado"] is True and r[f5.A]["n"] == 2
        assert r[f5.B]["sinalizado"] is False and set(r[f5.B]["fatores"]) == {"prazos_perdidos"}
        # O time ajusta o corte sem migration.
        c.execute("UPDATE public.app_config SET valor = '1' WHERE chave = 'risco_reprovacao_min_fatores'")
        assert _risco(c)[f5.B]["sinalizado"] is True


@f5.e2e
def test_sem_dado_suficiente_nao_dispara() -> None:
    """Abaixo dos mínimos (média semanal, respostas, aulas), o fator não é medido, e não 'dispara por zero'."""
    with _banco() as c:
        _semear(c)
        _eventos(c, f5.A, 3, 14)  # média 1/semana < 3
        _respostas(c, f5.B, 0, 3)  # 3 respostas < 5
        _aula(c, 3, [f5.A])  # 1 aula < 2
        r = _risco(c)
        assert all(v["n"] == 0 and v["fatores"] == {} for v in r.values())
        assert set(r) == {f5.A, f5.B, f5.C}


@f5.e2e
def test_eventos_creditados_nao_contam_como_uso() -> None:
    with _banco() as c:
        _semear(c)
        _eventos(c, f5.A, 12, 14)
        _eventos(c, f5.A, 10, 2, tipo="nota_professor")  # concedido, não é uso do app
        assert "queda_de_atividade" in _risco(c)[f5.A]["fatores"]


@f5.e2e
def test_so_o_professor_da_turma_le() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(f"INSERT INTO auth.users (id, email) VALUES ('{OUTRO_PROF}', 'o@teste.invalid')")
        assert len(_risco(c)) == 3
        for quem in (f5.A, OUTRO_PROF):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _risco(c, quem)
        c.execute("BEGIN")
        try:
            c.execute("SET LOCAL ROLE anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT * FROM public.professor_risco_reprovacao_turma(%s)", (f5.TURMA,))
        finally:
            c.execute("ROLLBACK")


@f5.e2e
def test_nao_escreve_nada_e_downgrade_limpa() -> None:
    with _banco() as c:
        _semear(c)
        antes = c.execute("SELECT count(*) FROM public.topico_aluno").fetchone()[0]
        _risco(c)
        assert c.execute("SELECT count(*) FROM public.topico_aluno").fetchone()[0] == antes
        assert c.execute(
            "SELECT provolatile FROM pg_proc WHERE proname = 'professor_risco_reprovacao_turma'"
        ).fetchone()[0] == "s"
        assert c.execute(
            "SELECT count(*) FROM public.app_config WHERE chave LIKE 'risco_reprovacao_%' AND NOT publico"
        ).fetchone()[0] == 8
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT count(*) FROM pg_proc WHERE proname = 'professor_risco_reprovacao_turma'").fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.app_config WHERE chave LIKE 'risco_reprovacao_%'").fetchone()[0] == 0
