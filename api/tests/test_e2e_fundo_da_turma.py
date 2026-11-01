"""`20261101_04`: recompensa coletiva — fundo da turma com meta (#144).

Banco local com o esqueleto de produção, as funções de que o fundo depende e os papéis de verdade
(`SET ROLE authenticated` + claims), como o PostgREST faria.
"""

from __future__ import annotations

import threading
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M = f5.modulo("20261101_04_fundo_da_turma.py")
DO_ALUNO = _trecho("20260826_09_rls_posse_por_tabela.py", "CREATE OR REPLACE FUNCTION public.app_classes_do_aluno()", "$$;")
SALDO = _trecho("20260912_01_moedas_razao.py", "CREATE OR REPLACE FUNCTION public.loja_saldo()", "$fn$;")
AUDITAR = _trecho("20261020_01_economia_configuracao.py", "CREATE OR REPLACE FUNCTION public.economia_auditar(", "$fn$;")
# O esqueleto não traz CHECK; o do razão é o que a doação e o estorno têm de respeitar.
MOTIVO = (
    "ALTER TABLE public.moedas_ledger ADD CONSTRAINT moedas_ledger_motivo_check "
    "CHECK (motivo IN ('evento','dotacao','compra','estorno','concessao'))"
)
# A tabela de retenção (com os CHECKs reais) veio depois do esqueleto; o fundo registra nela.
RETENCAO = _trecho("20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_politica (", "\n);")
GRANTS = "GRANT USAGE ON SCHEMA public TO authenticated, anon; GRANT SELECT ON public.moedas_ledger TO authenticated;"
OUTRO = uuid.UUID(int=31)  # aluno de outra turma


def _banco():
    return f5.banco(POSSE, DO_ALUNO, SALDO, AUDITAR, MOTIVO, RETENCAO, GRANTS, *f5.sql_de(M))


def _semear(c) -> None:
    f5.semear_turma(c)
    c.execute(
        f"INSERT INTO auth.users (id, email) VALUES ('{OUTRO}', 'o@teste.invalid');"
        f"INSERT INTO public.alunos (id, nome, email) VALUES ('{OUTRO}', 'O', 'o@teste.invalid');"
    )
    for aluno, moedas in ((f5.A, 100), (f5.B, 30), (f5.C, 5), (OUTRO, 100)):
        c.execute("INSERT INTO public.moedas_ledger (aluno_id, delta, motivo) VALUES (%s, %s, 'dotacao')", (aluno, moedas))


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


def _rpc(c, quem, fn: str, *args):
    marcas = ", ".join(["%s"] * len(args))
    return _como(c, quem, f"SELECT public.{fn}({marcas})", args)[0][0]


def _saldo(c, aluno) -> int:
    return int(c.execute("SELECT COALESCE(sum(delta), 0) FROM public.moedas_ledger WHERE aluno_id = %s", (aluno,)).fetchone()[0])


def _criar(c, meta: int = 50) -> int:
    r = _rpc(c, f5.PROF, "fundo_turma_criar", f5.TURMA, "Dia extra", "+1 dia de prazo na próxima lista", meta)
    assert r["ok"], r
    return r["fundo_id"]


@f5.e2e
def test_doacoes_somam_e_a_meta_fecha_o_fundo_sem_cobrar_o_excedente() -> None:
    with _banco() as c:
        _semear(c)
        fundo = _criar(c, meta=50)
        r = _rpc(c, f5.B, "fundo_turma_contribuir", fundo, 30, "b-1")
        assert (r["ok"], r["arrecadado"], r["status"]) == (True, 30, "aberto")
        r = _rpc(c, f5.A, "fundo_turma_contribuir", fundo, 40, "a-1")  # faltam 20: cobra 20
        assert (r["moedas"], r["arrecadado"], r["status"]) == (20, 50, "atingido")
        assert (_saldo(c, f5.A), _saldo(c, f5.B)) == (80, 0)
        r = _rpc(c, f5.C, "fundo_turma_contribuir", fundo, 5, "c-1")
        assert r == {"ok": False, "erro": "fundo_fechado", "status": "atingido"}
        assert _saldo(c, f5.C) == 5


@f5.e2e
def test_mesma_chave_nao_cobra_duas_vezes_e_saldo_insuficiente_nao_cobra_nada() -> None:
    with _banco() as c:
        _semear(c)
        fundo = _criar(c)
        _rpc(c, f5.A, "fundo_turma_contribuir", fundo, 10, "a-1")
        r = _rpc(c, f5.A, "fundo_turma_contribuir", fundo, 10, "a-1")
        assert r["repetido"] is True and _saldo(c, f5.A) == 90
        r = _rpc(c, f5.C, "fundo_turma_contribuir", fundo, 20, "c-1")
        assert (r["ok"], r["erro"]) == (False, "saldo_insuficiente")
        assert _saldo(c, f5.C) == 5
        assert c.execute("SELECT arrecadado FROM public.fundos_turma WHERE id = %s", (fundo,)).fetchone()[0] == 10


