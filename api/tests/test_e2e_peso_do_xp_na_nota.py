"""`20261102_13`: peso do XP na nota final, por turma (#143, decisão de 02/11).

nota_xp = 10 × min(XP, meta) ÷ meta; nota_final = max(notaMedia, (1 − peso) × notaMedia + peso × nota_xp).
Padrão 0: nenhuma nota muda. Sem nota média, sem nota final. Só o banco grava.
"""

from __future__ import annotations

from decimal import Decimal

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import POSSE
from tests.test_e2e_notas_da_turma_para_exportar import OUTRA_TURMA, REFERENCIA, RESOLVE
from tests.test_e2e_notas_da_turma_para_exportar import _semear as _semear_notas

M06 = f5.modulo("20261101_06_notas_da_turma_para_exportar.py")
M10 = f5.modulo("20261101_10_nota_media_da_matricula.py")
M = f5.modulo("20261102_13_peso_do_xp_na_nota.py")
# Em produção `authenticated` tem GRANT em tudo e a RLS decide; o esqueleto não traz GRANT.
GRANTS = "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;"


def _banco(*extra: str):
    # M10.NOTA traz a guarda `trg_classe_aluno_nota_pelo_banco`, que roda antes do gatilho daqui.
    return f5.banco(POSSE, REFERENCIA, RESOLVE, *f5.sql_de(M06), M10.NOTA, GRANTS, *f5.sql_de(M), *extra)


def _semear(c) -> None:
    _semear_notas(c)
    c.execute('UPDATE public.classe_aluno SET "notaMedia" = 6 WHERE aluno_id = %s', (f5.A,))


def _turma(c, *, peso, meta=100, turma=f5.TURMA) -> None:
    c.execute("UPDATE public.classe SET xp_peso_nota_pct = %s, xp_meta_nota = %s WHERE id = %s", (peso, meta, turma))


def _xp(c, valor, *, aluno=f5.A, classe=f5.TURMA, referencia="conquista:1", tipo="conquista_desbloqueada") -> int:
    return c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor) VALUES (%s, %s, %s, %s, %s)"
        " RETURNING id",
        (aluno, classe, tipo, referencia, valor),
    ).fetchone()[0]


def _notas(c, aluno=f5.A):
    return c.execute(
        'SELECT "notaMedia", nota_final FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = %s',
        (aluno, f5.TURMA),
    ).fetchone()


@f5.e2e
def test_padrao_zero_nao_muda_nenhuma_nota() -> None:
    with _banco() as c:
        _semear(c)
        assert c.execute("SELECT xp_peso_nota_pct, xp_meta_nota FROM public.classe WHERE id = %s", (f5.TURMA,)).fetchone() == (
            Decimal("0.00"),
            1000,
        )
        _xp(c, 5000)
        assert _notas(c) == (Decimal("6"), Decimal("6"))
        assert _notas(c, f5.B) == (None, None)  # sem nota média, sem nota final


