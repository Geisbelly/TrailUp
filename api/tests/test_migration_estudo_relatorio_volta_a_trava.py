"""`20261105_09`: o relatório do estudo volta a mostrar a trava (#13, #17).

A `20261104_04` regravou `metricas_estudo_coortes` a partir da `_03` e apagou o que a `_05` tinha
posto. Estes testes travam, sem banco, que a RPC final tem as duas coisas: a trava da `_05` e a
população da `_04_04`.
"""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

DA_TRAVA = (
    "public.estudo_coorte_retem(c.braco, c.corte, c.fim, c.timezone)",
    "'exposicao_antes_do_registro', v_exposto_antes",
    "'a personalizacao fica retida desde o registro (RLS e API); o que escapar aparece como exposicao em contaminacao'",
)
DO_CONSENTIMENTO = "pareados com consentimento de pesquisa vigente (vw_alunos_pesquisa_elegiveis)"


def _modulo():
    path = VERSOES / "20261105_09_estudo_relatorio_volta_a_trava.py"
    spec = importlib.util.spec_from_file_location("m_20261105_09_teste", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261105_08:20261105_09", sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_08() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_09").down_revision == "20261105_08"


def test_a_04_04_tinha_perdido_a_trava() -> None:
    """O defeito que esta migration corrige: se um dia a `_04_04` passar a partir da `_05`, este
    teste avisa que a `_05_09` ficou redundante."""
    anterior = _modulo().rpc_anterior()
    assert DO_CONSENTIMENTO in anterior
    for trecho in DA_TRAVA:
        assert trecho not in anterior
    assert "'sem trava de personalizacao" in anterior


def test_a_rpc_nova_tem_a_trava_e_a_populacao_nova() -> None:
    sql = _upgrade_sql()
    assert "CREATE OR REPLACE FUNCTION public.metricas_estudo_coortes(" in sql
    for trecho in DA_TRAVA:
        assert trecho in sql
    assert DO_CONSENTIMENTO in sql
    assert "'sem trava de personalizacao" not in sql
    assert "'trava', jsonb_build_object(" in sql


def test_nao_abre_para_anon() -> None:
    sql = _upgrade_sql()
    assert "REVOKE ALL ON FUNCTION public.metricas_estudo_coortes(bigint[]) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.metricas_estudo_coortes(bigint[]) TO authenticated" in sql


def test_o_downgrade_volta_ao_que_a_04_04_deixou() -> None:
    m = _modulo()
    spec = importlib.util.spec_from_file_location("m_0404_teste", VERSOES / "20261104_04_agregados_so_quem_consentiu.py")
    m0404 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m0404)
    assert m.rpc_anterior() == m0404._trocar(m0404.estudo_anterior(), m0404.TROCAS_ESTUDO, "x")
