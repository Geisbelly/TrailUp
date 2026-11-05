"""`20261105_19` sem banco: o comportamento fica em `test_e2e_monitor_24_horas.py`."""

import json

from alembic.script import ScriptDirectory
from sqlalchemy import text

from tests.test_e2e_monitor_disponibilidade import _modulo
from tests.test_migrations import _offline_alembic_config

M = _modulo("20261105_19_monitor_24_horas.py")


def test_vem_depois_da_18() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_19").down_revision == "20261105_18"


def test_nenhum_bloco_vira_parametro_de_bind() -> None:
    """`op.execute(str)` passa por `text()`: as horas e o `:=` não podem virar parâmetro."""
    blocos = [M._funcao_de_config(M.config_nova()), M._funcao_de_config(M._monitor().CONFIG_PADRAO),
              M.linha_nova(), M.linha_antiga(), M.ALVOS_1_MIN, M.ALVOS_5_MIN]
    for bloco in blocos:
        assert text(bloco).compile().params == {}


def test_padrao_cobre_todo_dia_e_nao_tem_mais_numero_informativo() -> None:
    config = M.config_nova()
    assert config["aula"] == {"dias": [1, 2, 3, 4, 5, 6, 7], "inicio": "00:00", "fim": "24:00", "sem_aula": []}
    assert "slo_24x7" not in config
    assert config["slo"] == M._monitor().CONFIG_PADRAO["slo"]


def test_funcao_recebe_o_padrao_novo_como_json_valido() -> None:
    sql = M._funcao_de_config(M.config_nova())
    assert "__CONFIG__" not in sql
    inicio = sql.index("v_padrao constant jsonb := '") + len("v_padrao constant jsonb := '")
    assert json.loads(sql[inicio : sql.index("'::jsonb", inicio)])["aula"]["fim"] == "24:00"
