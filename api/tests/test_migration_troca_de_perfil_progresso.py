from __future__ import annotations

import importlib.util
from pathlib import Path

MIGRACAO = (
    Path(__file__).parents[1] / "alembic" / "versions" / "20261106_06_troca_de_perfil_nao_cai_pelo_progresso.py"
)


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261106_06", MIGRACAO)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_cada_recalculo_tem_o_proprio_bloco_de_excecao() -> None:
    sql = _modulo().FUNCAO
    assert "CREATE OR REPLACE FUNCTION public.trailup_progresso_after_perfil()" in sql
    assert sql.count("EXCEPTION WHEN OTHERS") == 2
    assert sql.count("RAISE WARNING") == 2
    # Continua recalculando os dois níveis, só não derruba a troca.
    assert "trailup_recalcular_topico_aluno(NEW.id, r.id)" in sql
    assert "trailup_recalcular_classe_aluno(NEW.id, r.classe_id)" in sql
    assert "SECURITY DEFINER" in sql and "SET search_path = public, pg_temp" in sql


def test_sql_sem_bind_acidental() -> None:
    from sqlalchemy import text

    assert text(_modulo().FUNCAO).compile().params == {}
