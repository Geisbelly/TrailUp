"""recalcula tempo e progresso fossilizados nas tabelas derivadas

Revision ID: 20260910_12
Revises: 20260910_11

## O que estava errado

`tempo_gasto_min` em `topico_aluno`, `conteudo_aluno` e `atividade_aluno` e
derivado da telemetria por gatilho, e nenhum cliente escreve a coluna. O
gatilho e `trg_telemetria_tempo_gasto`, AFTER INSERT em
`telemetria_time_metric_entries`, e ele RECALCULA o total -- nao soma
incremental:

    SET tempo_gasto_min = public.trailup_tempo_telemetria_min(
          ta.aluno_id, 'topic', ta.topico_id, NULL, NULL)

Ou seja: toda linha tocada por um INSERT de telemetria fica correta. O que
sobra errado e linha FOSSIL -- valor gravado por codigo que nao existe mais,
ou telemetria que chegou antes do gatilho existir, e que nunca mais foi
recalculada porque nenhum INSERT novo tocou aquela entidade.

Medido antes desta migracao:

    tabela            linhas  fora  soma gravada  soma telemetria
    topico_aluno           9     3          0.66             2.37
    conteudo_aluno         9     2          2.35             2.37
    atividade_aluno       68     8          0.59             0.05

`topico_aluno` subcontava 3.6x, e e justamente ele que
`trailup_recalcular_classe_aluno` soma para o `tempoGastoMin` que o rank
"Tempo de Estudo" e as metricas do perfil leem -- o tempo do aluno aparecia
como 0.66 min em vez de 2.37. `atividade_aluno` ia para o outro lado,
supercontando 12x.

O caso mais claro de fossil: topico 130 com 0.03 min gravado e ZERO
telemetria. Nao ha telemetria que produza aquele valor; ele sobrou de um
gravador que a regra de fronteira ja removeu.

## O que esta migracao faz

Backfill, sem tocar em funcao nenhuma -- o gatilho ja esta correto.

O TEMPO dos tres niveis recebe a MESMA expressao que o gatilho usa, por
escopo. `trailup_recalcular_topico_aluno` nao serve para isso: ela se abstem
de `tempo_gasto_min` de proposito, alegando no corpo que a coluna seria
"contador incremental do app". A justificativa envelheceu -- hoje a coluna e
derivada pelo gatilho e nenhum cliente a escreve --, mas abster-se nao
corrompe nada, entao a funcao fica como esta. A primeira versao desta
migracao confiou nela e o CONFERE pegou: "ainda divergente apos o backfill
-- topico: 3".

O PROGRESSO, sim, sai das funcoes existentes:
`trailup_recalcular_topico_aluno` para o percentual do topico e
`trailup_recalcular_classe_aluno` para os dois agregados da classe -- assim
nao ha uma terceira copia dessa conta neste arquivo.

A ordem importa: conteudo e atividade primeiro, topico depois, classe por
ultimo -- cada nivel le o de baixo.

Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_12"
down_revision = "20260910_11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Conteudo e atividade: mesma expressao do gatilho, por escopo.
    op.execute(
        """
        UPDATE public.conteudo_aluno ca
           SET tempo_gasto_min = COALESCE(public.trailup_tempo_telemetria_min(
                 ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL), 0),
               updated_at = now()
         WHERE abs(
                 COALESCE(ca.tempo_gasto_min, 0)
                 - COALESCE(public.trailup_tempo_telemetria_min(
                     ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL), 0)
               ) > 0.01
        """
    )
    op.execute(
        """
        UPDATE public.atividade_aluno aa
           SET tempo_gasto_min = COALESCE(public.trailup_tempo_telemetria_min(
                 aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id), 0),
               updated_at = now()
         WHERE abs(
                 COALESCE(aa.tempo_gasto_min, 0)
                 - COALESCE(public.trailup_tempo_telemetria_min(
                     aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id), 0)
               ) > 0.01
        """
    )

    # 2. Topico, tempo: a mesma expressao do gatilho.
    #
    # `trailup_recalcular_topico_aluno` NAO serve aqui -- ela se abstem, com
    # este comentario no corpo:
    #
    #   -- Nao toca em tempo_gasto_min: e contador incremental do app, nao
    #   -- valor derivavel destas tabelas.
    #
    # A justificativa envelheceu: hoje a coluna E derivada, pelo gatilho
    # `trg_telemetria_tempo_gasto`, e nenhum cliente a escreve (ver CLAUDE.md).
    # Abster-se nao corrompe nada, entao a funcao fica como esta -- mas o
    # backfill precisa fazer o tempo do topico por conta propria. A primeira
    # versao desta migracao confiou na funcao e o CONFERE pegou: "ainda
    # divergente apos o backfill -- topico: 3".
    op.execute(
        """
        UPDATE public.topico_aluno ta
           SET tempo_gasto_min = COALESCE(public.trailup_tempo_telemetria_min(
                 ta.aluno_id, 'topic', ta.topico_id, NULL, NULL), 0),
               updated_at = now()
         WHERE abs(
                 COALESCE(ta.tempo_gasto_min, 0)
                 - COALESCE(public.trailup_tempo_telemetria_min(
                     ta.aluno_id, 'topic', ta.topico_id, NULL, NULL), 0)
               ) > 0.01
        """
    )

    # 3. Topico, progresso: aqui a funcao existente E a autoridade.
    op.execute(
        """
        DO $topicos$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN
            SELECT DISTINCT ta.aluno_id, ta.topico_id
              FROM public.topico_aluno ta
          LOOP
            PERFORM public.trailup_recalcular_topico_aluno(r.aluno_id, r.topico_id);
          END LOOP;
        END
        $topicos$;
        """
    )

    # 4. Classe: soma dos topicos (tempo) e media deles (percentual).
    op.execute(
        """
        DO $classes$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN
            SELECT DISTINCT ca.aluno_id, ca.classe_id
              FROM public.classe_aluno ca
          LOOP
            PERFORM public.trailup_recalcular_classe_aluno(r.aluno_id, r.classe_id);
          END LOOP;
        END
        $classes$;
        """
    )

    # CONFERE: nenhuma das tres tabelas pode sobrar divergente da telemetria,
    # e o agregado da classe tem de bater com a soma dos topicos.
    op.execute(
        """
        DO $confere$
        DECLARE
          v_topico INT;
          v_conteudo INT;
          v_atividade INT;
          v_classe INT;
        BEGIN
          SELECT count(*) INTO v_topico
            FROM public.topico_aluno ta
           WHERE abs(COALESCE(ta.tempo_gasto_min, 0)
                     - COALESCE(public.trailup_tempo_telemetria_min(
                         ta.aluno_id, 'topic', ta.topico_id, NULL, NULL), 0)) > 0.01;

          SELECT count(*) INTO v_conteudo
            FROM public.conteudo_aluno ca
           WHERE abs(COALESCE(ca.tempo_gasto_min, 0)
                     - COALESCE(public.trailup_tempo_telemetria_min(
                         ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL), 0)) > 0.01;

          SELECT count(*) INTO v_atividade
            FROM public.atividade_aluno aa
           WHERE abs(COALESCE(aa.tempo_gasto_min, 0)
                     - COALESCE(public.trailup_tempo_telemetria_min(
                         aa.aluno_id, 'activity', NULL, NULL, aa.atividade_id), 0)) > 0.01;

          SELECT count(*) INTO v_classe
            FROM public.classe_aluno cl
           WHERE abs(
                   COALESCE(cl."tempoGastoMin", 0)
                   - COALESCE((
                       SELECT sum(ta.tempo_gasto_min)
                         FROM public.topico_aluno ta
                         JOIN public.topicos t ON t.id = ta.topico_id
                        WHERE ta.aluno_id = cl.aluno_id
                          AND t.classe_id = cl.classe_id
                     ), 0)
                 ) > 0.01;

          IF v_topico <> 0 OR v_conteudo <> 0 OR v_atividade <> 0 OR v_classe <> 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ainda divergente apos o backfill -- topico: ' || v_topico::text
              || ', conteudo: ' || v_conteudo::text
              || ', atividade: ' || v_atividade::text
              || ', classe: ' || v_classe::text;
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: tempo derivado bate com a telemetria nos tres niveis,'
            || ' e o agregado da classe bate com a soma dos topicos';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # Sem volta: o valor anterior era justamente o fossil, e nao ha como
    # reconstruir qual gravador morto o produziu. Reverter tambem nao
    # restauraria defeito util -- ele vivia em codigo que nao existe mais, e o
    # gatilho atual reproduz estes mesmos numeros no proximo lote.
    pass
