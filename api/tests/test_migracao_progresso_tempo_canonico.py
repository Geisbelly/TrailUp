from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_tempo_canonico_usa_tempo_ativo_do_lote() -> None:
    sql = (ROOT / "alembic/versions/20260913_09_progresso_tempo_canonico.py").read_text()

    assert "sum(e.active_sec)" in sql
    assert "sum(e.dwell_sec)" not in sql
    assert "trailup_recalcular_topico_aluno" in sql
    assert "trailup_recalcular_classe_aluno" in sql


def test_chat_privado_permite_colega_da_mesma_turma_sem_bloqueio() -> None:
    sql = (ROOT / "alembic/versions/20260913_10_chat_colegas_sem_amizade.py").read_text()

    assert "JOIN public.classe_aluno other ON other.classe_id = mine.classe_id" in sql
    assert "social_chat_sem_amizade" not in sql
    assert "social_chat_bloqueado" in sql
