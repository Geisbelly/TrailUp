"""`20261121_04`: a resposta curta aceita o número com a unidade escrita de outro jeito (estrutura).

O comportamento é medido no e2e (`test_e2e_desafio_resposta_numero_e_unidade.py`, banco local).
"""

from __future__ import annotations

import importlib.util
import re
import types
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261121_04_desafio_resposta_numero_e_unidade.py"


def _mod(arquivo: str = ARQUIVO):
    spec = importlib.util.spec_from_file_location(f"m_{arquivo[:11]}", VERSOES / arquivo)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _comandos(fn: str) -> list[str]:
    mod = _mod()
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return coletados


def _compacto(sql: str) -> str:
    return re.sub(r"\s+", " ", sql)


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261121_04", "20261121_03")


def test_mesma_assinatura_imutavel_e_sem_grant() -> None:
    sql = _compacto("\n".join(_comandos("upgrade")))
    assert "CREATE OR REPLACE FUNCTION public.fn_missao_desafio_comparavel(p_texto text, p_curta boolean)" in sql
    assert "IMMUTABLE SET search_path = ''" in sql
    assert "SECURITY DEFINER" not in sql
    assert (
        "REVOKE ALL ON FUNCTION public.fn_missao_desafio_comparavel(text, boolean) FROM PUBLIC, anon, authenticated;"
        in sql
    )
    assert "GRANT" not in sql
    # Só a função de comparação muda: a RPC e a normalização da 20261117_03 ficam como estão.
    assert sql.count("CREATE OR REPLACE FUNCTION") == 1


def test_multipla_continua_so_normalizada() -> None:
    sql = _compacto(_mod().COMPARAVEL)
    assert "IF NOT p_curta THEN RETURN public.fn_missao_desafio_normalizar(p_texto); END IF;" in sql


def test_downgrade_devolve_o_texto_da_20261117_04() -> None:
    original = _mod("20261117_04_missao_desafio_responder.py").AUXILIARES
    inicio = original.index("CREATE OR REPLACE FUNCTION public.fn_missao_desafio_comparavel")
    fim = original.index("FROM PUBLIC, anon, authenticated;", inicio) + len("FROM PUBLIC, anon, authenticated;")
    assert original[inicio:fim] in "\n".join(_comandos("downgrade"))


def test_sem_bind_acidental() -> None:
    for fn in ("upgrade", "downgrade"):
        for bloco in _comandos(fn):
            assert text(bloco).compile().params == {}
