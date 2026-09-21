"""Sessões de estudo com abertura e fechamento reais, e tempo_gasto_min deixa de vir de active_sec

Fecha o loop aberto por `20260913_09`. Aquela migração trocou a leitura
canônica de `dwell_sec` (tempo do lote) para `active_sec` (tempo sem tocar a
tela por menos de `IDLE_THRESHOLD_MS` = 15s), alegando que "active_sec é
portanto a fonte autoritativa". `20260826_19` já tinha decidido o oposto, pelo
motivo oposto: `active_sec` subestima leitura, que é o modo comum de uso num
app de estudo. Medido nesta base: permanência real de ~2000s por tópico/
conteúdo/atividade contra ~545s contabilizados — 73% do tempo descartado.

## Por que trocar o mecanismo, não só a coluna

Voltar a ler `dwell_sec` corrigiria a maior parte da perda, mas não fecha o
pedido real: contar pelo abrir/fechar de cada tópico/conteúdo/atividade, com
histórico auditável, em vez de inferir de amostras de telemetria (que servem
a outro propósito: emoção, atenção, ritmo de leitura). O cliente já mede esse
intervalo com precisão (`StudyClock`, `mobile/src/utils/studyClock.ts`) — ele
só era descartado quando a telemetria estava ativa, usado apenas como
condição (ver `useStudyTimeTracking.ts`).

## Duas fontes, uma fórmula, sem gravador duplicado

`20260920_09` já separou `tempo_direto_min` (livro-caixa aditivo, hoje só
alimentado pelo fallback `estudo_intervalos` quando a telemetria está
desligada) de `tempo_gasto_min = tempo_direto_min + trailup_tempo_telemetria_min(...)`.
Esta migração:

  1. Cria `estudo_sessoes`: uma linha por intervalo real de abertura/
     fechamento, por (aluno, escopo, tópico/conteúdo/atividade).
  2. Cria `trailup_tempo_sessao_min`, a mesma forma de
     `trailup_tempo_telemetria_min` mas somando `estudo_sessoes.duracao_sec`.
  3. Cria `trailup_registrar_sessao_estudo`: uma sessão por chamada, sempre
     com abertura E fechamento já conhecidos (o cliente só chama depois que
     `StudyClock` fechou o intervalo localmente — nunca existe uma sessão
     "aberta" vivendo entre chamadas, então não há sessão órfã de app
     matado pelo SO para recuperar).
  4. Troca o RPC antigo (`trailup_registrar_intervalo_estudo`, usado pelos
     apps já publicados) para a mesma fonte.
  5. Congela a contribuição da telemetria já creditada em `tempo_direto_min`
     e desliga o trigger que a recalcularia por cima no próximo lote — sem
     isso o aluno veria o tempo exibido CAIR para perto de zero no dia da
     migração.

Revision ID: 20260921_01
Revises: 20260920_10
Create Date: 2026-09-21
"""

from alembic import op

