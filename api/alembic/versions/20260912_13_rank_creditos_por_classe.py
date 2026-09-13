"""Include professor-granted class credits in ranking totals."""

import sqlalchemy as sa

from alembic import op

revision = "20260912_13"
down_revision = "20260912_12"
branch_labels = None
depends_on = None


VIEW_RANK = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH referencias_normalizadas AS (
         SELECT e.aluno_id,
            e.classe_id AS classe_id_gravada,
            e.tipo,
            COALESCE(e.valor, 0::numeric) AS valor,
            TRIM(BOTH FROM COALESCE(e.referencia, ''::text)) AS referencia_bruta,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM e.referencia), ''::text) IS NULL THEN NULL::bigint
                    WHEN TRIM(BOTH FROM e.referencia) ~ '^\\d+$'::text
                      THEN TRIM(BOTH FROM e.referencia)::bigint
                    WHEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2) ~ '^\\d+$'::text
                      THEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2)::bigint
                    ELSE NULL::bigint
                END AS referencia_id
           FROM public.eventos_aluno e
        ), eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) AS classe_id,
            sum(e.valor) AS pontuacao
           FROM referencias_normalizadas e
             LEFT JOIN public.topicos t
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'topico') AND t.id = e.referencia_id
             LEFT JOIN public.conteudos c
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'conteudo') AND c.id = e.referencia_id
             LEFT JOIN public.topicos t_c ON t_c.id = c.topico_id
             LEFT JOIN public.atividades atv
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'atividade') AND atv.id = e.referencia_id
             LEFT JOIN public.topicos t_a ON t_a.id = atv.topico_id
             LEFT JOIN public.classe cl
               ON starts_with(lower(e.referencia_bruta), 'classe:') AND cl.id = e.referencia_id
          WHERE COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) IS NOT NULL
          GROUP BY e.aluno_id, COALESCE(e.classe_id_gravada, t.classe_id, t_c.classe_id, t_a.classe_id, cl.id)
        ), base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epc.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
                    ELSE 0::numeric
                END AS pontuacao
           FROM public.ranks r
             JOIN public.rank_tipo rt ON rt.id = r.tipo_id
             JOIN public.classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_classe epc
               ON epc.classe_id = r.classe_id AND epc.aluno_id = ca.aluno_id
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric) * 100::numeric, 2) AS __PROGRESS_COLUMN__,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN public.alunos a ON a.id = o.aluno_id;
"""


def upgrade() -> None:
    bind = op.get_bind()
    progress_column = bind.execute(
        sa.text(
            """
            SELECT CASE
                     WHEN EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'vw_rank_posicoes_por_classe_todas'
                          AND column_name = 'percentual_do_lider'
                     ) THEN 'percentual_do_lider'
                     ELSE 'progresso'
                   END
            """
        )
    ).scalar_one()
    op.execute(VIEW_RANK.replace("__PROGRESS_COLUMN__", f'"{progress_column}"'))


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter créditos de turma no ranking")