@f5.e2e
def test_doacoes_simultaneas_nao_gastam_moeda_que_o_aluno_nao_tem() -> None:
    """Duas doações de 60 com saldo 100, ao mesmo tempo: só uma passa."""
    with _banco() as c:
        _semear(c)
        fundo = _criar(c, meta=1000)
        dsn = f5._dsn_para(c.info.dbname)
        resultados: list[dict] = []

        def doar(chave: str) -> None:
            with psycopg.connect(dsn, autocommit=True) as c2:
                resultados.append(_rpc(c2, f5.A, "fundo_turma_contribuir", fundo, 60, chave))

        ts = [threading.Thread(target=doar, args=(f"a-{i}",)) for i in range(2)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        assert sorted(r["ok"] for r in resultados) == [False, True]
        assert _saldo(c, f5.A) == 40


@f5.e2e
def test_cancelar_devolve_tudo_e_entregar_exige_meta() -> None:
    with _banco() as c:
        _semear(c)
        fundo = _criar(c, meta=50)
        _rpc(c, f5.A, "fundo_turma_contribuir", fundo, 20, "a-1")
        _rpc(c, f5.B, "fundo_turma_contribuir", fundo, 10, "b-1")
        r = _rpc(c, f5.PROF, "fundo_turma_encerrar", fundo, True)
        assert (r["ok"], r["erro"]) == (False, "meta_nao_atingida")
        r = _rpc(c, f5.PROF, "fundo_turma_encerrar", fundo, False)
        assert (r["status"], r["devolvidas"]) == ("cancelado", 2)
        assert (_saldo(c, f5.A), _saldo(c, f5.B)) == (100, 30)
        estornos = c.execute(
            "SELECT count(*) FROM public.moedas_ledger WHERE motivo = 'estorno' AND referencia = %s", (f"fundo_turma:{fundo}",)
        ).fetchone()[0]
        assert estornos == 2
        # Cancelado libera a turma para outro fundo.
        _criar(c)


@f5.e2e
def test_um_fundo_ativo_por_turma_e_entregar_depois_da_meta() -> None:
    with _banco() as c:
        _semear(c)
        fundo = _criar(c, meta=10)
        r = _rpc(c, f5.PROF, "fundo_turma_criar", f5.TURMA, "Outro", "x", 10)
        assert r == {"ok": False, "erro": "fundo_ja_ativo"}
        _rpc(c, f5.A, "fundo_turma_contribuir", fundo, 10, "a-1")
        assert _rpc(c, f5.PROF, "fundo_turma_encerrar", fundo, True)["status"] == "entregue"


@f5.e2e
def test_posse_e_privacidade() -> None:
    with _banco() as c:
        _semear(c)
        fundo = _criar(c)
        # Aluno não cria nem encerra; aluno de outra turma não doa.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _rpc(c, f5.A, "fundo_turma_criar", f5.TURMA, "x", "y", 10)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _rpc(c, f5.A, "fundo_turma_encerrar", fundo, False)
        assert _rpc(c, OUTRO, "fundo_turma_contribuir", fundo, 10, "o-1") == {"ok": False, "erro": "fundo_indisponivel"}
        _rpc(c, f5.A, "fundo_turma_contribuir", fundo, 10, "a-1")
        _rpc(c, f5.B, "fundo_turma_contribuir", fundo, 5, "b-1")
        # Aluno vê o fundo e só a própria doação; o professor vê todas; ninguém escreve direto.
        assert _como(c, f5.B, "SELECT arrecadado FROM public.fundos_turma")[0][0] == 15
        assert _como(c, f5.B, "SELECT moedas FROM public.fundos_turma_contribuicao") == [(5,)]
        assert len(_como(c, f5.PROF, "SELECT 1 FROM public.fundos_turma_contribuicao")) == 2
        assert _como(c, OUTRO, "SELECT 1 FROM public.fundos_turma") == []
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _como(c, f5.A, "UPDATE public.fundos_turma SET arrecadado = 999")


@f5.e2e
def test_downgrade_remove_tudo() -> None:
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regclass('public.fundos_turma')").fetchone()[0] is None
        assert c.execute("SELECT count(*) FROM pg_proc WHERE proname LIKE 'fundo_turma_%'").fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.retencao_politica WHERE tabela LIKE 'fundos_turma%'").fetchone()[0] == 0




@f5.e2e
def test_as_duas_tabelas_tem_politica_de_retencao() -> None:
    with _banco() as c:
        linhas = c.execute(
            "SELECT tabela, acao, coluna_aluno FROM public.retencao_politica WHERE tabela LIKE 'fundos_turma%' ORDER BY 1"
        ).fetchall()
        assert linhas == [
            ("fundos_turma", "vida_da_conta", "criado_por"),
            ("fundos_turma_contribuicao", "vida_da_conta", "aluno_id"),
        ]
