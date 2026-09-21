import importlib.util
from pathlib import Path


def migration():
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/20260920_06_class_deletion_atomic.py'
    spec = importlib.util.spec_from_file_location('class_deletion_migration', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_revision_chain():
    module = migration()
    assert module.revision == '20260920_06'
    assert module.down_revision == '20260920_05'


def test_owner_check_precedes_all_class_mutations():
    sql = migration().SQL.split('CREATE OR REPLACE FUNCTION public.excluir_classe', 1)[1]
    assert sql.index('professor_id=auth.uid() FOR UPDATE') < sql.index('DELETE FROM')
    assert "ERRCODE='42501'" in sql
    assert 'FROM PUBLIC, anon' in sql
    assert 'TO authenticated' in sql
    assert 'EXCEPTION WHEN' not in sql


def test_unenrollment_is_student_scoped_and_keeps_shared_content():
    sql = migration().SQL.split('CREATE OR REPLACE FUNCTION public.trg_limpar_dados_aluno_classe()', 1)[1].split('CREATE OR REPLACE FUNCTION public.excluir_classe', 1)[0]
    assert sql.count('DELETE FROM') == sql.count('WHERE aluno_id=OLD.aluno_id')
    assert 'DELETE FROM public.conteudo_personalizado' not in sql
    assert 'DELETE FROM public.cards_personalizados' not in sql
    assert sql.index('DELETE FROM public.topico_aluno') > sql.index('DELETE FROM public.atividade_aluno')


def test_saved_bag_and_storage_files_are_preserved():
    sql = migration().SQL
    assert 'UPDATE public.bag_itens SET' in sql
    assert 'DELETE FROM public.bag_itens' not in sql
    assert 'storage.objects' not in sql
    assert 'ALTER TABLE' not in sql  # no broad FK/RLS weakening


def test_progress_does_not_recreate_deleted_topic():
    assert 'IF NOT EXISTS (SELECT 1 FROM public.topicos WHERE id=p_topico) THEN RETURN;' in migration().SQL
