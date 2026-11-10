"""`20261110_07` num Postgres descartável: a falha tratada entra, agrega e não acorda ninguém."""

from __future__ import annotations

import psycopg
import pytest
from sqlalchemy import text

from tests.test_e2e_monitor_disponibilidade import ALUNO, DONO, EMAIL_DONO, _modulo, alertas, banco  # noqa: F401
from tests.test_e2e_saude_dos_clientes import c, como, erro, exige_docker, registrar, sessao, voltar  # noqa: F401

F = _modulo("20261110_07_falha_tratada_do_cliente.py")


@pytest.fixture
def ct(c):  # noqa: F811
    c.execute(F._restricao(F.TIPOS_DEPOIS))
    c.execute(F._trocar(F.ANTES, F.DEPOIS))
    return c


def _tratado(**campos):
    return erro(tipo="tratado", assinatura="trat01", nome="PostgrestError", rota="questao/confirmar", **campos)


@exige_docker
def test_antes_da_migration_a_falha_tratada_some(c) -> None:  # noqa: F811
    como(c, ALUNO)
    registrar(c, sessao(), [_tratado()])
    voltar(c)
    assert c.execute("SELECT count(*) FROM public.cliente_erro").fetchone()[0] == 0


@exige_docker
def test_falha_tratada_entra_e_agrega(ct) -> None:
    como(ct, ALUNO)
    registrar(ct, sessao(), [_tratado(mensagem="tentativa_ja_respondida", vezes=3)])
    registrar(ct, sessao(), [_tratado(mensagem="tentativa_ja_respondida")])
    voltar(ct)
    assert ct.execute(
        "SELECT tipo, nome, mensagem, rota, vezes, cardinality(sessoes) FROM public.cliente_erro"
    ).fetchall() == [("tratado", "PostgrestError", "tentativa_ja_respondida", "questao/confirmar", 4, 2)]


@exige_docker
def test_falha_tratada_nao_avisa_nem_com_duas_pessoas(ct) -> None:
    for quem, email in ((ALUNO, "x@example.test"), (DONO, EMAIL_DONO)):
        como(ct, quem, email)
        registrar(ct, sessao(), [_tratado()])
        voltar(ct)
    ct.execute("SELECT public.fn_cliente_saude_varrer()")
    assert alertas(ct) == []


@exige_docker
def test_tipo_inventado_continua_fora(ct) -> None:
    como(ct, ALUNO)
    registrar(ct, sessao(), [erro(tipo="qualquer")])
    voltar(ct)
    assert ct.execute("SELECT count(*) FROM public.cliente_erro").fetchone()[0] == 0
    with pytest.raises(psycopg.errors.CheckViolation):
        ct.execute(
            "INSERT INTO public.cliente_erro (dia, superficie, assinatura, tipo, primeira_em, ultima_em)"
            " VALUES (current_date, 'app', 'x', 'qualquer', now(), now())"
        )


@exige_docker
def test_downgrade_volta_e_apaga_so_as_tratadas(ct) -> None:
    como(ct, ALUNO)
    registrar(ct, sessao(), [_tratado(), erro()])
    voltar(ct)
    ct.execute(F._trocar(F.DEPOIS, F.ANTES))
    ct.execute("DELETE FROM public.cliente_erro WHERE tipo = 'tratado';")
    ct.execute(F._restricao(F.TIPOS_ANTES))
    assert ct.execute("SELECT tipo FROM public.cliente_erro").fetchall() == [("tela",)]
    como(ct, ALUNO)
    registrar(ct, sessao(), [_tratado()])
    voltar(ct)
    assert ct.execute("SELECT count(*) FROM public.cliente_erro WHERE tipo = 'tratado'").fetchone()[0] == 0


def test_troca_e_restricao_nao_viram_parametro_de_bind() -> None:
    for bloco in (F._trocar(F.ANTES, F.DEPOIS), F._trocar(F.DEPOIS, F.ANTES), F._restricao(F.TIPOS_DEPOIS)):
        assert not text(bloco).compile().params


def test_cadeia_e_o_aviso_continua_so_para_tela_e_fatal() -> None:
    assert (F.revision, F.down_revision) == ("20261110_07", "20261110_06")
    m14 = _modulo("20261105_14_saude_dos_clientes.py")
    assert "e.tipo IN ('tela', 'fatal')" in m14.FUNCOES_SQL
    assert F.ANTES in m14.FUNCOES_SQL
    assert "fn_cliente_saude_varrer" not in F.TROCAR
