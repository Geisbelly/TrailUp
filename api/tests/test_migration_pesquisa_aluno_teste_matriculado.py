"""Estrutura da `20261124_05`: o aluno de teste do avaliador nasce cadastrado e matriculado.

Medido no banco de dev, numa transação desfeita, com os gatilhos reais de `alunos` e `classe_aluno`:
o backfill cadastra, libera o acesso só ao avaliador e matricula (com o job de matrícula); repetir não
duplica; o gatilho cobre o avaliador novo; aluno de teste sem `auth.users` não quebra.
"""

import importlib.util
from pathlib import Path

from sqlalchemy import text

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo():
    caminho = _VERSOES / "20261124_05_pesquisa_aluno_teste_matriculado.py"
    spec = importlib.util.spec_from_file_location("m20261124_05", caminho)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_encadeia_na_04() -> None:
    modulo = _modulo()
    assert modulo.revision == "20261124_05"
    assert modulo.down_revision == "20261124_04"


def test_sem_parametro_de_bind_no_sql() -> None:
    assert text(_modulo().SQL).compile().params == {}


def test_nao_sobrescreve_cadastro_nem_matricula() -> None:
    sql = _modulo().SQL
    assert "ON CONFLICT (id) DO NOTHING" in sql
    assert "WHERE NOT EXISTS" in sql
    # O aluno de teste não ganha perfil inventado: sem aluno_perfil ele conta como mastermind.
    assert "aluno_perfil" not in sql.split("$function$")[1]


def test_acesso_so_ao_professor_avaliador() -> None:
    sql = _modulo().SQL
    assert "VALUES (r.professor_id, r.aluno_teste_id, true)" in sql
    assert "has_acesso = true" in sql


def test_falha_nao_derruba_a_conta_nem_a_api() -> None:
    sql = _modulo().SQL
    assert sql.count("EXCEPTION WHEN OTHERS THEN") == 2
    assert "RAISE WARNING" in sql and "RAISE EXCEPTION" not in sql


def test_so_o_servidor_executa() -> None:
    sql = _modulo().SQL
    assert (
        "REVOKE ALL ON FUNCTION public.fn_pesquisa_cadastrar_aluno_teste(bigint) FROM PUBLIC, anon, authenticated"
        in sql
    )
    assert "SECURITY DEFINER" in sql
