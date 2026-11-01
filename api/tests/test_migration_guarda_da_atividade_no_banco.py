"""Estrutura da `20261102_04` (guarda da atividade no banco, #136 fase 5). O comportamento está no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261102_04_guarda_da_atividade_no_banco.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_20261102_03():
    # Nasceu como 20261101_16 sobre a _14; a main andou até a 20261102_03 (#769) antes do merge, e
    # o número acompanha a cadeia para a ordem do nome bater com a ordem de aplicação.
    assert M.revision == "20261102_04"
    assert M.down_revision == "20261102_03"


def test_guardas_sao_invoker_e_decidem_por_current_user():
    # DEFINER faria o current_user ser sempre o dono, e a guarda nunca dispararia (20261029_06).
    for fn in ("fn_atividade_aluno_guarda_cliente", "fn_questao_aluno_guarda_cliente",
               "fn_eventos_aluno_atividade_concluida"):
        corpo = UP[UP.index(f"FUNCTION public.{fn}()"):]
        corpo = corpo[: corpo.index("$function$;")]
        assert "SECURITY INVOKER" in corpo, fn
        assert "current_user NOT IN ('authenticated', 'anon')" in corpo, fn
        assert "request.jwt" not in corpo, fn


def test_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro: as mensagens concatenam.
    assert "%" not in UP


def test_downgrade_derruba_o_que_o_upgrade_cria():
    for gatilho in re.findall(r"CREATE TRIGGER (\w+)", UP):
        assert f"DROP TRIGGER IF EXISTS {gatilho}" in DOWN
    for fn in re.findall(r"CREATE OR REPLACE FUNCTION public\.(\w+)\(", UP):
        assert f"DROP FUNCTION IF EXISTS public.{fn}(" in DOWN
