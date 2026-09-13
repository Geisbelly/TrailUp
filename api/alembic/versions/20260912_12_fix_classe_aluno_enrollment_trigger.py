"""Allow class enrollment trigger to provision student progress rows."""

from alembic import op

revision = "20260912_12"
down_revision = "20260912_11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # classe_aluno has an AFTER INSERT trigger that provisions the student's
    # progress rows. Those tables are protected by RLS, so the provisioning
    # function must run with its owner's privileges. Keep the search path
    # pinned because this is a SECURITY DEFINER function.
    op.execute(
        """
        ALTER FUNCTION public.provisionar_estrutura_aluno_classe(uuid, bigint)
          SECURITY DEFINER;
        ALTER FUNCTION public.provisionar_estrutura_aluno_classe(uuid, bigint)
          SET search_path = public, pg_temp;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER FUNCTION public.provisionar_estrutura_aluno_classe(uuid, bigint)
          SECURITY INVOKER;
        ALTER FUNCTION public.provisionar_estrutura_aluno_classe(uuid, bigint)
          RESET search_path;
        """
    )
