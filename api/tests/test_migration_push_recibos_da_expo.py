"""Estrutura da `20261108_02`: o push passa a ler os recibos da Expo.

O comportamento roda num Postgres de verdade em `test_e2e_push_recibos_da_expo.py`.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from tests import _f5_banco as f5

M = f5.modulo("20261108_02_push_le_os_recibos_da_expo.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def _corpo(sql: str, funcao: str) -> str:
    inicio = sql.index(f"FUNCTION public.{funcao}(")
    return sql[inicio : sql.index("$fn$", sql.index("$fn$", inicio) + 4)]


def test_encadeia_depois_da_20261108_01():
    assert M.revision == "20261108_02"
    assert M.down_revision == "20261108_01"


def test_tabela_sem_policy_e_fechada_para_o_cliente():
    assert "ALTER TABLE public.notificacoes_push_tickets ENABLE ROW LEVEL SECURITY" in UP
    assert "REVOKE ALL ON TABLE public.notificacoes_push_tickets FROM PUBLIC, anon, authenticated" in UP
    assert "CREATE POLICY" not in UP
    # A linha vai embora junto com o token: sem dado de pessoa sobrando.
    assert "REFERENCES public.expo_tokens (token) ON DELETE CASCADE" in UP


@pytest.mark.parametrize(
    "funcao",
    ["notificacoes_pedir_recibos_push", "notificacoes_conciliar_recibos_push", "notificacoes_conciliar_push"],
)
def test_funcoes_sao_do_banco_e_nao_do_cliente(funcao: str):
    corpo = _corpo(UP, funcao)
    assert "SECURITY DEFINER" in corpo
    assert "SET search_path = public, pg_temp" in corpo
    assert f"REVOKE ALL ON FUNCTION public.{funcao}(integer) FROM PUBLIC, anon, authenticated" in UP


def test_pede_no_maximo_mil_recibos_depois_de_quinze_minutos():
    corpo = _corpo(UP, "notificacoes_pedir_recibos_push")
    assert "LEAST(GREATEST(p_limite, 1), 1000)" in corpo
    assert "interval '15 minutes'" in corpo
    assert "'https://exp.host/--/api/v2/push/getReceipts'" in corpo


def test_so_device_not_registered_desativa_pelo_recibo():
    corpo = _corpo(UP, "notificacoes_conciliar_recibos_push")
    assert "IF v_erro = 'DeviceNotRegistered' THEN" in corpo
    assert "ultima_atividade_em < v_ticket.criado_em" in corpo


def test_ticket_com_credencial_invalida_nao_desativa_mais():
    assert "v_erro IN ('DeviceNotRegistered') THEN" in _corpo(UP, "notificacoes_conciliar_push")
    # O downgrade volta ao comportamento da 20260826_15.
    assert "v_erro IN ('DeviceNotRegistered', 'InvalidCredentials') THEN" in _corpo(DOWN, "notificacoes_conciliar_push")


def test_cron_continua_o_mesmo_e_chama_os_recibos():
    corpo = _corpo(UP, "notificacoes_conciliar_push")
    assert "public.notificacoes_conciliar_recibos_push()" in corpo
    assert "public.notificacoes_pedir_recibos_push()" in corpo
    assert "cron.schedule" not in UP


def test_desativa_so_o_token_android_do_expo_go():
    # Nenhum build teve Firebase: todo token Android anterior à recusa do Expo Go (27/08) é dele.
    assert "SET ativo = FALSE, desativado_motivo = 'expo_go'" in M.TOKEN_DO_EXPO_GO
    assert "plataforma = 'android'" in M.TOKEN_DO_EXPO_GO
    assert "created_at < TIMESTAMPTZ '2026-08-27 00:00:00-03'" in M.TOKEN_DO_EXPO_GO
    assert M.TOKEN_DO_EXPO_GO in UP
    # O downgrade não volta a mandar push para o Expo Go.
    assert "expo_go" not in DOWN


def test_downgrade_tira_o_que_o_upgrade_pos():
    assert "notificacoes_push_tickets" not in _corpo(DOWN, "notificacoes_conciliar_push")
    for objeto in (
        "FUNCTION IF EXISTS public.notificacoes_conciliar_recibos_push(integer)",
        "FUNCTION IF EXISTS public.notificacoes_pedir_recibos_push(integer)",
        "TABLE IF EXISTS public.notificacoes_push_tickets",
    ):
        assert f"DROP {objeto}" in DOWN


@pytest.mark.parametrize("fn", ["upgrade", "downgrade"])
def test_sql_sem_porcentagem_nem_parametro_solto(fn: str):
    # O SQL offline do Alembic dobra `%`, e `text()` lê `:palavra` como parâmetro.
    for sql in f5.sql_de(M, fn):
        assert "%" not in sql
        assert text(sql).compile().params == {}
