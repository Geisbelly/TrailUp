"""Texto da `20261121_05`, sem banco: o tick novo é o antigo com um passo a mais, e nada vira bind."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(nome: str):
    caminho = VERSOES / nome
    spec = importlib.util.spec_from_file_location(f"m_{caminho.stem}_teste", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M = _modulo("20261121_05_monitor_desafios_auto_parados.py")
M09 = _modulo("20261105_09_monitor_de_disponibilidade.py")


def test_revisao_encadeia_na_cabeca_anterior():
    assert (M.revision, M.down_revision) == ("20261121_05", "20261121_04")


@pytest.mark.parametrize("bloco", ["SINAL", "TICK_NOVO", "TICK_ANTIGO", "DROP_SINAL"])
def test_nenhum_bloco_vira_bind_nem_leva_placeholder(bloco):
    sql = getattr(M, bloco)
    assert text(sql).compile().params == {}
    assert "__CONFIG__" not in sql


def test_tick_antigo_e_o_recorte_exato_da_09():
    assert M.TICK_ANTIGO.startswith("CREATE OR REPLACE FUNCTION public.fn_monitor_tick()")
    assert M.TICK_ANTIGO.strip().endswith("$fn$;")
    assert M.TICK_ANTIGO.strip() in M09.NUCLEO
    # Um CREATE só: o recorte não pode levar a função seguinte junto.
    assert M.TICK_ANTIGO.count("CREATE OR REPLACE FUNCTION") == 1


def test_tick_novo_so_acrescenta_o_passo_dos_desafios():
    passo = M.TICK_NOVO.replace(M.TICK_ANTIGO.split("  BEGIN\n    v_disparadas")[0], "", 1)
    assert passo.startswith("  IF v_minuto % 10 = 0 THEN")
    removido = M.TICK_NOVO.replace(
        """  IF v_minuto % 10 = 0 THEN
    BEGIN
      PERFORM public.fn_monitor_sinal_desafios_auto();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'monitor: desafios: %', SQLERRM;
    END;
  END IF;
""",
        "",
    )
    assert removido == M.TICK_ANTIGO
    # Depois dos sinais e antes de disparar e enviar: o alerta aberto sai no mesmo tick.
    assert M.TICK_NOVO.index("fn_monitor_varrer_sinais") < M.TICK_NOVO.index("fn_monitor_sinal_desafios_auto")
    assert M.TICK_NOVO.index("fn_monitor_sinal_desafios_auto") < M.TICK_NOVO.index("fn_monitor_enviar_alertas")


def test_sinal_e_do_servidor_e_ignora_o_429():
    assert "SECURITY DEFINER" in M.SINAL
    assert "REVOKE ALL ON FUNCTION public.fn_monitor_sinal_desafios_auto() FROM PUBLIC, anon, authenticated" in M.SINAL
    assert "GRANT" not in M.SINAL
    assert "t.erro NOT LIKE '429 %'" in M.SINAL
    assert "'desafios_auto', 'degradacao'" in M.SINAL


def test_downgrade_volta_o_tick_antes_de_dropar():
    assert "DROP FUNCTION IF EXISTS public.fn_monitor_sinal_desafios_auto()" in M.DROP_SINAL
    corpo = Path(M.__file__).read_text(encoding="utf-8")
    baixa = corpo[corpo.index("def downgrade"):]
    assert baixa.index("TICK_ANTIGO") < baixa.index("DROP_SINAL")
