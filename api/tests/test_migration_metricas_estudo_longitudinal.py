"""`20261105_10` (#19): análise longitudinal do estudo.

O comportamento está em `test_e2e_metricas_estudo_longitudinal.py` (Postgres local). Aqui fica o
que dá para travar sem banco.
"""

import importlib.util
from io import StringIO
from pathlib import Path

from alembic.script import ScriptDirectory

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    path = VERSOES / "20261105_10_metricas_estudo_longitudinal.py"
    spec = importlib.util.spec_from_file_location("m_20261105_10_teste", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sql(direcao: str) -> str:
    output = StringIO()
    faixa = "20261105_09:20261105_10" if direcao == "upgrade" else "20261105_10:20261105_09"
    comando = migrations.command.upgrade if direcao == "upgrade" else migrations.command.downgrade
    comando(_offline_alembic_config(output), faixa, sql=True)
    return output.getvalue().replace("%%", "%")


def test_a_arvore_continua_com_uma_cabeca_e_vem_depois_da_09() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261105_10").down_revision == "20261105_09"


def test_a_janela_ganha_perfil_opcional_sem_perder_o_consentimento() -> None:
    nova = _modulo().janela_nova()
    assert "  p_perfil text DEFAULT NULL\n)" in nova
    assert "vw_alunos_pesquisa_elegiveis" in nova
    assert "p_perfil IS NULL OR p_perfil = (SELECT lower(pf.nome)" in nova
    # O mesmo desempate do perfil dominante da 20261102_26: maior afinidade, depois o nome.
    assert "ORDER BY ap.afinidade DESC NULLS LAST, lower(pf.nome) LIMIT 1" in nova


def test_upgrade_troca_a_janela_de_5_pela_de_6_e_mantem_fechada() -> None:
    sql = _sql("upgrade")
    assert sql.index("DROP FUNCTION IF EXISTS public.estudo_indicadores_janela(bigint, date, date, date, text);") < sql.index(
        "CREATE OR REPLACE FUNCTION public.estudo_indicadores_janela("
    )
    assert (
        "REVOKE ALL ON FUNCTION public.estudo_indicadores_janela(bigint, date, date, date, text, text)"
        " FROM PUBLIC, anon, authenticated" in sql
    )
    assert "GRANT EXECUTE ON FUNCTION public.estudo_indicadores_janela" not in sql


def test_a_rpc_nova_e_do_professor_e_nao_de_anon() -> None:
    sql = _sql("upgrade")
    assert "CREATE OR REPLACE FUNCTION public.metricas_estudo_longitudinal(p_classe_ids bigint[])" in sql
    assert "SECURITY DEFINER" in sql
    assert "public.app_classes_do_professor()" in sql
    assert "REVOKE ALL ON FUNCTION public.metricas_estudo_longitudinal(bigint[]) FROM PUBLIC, anon" in sql
    assert "GRANT EXECUTE ON FUNCTION public.metricas_estudo_longitudinal(bigint[]) TO authenticated" in sql


def test_nenhum_aluno_id_sai_da_rpc() -> None:
    rpc = _modulo().RPC
    corpo = rpc[rpc.index("RETURN jsonb_build_object(") :]
    assert "aluno_id" not in corpo
    assert "aluno_id" not in rpc[rpc.index("grupos AS (") :]


def test_supressao_pelo_mesmo_n_minimo_do_estudo() -> None:
    rpc = _modulo().RPC
    assert "FROM public.metricas_catalogo\n   WHERE left(chave, 7) = 'estudo.'" in rpc
    assert "pareados >= v_n_min AND aluno_semanas > 0 AS ok" in rpc
    assert "'pareados', CASE WHEN s.ok THEN s.pareados END" in rpc


def test_downgrade_volta_a_janela_de_5() -> None:
    sql = _sql("downgrade")
    assert "DROP FUNCTION IF EXISTS public.metricas_estudo_longitudinal(bigint[]);" in sql
    assert "DROP FUNCTION IF EXISTS public.estudo_indicadores_janela(bigint, date, date, date, text, text);" in sql
    assert "  p_timezone text\n)" in sql
    assert "p_perfil" not in sql
