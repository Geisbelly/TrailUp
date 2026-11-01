"""Contrato das migrations de cohort e baseline (#13), lido sem banco.

O comportamento (RLS com o papel real, números da RPC, gatilhos) está no e2e
`test_e2e_estudo_coorte.py`; aqui fica o que tem de valer em qualquer ambiente, inclusive no CI
sem Postgres.
"""

from __future__ import annotations

import re

from alembic.config import Config
from alembic.script import ScriptDirectory

from tests import _f5_banco as f5

M_COORTE = f5.modulo("20261102_02_estudo_coorte_e_marcos.py")
M_RPC = f5.modulo("20261102_03_metricas_estudo_coortes.py")


def _sql(mod, fn: str = "upgrade") -> str:
    return "\n".join(f5.sql_de(mod, fn))


def _config() -> Config:
    raiz = f5.VERSOES.parent.parent
    config = Config(str(raiz / "alembic.ini"))
    config.set_main_option("script_location", str(raiz / "alembic"))
    return config


def test_cadeia_e_cabeca_unica() -> None:
    scripts = ScriptDirectory.from_config(_config())
    assert len(scripts.get_heads()) == 1
    assert scripts.get_revision("20261102_02").down_revision == "20261102_01"
    assert scripts.get_revision("20261102_03").down_revision == "20261102_02"


def test_toda_tabela_nova_nasce_com_rls_e_policy() -> None:
    sql = _sql(M_COORTE)
    for tabela in ("estudo_coorte", "marco_produto", "topico_aluno_conclusao"):
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql
        assert re.search(rf"CREATE POLICY \w+ ON public\.{tabela}\s+FOR SELECT TO authenticated", sql)


def test_cliente_nao_escreve_direto_nas_tabelas_novas() -> None:
    sql = _sql(M_COORTE)
    assert "REVOKE INSERT, UPDATE, DELETE, TRUNCATE" in sql
    assert not re.search(r"CREATE POLICY[^;]+FOR (INSERT|UPDATE|DELETE|ALL)", sql)


def test_view_nasce_com_security_invoker_e_sem_anon() -> None:
    sql = _sql(M_COORTE)
    assert "CREATE OR REPLACE VIEW public.vw_estudo_participantes\nWITH (security_invoker = on)" in sql
    assert "REVOKE ALL ON public.vw_estudo_participantes FROM PUBLIC, anon" in sql


def test_rpcs_expostas_conferem_sessao_e_posse() -> None:
    sql = _sql(M_COORTE) + _sql(M_RPC)
    for nome in ("estudo_coorte_registrar", "estudo_coorte_remover", "marco_produto_registrar",
                 "metricas_estudo_coortes"):
        corpo = sql[sql.index(f"FUNCTION public.{nome}(") :]
        corpo = corpo[: corpo.index("$fn$;")]
        assert "auth.uid() IS NULL" in corpo, nome
        assert "SECURITY DEFINER" in corpo, nome
    assert sql.count("app_classes_do_professor()") >= 6


def test_contagem_crua_nao_tem_execute_para_cliente() -> None:
    sql = _sql(M_RPC)
    assert "REVOKE ALL ON FUNCTION public.estudo_indicadores_janela(bigint, date, date, date, text)\n  FROM PUBLIC, anon, authenticated" in sql
    assert "REVOKE ALL ON FUNCTION public.estudo_indicadores_publicos(jsonb, integer)\n  FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.estudo_indicadores" not in sql


def test_pr1_so_soma_o_escopo_de_topico_e_active_sec() -> None:
    sql = _sql(M_RPC)
    janela = sql[sql.index("FUNCTION public.estudo_indicadores_janela(") :]
    janela = janela[: janela.index("$fn$;")]
    tempo = janela[janela.index("tempo AS (") : janela.index("expostos AS (")]
    assert "sum(e.active_sec)" in tempo and "dwell_sec" not in tempo
    assert "e.scope = 'topic'" in tempo


def test_sem_porcento_nem_bind_acidental() -> None:
    # O SQL offline do Alembic dobra `%` e `text()` lê `:palavra` como parâmetro.
    for mod in (M_COORTE, M_RPC):
        for fn in ("upgrade", "downgrade"):
            sql = _sql(mod, fn)
            assert "%" not in sql
            assert not re.search(r"(?<!:):[A-Za-z_]", sql)


def test_downgrade_remove_tudo_que_o_upgrade_cria() -> None:
    down = _sql(M_COORTE, "downgrade") + _sql(M_RPC, "downgrade")
    for objeto in ("vw_estudo_participantes", "estudo_coorte", "marco_produto", "topico_aluno_conclusao",
                   "trg_topico_aluno_conclusao", "trg_marco_da_migracao", "metricas_estudo_coortes",
                   "estudo_indicadores_janela", "estudo_indicadores_publicos", "estudo.pr1_tempo_ativo"):
        assert objeto in down, objeto
