"""RLS: professor le personalizacao_job_targets da propria classe

`personalizacao_job_targets` tem RLS ligado mas **nenhuma policy** — verificado
ao vivo (`pg_policies` vazio para essa tabela). Hoje so o `service_role` da API
consegue ler; nem o professor dono da classe enxerga. Isso trava o console
inteiro atras da API mesmo pra dado que nao tem IA nenhuma no meio (status de
geracao de midia), violando a regra de fronteira do CLAUDE.md.

A tabela nao tem `classe_id` proprio (so `job_id`), entao a posse vem de
`personalizacao_jobs.classe_id` via join — mesmo padrao de
`personalizacao_jobs_professor_sel` (`20260827_03`), so que com um passo a
mais.

Revision ID: 20260922_01
Revises: 20260921_01
Create Date: 2026-09-22
"""

from alembic import op

revision = "20260922_01"
down_revision = "20260921_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("GRANT SELECT ON public.personalizacao_job_targets TO authenticated")
    op.execute("DROP POLICY IF EXISTS personalizacao_job_targets_professor_sel ON public.personalizacao_job_targets")
    op.execute(
        """
        CREATE POLICY personalizacao_job_targets_professor_sel ON public.personalizacao_job_targets
          FOR SELECT TO authenticated
          USING (
            job_id IN (
              SELECT j.id FROM public.personalizacao_jobs j
               WHERE j.classe_id IN (SELECT public.app_classes_do_professor())
            )
          )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS personalizacao_job_targets_professor_sel ON public.personalizacao_job_targets")
