"""Allow enrolled students to read the shared personalized artifacts.

The base layer is generated once per class/topic/content/profile with
``aluno_id IS NULL``.  The mobile client already selects the active BrainHex
profile from that layer, but the old RLS policies only allowed rows owned by
the student.  Students without a successful enrollment derivation therefore
received only teacher content, even when the class already had cards and
personalized material.
"""

from alembic import op


revision = "20260913_18"
down_revision = "20260913_17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DROP POLICY IF EXISTS aluno_classe_conteudo_personalizado_sel
          ON public.conteudo_personalizado;

        CREATE POLICY aluno_classe_conteudo_personalizado_sel
          ON public.conteudo_personalizado
          FOR SELECT TO authenticated
          USING (
            aluno_id = auth.uid()
            OR (
              aluno_id IS NULL
              AND classe_id IN (SELECT public.app_classes_do_aluno())
            )
          );
        """
    )
    op.execute(
        """
        DROP POLICY IF EXISTS aluno_classe_cards_personalizados_sel
          ON public.cards_personalizados;

        CREATE POLICY aluno_classe_cards_personalizados_sel
          ON public.cards_personalizados
          FOR SELECT TO authenticated
          USING (
            aluno_id = auth.uid()
            OR (
              aluno_id IS NULL
              AND classe_id IN (SELECT public.app_classes_do_aluno())
            )
          );
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS aluno_classe_conteudo_personalizado_sel ON public.conteudo_personalizado"
    )
    op.execute(
        "DROP POLICY IF EXISTS aluno_classe_cards_personalizados_sel ON public.cards_personalizados"
    )
