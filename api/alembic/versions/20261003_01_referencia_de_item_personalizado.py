"""referencia `item:<topico>:<chave>` para o acerto em atividade personalizada

Issue #186. A atividade do professor tem linha em `atividades`, entao o evento
referencia `atividade:<id>` e a dedup do gatilho -- que zera o valor quando ja'
existe `(aluno_id, tipo, referencia)` -- funciona: acertar a atividade 37 duas
vezes paga uma.

A atividade PERSONALIZADA e' sintetizada de JSONB e nao tem linha em
`atividades`. A referencia caia em `topico:<id>`, e o tipo virava
`topico_atividade_acertada` -- que nao esta' em `fn_evento_de_conclusao`. Logo,
sem dedup nenhuma no servidor: a unica barreira era o estado local da tela, e
barreira de cliente nao e' barreira.

POR QUE NAO BASTAVA ADICIONAR O TIPO NA LISTA. Com a referencia no topico, so' o
PRIMEIRO acerto do topico inteiro pagaria, e o aluno que acerta cinco atividades
personalizadas receberia por uma. Seria trocar um defeito por outro, pior de
enxergar.

A SOLUCAO, que e' a opcao 2 da issue: referencia nova `item:<topico_id>:<chave>`.
Ela carrega as duas coisas que faltavam ao mesmo tempo:

- CLASSE, pelo `topico_id` no segundo segmento -- evento sem classe e' zerado
  pelo gatilho, entao resolver a classe e' pre-requisito para pagar;
- GRANULARIDADE, pela referencia completa: dedup por item, que e' a unidade
  certa. Cinco atividades distintas pagam cinco; a mesma duas vezes paga uma.

A chave pode conter ':' e letras, por isso o id do topico vem no SEGUNDO
segmento e nao no fim -- mesma construcao que `classe:<id>:<data>` ja' usava,
porque `fn_eventos_aluno_referencia_id` tira digitos do FIM e devolveria a chave,
nao o topico.

Nao ha' dado a migrar: nenhum evento `topico_atividade_*` foi gravado ate hoje.

Revision ID: 20261003_01
Revises: 20261002_03
Create Date: 2026-10-03
"""

from alembic import op

revision = "20261003_01"
down_revision = "20261002_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) O resolvedor aprende o prefixo `item:`.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id(
          p_tipo text, p_referencia text
        )
        RETURNS bigint
        LANGUAGE sql
        STABLE
        SET search_path TO 'public', 'pg_temp'
        AS $function$
          WITH ref AS (
            SELECT public.fn_eventos_aluno_referencia_id(p_referencia) AS ref_id,
                   TRIM(BOTH FROM COALESCE(p_referencia, ''::text))    AS bruta
          ), alvo AS (
            SELECT ref.ref_id,
                   ref.bruta,
                   COALESCE(
                     CASE WHEN position(':' in ref.bruta) > 0 THEN
                       CASE lower(split_part(ref.bruta, ':', 1))
                         WHEN 'topico' THEN 'topico'
                         WHEN 'topic' THEN 'topico'
                         WHEN 'conteudo' THEN 'conteudo'
                         WHEN 'content' THEN 'conteudo'
                         WHEN 'atividade' THEN 'atividade'
                         WHEN 'activity' THEN 'atividade'
                         WHEN 'classe' THEN 'classe'
                         WHEN 'class' THEN 'classe'
                         WHEN 'conquista' THEN 'conquista'
                         -- `item:<topico_id>:<chave>` -- atividade personalizada,
                         -- que nao tem linha em `atividades`. Resolve a classe
                         -- pelo topico do segundo segmento.
                         WHEN 'item' THEN 'item'
                         ELSE NULL::text
                       END
                     END,
                     CASE
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'topico') THEN 'topico'
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'conteudo') THEN 'conteudo'
                       WHEN starts_with(lower(COALESCE(p_tipo, ''::text)), 'atividade') THEN 'atividade'
                       ELSE NULL::text
                     END
                   ) AS entidade
              FROM ref
          ), com_classe AS (
            -- `classe:<id>:<data>` e `item:<topico>:<chave>`: o id e' o SEGUNDO
            -- segmento, por construcao. Tirar os digitos do fim (que e' o que
            -- `fn_eventos_aluno_referencia_id` faz) devolveria a data ou a
            -- chave, e classe nula tira o evento do rank.
            SELECT alvo.*,
                   CASE
                     WHEN alvo.entidade IN ('classe', 'item') THEN
                       NULLIF(regexp_replace(split_part(alvo.bruta, ':', 2), '[^0-9]', '', 'g'), '')::bigint
                     ELSE alvo.ref_id
                   END AS id_alvo
              FROM alvo
          )
          SELECT COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, t_i.classe_id, cl.id)
          FROM com_classe
          LEFT JOIN public.topicos t    ON com_classe.entidade = 'topico'    AND t.id = com_classe.id_alvo
          LEFT JOIN public.conteudos c  ON com_classe.entidade = 'conteudo'  AND c.id = com_classe.id_alvo
          LEFT JOIN public.topicos t_c  ON t_c.id = c.topico_id
          LEFT JOIN public.atividades a ON com_classe.entidade = 'atividade' AND a.id = com_classe.id_alvo
          LEFT JOIN public.topicos t_a  ON t_a.id = a.topico_id
          LEFT JOIN public.topicos t_i  ON com_classe.entidade = 'item'      AND t_i.id = com_classe.id_alvo
          LEFT JOIN public.classe cl    ON com_classe.entidade = 'classe'    AND cl.id = com_classe.id_alvo;
        $function$
        """
    )

    # 2) O tipo do caminho personalizado entra na lista que nao paga duas vezes.
    #    Agora faz sentido: a referencia e' por item, nao por topico.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_evento_de_conclusao(p_tipo text)
        RETURNS boolean
        LANGUAGE sql
        IMMUTABLE
        SET search_path TO 'public', 'pg_temp'
        AS $function$
          SELECT COALESCE(p_tipo, '') IN (
            'conteudo_concluido',
            'atividade_concluida',
            'atividade_acertada',
            -- Caminho personalizado. So' entra junto com a referencia `item:`,
            -- senao a dedup seria por topico e quatro acertos pagariam um.
            'topico_atividade_concluida',
            'topico_atividade_acertada'
          );
        $function$
        """
    )


def downgrade() -> None:
    raise RuntimeError(
        "downgrade devolveria o acerto personalizado a pagar N vezes (issue #186); "
        "reverta a mao se for mesmo necessario"
    )
