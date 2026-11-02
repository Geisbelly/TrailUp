"""`20261102_25`: a supressão do estudo vale para a célula inteira (#17).

O comportamento está em `test_e2e_estudo_supressao_completa.py` (Postgres local). Aqui fica o que dá
para travar sem banco.
"""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    path = VERSOES / "20261102_25_estudo_supressao_completa.py"
    spec = importlib.util.spec_from_file_location("m_20261102_25_teste", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261102_24:20261102_25", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_24() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_25").down_revision == "20261102_24"


def test_todo_campo_da_celula_passa_pela_mesma_regra() -> None:
    """Campo novo em `estudo_indicadores_publicos` que leia `p_bruto` direto, sem `b.ok`, sai cru
    numa turma pequena. Os únicos que não passam por `b.ok` são a janela (inicio, fim, dias), que
    não diz nada de aluno."""
    corpo = _modulo().funcao_nova()
    corpo = corpo[: corpo.index("FROM (")]
    crus = [
        linha.strip()
        for linha in corpo.splitlines()
        if "p_bruto ->" in linha and "b.ok" not in linha and "CASE WHEN p_bruto IS NULL" not in linha
    ]
    assert crus == ["'inicio', p_bruto -> 'inicio',", "'fim', p_bruto -> 'fim',", "'dias', p_bruto -> 'dias',"]


def test_so_troca_a_funcao_e_nao_abre_para_cliente() -> None:
    sql = _upgrade_sql()
    assert "CREATE OR REPLACE FUNCTION public.estudo_indicadores_publicos(" in sql
    assert "CASE WHEN b.ok THEN p_bruto -> 'lotes_por_plataforma' END" in sql
    assert "CASE WHEN b.ok THEN p_bruto -> 'ciclos_personalizacao' END" in sql
    assert "GRANT" not in sql
    assert "REVOKE ALL ON FUNCTION public.estudo_indicadores_publicos(jsonb, integer) FROM PUBLIC, anon, authenticated" in sql


def test_o_downgrade_e_a_funcao_da_03_byte_a_byte() -> None:
    mod = _modulo()
    texto_03 = (VERSOES / "20261102_03_metricas_estudo_coortes.py").read_text(encoding="utf-8")
    assert mod.funcao_anterior() in texto_03
