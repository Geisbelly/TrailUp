"""Keep student-specific cards private in the Bag listing."""

from alembic import op

revision = "20260913_24"
down_revision = "20260913_23"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $migration$
        DECLARE
          v_definition TEXT;
        BEGIN
          SELECT pg_get_functiondef(
            'public.bag_listar(text,text,bigint,bigint,text)'::regprocedure
          ) INTO v_definition;

          v_definition := replace(
            v_definition,
            '               WHERE p_classe_id IS NOT NULL
                 AND cp.classe_id = p_classe_id',
            '               WHERE p_classe_id IS NOT NULL
                 AND (cp.aluno_id IS NULL OR cp.aluno_id = auth.uid())
                 AND cp.classe_id = p_classe_id'
          );

          IF position('cp.aluno_id IS NULL OR cp.aluno_id = auth.uid()' IN v_definition) = 0 THEN
            RAISE EXCEPTION 'bag_listar_ownership_guard_not_applied';
          END IF;

          EXECUTE v_definition;
        END
        $migration$;
        """
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter isolamento dos cards da Bag")
