"""missao e uma atividade, e o tipo passa a ser lista fechada

Revision ID: 20260911_07
Revises: 20260911_06

Implementa a #150.

## Missao nao ganha tabela

`tipo = 'missao'` em `atividades`. Uma tabela `missoes` propria seria invisivel
para `trailup_recalcular_topico_aluno`, que deriva o percentual do topico de
`conteudo_aluno`, `atividade_aluno` e `personalizacao_item_progresso`: o aluno
cumpriria a missao inteira e veria a barra parada -- exatamente o defeito que a
`20260826_18` existe para corrigir.

Medido nesta base, com o bloco desfeito por excecao: criar a missao semeia a
linha em `atividade_aluno` (gatilho que ja existia) e conclui-la leva o topico
133 de **0% para 8,33%**. Prazo, pontuacao, questoes, avaliacao do professor e
os eventos que alimentam o rank vem de graca.

## O tipo vira lista fechada, e isso NAO era seguro antes

`atividades.tipo` era `text` puro, sem CHECK nenhum. Quem escreve nela e o
console E a geracao personalizada -- e a geracao tirava o valor direto do
payload do modelo:

    tipo = str(atividade.get("tipo") or "quiz").strip() or "quiz"

Entao `multipla_escolha`, `dissertativa` ou qualquer coisa entrava. Nao dava
erro, e e esse o problema: o console decide quais campos mostrar comparando
`tipo` com string literal, entao tipo que nao casa nenhum ramo vira **formulario
vazio, sem aviso**, e a atividade fica ineditavel.

Um CHECK sozinho teria derrubado a geracao. Por isso ele vem DEPOIS da
normalizacao em `app/services/tipos_de_atividade.py`: com ela, a geracao nunca
manda valor fora da lista, e o CHECK protege escrita nova sem quebrar o
pipeline.

As 248 linhas existentes ja estao todas na lista -- `quiz` 94, `true_false` 62,
`fill_blank` 58, `essay` 34 --, entao a constraint valida sem backfill.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_07"
down_revision = "20260911_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A lista vive em tres lugares, e os tres precisam concordar: aqui,
    # `app/services/tipos_de_atividade.py` e
    # `frontend/src/lib/tiposDeAtividade.ts`. Sao runtimes diferentes sem pacote
    # compartilhado -- o mesmo arranjo da cor-assinatura dos perfis BrainHex.
    op.execute(
        """
        DO $check$
        DECLARE
          v_fora text;
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.atividades'::regclass
               AND conname = 'atividades_tipo_conhecido'
          ) THEN
            RAISE NOTICE USING MESSAGE = 'o CHECK de tipo ja existe, nada a fazer';
            RETURN;
          END IF;

          -- Abortar com a LISTA do que esta fora e' mais util que o erro cru da
          -- constraint, que diz apenas que alguma linha falhou.
          SELECT string_agg(DISTINCT tipo, ', ') INTO v_fora
            FROM public.atividades
           WHERE tipo IS NOT NULL
             AND tipo NOT IN ('quiz', 'true_false', 'fill_blank', 'essay', 'missao');

          IF v_fora IS NOT NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'ha atividade com tipo fora da lista: ' || v_fora
              || ' -- normalize antes de fechar o CHECK';
          END IF;

          ALTER TABLE public.atividades
            ADD CONSTRAINT atividades_tipo_conhecido
            CHECK (tipo IS NULL OR tipo IN ('quiz', 'true_false', 'fill_blank', 'essay', 'missao'));
        END
        $check$;
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN public.atividades.tipo IS
          'Formato da atividade, ou `missao` para a tarefa que o professor monta. '
          'Lista fechada pelo CHECK atividades_tipo_conhecido: antes era texto '
          'livre, e a geração escrevia o que o modelo mandasse -- tipo fora da '
          'lista deixa a atividade inditável, com formulário vazio no console.'
        """
    )

    # ------------------------------------------------------------------
    # CONFERE de comportamento: a missao MOVE o progresso do topico.
    # E' o criterio de aceite da #150, e e o unico que justifica nao criar
    # tabela propria. A sonda roda num bloco com EXCEPTION (savepoint) e sai
    # por um SQLSTATE proprio -- nada do que ela inseriu fica.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $confere$
        DECLARE
          v_topico bigint;
          v_aluno uuid;
          v_missao bigint;
          v_antes numeric;
          v_depois numeric;
          v_semeou boolean;
        BEGIN
          SELECT ta.topico_id, ta.aluno_id INTO v_topico, v_aluno
            FROM public.topico_aluno ta
            JOIN public.topicos t ON t.id = ta.topico_id
           LIMIT 1;

          IF v_topico IS NULL THEN
            RAISE NOTICE USING MESSAGE =
              'CONFERE: base sem progresso de topico, sonda nao executada';
            RETURN;
          END IF;

          BEGIN
            SELECT percentual_concluido INTO v_antes
              FROM public.topico_aluno
             WHERE topico_id = v_topico AND aluno_id = v_aluno;

            INSERT INTO public.atividades (topico_id, titulo, descricao, tipo, pontuacao_maxima)
            VALUES (v_topico, 'sonda 20260911_07', 'sonda', 'missao', 10)
            RETURNING id INTO v_missao;

            -- A linha do aluno ja nasce, por gatilho anterior a esta migracao.
            SELECT EXISTS (
              SELECT 1 FROM public.atividade_aluno
               WHERE aluno_id = v_aluno AND atividade_id = v_missao
            ) INTO v_semeou;

            UPDATE public.atividade_aluno
               SET status = 'concluido', percentual_concluido = 100, updated_at = now()
             WHERE aluno_id = v_aluno AND atividade_id = v_missao;

            SELECT percentual_concluido INTO v_depois
              FROM public.topico_aluno
             WHERE topico_id = v_topico AND aluno_id = v_aluno;

            RAISE EXCEPTION USING ERRCODE = 'ZZ001';
          EXCEPTION WHEN SQLSTATE 'ZZ001' THEN
            NULL;  -- esperado: e' o que desfaz a sonda
          END;

          IF NOT COALESCE(v_semeou, FALSE) THEN
            RAISE EXCEPTION USING MESSAGE =
              'a missao nao gerou linha em atividade_aluno -- o aluno nao a veria';
          END IF;

          IF COALESCE(v_depois, 0) <= COALESCE(v_antes, 0) THEN
            RAISE EXCEPTION USING MESSAGE =
              'concluir a missao nao moveu o percentual do topico: '
              || COALESCE(v_antes::text, 'nulo') || ' -> '
              || COALESCE(v_depois::text, 'nulo')
              || ' -- e o motivo de missao nao ter tabela propria';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: missao conta como atividade e move o progresso do topico';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # As missoes viram `quiz` em vez de sumir: sao atividades de verdade, com
    # questoes e progresso de aluno pendurados. Apagar levaria o trabalho junto.
    op.execute(
        """
        ALTER TABLE public.atividades
          DROP CONSTRAINT IF EXISTS atividades_tipo_conhecido
        """
    )
    op.execute("UPDATE public.atividades SET tipo = 'quiz' WHERE tipo = 'missao'")
