"""intervencoes vira a tabela de insights da turma (aba Insights do console)

A aba Insights do dashboard (docs/frontend/redesign-fase-2/01-analise-dashboard.md,
Fase 8) mostra sinteses geradas pela IA sobre uma turma: sugestoes que o
professor aceita ou ignora e observacoes que so informam. `intervencoes`
(`20260829_03`) ja era "intervencao sugerida pela IA", com `status`
pending/applied/dismissed — mas so por aluno, sem turma e sem texto para
mostrar. Nenhum codigo grava nela ainda (0 linhas no banco), entao da para
estender sem migrar dado:

- `classe_id`, `escopo` (turma|aluno), `natureza` (sugestao|observacao),
  `texto`, `base` (o dado que sustenta o texto) e `geracao_id` (agrupa o
  lote gerado de uma vez — o console mostra o lote mais recente);
- `motivo_descarte` em coluna propria, nao dentro de `contexto`: assim o
  GRANT por coluna deixa o professor mexer so em status/motivo/resolved_at,
  sem poder reescrever o que a IA registrou;
- `aluno_id` passa a ser opcional (insight de turma nao tem aluno).

RLS: antes o aluno lia as proprias intervencoes. Agora e material do
professor — o aluno nao le. O professor le e atualiza so as das classes dele
(`app_classes_do_professor()`); quem insere e a API, fora do RLS.

Revision ID: 20260929_01
Revises: 20260927_02
Create Date: 2026-09-29

Nasceu irma da "20260923_01" e da "20260930_01", as tres saindo da
"20260922_06". A cadeia linear do espelho coloca o trecho do Geisbelly
(23 -> 27) antes deste: quem ja esta em "20260927_02" aplica daqui para
a frente, sem reexecutar o que ja rodou.
"""

from alembic import op

revision = "20260929_01"
down_revision = "20260927_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.intervencoes
          ADD COLUMN IF NOT EXISTS classe_id       bigint NULL,
          ADD COLUMN IF NOT EXISTS escopo          text   NOT NULL DEFAULT 'aluno',
          ADD COLUMN IF NOT EXISTS natureza        text   NOT NULL DEFAULT 'sugestao',
          ADD COLUMN IF NOT EXISTS texto           text   NULL,
          ADD COLUMN IF NOT EXISTS base            text   NULL,
          ADD COLUMN IF NOT EXISTS motivo_descarte text   NULL,
          ADD COLUMN IF NOT EXISTS geracao_id      uuid   NULL
        """
    )
    op.execute("ALTER TABLE public.intervencoes ALTER COLUMN aluno_id DROP NOT NULL")

    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_escopo_chk")
    op.execute(
        "ALTER TABLE public.intervencoes ADD CONSTRAINT intervencoes_escopo_chk "
        "CHECK (escopo IN ('turma', 'aluno'))"
    )
    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_natureza_chk")
    op.execute(
        "ALTER TABLE public.intervencoes ADD CONSTRAINT intervencoes_natureza_chk "
        "CHECK (natureza IN ('sugestao', 'observacao'))"
    )
    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_motivo_descarte_chk")
    op.execute(
        "ALTER TABLE public.intervencoes ADD CONSTRAINT intervencoes_motivo_descarte_chk "
        "CHECK (motivo_descarte IS NULL OR motivo_descarte IN ('ja_resolvido', 'nao_se_aplica', 'revisar_depois'))"
    )
    # Escopo aluno exige aluno; escopo turma exige turma (mesma regra de rag_chunks).
    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_escopo_alvo_chk")
    op.execute(
        "ALTER TABLE public.intervencoes ADD CONSTRAINT intervencoes_escopo_alvo_chk "
        "CHECK ((escopo <> 'aluno' OR aluno_id IS NOT NULL) AND (escopo <> 'turma' OR classe_id IS NOT NULL))"
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_intervencoes_classe_created "
        "ON public.intervencoes (classe_id, created_at DESC)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_intervencoes_geracao_id ON public.intervencoes (geracao_id)")

    # RLS: o aluno deixa de ler; o professor le e atualiza as das suas classes.
    op.execute("ALTER TABLE public.intervencoes ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS intervencoes_sel ON public.intervencoes")
    op.execute("DROP POLICY IF EXISTS intervencoes_professor_sel ON public.intervencoes")
    op.execute(
        """
        CREATE POLICY intervencoes_professor_sel ON public.intervencoes
          FOR SELECT TO authenticated
          USING (classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )
    op.execute("DROP POLICY IF EXISTS intervencoes_professor_upd ON public.intervencoes")
    op.execute(
        """
        CREATE POLICY intervencoes_professor_upd ON public.intervencoes
          FOR UPDATE TO authenticated
          USING (classe_id IN (SELECT public.app_classes_do_professor()))
          WITH CHECK (
            classe_id IN (SELECT public.app_classes_do_professor())
            AND status IN ('applied', 'dismissed')
          )
        """
    )
    # A policy decide QUAIS linhas; o GRANT por coluna decide QUAIS campos.
    op.execute("REVOKE UPDATE ON public.intervencoes FROM anon, authenticated")
    op.execute("GRANT SELECT ON public.intervencoes TO authenticated")
    op.execute("GRANT UPDATE (status, motivo_descarte, resolved_at) ON public.intervencoes TO authenticated")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS intervencoes_professor_upd ON public.intervencoes")
    op.execute("DROP POLICY IF EXISTS intervencoes_professor_sel ON public.intervencoes")
    op.execute("REVOKE UPDATE (status, motivo_descarte, resolved_at) ON public.intervencoes FROM authenticated")
    op.execute("GRANT UPDATE ON public.intervencoes TO anon, authenticated")

    # Insight de turma nao tem aluno e nao cabe no esquema antigo.
    op.execute("DELETE FROM public.intervencoes WHERE aluno_id IS NULL")
    op.execute(
        """
        CREATE POLICY intervencoes_sel ON public.intervencoes
          FOR SELECT TO authenticated
          USING (
            aluno_id = auth.uid()
            OR aluno_id IN (SELECT public.app_alunos_do_professor())
          )
        """
    )

    op.execute("DROP INDEX IF EXISTS public.idx_intervencoes_geracao_id")
    op.execute("DROP INDEX IF EXISTS public.idx_intervencoes_classe_created")
    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_escopo_alvo_chk")
    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_motivo_descarte_chk")
    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_natureza_chk")
    op.execute("ALTER TABLE public.intervencoes DROP CONSTRAINT IF EXISTS intervencoes_escopo_chk")
    op.execute("ALTER TABLE public.intervencoes ALTER COLUMN aluno_id SET NOT NULL")
    op.execute(
        """
        ALTER TABLE public.intervencoes
          DROP COLUMN IF EXISTS geracao_id,
          DROP COLUMN IF EXISTS motivo_descarte,
          DROP COLUMN IF EXISTS base,
          DROP COLUMN IF EXISTS texto,
          DROP COLUMN IF EXISTS natureza,
          DROP COLUMN IF EXISTS escopo,
          DROP COLUMN IF EXISTS classe_id
        """
    )
