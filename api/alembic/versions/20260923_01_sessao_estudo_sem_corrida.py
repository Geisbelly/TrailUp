"""Sessão de estudo gravada sem perder a concorrente, e limpeza do tempo em dobro

Duas correções em `trailup_registrar_sessao_estudo` / `trailup_registrar_intervalo_estudo`
e um reparo de dados. Medido no banco em 22/09/2026 (aluno de teste, turma 54).

## 1. A soma perdia a sessão concorrente (lost update)

As duas RPCs gravam `tempo_gasto_min = tempo_direto_min + trailup_tempo_sessao_min(...)`
num único UPDATE. Em READ COMMITTED esse UPDATE usa o snapshot do INÍCIO do
comando: quando duas chamadas para a mesma linha se cruzam, a segunda espera o
lock da primeira e, ao ganhá-lo, grava a soma calculada ANTES do commit dela —
sem a sessão da primeira. O cliente dispara as gravações sem fila, e cada bloco
fecha com um intervalo residual logo depois de um flush, então o cruzamento é
rotina, não caso raro. Atividade 1095: sessões de 7s (01:00:47.309) e 0s
(01:00:48.116), linha escrita por último pela transação da de 0s, e
`tempo_gasto_min` igual a `tempo_direto_min` — os 7s nunca entraram.
Reproduzido num Postgres local com duas transações: 90s gravados, 60s somados.

A correção é travar a linha de progresso ANTES de inserir a sessão e somar.
Cada comando do PL/pgSQL tira snapshot novo em READ COMMITTED; com o lock pego
primeiro, a chamada concorrente espera o commit da outra, e o UPDATE seguinte
já enxerga a sessão dela.

Ordem dos locks: linha filha (conteúdo/atividade) antes do tópico. O trigger de
progresso e `trailup_recalcular_topico_aluno` sempre tocam o tópico DEPOIS da
filha; travar o tópico primeiro na RPC antiga abria um ciclo de deadlock com a
RPC de sessão.

A linha de progresso é garantida antes do lock (sem linha não há o que travar,
e a sessão ficava gravada sem nunca chegar a `tempo_gasto_min`). Ela nasce como
o provisionamento a cria — só as chaves, status e percentual nos defaults
('não iniciado', 0) —, então não inventa item iniciado.

## 2. Sessões de conteúdo gêmeas de atividade

Um bloco de ATIVIDADE vinculado a conteúdo gravava a MESMA sessão como
'content' e como 'activity' (corrigido no cliente em `a2586981`, mas o app que
gerou os dados de 21 e 22/09 era anterior à correção: 34 gêmeas). A regra de
limpeza é igualdade exata de abertura e fechamento (milissegundos) no mesmo
aluno e tópico: o relógio de bloco nunca tem conteúdo e atividade abertos ao
mesmo tempo, então só gêmea casa.

## 3. Recálculo

Depois da limpeza, `tempo_gasto_min` volta a ser a fórmula
(`tempo_direto_min + trailup_tempo_sessao_min`) nas linhas que divergem dela —
é isso que devolve o tempo perdido pela corrida e tira o dobro das gêmeas.
`topico_aluno.tempo_gasto_min` é `real`: compara com tolerância para não
reescrever a tabela inteira por arredondamento de ponto flutuante.

Revision ID: 20260923_01
Revises: 20260922_06
Create Date: 2026-09-23
"""

from alembic import op

