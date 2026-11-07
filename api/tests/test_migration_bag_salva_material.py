from __future__ import annotations

import importlib.util
from pathlib import Path

MIGRACAO = Path(__file__).parents[1] / "alembic" / "versions" / "20261106_05_bag_salva_material.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261106_05", MIGRACAO)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_material_entra_no_check_de_tipo_e_de_formato() -> None:
    mod = _modulo()
    assert "'material'" in mod.CONSTRAINTS
    assert "bag_itens_tipo_check" in mod.CONSTRAINTS
    assert "bag_itens_formato_valido" in mod.CONSTRAINTS
    # O material é atalho para o tópico: sem tópico não há para onde levar o aluno.
    assert "topico_id IS NOT NULL" in mod.CONSTRAINTS
    for formato in ("audio", "apresentacao", "markdown"):
        assert f"'{formato}'" in mod.CONSTRAINTS


def test_bag_listar_devolve_metadata_do_item_do_aluno() -> None:
    mod = _modulo()
    assert "'metadata', bi.metadata" in mod.LISTAR
    # Escopo que já existia continua: turma do aluno, dono e visualização.
    assert "app_classes_do_aluno()" in mod.LISTAR
    assert "bi.aluno_id = auth.uid()" in mod.LISTAR
    assert "ultima_visualizacao IS NOT NULL" in mod.LISTAR
    assert "GRANT EXECUTE ON FUNCTION public.bag_listar(text,text,bigint,bigint,text) TO authenticated" in mod.LISTAR


def test_item_nao_guarda_url_do_material() -> None:
    mod = _modulo()
    assert "'url'" not in mod.CONSTRAINTS


def test_sql_sem_bind_acidental() -> None:
    from sqlalchemy import text

    mod = _modulo()
    for bloco in (mod.CONSTRAINTS, mod.LISTAR):
        assert text(bloco).compile().params == {}
