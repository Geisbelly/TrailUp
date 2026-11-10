"""Estrutura da `20261110_06`: a arena corrige pelo banco e só sorteia o que o banco corrige.

Sem banco (roda no CI). O comportamento está em `test_e2e_arena.py`.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

API = Path(__file__).resolve().parents[1]
CAMINHO = API / "alembic" / "versions" / "20261110_06_arena_corrige_pelo_banco.py"
RETRATO = (API / "tests" / "fixtures" / "arena_prod_20261110.sql").read_text(encoding="utf-8")

_spec = importlib.util.spec_from_file_location("m_20261110_06", CAMINHO)
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)

IGUALDADE = re.compile(r"lower\(btrim\(COALESCE\(v_q\.resposta_correta")


def _do_retrato(nome: str) -> str:
    inicio = RETRATO.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    delimitador = re.search(r"AS (\$\w*\$)", RETRATO[inicio:]).group(1)
    fim = RETRATO.index(delimitador, RETRATO.index(delimitador, inicio) + len(delimitador)) + len(delimitador)
    return RETRATO[inicio:fim] + ";"


def test_cadeia():
    assert (M.revision, M.down_revision) == ("20261110_06", "20261110_05")


def test_antes_e_o_corpo_de_producao():
    """O downgrade devolve exatamente o que estava no ar em 10/11."""
    assert M.ARENA_CRIAR_ANTES.strip() == _do_retrato("arena_desafio_criar")
    assert M.GUILDA_CRIAR_ANTES.strip() == _do_retrato("guilda_desafio_criar")
    assert M.ARENA_RESPONDER_ANTES.strip() == _do_retrato("arena_responder")
    assert M.GUILDA_RESPONDER_ANTES.strip() == _do_retrato("guilda_desafio_responder")


def test_responder_corrige_pela_funcao_da_atividade():
    for antes, depois in ((M.ARENA_RESPONDER_ANTES, M.ARENA_RESPONDER), (M.GUILDA_RESPONDER_ANTES, M.GUILDA_RESPONDER)):
        assert IGUALDADE.search(antes)
        assert not IGUALDADE.search(depois)
        assert "public.fn_questao_confere(p_questao_id, p_resposta)" in depois


def test_resposta_repetida_devolve_o_gravado():
    assert "IF NOT v_gravou THEN" in M.ARENA_RESPONDER
    assert "SELECT r.correta INTO v_correta" in M.ARENA_RESPONDER


def test_sorteio_filtra_nos_dois_criadores():
    assert M.ARENA_CRIAR.count("public.fn_questao_cabe_no_desafio(q.id)") == 1
    # Os dois ramos do cooperativo: normal e difícil.
    assert M.GUILDA_CRIAR.count("public.fn_questao_cabe_no_desafio(q.id)") == 2


def test_filtro_nao_e_do_cliente():
    sql = M.CABE_NO_DESAFIO
    assert "SECURITY DEFINER" in sql and "SET search_path TO 'public', 'pg_temp'" in sql
    assert "FROM PUBLIC, anon, authenticated" in sql
    assert "TO service_role" in sql
    assert "fn_questao_corrigida_por_ia" in sql


def test_downgrade_apaga_o_filtro():
    class Coletor:
        def __init__(self):
            self.sql = []

        def execute(self, sql):
            self.sql.append(str(sql))

    original, M.op = M.op, Coletor()
    try:
        M.downgrade()
        executado = M.op.sql
    finally:
        M.op = original
    assert executado[-1].startswith("DROP FUNCTION IF EXISTS public.fn_questao_cabe_no_desafio(bigint)")
    assert len(executado) == 5
