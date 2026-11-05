"""`20261105_09` e `_10` sem banco: o comportamento fica em `test_e2e_monitor_disponibilidade.py`."""

import re
from io import StringIO

from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.db import migrations
from tests.test_e2e_monitor_disponibilidade import _modulo
from tests.test_migrations import _offline_alembic_config

M09 = _modulo("20261105_09_monitor_de_disponibilidade.py")
M10 = _modulo("20261105_10_painel_disponibilidade.py")


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261105_08:20261105_10", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca() -> None:
    assert len(ScriptDirectory.from_config(_offline_alembic_config()).get_heads()) == 1


def test_nenhum_bloco_vira_parametro_de_bind() -> None:
    """`op.execute(str)` passa por `text()`: um `:palavra` no SQL viraria bind e quebraria só ao aplicar."""
    cfg = M09._config()
    blocos = [M09.TABELAS, M09.ALVOS, M09.CONFIG_SEED.replace("__CONFIG__", cfg), M09.PURAS,
              M09.NUCLEO.replace("__CONFIG__", cfg), M09.AGENDAR, M09.DESAGENDAR, M10.TABELA, M10.PAINEL]
    for bloco in blocos:
        assert not text(bloco).compile().params


def test_tabela_nasce_com_rls_e_sem_grant_para_cliente() -> None:
    sql = _upgrade_sql()
    for tabela in ("monitor_alvo", "monitor_sonda", "monitor_incidente", "monitor_alerta", "monitor_consulta"):
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql
        assert f"GRANT SELECT ON public.{tabela}" not in sql


def test_so_as_duas_rpcs_do_painel_abrem_para_cliente() -> None:
    sql = _upgrade_sql()
    assert "GRANT EXECUTE ON FUNCTION public.painel_disponibilidade(integer) TO authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.painel_acessos_alunos(integer, boolean) TO authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.fn_monitor" not in sql


def test_o_destino_do_alerta_vem_da_config() -> None:
    assert not re.search(r"[\w.]+@[\w.]+", M09.NUCLEO.replace("__CONFIG__", "{}"))
    assert "'dono_email'" in M09.NUCLEO


def test_agenda_so_com_pg_cron_e_sem_duplicar() -> None:
    assert "extname = 'pg_cron'" in M09.AGENDAR
    assert "cron.unschedule" in M09.AGENDAR
