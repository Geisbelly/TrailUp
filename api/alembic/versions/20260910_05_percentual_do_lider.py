"""`progresso` no rank vira `percentual_do_lider`, que e' o que ele sempre foi

A coluna era calculada assim:

    round(pontuacao / max(pontuacao) OVER (PARTITION BY rank_id) * 100, 2)

Isso nao e' progresso: e' a pontuacao do aluno **relativa ao primeiro
colocado**. O lider tem 100 por construcao, sempre, mesmo tendo concluido 10 por
cento da trilha. Chamar de `progresso` convida a por num rank de progresso -- e o
`Rank.ts` ja refaz a mesma conta no caminho de fallback, entao a confusao esta
replicada nos dois lados.

Nenhuma tela consome esse campo hoje (conferi: fora de `models/Rank*`, todo
`.progresso` do app pertence a conquista, relatorio ou metrica do perfil). Ele
nao e' removido porque a informacao e' legitima -- serve para a barra do rank --,
so' passa a se chamar pelo que e'.

**Por que DROP e nao CREATE OR REPLACE.** Renomear coluna nao cabe em
`CREATE OR REPLACE VIEW`, que so' aceita acrescentar no fim. As duas views caem e
voltam, na ordem certa: a cortada depende da `_todas`.

**O detalhe que importa aqui e' privilegio, nao SQL.** `CREATE OR REPLACE`
preserva grants; DROP nao. E o projeto tem default privileges do Supabase que dao
SELECT a `anon`/`authenticated` em objeto novo no `public` -- recriar a `_todas`
sem cuidado publicaria o ranking **sem o corte de 15** e sem o filtro por classe.
Por isso o REVOKE explicito depois do CREATE, e a conferencia no fim que aborta a
migracao se `authenticated` tiver ganhado acesso a ela.

Os grants voltam exatamente como estavam antes:

| view                                | authenticated | service_role |
|-------------------------------------|---------------|--------------|
| vw_rank_posicoes_por_classe         | SELECT        | ALL          |
| vw_rank_posicoes_por_classe_todas   | nenhum        | ALL          |

A `_todas` mantem a ausencia de `security_invoker` de proposito: e' a excecao
documentada no `CLAUDE.md` -- somar eventos de varios alunos e' o que um aluno
nao pode fazer lendo `eventos_aluno` linha a linha, e o filtro fica na saida, na
view cortada.

Revision ID: 20260910_05
Revises: 20260910_04
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_05"
down_revision = "20260910_04"
branch_labels = None
depends_on = None


COLUNA_NOVA = "percentual_do_lider"
COLUNA_ANTIGA = "progresso"


def _corpo_todas(nome_da_coluna: str) -> str:
    return f"""
CREATE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH referencias_normalizadas AS (
         SELECT e.aluno_id,
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
           FROM eventos_aluno e
        ), eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id, ca_conq.classe_id) AS classe_id,
            sum(e.valor) AS pontuacao
           FROM referencias_normalizadas e
             LEFT JOIN topicos t
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'topico') AND t.id = e.referencia_id
             LEFT JOIN conteudos c
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'conteudo') AND c.id = e.referencia_id
             LEFT JOIN topicos t_c ON t_c.id = c.topico_id
             LEFT JOIN atividades atv
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'atividade') AND atv.id = e.referencia_id
             LEFT JOIN topicos t_a ON t_a.id = atv.topico_id
             -- Nao olha o tipo, e sim a FORMA da referencia: `classe:<id>` resolve
             -- direto. Assim um tipo creditado novo nao precisa mexer nesta view.
             LEFT JOIN classe cl
               ON starts_with(lower(e.referencia_bruta), 'classe:') AND cl.id = e.referencia_id
             -- `conquista:<id>` nao aponta para classe alguma, e nao poderia:
             -- `conquistas.escopo` e' `comum` ou `perfil`. O premio vale em toda
             -- classe onde o aluno compete -- este join e' o unico que multiplica
             -- linhas, de proposito, e o `sum` por (aluno, classe) conta o premio
             -- inteiro em cada uma.
             LEFT JOIN classe_aluno ca_conq
               ON starts_with(lower(e.referencia_bruta), 'conquista:')
              AND ca_conq.aluno_id = e.aluno_id
          WHERE COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id, ca_conq.classe_id) IS NOT NULL
          GROUP BY e.aluno_id,
                   (COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id, ca_conq.classe_id))
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
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
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
    -- Nao e' progresso na trilha: e' quanto o aluno tem em relacao ao primeiro
    -- colocado. O lider da 100 por construcao.
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)
          * 100::numeric, 2) AS {nome_da_coluna},
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


