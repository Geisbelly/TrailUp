from pathlib import Path


MIGRACAO = Path(__file__).parents[1] / "alembic" / "versions" / "20260913_11_progresso_percentual_ponderado.py"


def test_percentual_da_classe_nao_faz_media_simples_dos_topicos() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "AVG(" not in source
    assert "sum(total)" in source
    assert "sum(feitos)" in source


def test_percentual_ponderado_respeita_percurso_personalizado() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "personalizacao_item_progresso" in source
    assert "coalesce(p.total, 0) > 0" in source
    assert "ELSE coalesce(pr.total, 0)" in source
    assert "left(coalesce(item_key, ''), 6) <> 'slide:'" in source


def test_migracao_recalcula_registros_existentes_e_preserva_tempo_canonico() -> None:
    source = MIGRACAO.read_text(encoding="utf-8")
    assert "SELECT aluno_id, classe_id FROM public.classe_aluno" in source
    assert "sum(greatest(0, coalesce(ta.tempo_gasto_min, 0)))" in source
    assert "active_sec aggregate" in source
