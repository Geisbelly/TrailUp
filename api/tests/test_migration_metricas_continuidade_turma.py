"""Estrutura da `20261115_04` (sem banco): cadeia, SQL sem `%` nem bind acidental, contrato de acesso."""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = VERSOES / "20261115_04_metricas_continuidade_turma.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m_20261115_04", ARQUIVO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _modulo()
BLOCOS = {"VIEW": M.VIEW, "RPC": M.RPC, "CATALOGO": M.CATALOGO, "DOWNGRADE": M.DOWNGRADE}


def test_revisao_parte_de_uma_revisao_que_existe() -> None:
    assert M.revision == "20261115_04"
    achou = [
        f for f in VERSOES.glob("*.py")
        if re.search(rf'^revision(?:: str)?\s*=\s*["\']{M.down_revision}["\']', f.read_text(encoding="utf-8"), re.M)
    ]
    assert len(achou) == 1


def test_sql_sem_porcento_nem_parametro_acidental() -> None:
    """`%` é dobrado pelo SQL offline do Alembic; `:palavra` vira bind no `op.execute`."""
    for nome, sql in BLOCOS.items():
        assert "%" not in sql, nome
        assert text(sql).compile().params == {}, nome


def test_view_nasce_security_invoker_e_fechada_para_anon() -> None:
    assert "CREATE VIEW public.vw_metricas_sessoes_estudo WITH (security_invoker = on)" in M.VIEW
    assert "REVOKE ALL ON public.vw_metricas_sessoes_estudo FROM anon" in M.VIEW
    assert "GRANT SELECT ON public.vw_metricas_sessoes_estudo TO authenticated" in M.VIEW


def test_view_usa_so_o_escopo_topic() -> None:
    assert M.VIEW.count("e.scope = 'topic'") == 2
    assert "interval '30 minutes'" in M.VIEW


def test_rpc_confere_a_posse_antes_de_ler_e_fecha_para_anon() -> None:
    corpo = M.RPC
    posse = corpo.index("app_classes_do_professor()")
    assert posse < corpo.index("WITH\n  matriculados")
    assert "SECURITY DEFINER" in corpo and "SET search_path TO 'public', 'pg_temp'" in corpo
    assert "REVOKE ALL ON FUNCTION public.metricas_continuidade_turma(bigint, date, date, text) FROM PUBLIC, anon" in corpo
    assert "public.trailup_fuso_valido(p_timezone)" in corpo
    assert "pg_timezone_names" not in corpo


def test_rpc_nao_devolve_identificador_de_aluno() -> None:
    """Contagens da turma: nenhuma chave do JSON carrega `aluno_id`."""
    assert not re.search(r"'aluno_id'\s*,", M.RPC)


def test_catalogo_e_downgrade_falam_das_mesmas_chaves() -> None:
    for chave in M.CHAVES:
        assert f"'{chave}'" in M.CATALOGO
        assert f"'{chave}'" in M.DOWNGRADE
    assert len(M.CHAVES) == 4
