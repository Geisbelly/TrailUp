"""Use the existing enrollment helper for journey ownership checks."""
from alembic import op

revision = '20260920_05'
down_revision = '20260920_04'
branch_labels = None
depends_on = None


def upgrade() -> None:
    check = """aluno_id=auth.uid() AND classe_id IN (SELECT public.app_classes_do_aluno())
      AND EXISTS (SELECT 1 FROM public.conteudo_personalizado cp
        WHERE cp.id=personalizacao_percurso.personalizacao_id
          AND cp.classe_id=personalizacao_percurso.classe_id
          AND cp.topico_id=personalizacao_percurso.topico_id
          AND (cp.aluno_id=auth.uid() OR cp.aluno_id IS NULL))"""
    op.execute(f'ALTER POLICY percurso_proprio_insert ON public.personalizacao_percurso WITH CHECK ({check})')
    op.execute(f'ALTER POLICY percurso_proprio_update ON public.personalizacao_percurso WITH CHECK ({check})')
    # O manifesto é derivado. Não pode impedir a exclusão normal do conteúdo
    # pelo professor; o histórico em personalizacao_item_progresso não muda.
    op.execute('''ALTER TABLE public.personalizacao_percurso
      DROP CONSTRAINT personalizacao_percurso_personalizacao_id_fkey,
      ADD CONSTRAINT personalizacao_percurso_personalizacao_id_fkey
        FOREIGN KEY(personalizacao_id) REFERENCES public.conteudo_personalizado(id) ON DELETE CASCADE''')


def downgrade() -> None:
    raise RuntimeError('Downgrade manual: manter validação por matrícula e histórico.')
