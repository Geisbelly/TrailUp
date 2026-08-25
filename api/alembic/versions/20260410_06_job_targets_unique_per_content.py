"""adjust personalizacao_job_targets uniqueness to include conteudo_id"""


from alembic import op

revision = "20260410_06"
down_revision = "20260410_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("personalizacao_job_targets") as batch_op:
        batch_op.drop_constraint("uq_job_target_aluno_topico", type_="unique")
        batch_op.create_unique_constraint(
            "uq_job_target_aluno_topico_conteudo",
            ["job_id", "aluno_id", "topico_id", "conteudo_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("personalizacao_job_targets") as batch_op:
        batch_op.drop_constraint("uq_job_target_aluno_topico_conteudo", type_="unique")
        batch_op.create_unique_constraint(
            "uq_job_target_aluno_topico",
            ["job_id", "aluno_id", "topico_id"],
        )