@f5.e2e
def test_matricula_que_ja_tinha_nota_nasce_com_a_nota_final_igual() -> None:
    # Banco com nota gravada ANTES da migration: o preenchimento copia, porque o peso é 0.
    with f5.banco(POSSE, REFERENCIA, RESOLVE, *f5.sql_de(M06), M10.NOTA, GRANTS) as c:
        _semear(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert _notas(c) == (Decimal("6"), Decimal("6"))


@f5.e2e
def test_xp_contra_a_meta_e_so_soma() -> None:
    with _banco() as c:
        _semear(c)
        _turma(c, peso=10, meta=100)
        assert _notas(c)[1] == Decimal("6")  # XP 0: nota_xp 0, mas o XP não baixa a nota
        evento = _xp(c, 50)
        assert _notas(c)[1] == Decimal("6")  # 0,9 × 6 + 0,1 × 5 = 5,9 < 6: fica 6
        _xp(c, 50, referencia="conquista:2")
        assert _notas(c)[1] == Decimal("6.40")  # 0,9 × 6 + 0,1 × 10
        _xp(c, 900, referencia="conquista:3")
        assert _notas(c)[1] == Decimal("6.40")  # passou da meta: a parte do XP para em 10
        c.execute("DELETE FROM public.eventos_aluno WHERE valor = 900")
        c.execute("UPDATE public.eventos_aluno SET valor = 0 WHERE id = %s", (evento,))
        assert _notas(c)[1] == Decimal("6")  # XP 50: volta para a nota das atividades
        assert _notas(c)[0] == Decimal("6")  # e a nota média nunca mudou


@f5.e2e
def test_so_conta_o_xp_da_turma_inclusive_o_evento_antigo_sem_turma() -> None:
    with _banco() as c:
        _semear(c)
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 0 WHERE aluno_id = %s', (f5.A,))
        _turma(c, peso=50, meta=100)
        _turma(c, peso=50, meta=100, turma=OUTRA_TURMA)
        _xp(c, 999, classe=OUTRA_TURMA)  # gravado em outra turma
        _xp(c, 999, classe=None, tipo="atividade_concluida", referencia="atividade:502")  # tópico de outra turma
        _xp(c, 999, aluno=f5.B)  # de outro aluno
        assert _notas(c)[1] == Decimal("0")
        _xp(c, 20, classe=None, tipo="topico_concluido", referencia="topico:10")  # antigo: turma pelo tópico
        assert _notas(c)[1] == Decimal("1.00")  # 0,5 × 0 + 0,5 × 2


@f5.e2e
def test_mudar_o_peso_recalcula_a_turma_inteira() -> None:
    with _banco() as c:
        _semear(c)
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 4 WHERE aluno_id = %s', (f5.C,))
        _xp(c, 100)
        _xp(c, 100, aluno=f5.C)
        _turma(c, peso=20, meta=100)
        assert _notas(c)[1] == Decimal("6.80")  # 0,8 × 6 + 0,2 × 10
        assert _notas(c, f5.C)[1] == Decimal("5.20")  # 0,8 × 4 + 0,2 × 10
        _turma(c, peso=20, meta=200)
        assert _notas(c)[1] == Decimal("6")  # 0,8 × 6 + 0,2 × 5 = 5,8: fica 6
        _turma(c, peso=0, meta=200)
        assert (_notas(c)[1], _notas(c, f5.C)[1]) == (Decimal("6"), Decimal("4"))


@f5.e2e
def test_nota_media_nova_leva_o_xp_junto() -> None:
    with _banco() as c:
        _semear(c)
        _turma(c, peso=10, meta=100)
        _xp(c, 100)
        assert _notas(c)[1] == Decimal("6.40")
        # A conta da nota média (trailup_recalcular_nota_classe_aluno) grava pelo mesmo caminho.
        c.execute("SELECT set_config('trailup.nota_pelo_banco', '1', false)")
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 8 WHERE aluno_id = %s', (f5.A,))
        assert _notas(c) == (Decimal("8"), Decimal("8.20"))
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = NULL WHERE aluno_id = %s', (f5.A,))
        assert _notas(c) == (None, None)


@f5.e2e
def test_o_aluno_nao_grava_a_nota_final() -> None:
    with _banco() as c:
        _semear(c)
        _turma(c, peso=10, meta=100)
        c.execute("BEGIN")
        f5.como(c, f5.A)
        c.execute("SET LOCAL ROLE authenticated")
        c.execute("UPDATE public.classe_aluno SET nota_final = 10 WHERE aluno_id = %s", (f5.A,))
        # A guarda da nota roda antes: a nota média do cliente é ignorada, e a final sai da antiga.
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 10, nota_final = 10 WHERE aluno_id = %s', (f5.A,))
        c.execute(
            'INSERT INTO public.classe_aluno (classe_id, aluno_id, "notaMedia", nota_final) VALUES (%s, %s, 10, 10)',
            (OUTRA_TURMA, f5.A),
        )
        c.execute("COMMIT")
        assert _notas(c) == (Decimal("6"), Decimal("6"))
        assert c.execute(
            'SELECT "notaMedia", nota_final FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = %s',
            (f5.A, OUTRA_TURMA),
        ).fetchone() == (None, None)


@f5.e2e
def test_aluno_que_ganha_xp_recalcula_a_propria_nota() -> None:
    with _banco() as c:
        _semear(c)
        _turma(c, peso=10, meta=100)
        c.execute("BEGIN")
        f5.como(c, f5.A)
        c.execute("SET LOCAL ROLE authenticated")
        _xp(c, 100)
        c.execute("COMMIT")
        assert _notas(c)[1] == Decimal("6.40")


@f5.e2e
@pytest.mark.parametrize("coluna, valor", [("xp_peso_nota_pct", 50.01), ("xp_peso_nota_pct", -1), ("xp_meta_nota", 0)])
def test_check_limita_o_peso_e_a_meta(coluna: str, valor) -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute(f"UPDATE public.classe SET {coluna} = %s WHERE id = %s", (valor, f5.TURMA))


@f5.e2e
def test_csv_do_professor_traz_a_nota_final() -> None:
    with _banco() as c:
        _semear(c)
        _turma(c, peso=10, meta=100)
        _xp(c, 100)
        c.execute("BEGIN")
        f5.como(c, f5.PROF)
        c.execute("SET LOCAL ROLE authenticated")
        linhas = {
            r[0]: r[1:]
            for r in c.execute(
                "SELECT aluno_id, xp, nota_media, nota_final FROM public.professor_notas_da_turma(%s)", (f5.TURMA,)
            ).fetchall()
        }
        c.execute("ROLLBACK")
        assert linhas[f5.A] == (100, Decimal("6"), Decimal("6.40"))
        assert linhas[f5.B] == (0, None, None)


@f5.e2e
def test_upgrade_repetido_e_downgrade() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear(c)
        _turma(c, peso=10, meta=100)
        _xp(c, 100)
        assert _notas(c)[1] == Decimal("6.40")
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'"
            " AND column_name IN ('nota_final', 'xp_peso_nota_pct', 'xp_meta_nota')"
        ).fetchone()[0] == 0
        assert c.execute(
            "SELECT count(*) FROM pg_trigger WHERE tgname IN"
            " ('trg_classe_aluno_z_nota_final', 'trg_eventos_aluno_nota_final', 'trg_classe_nota_final')"
        ).fetchone()[0] == 0
        # O CSV volta a ser o da 20261101_06, e o XP continua gravando.
        _xp(c, 1, referencia="conquista:9")
        cols = c.execute(
            "SELECT pg_get_function_result('public.professor_notas_da_turma(bigint)'::regprocedure)"
        ).fetchone()[0]
        assert "nota_final" not in cols
