"""o premio da conquista passa a chegar ao rank, e quem ficou sem recebe

Medido em producao depois da `20260909_01`, aluno de demonstracao:

| bloco                  | gravado | chega ao rank | perdido |
|------------------------|---------|---------------|---------|
| conquista_desbloqueada |     340 |             0 |     340 |
| atividade_revisada     |     172 |            32 |     140 |
| conteudo_concluido     |     150 |            20 |     130 |
| atividade_concluida    |      75 |            60 |      15 |
| atividade_acertada     |      15 |            10 |       5 |
| total                  |     752 |           122 |     630 |

O rank mostra 122 -- exatamente a soma que resolve classe. Esta migracao trata o
primeiro bloco, que e' o maior e e' defeito meu.

**Por que 0 de 12 resolviam.** A conquista e' avaliada num gatilho AFTER em
`eventos_aluno`, e o premio herdava `v_classe_id` do evento que o disparou. Como
a maioria dos eventos nao resolve classe, o premio nascia com
`referencia = NULL`. Pior: o indice `eventos_aluno_creditado_unico` e' sobre
`(aluno_id, tipo, referencia)`, e NULL nunca e' igual a NULL -- o `ON CONFLICT`
nao deduplicava nada.

**A referencia passa a ser a conquista, nunca a classe.** `conquistas.escopo` so'
tem `comum` e `perfil`: conquista nao pertence a classe alguma. Herdar a classe
do evento disparador era, alem de fragil, errado de origem. Agora e'
`conquista:<id>` -- deterministico, e o indice unico volta a funcionar: uma
conquista paga uma vez por aluno, para sempre.

**E a view atribui o premio a todas as classes do aluno.** Se a conquista nao e'
de uma classe, os pontos dela valem em cada rank onde o aluno compete. Dentro de
um mesmo rank todos os alunos sao tratados igual, que e' o que importa para ser
justo; escolher "uma" classe criaria o caso arbitrario de a conquista contar na
turma A e nao na B. A alternativa -- gravar uma linha por classe -- inflaria o
razao: o aluno de tres turmas apareceria com o premio pago tres vezes. Uma
conquista, um pagamento, N atribuicoes.

**Os 140 que faltavam.** Sao 18 conquistas concluidas, 480 devidos e 340 pagos.
A diferenca e' de 6 conquistas concluidas ANTES de 2026-09-09 -- a `20260909_01`
paga so' na transicao para desbloqueado e nao olhou para tras. A mais antiga e'
de 13/04.

O backfill **apaga as 12 linhas sem referencia e repaga as 18 a partir de
`conquistas_aluno`**, que e' a fonte da verdade de quem ganhou o que. As linhas
antigas sao inatribuiveis: quatro conquistas diferentes dividem o mesmo
`pontos_recompensa`, entao o valor sozinho nao diz a qual delas cada linha
pertence. Elas valiam 0 em todo rank, e o que entra no lugar e' um superconjunto
exato -- ninguem perde ponto.

Nao mexe nos outros dois blocos (`atividade_revisada`, `conteudo_concluido`):
aqueles sao id velho de conteudo regerado e linha gravada antes da correcao do
`_sanitize_reference`. Sao deriva de dado, nao defeito de codigo, e pedem
decisao separada.

Revision ID: 20260910_02
Revises: 20260910_01
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_02"
down_revision = "20260910_01"
branch_labels = None
depends_on = None


EVENTO_PREMIO = "conquista_desbloqueada"
TIPOS_CREDITADOS = ("presenca_aula", "participacao_aula", EVENTO_PREMIO)

# O predicado do `ON CONFLICT` tem de repetir o do indice parcial, senao o
# Postgres nao casa o indice e levanta "no unique or exclusion constraint".
PREDICADO_CREDITADO = "tipo IN (" + ", ".join(f"'{t}'" for t in TIPOS_CREDITADOS) + ")"


# Substituicao no corpo, nao recolagem: o gatilho e' gerado a partir do
# dicionario de metricas da `20260909_01`, e recolar uma copia aqui congelaria
# aquela geracao dentro desta migracao. Duas trocas, ambas numa linha so' --
# casar texto que atravessa quebra de linha e' fragil.
GATILHO_REFERENCIA = """
DO $$
DECLARE
  v_src  text;
  v_novo text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'trg_eventos_aluno_after_iud';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'trg_eventos_aluno_after_iud nao encontrada';
  END IF;

  IF position('ELSE ''conquista:'' || v_conquista.id::text END,' in v_src) > 0 THEN
    RETURN;  -- ja aplicado
  END IF;

  v_novo := replace(
    v_src,
    'ELSE ''classe:'' || v_classe_id::text || '':conquista:'' || v_conquista.id::text END,',
    'ELSE ''conquista:'' || v_conquista.id::text END,'
  );

  -- A guarda do CASE deixa de olhar a classe: o que pode faltar e' a conquista.
  v_novo := replace(
    v_novo,
    'CASE WHEN v_classe_id IS NULL THEN NULL',
    'CASE WHEN v_conquista.id IS NULL THEN NULL'
  );

  IF v_novo = v_src THEN
    RAISE EXCEPTION
      'Nao encontrei a referencia do premio em trg_eventos_aluno_after_iud';
  END IF;

  EXECUTE
    'CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud() '
    || 'RETURNS trigger LANGUAGE plpgsql AS $fn$' || v_novo || '$fn$';
