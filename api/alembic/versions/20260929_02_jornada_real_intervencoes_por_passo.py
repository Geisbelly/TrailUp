"""Jornada real do aluno: professor le estudo_sessoes e comenta cada passo

Fase 9 do redesign do dashboard (docs/frontend/redesign-fase-2/02-desenho-jornada-real.md).
A jornada e montada no console a partir de `telemetria_eventos_app` (que o
professor ja le); esta migration cobre as duas pecas que faltam:

1. `estudo_sessoes` so tinha `aluno_id = auth.uid()` — nem o professor da
   turma lia. E dela que sai o tempo de cada passo: a distancia entre o
   primeiro e o ultimo evento conta o app parado em segundo plano (20 min
   onde o registro diz 5).

2. `professor_intervencoes_passo`: comentario do professor preso a um passo
   da jornada. `passo_ref` e o id do primeiro evento da visita
   (`evento:<uuid>`), estavel porque a visita so cresce para frente. So
   SELECT e INSERT: comentario registrado e historico, nao se edita. O aluno
   nao le.

Revision ID: 20260929_02
Revises: 20260929_01
Create Date: 2026-09-29
"""

from alembic import op

revision = "20260929_02"
down_revision = "20260929_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS estudo_sessoes_professor_sel ON public.estudo_sessoes")
    op.execute(
        """
        CREATE POLICY estudo_sessoes_professor_sel ON public.estudo_sessoes
          FOR SELECT TO authenticated
          USING (classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.professor_intervencoes_passo (
          id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
          professor_id uuid        NOT NULL DEFAULT auth.uid(),
          aluno_id     uuid        NOT NULL,
          classe_id    bigint      NOT NULL,
          passo_ref    text        NOT NULL,
          topico_id    bigint      NULL,
          texto        text        NOT NULL
            CHECK (char_length(btrim(texto)) BETWEEN 1 AND 2000),
          created_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_professor_intervencoes_passo_aluno "
        "ON public.professor_intervencoes_passo (aluno_id, classe_id, passo_ref)"
    )

    op.execute("ALTER TABLE public.professor_intervencoes_passo ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS professor_intervencoes_passo_sel ON public.professor_intervencoes_passo")
    op.execute(
        """
        CREATE POLICY professor_intervencoes_passo_sel ON public.professor_intervencoes_passo
          FOR SELECT TO authenticated
          USING (classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )
    op.execute("DROP POLICY IF EXISTS professor_intervencoes_passo_ins ON public.professor_intervencoes_passo")
    op.execute(
        """
        CREATE POLICY professor_intervencoes_passo_ins ON public.professor_intervencoes_passo
          FOR INSERT TO authenticated
          WITH CHECK (
            professor_id = auth.uid()
            AND classe_id IN (SELECT public.app_classes_do_professor())
            AND aluno_id IN (SELECT public.app_alunos_do_professor())
          )
        """
    )
    op.execute("REVOKE ALL ON public.professor_intervencoes_passo FROM anon, authenticated")
    op.execute("GRANT SELECT, INSERT ON public.professor_intervencoes_passo TO authenticated")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS professor_intervencoes_passo_ins ON public.professor_intervencoes_passo")
    op.execute("DROP POLICY IF EXISTS professor_intervencoes_passo_sel ON public.professor_intervencoes_passo")
    op.execute("DROP INDEX IF EXISTS public.idx_professor_intervencoes_passo_aluno")
    op.execute("DROP TABLE IF EXISTS public.professor_intervencoes_passo")
    op.execute("DROP POLICY IF EXISTS estudo_sessoes_professor_sel ON public.estudo_sessoes")
