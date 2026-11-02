"""Estrutura da `20261102_24` (o banco só entrega o texto da IA aprovado pela guarda de hoje)."""

from __future__ import annotations

from importlib import import_module

from tests import _f5_banco as f5

M = f5.modulo("20261102_24_notificacao_so_com_texto_da_guarda.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))
notificacao = import_module("app.agent.graph.nodes.agente_notificacao")


def test_encadeia_depois_da_23_de_02_11():
    assert M.revision == "20261102_24"
    assert M.down_revision == "20261102_23"


def test_sem_porcentagem_literal():
    # O SQL offline do Alembic dobra `%` e corrompe plpgsql sem erro (memória do projeto).
    assert "%" not in UP
    assert "%" not in DOWN


def test_minimo_do_banco_e_a_versao_da_guarda_da_api():
    # Mínimo acima da API cala todo aviso; abaixo, deixa sair texto aprovado por guarda velha.
    assert M.VERSAO_MINIMA == notificacao.TEXTO_GUARDA_VERSAO
    assert f"('{M.CHAVE}', '{M.VERSAO_MINIMA}'" in UP


def test_a_entrega_ganha_so_a_guarda_e_o_resto_e_a_da_18():
    nova, anterior = M.entregar_nova(), M.entregar_anterior()
    assert nova.replace(M.GUARDA, M.ANCORA, 1) == anterior
    assert "s.origem = 'ciclo'" in M.GUARDA
    assert UP.count("CREATE OR REPLACE FUNCTION public.notificacoes_entregar(") == 1


def test_downgrade_volta_a_entrega_da_18():
    assert M.entregar_anterior() in DOWN
    assert "texto_fora_da_guarda" not in DOWN
    assert f"DELETE FROM public.notificacoes_config WHERE chave = '{M.CHAVE}'" in DOWN