END $$;
"""


VIEW_RANK = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
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
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)
          * 100::numeric, 2) AS progresso,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


BACKFILL = f"""
-- Inatribuiveis: quatro conquistas dividem o mesmo `pontos_recompensa`, entao o
-- valor sozinho nao diz a qual delas a linha pertence. Valiam 0 em todo rank e
-- o que entra no lugar e' um superconjunto exato.
DELETE FROM public.eventos_aluno
 WHERE tipo = '{EVENTO_PREMIO}'
   AND referencia IS NULL;

-- `conquistas_aluno` e' a fonte da verdade de quem ganhou o que. `criado_em` e'
-- timestamp SEM tz e `data_conquista` e' COM: a conversao vai explicita, para
-- nao depender do TimeZone da sessao sem que se veja.
INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
SELECT ca.aluno_id,
       '{EVENTO_PREMIO}',
       'conquista:' || c.id::text,
       c.pontos_recompensa,
       (COALESCE(ca.data_conquista, now()))::timestamp
  FROM public.conquistas_aluno ca
  JOIN public.conquistas c ON c.id = ca.conquista_id
 WHERE ca.concluida IS TRUE
   AND COALESCE(c.pontos_recompensa, 0) > 0
ON CONFLICT (aluno_id, tipo, referencia)
  WHERE {PREDICADO_CREDITADO}
  DO NOTHING;
"""


# Falha aqui, na migracao, e nao depois num rank silenciosamente errado.
CONFERE = f"""
DO $$
DECLARE
  v_sem_ref bigint;
  v_devido  numeric;
  v_pago    numeric;
  v_fora    bigint;
BEGIN
  SELECT count(*) INTO v_sem_ref
    FROM public.eventos_aluno
   WHERE tipo = '{EVENTO_PREMIO}' AND referencia IS NULL;

  IF v_sem_ref > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'premio de conquista ainda sem referencia: ' || v_sem_ref::text;
  END IF;

  SELECT count(*) INTO v_fora
    FROM public.eventos_aluno
   WHERE tipo = '{EVENTO_PREMIO}'
     AND NOT starts_with(referencia, 'conquista:');

  IF v_fora > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'premio com referencia fora do formato conquista:<id>: ' || v_fora::text;
  END IF;

  SELECT COALESCE(sum(c.pontos_recompensa), 0) INTO v_devido
    FROM public.conquistas_aluno ca
    JOIN public.conquistas c ON c.id = ca.conquista_id
   WHERE ca.concluida IS TRUE
     AND COALESCE(c.pontos_recompensa, 0) > 0;

  SELECT COALESCE(sum(valor), 0) INTO v_pago
    FROM public.eventos_aluno
   WHERE tipo = '{EVENTO_PREMIO}';

  IF v_pago <> v_devido THEN
    RAISE EXCEPTION USING MESSAGE =
      'premio pago (' || v_pago::text || ') difere do devido ('
      || v_devido::text || ')';
  END IF;

  -- Quem esta matriculado tem de ter o premio atribuido a alguma classe pela
  -- view. Se este numero nao for zero, o join novo nao esta pegando.
  SELECT count(*) INTO v_fora
    FROM public.eventos_aluno e
   WHERE e.tipo = '{EVENTO_PREMIO}'
     AND COALESCE(e.valor, 0) > 0
     AND EXISTS (SELECT 1 FROM public.classe_aluno ca WHERE ca.aluno_id = e.aluno_id)
     AND NOT starts_with(lower(trim(e.referencia)), 'conquista:');

  IF v_fora > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'premio que a view nao consegue atribuir: ' || v_fora::text;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(GATILHO_REFERENCIA)
    op.execute(VIEW_RANK)
    op.execute(BACKFILL)
    op.execute(CONFERE)


def downgrade() -> None:
    # A view volta a ignorar `conquista:<id>`; o gatilho volta a herdar a classe
    # do evento disparador. O backfill nao volta: as 12 linhas sem referencia
    # eram inatribuiveis e nao ha para onde retorna-las.
    op.execute(
        """
        DO $$
        DECLARE
          v_src  text;
          v_novo text;
        BEGIN
          SELECT p.prosrc INTO v_src
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'trg_eventos_aluno_after_iud';

          v_novo := replace(
            v_src,
            'CASE WHEN v_conquista.id IS NULL THEN NULL',
            'CASE WHEN v_classe_id IS NULL THEN NULL'
          );
          v_novo := replace(
            v_novo,
            'ELSE ''conquista:'' || v_conquista.id::text END,',
            'ELSE ''classe:'' || v_classe_id::text || '':conquista:'' || v_conquista.id::text END,'
          );

          EXECUTE
            'CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud() '
            || 'RETURNS trigger LANGUAGE plpgsql AS $fn$' || v_novo || '$fn$';
        END $$;
        """
    )
