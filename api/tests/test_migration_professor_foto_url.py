"""`20261103_12`: foto de perfil do professor em `professor.foto_url`, presa à pasta do dono."""

import importlib.util
import types
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261103_12_professor_foto_url.py"


def _sql(fn: str) -> str:
    spec = importlib.util.spec_from_file_location("m_20261103_12", VERSOES / ARQUIVO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return "\n".join(coletados)


def test_cadeia() -> None:
    texto = (VERSOES / ARQUIVO).read_text(encoding="utf-8")
    assert 'revision = "20261103_12"' in texto
    assert 'down_revision = "20261103_11"' in texto
    # Ninguém mais aponta para a _11: a cadeia continua linear.
    outras = [p for p in VERSOES.glob("*.py") if p.name != ARQUIVO]
    assert not any('down_revision = "20261103_11"' in p.read_text(encoding="utf-8") for p in outras)


def test_coluna_e_check_na_pasta_do_dono() -> None:
    sql = _sql("upgrade")
    assert "ADD COLUMN IF NOT EXISTS foto_url text" in sql
    assert "CHECK (foto_url IS NULL OR left(foto_url" in sql
    assert "'perfil_fotos/' || id::text || '/'" in sql


def test_downgrade_desfaz() -> None:
    sql = _sql("downgrade")
    assert "DROP CONSTRAINT IF EXISTS professor_foto_url_na_pasta_do_dono" in sql
    assert "DROP COLUMN IF EXISTS foto_url" in sql