def _corpo_cortada(nome_da_coluna: str) -> str:
    return f"""
CREATE VIEW public.vw_rank_posicoes_por_classe AS
 SELECT rank_id,
    classe_id,
    posicao,
    id_aluno,
    nome_aluno,
    pontuacao,
    {nome_da_coluna},
    medalha
   FROM vw_rank_posicoes_por_classe_todas b
  WHERE (classe_id IN ( SELECT app_minhas_classes() AS app_minhas_classes))
    AND (posicao <= app_rank_limite_visivel()
         OR id_aluno = auth.uid()
         OR (classe_id IN ( SELECT app_classes_do_professor() AS app_classes_do_professor)));
"""


# DROP nao preserva grant, e o Supabase tem default privileges que dariam SELECT
# a anon/authenticated em objeto novo no `public`. Sem este bloco, a `_todas`
# nasceria legivel pelo cliente -- ranking inteiro, sem o corte de 15 e sem o
# filtro por classe.
GRANTS = """
REVOKE ALL ON TABLE public.vw_rank_posicoes_por_classe_todas FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.vw_rank_posicoes_por_classe_todas TO service_role;

REVOKE ALL ON TABLE public.vw_rank_posicoes_por_classe FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.vw_rank_posicoes_por_classe TO authenticated;
GRANT ALL ON TABLE public.vw_rank_posicoes_por_classe TO service_role;
"""


CONFERE = f"""
DO $$
DECLARE
  v_vazou   bigint;
  v_coluna  bigint;
BEGIN
  -- A view sem corte nao pode ser legivel pelo cliente.
  SELECT count(*) INTO v_vazou
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name = 'vw_rank_posicoes_por_classe_todas'
     AND g.grantee IN ('anon', 'authenticated');

  IF v_vazou > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'vw_rank_posicoes_por_classe_todas ficou legivel pelo cliente: '
      || v_vazou::text || ' grant(s)';
  END IF;

  -- E a cortada tem de continuar legivel, senao o rank desaparece do app.
  SELECT count(*) INTO v_vazou
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name = 'vw_rank_posicoes_por_classe'
     AND g.grantee = 'authenticated'
     AND g.privilege_type = 'SELECT';

  IF v_vazou = 0 THEN
    RAISE EXCEPTION 'vw_rank_posicoes_por_classe perdeu o SELECT de authenticated';
  END IF;

  -- O nome antigo nao pode sobrar em nenhuma das duas.
  SELECT count(*) INTO v_coluna
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('vw_rank_posicoes_por_classe', 'vw_rank_posicoes_por_classe_todas')
     AND column_name = '{COLUNA_ANTIGA}';

  IF v_coluna > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'coluna {COLUNA_ANTIGA} ainda presente em ' || v_coluna::text || ' view(s)';
  END IF;

  SELECT count(*) INTO v_coluna
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('vw_rank_posicoes_por_classe', 'vw_rank_posicoes_por_classe_todas')
     AND column_name = '{COLUNA_NOVA}';

  IF v_coluna <> 2 THEN
    RAISE EXCEPTION USING MESSAGE =
      'esperava {COLUNA_NOVA} nas duas views, achei ' || v_coluna::text;
  END IF;
END $$;
"""


def _troca(nome_da_coluna: str) -> None:
    # A cortada primeiro: ela depende da `_todas`.
    op.execute("DROP VIEW IF EXISTS public.vw_rank_posicoes_por_classe")
    op.execute("DROP VIEW IF EXISTS public.vw_rank_posicoes_por_classe_todas")
    op.execute(_corpo_todas(nome_da_coluna))
    op.execute(_corpo_cortada(nome_da_coluna))
    op.execute(GRANTS)


def upgrade() -> None:
    _troca(COLUNA_NOVA)
    op.execute(CONFERE)


def downgrade() -> None:
    _troca(COLUNA_ANTIGA)
