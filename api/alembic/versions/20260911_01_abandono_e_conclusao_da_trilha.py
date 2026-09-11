"""abandono e conclusao da turma saem da trilha, nao de contagem de eventos

Revision ID: 20260911_01
Revises: 20260910_13

## O que estava errado

`vw_metricas_engajamento_aluno_classe` calculava as duas taxas dividindo
CONTAGEM DE EVENTOS de telemetria:

    topicos_iniciados  = count(*) FILTER (WHERE event_name = 'topic_open')
    topicos_concluidos = count(*) FILTER (WHERE event_name = 'topic_complete')

    taxa_conclusao_topicos_pct = concluidos / iniciados * 100
    taxa_abandono_pct          = (iniciados - concluidos) / iniciados * 100

`topic_open` e um evento por ABERTURA, nao por topico. Cada revisita infla o
denominador, entao a taxa de conclusao desaba para perto de zero e a de
abandono sobe para perto de 100 -- e quanto mais o aluno estuda, pior fica o
numero que o professor ve.

Medido em producao, aluno b49f2e21 na classe 32:

    eventos topic_open .............. 106
    eventos topic_complete .......... 1
    taxa_conclusao_topicos_pct ...... 0.94
    taxa_abandono_pct ............... 99.06

    realidade em topico_aluno ....... 4 topicos, 3 concluidos = 75.00

O painel dizia que o aluno ABANDONOU 99% de uma trilha que ele concluiu em
99.06% (percentual ponderado) e 75% (topicos fechados). As duas taxas somam
100 entre si, entao eram coerentes uma com a outra e erradas juntas -- foi
por isso que o defeito passou: nada dentro da view o contradizia.

## Por que a fonte passa a ser `topico_aluno`

Contar topicos DISTINTOS da telemetria nao resolveria: o payload de
`telemetria_eventos_app` nao carrega `topico_id` (conferido -- `count(DISTINCT
payload->>'topico_id')` devolve 0 para os 106 eventos). Nao ha como derivar
"quantos topicos distintos foram abertos" desse dado.

E `topico_aluno` ja e a autoridade de progresso: o percentual sai de
`trailup_recalcular_topico_aluno` e nenhum cliente escreve a coluna (ver
20260826_18 e o CLAUDE.md). Usa-la aqui alinha o painel do professor com a
trilha do aluno, com o rank e com as metricas do perfil -- as tres que hoje
concordam entre si.

Semantica preservada: `topico_aluno` tem linha para o topico que o aluno
COMECOU, entao "iniciados" continua sendo iniciados, e abandono continua
sendo "comecou e nao fechou".

## Forma da mudanca

Duas subconsultas correlacionadas, no lugar das duas expressoes. Nao toco na
CTE de eventos nem em nenhuma outra coluna: `CREATE OR REPLACE VIEW` exige a
mesma lista de colunas, na mesma ordem e tipo, e mexer na CTE arriscaria as
outras metricas que dependem dela.

`security_invoker = on` e reafirmado no CREATE OR REPLACE -- toda view nasce
e permanece assim (CLAUDE.md), e a view ja estava correta nesse ponto.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_01"
down_revision = "20260910_13"
branch_labels = None
depends_on = None


# Expressoes exatas como `pg_get_viewdef(..., true)` as imprime.
_ANCORA_ABANDONO = (
    "COALESCE((COALESCE(te.topicos_iniciados, 0::bigint)"
    " - COALESCE(te.topicos_concluidos, 0::bigint))::numeric"
    " / NULLIF(COALESCE(te.topicos_iniciados, 0::bigint), 0)::numeric"
    " * 100::numeric, 0::numeric) AS taxa_abandono_pct"
)
_ANCORA_CONCLUSAO = (
    "COALESCE(COALESCE(te.topicos_concluidos, 0::bigint)::numeric"
    " / NULLIF(COALESCE(te.topicos_iniciados, 0::bigint), 0)::numeric"
    " * 100::numeric, 0::numeric) AS taxa_conclusao_topicos_pct"
)

# `sb.aluno_id` e `sb.classe_id` estao no GROUP BY da view, entao servem de
# correlacao aqui.
_TROCA_ABANDONO = """COALESCE((
      SELECT (count(*) - count(*) FILTER (WHERE ta.status::text = 'concluido'))::numeric
             / NULLIF(count(*), 0)::numeric * 100::numeric
        FROM topico_aluno ta
        JOIN topicos t_ab ON t_ab.id = ta.topico_id
       WHERE ta.aluno_id = sb.aluno_id
         AND t_ab.classe_id = sb.classe_id
    ), 0::numeric) AS taxa_abandono_pct"""

_TROCA_CONCLUSAO = """COALESCE((
      SELECT count(*) FILTER (WHERE ta.status::text = 'concluido')::numeric
             / NULLIF(count(*), 0)::numeric * 100::numeric
        FROM topico_aluno ta
        JOIN topicos t_cc ON t_cc.id = ta.topico_id
       WHERE ta.aluno_id = sb.aluno_id
         AND t_cc.classe_id = sb.classe_id
    ), 0::numeric) AS taxa_conclusao_topicos_pct"""


def _troca(ancora: str, troca: str, sentinela: str) -> str:
    """Substitui UMA expressao na definicao viva da view.

    `sentinela` e a marca do estado DEPOIS da troca -- presente, nao ha o que
    fazer. Ela e parametro, e nao uma string fixa, porque o downgrade usa a
    mesma funcao com as pontas invertidas: uma sentinela fixa faria o
    downgrade sair sem reverter nada.
    """
    return f"""
        DO $sub$
        DECLARE
          v_def TEXT;
          v_novo TEXT;
          v_ocorrencias INT;
          v_ancora TEXT := $a${ancora}$a$;
          v_troca TEXT := $t${troca}$t$;
        BEGIN
          SELECT pg_get_viewdef(
                   to_regclass('public.vw_metricas_engajamento_aluno_classe'), true
                 )
            INTO v_def;
          IF v_def IS NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'vw_metricas_engajamento_aluno_classe nao encontrada';
          END IF;

          IF position($s${sentinela}$s$ IN v_def) > 0 THEN
            RAISE NOTICE 'expressao ja esta no estado desejado';
            RETURN;
          END IF;

          v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, '')))
                           / length(v_ancora);
          IF v_ocorrencias <> 1 THEN
            RAISE EXCEPTION USING MESSAGE =
              'esperava 1 ocorrencia da expressao, achei ' || v_ocorrencias::text;
          END IF;

          v_novo := replace(v_def, v_ancora, v_troca);
          EXECUTE 'CREATE OR REPLACE VIEW public.vw_metricas_engajamento_aluno_classe'
                  || ' WITH (security_invoker = on) AS ' || v_novo;
        END
        $sub$;
        """


def upgrade() -> None:
    # Uma substituicao por vez: a segunda le a definicao ja atualizada pela
    # primeira, entao as ancoras nao competem.
    op.execute(_troca(_ANCORA_CONCLUSAO, _TROCA_CONCLUSAO, "t_cc.classe_id"))
    op.execute(_troca(_ANCORA_ABANDONO, _TROCA_ABANDONO, "t_ab.classe_id"))

    op.execute(
        """
        DO $confere$
        DECLARE
          v_def TEXT;
          v_fora INT;
        BEGIN
          v_def := pg_get_viewdef(
            to_regclass('public.vw_metricas_engajamento_aluno_classe'), true
          );
          IF position('t_ab.classe_id' IN v_def) = 0
             OR position('t_cc.classe_id' IN v_def) = 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a view nao passou a derivar as duas taxas de topico_aluno';
          END IF;

          -- As duas taxas tem de somar 100 e bater com a trilha.
          SELECT count(*)
            INTO v_fora
            FROM public.vw_metricas_engajamento_aluno_classe v
           WHERE abs(
                   COALESCE(v.taxa_conclusao_topicos_pct, 0)
                   - COALESCE((
                       SELECT count(*) FILTER (WHERE ta.status::text = 'concluido')::numeric
                              / NULLIF(count(*), 0)::numeric * 100::numeric
                         FROM public.topico_aluno ta
                         JOIN public.topicos t ON t.id = ta.topico_id
                        WHERE ta.aluno_id = v.aluno_id AND t.classe_id = v.classe_id
                     ), 0)
                 ) > 0.01;
          IF v_fora <> 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'taxa de conclusao ainda divergente da trilha em '
              || v_fora::text || ' linha(s)';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: abandono e conclusao da turma derivados de topico_aluno';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # Sentinela invertida: a marca do estado ANTERIOR e o que diz "ja voltou".
    op.execute(_troca(_TROCA_CONCLUSAO, _ANCORA_CONCLUSAO, "te.topicos_concluidos)::numeric"))
    op.execute(_troca(_TROCA_ABANDONO, _ANCORA_ABANDONO, "te.topicos_iniciados, 0::bigint)"))
