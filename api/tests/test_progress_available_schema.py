from pathlib import Path


def test_progress_migration_preserves_live_function_body_and_checks_both_functions():
    sql = (Path(__file__).resolve().parents[2] / 'docs/mobile/sql/20260920_02_progresso_material_disponivel.sql').read_text(encoding='utf-8')
    assert 'pg_get_functiondef' in sql
    assert 'trailup_recalcular_topico_aluno' in sql
    assert 'trailup_recalcular_classe_aluno' in sql
    assert 'position(filtro IN definicao) = 0' in sql
    assert "EXECUTE replace(definicao, filtro, '')" in sql
    assert 'DELETE FROM' not in sql
    assert 'DISABLE ROW LEVEL SECURITY' not in sql


def test_shared_base_progress_does_not_include_other_students_private_material():
    sql = (Path(__file__).resolve().parents[2] / 'docs/mobile/sql/20260920_03_progresso_base_compartilhada.sql').read_text(encoding='utf-8')
    assert 'AND (cp.aluno_id = p_aluno OR cp.aluno_id IS NULL)' in sql
    assert 'cp.brainhex_profile_key=al.perfil_ativo' in sql
    assert 'cp.classe_id=pip.classe_id' in sql
    assert 'DELETE FROM' not in sql
    assert 'ALTER POLICY' not in sql


def test_current_journey_counts_missing_items_and_preserves_history_and_rls():
    sql = (Path(__file__).resolve().parents[2] / 'docs/mobile/sql/20260920_04_manifesto_percurso.sql').read_text(encoding='utf-8')
    assert 'ENABLE ROW LEVEL SECURITY' in sql
    assert 'WITH CHECK (aluno_id=auth.uid()' in sql
    assert 'LEFT JOIN personalizacao_item_progresso' in sql
    assert 'jsonb_array_elements_text(m.item_keys)' in sql
    assert 'NOT EXISTS (SELECT 1 FROM manifestos' in sql
    assert 'cp.brainhex_profile_key=al.perfil_ativo' in sql
    assert 'DELETE FROM' not in sql
    assert 'SECURITY DEFINER' not in sql