revision = "20260921_01"
down_revision = "20260920_10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. A tabela: uma linha por sessão FECHADA (abertura + fechamento
    #    sempre juntos).
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE public.estudo_sessoes (
          id uuid PRIMARY KEY,
          aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
          classe_id bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
          scope text NOT NULL CHECK (scope IN ('topic', 'content', 'activity')),
          topico_id bigint NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
          conteudo_id bigint REFERENCES public.conteudos(id) ON DELETE CASCADE,
          atividade_id bigint REFERENCES public.atividades(id) ON DELETE CASCADE,
          aberto_em timestamptz NOT NULL,
          fechado_em timestamptz NOT NULL,
          duracao_sec integer GENERATED ALWAYS AS (
            GREATEST(0, EXTRACT(EPOCH FROM (fechado_em - aberto_em)))::int
          ) STORED,
          criado_em timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT estudo_sessoes_escopo_consistente CHECK (
            (scope = 'topic'    AND conteudo_id IS NULL AND atividade_id IS NULL) OR
            (scope = 'content'  AND conteudo_id IS NOT NULL) OR
            (scope = 'activity' AND atividade_id IS NOT NULL)
          ),
          CONSTRAINT estudo_sessoes_fechamento_apos_abertura CHECK (fechado_em >= aberto_em),
          CONSTRAINT estudo_sessoes_duracao_maxima CHECK (fechado_em - aberto_em <= interval '1440 minutes')
        )
        """
    )
    op.execute(
        """
        CREATE INDEX estudo_sessoes_soma_idx
          ON public.estudo_sessoes (aluno_id, scope, topico_id, conteudo_id, atividade_id)
        """
    )
    op.execute("ALTER TABLE public.estudo_sessoes ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.estudo_sessoes FROM PUBLIC, anon, authenticated")
    op.execute("GRANT SELECT ON public.estudo_sessoes TO authenticated")
    op.execute(
        """
        CREATE POLICY estudo_sessoes_sel ON public.estudo_sessoes
          FOR SELECT TO authenticated USING (aluno_id = auth.uid())
        """
    )

    # ------------------------------------------------------------------
    # 2. A leitura: mesma assinatura de trailup_tempo_telemetria_min, somando
    #    a tabela nova em vez de inferir de amostras de telemetria.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE FUNCTION public.trailup_tempo_sessao_min(
          p_aluno uuid, p_scope text,
          p_topico bigint, p_conteudo bigint, p_atividade bigint
        )
        RETURNS numeric LANGUAGE sql STABLE
        SET search_path = public, pg_temp AS $fn$
          SELECT COALESCE(round(sum(e.duracao_sec)::numeric / 60.0, 2), 0)
            FROM public.estudo_sessoes e
           WHERE e.aluno_id = p_aluno
             AND e.scope = p_scope
             AND (p_topico    IS NULL OR e.topico_id    = p_topico)
             AND (p_conteudo  IS NULL OR e.conteudo_id  = p_conteudo)
             AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 3. A escrita: só UPDATE em topico_aluno/conteudo_aluno/atividade_aluno,
    #    nunca INSERT — mesma razão de `20260826_19`: a linha já existe assim
    #    que o aluno interage; criar aqui inventaria um item "iniciado" que
    #    ninguém iniciou.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE FUNCTION public.trailup_registrar_sessao_estudo(
          p_sessao uuid, p_aluno uuid, p_scope text,
          p_topico bigint, p_conteudo bigint, p_atividade bigint,
          p_aberto_em timestamptz, p_fechado_em timestamptz
        ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $fn$
        DECLARE v_classe bigint; v_id uuid;
        BEGIN
          IF auth.uid() IS NULL OR p_aluno IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'aluno_invalido' USING ERRCODE = '42501';
          END IF;
          IF p_scope NOT IN ('topic', 'content', 'activity') THEN
            RAISE EXCEPTION 'escopo_invalido';
          END IF;
          IF p_sessao IS NULL OR p_aberto_em IS NULL OR p_fechado_em IS NULL
             OR p_fechado_em < p_aberto_em
             OR p_fechado_em - p_aberto_em > interval '1440 minutes' THEN
            RAISE EXCEPTION 'sessao_invalida';
          END IF;
          IF p_scope = 'content' AND p_conteudo IS NULL THEN
            RAISE EXCEPTION 'conteudo_obrigatorio';
          END IF;
          IF p_scope = 'activity' AND p_atividade IS NULL THEN
            RAISE EXCEPTION 'atividade_obrigatoria';
          END IF;

          SELECT t.classe_id INTO v_classe FROM public.topicos t
            JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id AND ca.aluno_id = p_aluno
           WHERE t.id = p_topico;
          IF v_classe IS NULL THEN
            RAISE EXCEPTION 'matricula_invalida' USING ERRCODE = '42501';
          END IF;

          IF p_conteudo IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.conteudos WHERE id = p_conteudo AND topico_id = p_topico
          ) THEN RAISE EXCEPTION 'conteudo_invalido'; END IF;
          IF p_atividade IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.atividades WHERE id = p_atividade AND topico_id = p_topico
          ) THEN RAISE EXCEPTION 'atividade_invalida'; END IF;

          INSERT INTO public.estudo_sessoes(
            id, aluno_id, classe_id, scope, topico_id, conteudo_id, atividade_id,
            aberto_em, fechado_em
          ) VALUES (
            p_sessao, p_aluno, v_classe, p_scope, p_topico, p_conteudo, p_atividade,
            p_aberto_em, p_fechado_em
          ) ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;
          IF v_id IS NULL THEN RETURN; END IF;

          IF p_scope = 'topic' THEN
            UPDATE public.topico_aluno
               SET tempo_gasto_min = tempo_direto_min
                     + public.trailup_tempo_sessao_min(p_aluno, 'topic', p_topico, NULL, NULL),
                   updated_at = now()
             WHERE aluno_id = p_aluno AND topico_id = p_topico;
          ELSIF p_scope = 'content' THEN
            UPDATE public.conteudo_aluno
               SET tempo_gasto_min = tempo_direto_min
                     + public.trailup_tempo_sessao_min(p_aluno, 'content', NULL, p_conteudo, NULL),
                   updated_at = now()
             WHERE aluno_id = p_aluno AND conteudo_id = p_conteudo;
          ELSE
            UPDATE public.atividade_aluno
               SET tempo_gasto_min = tempo_direto_min
                     + public.trailup_tempo_sessao_min(p_aluno, 'activity', NULL, NULL, p_atividade),
                   updated_at = now()
             WHERE aluno_id = p_aluno AND atividade_id = p_atividade;
          END IF;

          PERFORM public.trailup_recalcular_topico_aluno(p_aluno, p_topico);
          PERFORM public.trailup_recalcular_classe_aluno(p_aluno, v_classe);
        END;
        $fn$
        """
    )
    op.execute(
        "REVOKE ALL ON FUNCTION public.trailup_registrar_sessao_estudo("
        "uuid,uuid,text,bigint,bigint,bigint,timestamptz,timestamptz) FROM PUBLIC, anon"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.trailup_registrar_sessao_estudo("
        "uuid,uuid,text,bigint,bigint,bigint,timestamptz,timestamptz) TO authenticated"
    )

    # ------------------------------------------------------------------
    # 4. O RPC antigo (apps já publicados que só conhecem esta assinatura)
    #    passa a somar a mesma fonte que a RPC nova.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_registrar_intervalo_estudo(
          p_intervalo uuid, p_aluno uuid, p_topico bigint, p_conteudo bigint,
          p_atividade bigint, p_tempo_min numeric
        ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $fn$
        DECLARE v_classe bigint; v_id uuid;
        BEGIN
          IF auth.uid() IS NULL OR p_aluno IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'aluno_invalido' USING ERRCODE = '42501';
          END IF;
          SELECT t.classe_id INTO v_classe FROM public.topicos t
            JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id AND ca.aluno_id = p_aluno
           WHERE t.id = p_topico;
          IF v_classe IS NULL THEN RAISE EXCEPTION 'matricula_invalida' USING ERRCODE = '42501'; END IF;
          IF p_intervalo IS NULL OR p_tempo_min IS NULL OR p_tempo_min <= 0 OR p_tempo_min > 1440 THEN
            RAISE EXCEPTION 'intervalo_invalido';
          END IF;
          IF p_conteudo IS NOT NULL AND NOT EXISTS(
            SELECT 1 FROM public.conteudos WHERE id = p_conteudo AND topico_id = p_topico
          ) THEN RAISE EXCEPTION 'conteudo_invalido'; END IF;
          IF p_atividade IS NOT NULL AND NOT EXISTS(
            SELECT 1 FROM public.atividades WHERE id = p_atividade AND topico_id = p_topico
          ) THEN RAISE EXCEPTION 'atividade_invalida'; END IF;

          INSERT INTO public.estudo_intervalos(id, aluno_id, classe_id, topico_id, tempo_min)
            VALUES (p_intervalo, p_aluno, v_classe, p_topico, p_tempo_min)
            ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;
          IF v_id IS NULL THEN RETURN; END IF;

          INSERT INTO public.topico_aluno(aluno_id, topico_id, tempo_direto_min, tempo_gasto_min)
            VALUES (p_aluno, p_topico, p_tempo_min,
                    p_tempo_min + public.trailup_tempo_sessao_min(p_aluno, 'topic', p_topico, NULL, NULL))
            ON CONFLICT (aluno_id, topico_id) DO UPDATE SET
              tempo_direto_min = topico_aluno.tempo_direto_min + p_tempo_min,
              tempo_gasto_min = topico_aluno.tempo_direto_min + p_tempo_min
                + public.trailup_tempo_sessao_min(p_aluno, 'topic', p_topico, NULL, NULL),
              ultima_visualizacao = now();
          IF p_conteudo IS NOT NULL THEN
            INSERT INTO public.conteudo_aluno(aluno_id, conteudo_id, tempo_direto_min, tempo_gasto_min)
              VALUES (p_aluno, p_conteudo, p_tempo_min,
                      p_tempo_min + public.trailup_tempo_sessao_min(p_aluno, 'content', NULL, p_conteudo, NULL))
              ON CONFLICT (aluno_id, conteudo_id) DO UPDATE SET
                tempo_direto_min = conteudo_aluno.tempo_direto_min + p_tempo_min,
                tempo_gasto_min = conteudo_aluno.tempo_direto_min + p_tempo_min
                  + public.trailup_tempo_sessao_min(p_aluno, 'content', NULL, p_conteudo, NULL),
                ultima_visualizacao = now();
          END IF;
          IF p_atividade IS NOT NULL THEN
            INSERT INTO public.atividade_aluno(aluno_id, atividade_id, tempo_direto_min, tempo_gasto_min)
              VALUES (p_aluno, p_atividade, p_tempo_min,
                      p_tempo_min + public.trailup_tempo_sessao_min(p_aluno, 'activity', NULL, NULL, p_atividade))
              ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET
                tempo_direto_min = atividade_aluno.tempo_direto_min + p_tempo_min,
                tempo_gasto_min = atividade_aluno.tempo_direto_min + p_tempo_min
                  + public.trailup_tempo_sessao_min(p_aluno, 'activity', NULL, NULL, p_atividade),
                ultima_visualizacao = now();
          END IF;
          PERFORM public.trailup_recalcular_topico_aluno(p_aluno, p_topico);
          PERFORM public.trailup_recalcular_classe_aluno(p_aluno, v_classe);
        END; $fn$
        """
    )

    # ------------------------------------------------------------------
    # 5. Congela o que a telemetria já tinha creditado, e só ENTÃO desliga o
    #    trigger que recalcularia por cima com active_sec no próximo lote.
    #    Sem isto o aluno veria o tempo exibido CAIR para perto de zero no
    #    dia da migração.
    # ------------------------------------------------------------------
    op.execute(
        """
        UPDATE public.topico_aluno
           SET tempo_direto_min = tempo_direto_min
             + public.trailup_tempo_telemetria_min(aluno_id, 'topic', topico_id, NULL, NULL)
        """
    )
    op.execute(
        """
        UPDATE public.conteudo_aluno
           SET tempo_direto_min = tempo_direto_min
             + public.trailup_tempo_telemetria_min(aluno_id, 'content', NULL, conteudo_id, NULL)
        """
    )
    op.execute(
        """
        UPDATE public.atividade_aluno
           SET tempo_direto_min = tempo_direto_min
             + public.trailup_tempo_telemetria_min(aluno_id, 'activity', NULL, NULL, atividade_id)
        """
    )
    op.execute(
        """
        UPDATE public.topico_aluno
           SET tempo_gasto_min = tempo_direto_min
             + public.trailup_tempo_sessao_min(aluno_id, 'topic', topico_id, NULL, NULL),
               updated_at = now()
        """
    )
    op.execute(
        """
        UPDATE public.conteudo_aluno
           SET tempo_gasto_min = tempo_direto_min
             + public.trailup_tempo_sessao_min(aluno_id, 'content', NULL, conteudo_id, NULL),
               updated_at = now()
        """
    )
    op.execute(
        """
        UPDATE public.atividade_aluno
           SET tempo_gasto_min = tempo_direto_min
             + public.trailup_tempo_sessao_min(aluno_id, 'activity', NULL, NULL, atividade_id),
               updated_at = now()
        """
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trg_telemetria_tempo_gasto "
        "ON public.telemetria_time_metric_entries"
    )
    op.execute("DROP FUNCTION IF EXISTS public.trailup_tempo_after_telemetria()")


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade manual: preserva o historico de estudo_sessoes"
    )