revision = "20260923_01"
down_revision = "20260922_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_registrar_sessao_estudo(
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

          -- Garante a linha e a TRAVA antes de somar: a chamada concorrente
          -- para a mesma linha espera aqui, e o UPDATE abaixo (comando novo,
          -- snapshot novo) já enxerga a sessão que ela gravou.
          IF p_scope = 'topic' THEN
            INSERT INTO public.topico_aluno (aluno_id, topico_id) VALUES (p_aluno, p_topico) ON CONFLICT (aluno_id, topico_id) DO NOTHING;
            PERFORM 1 FROM public.topico_aluno WHERE aluno_id = p_aluno AND topico_id = p_topico FOR UPDATE;
          ELSIF p_scope = 'content' THEN
            INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id) VALUES (p_aluno, p_conteudo) ON CONFLICT (aluno_id, conteudo_id) DO NOTHING;
            PERFORM 1 FROM public.conteudo_aluno WHERE aluno_id = p_aluno AND conteudo_id = p_conteudo FOR UPDATE;
          ELSE
            INSERT INTO public.atividade_aluno (aluno_id, atividade_id) VALUES (p_aluno, p_atividade) ON CONFLICT (aluno_id, atividade_id) DO NOTHING;
            PERFORM 1 FROM public.atividade_aluno WHERE aluno_id = p_aluno AND atividade_id = p_atividade FOR UPDATE;
          END IF;

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

    # A RPC antiga (apps já instalados). Mesma semântica de antes — soma
    # p_tempo_min em tempo_direto_min de tópico, conteúdo e atividade —, agora
    # com as linhas garantidas e travadas antes da soma. Filhas antes do tópico.
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

          IF p_conteudo IS NOT NULL THEN
            INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id) VALUES (p_aluno, p_conteudo) ON CONFLICT (aluno_id, conteudo_id) DO NOTHING;
            PERFORM 1 FROM public.conteudo_aluno WHERE aluno_id = p_aluno AND conteudo_id = p_conteudo FOR UPDATE;
          END IF;
          IF p_atividade IS NOT NULL THEN
            INSERT INTO public.atividade_aluno (aluno_id, atividade_id) VALUES (p_aluno, p_atividade) ON CONFLICT (aluno_id, atividade_id) DO NOTHING;
            PERFORM 1 FROM public.atividade_aluno WHERE aluno_id = p_aluno AND atividade_id = p_atividade FOR UPDATE;
          END IF;
          INSERT INTO public.topico_aluno (aluno_id, topico_id) VALUES (p_aluno, p_topico) ON CONFLICT (aluno_id, topico_id) DO NOTHING;
          PERFORM 1 FROM public.topico_aluno WHERE aluno_id = p_aluno AND topico_id = p_topico FOR UPDATE;

          INSERT INTO public.estudo_intervalos(id, aluno_id, classe_id, topico_id, tempo_min)
            VALUES (p_intervalo, p_aluno, v_classe, p_topico, p_tempo_min)
            ON CONFLICT (id) DO NOTHING RETURNING id INTO v_id;
          IF v_id IS NULL THEN RETURN; END IF;

          -- No SET, `tempo_direto_min` à direita é o valor ANTERIOR da linha.
          IF p_conteudo IS NOT NULL THEN
            UPDATE public.conteudo_aluno
               SET tempo_direto_min = tempo_direto_min + p_tempo_min,
                   tempo_gasto_min = tempo_direto_min + p_tempo_min
                     + public.trailup_tempo_sessao_min(p_aluno, 'content', NULL, p_conteudo, NULL),
                   ultima_visualizacao = now()
             WHERE aluno_id = p_aluno AND conteudo_id = p_conteudo;
          END IF;
          IF p_atividade IS NOT NULL THEN
            UPDATE public.atividade_aluno
               SET tempo_direto_min = tempo_direto_min + p_tempo_min,
                   tempo_gasto_min = tempo_direto_min + p_tempo_min
                     + public.trailup_tempo_sessao_min(p_aluno, 'activity', NULL, NULL, p_atividade),
                   ultima_visualizacao = now()
             WHERE aluno_id = p_aluno AND atividade_id = p_atividade;
          END IF;
          UPDATE public.topico_aluno
             SET tempo_direto_min = tempo_direto_min + p_tempo_min,
                 tempo_gasto_min = tempo_direto_min + p_tempo_min
                   + public.trailup_tempo_sessao_min(p_aluno, 'topic', p_topico, NULL, NULL),
                 ultima_visualizacao = now()
           WHERE aluno_id = p_aluno AND topico_id = p_topico;

          PERFORM public.trailup_recalcular_topico_aluno(p_aluno, p_topico);
          PERFORM public.trailup_recalcular_classe_aluno(p_aluno, v_classe);
        END; $fn$
        """
    )

    # Gêmeas: a sessão de conteúdo com abertura e fechamento idênticos aos de
    # uma sessão de atividade do mesmo aluno e tópico é a cópia (ver cabeçalho).
    op.execute(
        """
        DELETE FROM public.estudo_sessoes c
         USING public.estudo_sessoes a
         WHERE c.scope = 'content'
           AND a.scope = 'activity'
           AND c.aluno_id = a.aluno_id
           AND c.topico_id = a.topico_id
           AND c.aberto_em = a.aberto_em
           AND c.fechado_em = a.fechado_em
        """
    )

    op.execute(
        """
        UPDATE public.conteudo_aluno x
           SET tempo_gasto_min = x.tempo_direto_min
                 + public.trailup_tempo_sessao_min(x.aluno_id, 'content', NULL, x.conteudo_id, NULL)
         WHERE x.tempo_gasto_min IS DISTINCT FROM x.tempo_direto_min
                 + public.trailup_tempo_sessao_min(x.aluno_id, 'content', NULL, x.conteudo_id, NULL)
        """
    )
    op.execute(
        """
        UPDATE public.atividade_aluno x
           SET tempo_gasto_min = x.tempo_direto_min
                 + public.trailup_tempo_sessao_min(x.aluno_id, 'activity', NULL, NULL, x.atividade_id)
         WHERE x.tempo_gasto_min IS DISTINCT FROM x.tempo_direto_min
                 + public.trailup_tempo_sessao_min(x.aluno_id, 'activity', NULL, NULL, x.atividade_id)
        """
    )
    op.execute(
        """
        UPDATE public.topico_aluno x
           SET tempo_gasto_min = x.tempo_direto_min
                 + public.trailup_tempo_sessao_min(x.aluno_id, 'topic', x.topico_id, NULL, NULL)
         WHERE abs(COALESCE(x.tempo_gasto_min, 0)::numeric - (x.tempo_direto_min
                 + public.trailup_tempo_sessao_min(x.aluno_id, 'topic', x.topico_id, NULL, NULL))) >= 0.01
        """
    )


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade manual: as versoes anteriores das duas RPCs (20260921_01) "
        "perdem a sessao concorrente, e as sessoes gemeas removidas eram copias."
    )
