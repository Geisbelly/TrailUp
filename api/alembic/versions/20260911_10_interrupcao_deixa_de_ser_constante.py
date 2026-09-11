"""interrupcao de sessao deixa de marcar 106 de 106

Revision ID: 20260911_10
Revises: 20260911_09

`vw_metricas_comportamento_aluno_classe` conta:

    count(*) FILTER (
      WHERE explicit_interrupt
         OR topicos_abertos > topicos_concluidos
    ) AS interrupcoes_sessao

Medido nesta base:

    sessoes                                106
    com o sinal explicito                  105
    pela heuristica                        105
    como a view conta (as duas)            106
    so a heuristica acrescenta               1
    so o explicito pega                      1

**106 de 106.** Nao e uma metrica, e uma constante -- e uma constante que diz
ao professor que todo aluno se interrompe em toda sessao.

## A heuristica e a MESMA premissa que a 20260911_01 derrubou

`topic_open` e um evento por ABERTURA, e `topic_complete` acontece uma vez na
vida do topico. Comparar as duas contagens dentro de uma sessao compara coisas
de escalas diferentes: qualquer sessao em que o aluno abre um topico e nao o
termina NAQUELA sessao entra como interrupcao -- inclusive quando ele termina na
sessao seguinte, e inclusive quando so' passou os olhos.

Foi assim que abandono e conclusao da turma deram 99,06 e 0,94 por cento onde a
trilha tinha 75. A view de comportamento ficou com a premissa, e ninguem notou
porque `interrupcoes_sessao` so' e' consumida num teste de "maior que zero".

## Mas a heuristica nao era a causa

Ela acrescenta exatamente UMA sessao sobre o sinal explicito. A causa e' o sinal
explicito disparar em toda saida: `endStudySession` emite `session_interrupt`
para qualquer motivo que nao seja `session_end`, e o unico chamador passava
sempre `"screen_blur"` -- ou seja, sair da tela do topico, que e' a forma normal
de terminar de estudar, contava como interrupcao.

O lado do app foi corrigido junto (`motivoDeSaidaDaSessao`): sair de um topico
CONCLUIDO passa `session_end`. Sem essa correcao, remover a heuristica aqui
levaria a metrica de 106 para 105, e ela continuaria constante.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_10"
down_revision = "20260911_09"
branch_labels = None
depends_on = None

_ANCORA = (
    "count(*) FILTER (WHERE session_interrupts.explicit_interrupt "
    "OR session_interrupts.topicos_abertos > session_interrupts.topicos_concluidos) "
    "AS interrupcoes_sessao"
)

_SUBSTITUTO = (
    "count(*) FILTER (WHERE session_interrupts.explicit_interrupt) "
    "AS interrupcoes_sessao"
)


def _sql_literal(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def upgrade() -> None:
    # Substituicao sobre o `pg_get_viewdef`, e nao um CREATE OR REPLACE com o
    # corpo inteiro: a view tem varias CTEs, e copiar tudo para ca criaria uma
    # segunda copia que envelheceria na primeira mudanca alheia.
    op.execute(
        """
        DO $troca$
        DECLARE
          v_def text;
          v_ocorrencias int;
        BEGIN
          v_def := pg_get_viewdef('public.vw_metricas_comportamento_aluno_classe'::regclass, true);

          IF position(%(substituto)s IN v_def) > 0 THEN
            RAISE NOTICE USING MESSAGE = 'a heuristica ja saiu da view, nada a fazer';
            RETURN;
          END IF;

          v_ocorrencias := (length(v_def) - length(replace(v_def, %(ancora)s, '')))
                           / length(%(ancora)s);

          IF v_ocorrencias <> 1 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a ancora da heuristica aparece ' || v_ocorrencias::text
              || ' vezes na view -- esperado exatamente 1';
          END IF;

          EXECUTE 'CREATE OR REPLACE VIEW public.vw_metricas_comportamento_aluno_classe AS '
                  || replace(v_def, %(ancora)s, %(substituto)s);

          -- **`CREATE OR REPLACE VIEW` NAO preserva `security_invoker`.**
          -- Observado nesta base: depois do replace, a view era a unica das
          -- nove `vw_metricas_*` sem a opcao. Sem ela a view roda com os
          -- privilegios do dono e as policies das tabelas base nao se aplicam
          -- -- o bypass que a 20260826_10 fechou. Repor faz parte da troca, nao
          -- e' zelo.
          ALTER VIEW public.vw_metricas_comportamento_aluno_classe
            SET (security_invoker = on);
        END
        $troca$;
        """
        % {
            "ancora": _sql_literal(_ANCORA),
            "substituto": _sql_literal(_SUBSTITUTO),
        }
    )

    op.execute(
        """
        DO $confere$
        DECLARE
          v_def text;
        BEGIN
          v_def := pg_get_viewdef('public.vw_metricas_comportamento_aluno_classe'::regclass, true);

          IF position('topicos_abertos > ' IN v_def) > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a heuristica de topicos abertos continua na contagem de interrupcao';
          END IF;

          IF position('explicit_interrupt' IN v_def) = 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a view perdeu o sinal explicito de interrupcao';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'vw_metricas_comportamento_aluno_classe'
               AND column_name = 'interrupcoes_sessao'
          ) THEN
            RAISE EXCEPTION USING MESSAGE =
              'a coluna interrupcoes_sessao sumiu da view';
          END IF;

          -- A opcao some no CREATE OR REPLACE, e sem esta conferencia o
          -- bypass voltaria calado: a view continua devolvendo numero, so' que
          -- sem respeitar a RLS de quem consulta.
          IF NOT EXISTS (
            SELECT 1 FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relname = 'vw_metricas_comportamento_aluno_classe'
               AND 'security_invoker=on' = ANY (c.reloptions)
          ) THEN
            RAISE EXCEPTION USING MESSAGE =
              'a view perdeu security_invoker no CREATE OR REPLACE';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: interrupcao vem so do sinal explicito, e a view segue invoker';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $volta$
        DECLARE
          v_def text;
        BEGIN
          v_def := pg_get_viewdef('public.vw_metricas_comportamento_aluno_classe'::regclass, true);
          IF position(%(ancora)s IN v_def) > 0 THEN
            RETURN;
          END IF;

          EXECUTE 'CREATE OR REPLACE VIEW public.vw_metricas_comportamento_aluno_classe AS '
                  || replace(v_def, %(substituto)s, %(ancora)s);
          ALTER VIEW public.vw_metricas_comportamento_aluno_classe
            SET (security_invoker = on);
        END
        $volta$;
        """
        % {
            "ancora": _sql_literal(_ANCORA),
            "substituto": _sql_literal(_SUBSTITUTO),
        }
    )
