"""Guardas da `20260921_02` — a view volta a expor o gabarito da questão."""

import importlib.util
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20260921_02_reexpoe_resposta_correta_na_view.py"


def _carregar(nome: str = ARQUIVO):
    caminho = VERSOES / nome
    spec = importlib.util.spec_from_file_location(f"migration_{nome}", caminho)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sql(direcao: str = "upgrade") -> str:
    module = _carregar()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return "\n".join(executado)


def test_cadeia_de_revisao():
    module = _carregar()
    assert module.revision == "20260921_02"
    assert module.down_revision == "20260921_01"


def test_upgrade_reexpoe_o_gabarito():
    sql = _sql()
    assert "q.resposta_correta AS questao_resposta_correta" in sql
    assert "NULL::text AS questao_resposta_correta" not in sql


def test_downgrade_anula_o_gabarito_de_novo():
    sql = _sql("downgrade")
    assert "NULL::text AS questao_resposta_correta" in sql
    assert "q.resposta_correta AS questao_resposta_correta" not in sql


def test_view_mantem_security_invoker():
    sql = _sql()
    assert "SET (security_invoker = on)" in sql


def test_recarrega_cache_do_postgrest():
    assert "NOTIFY pgrst, 'reload schema'" in _sql("upgrade")
    assert "NOTIFY pgrst, 'reload schema'" in _sql("downgrade")
