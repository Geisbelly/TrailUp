import importlib.util
from io import StringIO
from pathlib import Path

from sqlalchemy import text

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

_ARQUIVO = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20261123_02_pesquisa_topicos_publicados.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261123_02", _ARQUIVO)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _corpo(sql: str) -> str:
    return sql.split("CREATE OR REPLACE FUNCTION public.pesquisa_preparar_avaliador")[1].split("$function$;")[0]


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261123_01:20261123_02", sql=True)
    return output.getvalue()


def test_copia_publica_os_topicos_como_a_turma_modelo() -> None:
    corpo = _corpo(_upgrade_sql())

    publica = corpo.index("UPDATE public.topicos n")
    # Depois da cópia e com as claims já de volta: quem publica é a função, não o dono da modelo.
    assert corpo.index("v_nova := public.duplicar_classe(v_modelo);") < publica
    assert corpo.index("PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);") < publica
    trecho = corpo[publica:]
    assert "SET publicacao = m.publicacao" in trecho
    assert "publicar_em = m.publicar_em" in trecho
    assert "n.classe_id = v_nova" in trecho and "m.classe_id = v_modelo" in trecho
    assert "m.ordem IS NOT DISTINCT FROM n.ordem" in trecho


def test_so_muda_a_publicacao() -> None:
    modulo = _modulo()
    antes = _corpo(modulo.DOWNGRADE_SQL)
    depois = _corpo(modulo.SQL)
    inicio = depois.index("\n  -- A cópia nasce em rascunho")
    fim = depois.index("m.ordem IS NOT DISTINCT FROM n.ordem;\n") + len("m.ordem IS NOT DISTINCT FROM n.ordem;\n")
    assert depois[:inicio] + depois[fim:] == antes


def test_downgrade_e_o_corpo_da_20261123_01() -> None:
    modulo = _modulo()
    original = (_ARQUIVO.parent / "20261123_01_pesquisa_avaliadores.py").read_text(encoding="utf-8")
    assert _corpo(modulo.DOWNGRADE_SQL) == _corpo(original)


def test_sql_sem_bind_acidental() -> None:
    modulo = _modulo()
    assert text(modulo.SQL).compile().params == {}
    assert text(modulo.DOWNGRADE_SQL).compile().params == {}
