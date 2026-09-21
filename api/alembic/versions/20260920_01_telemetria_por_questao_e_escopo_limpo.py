"""a telemetria passa a medir a questao, e cada escopo para de carimbar o vizinho

Revision ID: 20260920_01
Revises: 20260919_01
Create Date: 2026-09-20

## O que estava errado, medido nesta base

**1. Nao havia tempo por questao.** `telemetria_time_metric_entries` tem quatro
escopos -- `topic`, `content`, `activity`, `material` -- e o mais fino para na
ATIVIDADE. Uma atividade de oito questoes era um numero so, e nao dava para
dizer em qual delas o aluno travou.

Do outro lado, `questao_aluno.tempo_gasto_seg` ja EXISTIA como coluna, o
parametro `tempoGastoSeg` de `registrarRespostaQuestao` ja existia, e nenhum
chamador o passava: **35 das 35 linhas com NULL**. `trailup_core/tempo.py`, que
modela exatamente a latencia por questao (R2 0,562 sobre o log), nao tinha
entrada nenhuma.

**2. A linha de escopo `content` saia carimbada com uma atividade.** Sao duas
medidas diferentes, e as duas sao erradas:

    scope    entry_key     item_key        atividade_id
    content  content:174   activity:1063   1063
    content  content:174   activity:1062   1062
    content  content:174   activity:1061   1061

Nove linhas assim. O escopo `content` AGREGA as atividades do conteudo; dizer
que ele pertence a uma delas nao e uma aproximacao, e uma afirmacao falsa. E o
valor nao tinha nem significado: era a ULTIMA atividade aberta no lote.

A origem e uma so, e nao e o cliente sozinho. O contexto de estudo carrega uma
`item_key` -- a do bloco aberto --, e o acumulador passava essa chave para a
entrada de conteudo tambem. Ai o gatilho `telemetria_resolver_entidade` fazia o
que foi escrito para fazer: leu `activity:1063`, viu `atividade_id` nulo, e
preencheu. **O gatilho preenche sem olhar o escopo da linha.**

## O que esta migracao faz

**Escopo `question`**, com coluna `questao_id`, o CHECK ampliado (sem ele toda
linha de questao seria RECUSADA) e o indice parcial que os outros tres ja tem.

**O gatilho passa a respeitar o escopo.** Continua recuperando identidade do
`item_key` -- que e o que a `20260826_17` provou ser recuperavel --, mas so para
cima: uma linha nunca recebe o id de um item MAIS FINO que o escopo dela. E
ganha a ancestralidade da questao, que e derivavel de verdade:
`questoes.atividade_id` e `atividades.topico_id`.

**`trailup_tempo_telemetria_min_v2`**, com a questao na assinatura. Funcao NOVA,
e nao um `CREATE OR REPLACE` da antiga: a de cinco argumentos e chamada pelo
gatilho `trailup_tempo_after_telemetria`, e trocar assinatura de funcao viva
debaixo de um gatilho e como esta migracao aprenderia sozinha o que a
`20260912_01` ja documentou. A antiga fica, intacta, e passa a delegar.

## O que esta migracao NAO faz

**Nao deriva `questao_aluno.tempo_gasto_seg` da telemetria.** Sao duas medidas
distintas e nenhuma substitui a outra:

    telemetria, escopo `question`  permanencia na questao, somada por lote
    questao_aluno.tempo_gasto_seg  LATENCIA da tentativa (apareceu -> confirmou)

`questao_aluno` e por TENTATIVA (`aluno_id, questao_id, tentativa`). Espalhar um
agregado de lote sobre linhas de tentativa escolheria arbitrariamente uma delas,
e e justamente a latencia por tentativa que `trailup_core/tempo` pede. Quem
preenche essa coluna e o cliente, no instante da confirmacao -- que e o unico
lugar onde o intervalo existe.

**Nao refaz o `active_sec` historico.** A correcao do limiar de ocio (de 15s
para 120s, em `MetricasContext.tsx`) vale para frente. O que ficou gravado como
`idle` nao da para reclassificar: o instante de cada interacao nao foi
persistido, so o total agregado por lote. Dado velho fica como esta, e sabendo
por que.

## A limpeza que DA para fazer

As nove linhas de `content` com `atividade_id` sao corrigiveis com certeza: a
prova de que o valor e lixo esta na propria linha (`scope = 'content'` e
`item_key` comecando com `activity:`). O `UPDATE` anula a coluna e mantem a
linha -- o tempo medido continua valendo, so deixa de apontar para o lugar
errado.
"""

from alembic import op

revision = "20260920_01"
down_revision = "20260919_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. A coluna e o escopo
    # ------------------------------------------------------------------
    # Sem FK, como `topico_id`/`conteudo_id`/`atividade_id`: a telemetria e
    # append-only e precisa sobreviver ao conteudo regerado, que apaga e recria
    # a questao. Foi exatamente a licao da `20260910_06` -- historico que depende
    # do presente some retroativamente.
    op.execute(
        "ALTER TABLE telemetria_time_metric_entries "
        "ADD COLUMN IF NOT EXISTS questao_id bigint"
    )

    # O CHECK precisa vir ANTES de qualquer linha de questao existir: enquanto
    # ele listar so os quatro escopos antigos, todo INSERT de `question` e
    # recusado com 23514 -- e o cliente trata erro nao-rede caindo no fallback,
    # que grava no mesmo lugar e leva o mesmo 23514.
    op.execute(
        "ALTER TABLE telemetria_time_metric_entries "
        "DROP CONSTRAINT IF EXISTS ck_telemetria_time_metric_entries_scope"
    )
    op.execute(
        """
        ALTER TABLE telemetria_time_metric_entries
          ADD CONSTRAINT ck_telemetria_time_metric_entries_scope
          CHECK (scope IN ('topic', 'content', 'activity', 'question', 'material'))
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS telemetria_tme_questao_id_tempo_idx
          ON telemetria_time_metric_entries (aluno_id, scope, questao_id)
          WHERE questao_id IS NOT NULL
        """
    )

    # ------------------------------------------------------------------
    # 2. O gatilho, agora ciente do escopo
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.telemetria_resolver_entidade()
        RETURNS trigger LANGUAGE plpgsql AS $fn$
        DECLARE
          v_id bigint;
        BEGIN
          -- A QUESTAO primeiro: ela e o unico escopo cuja ancestralidade da
          -- para descobrir no banco (a atividade da questao, o topico da
          -- atividade), e os passos de baixo dependem dela ja estar resolvida.
          IF NEW.questao_id IS NULL AND NEW.scope = 'question' THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'question');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM questoes q WHERE q.id = v_id) THEN
              NEW.questao_id := v_id;
            END IF;
          END IF;

          IF NEW.questao_id IS NOT NULL AND NEW.atividade_id IS NULL THEN
            SELECT q.atividade_id INTO NEW.atividade_id
              FROM questoes q WHERE q.id = NEW.questao_id;
          END IF;

          IF NEW.atividade_id IS NOT NULL AND NEW.topico_id IS NULL THEN
            SELECT a.topico_id INTO NEW.topico_id
              FROM atividades a WHERE a.id = NEW.atividade_id;
          END IF;

          -- Daqui para baixo, o `item_key` so preenche o que e do escopo ou
          -- ANCESTRAL dele. A guarda de escopo e a correcao desta migracao: sem
          -- ela, a linha de `content` cujo `item_key` era `activity:1063`
          -- recebia `atividade_id = 1063`, e o escopo que agrega as atividades
          -- do conteudo passava a alegar que pertencia a uma.
          IF NEW.conteudo_id IS NULL AND NEW.scope <> 'topic' THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'content');
            -- Confere existencia antes de atribuir: chave de material antigo
            -- pode apontar para conteudo ja removido, e gravar isso criaria
            -- referencia quebrada que so apareceria num JOIN silencioso.
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM conteudos c WHERE c.id = v_id) THEN
              NEW.conteudo_id := v_id;
            END IF;
          END IF;

          IF NEW.atividade_id IS NULL
             AND NEW.scope IN ('activity', 'question', 'material') THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'activity');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM atividades a WHERE a.id = v_id) THEN
              NEW.atividade_id := v_id;
            END IF;
          END IF;

          IF NEW.topico_id IS NULL THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'topic');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM topicos t WHERE t.id = v_id) THEN
              NEW.topico_id := v_id;
            END IF;
          END IF;

          -- Identidade da entrada dentro do lote. Derivada aqui, e nao no
          -- cliente, para valer tambem para os apps ja publicados, que escrevem
          -- direto no Supabase pelo fallback e nunca vao mandar esta coluna.
          -- `id` ainda nao existe num BEFORE INSERT, entao o ELSE final usa a
          -- propria chave do cliente; se nem ela houver, um valor unico por
          -- linha, que preserva em vez de fundir.
          IF NEW.entry_key IS NULL THEN
            NEW.entry_key := CASE
              WHEN NEW.scope = 'topic'    AND NEW.topico_id    IS NOT NULL
                THEN 'topic:'    || NEW.topico_id::text
              WHEN NEW.scope = 'content'  AND NEW.conteudo_id  IS NOT NULL
                THEN 'content:'  || NEW.conteudo_id::text
              WHEN NEW.scope = 'activity' AND NEW.atividade_id IS NOT NULL
                THEN 'activity:' || NEW.atividade_id::text
              WHEN NEW.scope = 'question' AND NEW.questao_id   IS NOT NULL
                THEN 'question:' || NEW.questao_id::text
              WHEN NEW.material_key IS NOT NULL THEN NEW.material_key
              WHEN NEW.item_key     IS NOT NULL THEN NEW.item_key
              ELSE 'row:' || gen_random_uuid()::text
            END;
          END IF;

          RETURN NEW;
        END;
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 3. A soma de tempo, com a questao na assinatura
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_tempo_telemetria_min_v2(
          p_aluno uuid, p_scope text, p_topico bigint, p_conteudo bigint,
          p_atividade bigint, p_questao bigint
        )
        RETURNS numeric LANGUAGE sql STABLE
        SET search_path TO 'public', 'pg_temp' AS $fn$
          SELECT COALESCE(round(sum(e.active_sec)::numeric / 60.0, 2), 0)
            FROM public.telemetria_time_metric_entries e
           WHERE e.aluno_id = p_aluno
             AND e.scope = p_scope
             AND (p_topico IS NULL OR e.topico_id = p_topico)
             AND (p_conteudo IS NULL OR e.conteudo_id = p_conteudo)
             AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
             AND (p_questao IS NULL OR e.questao_id = p_questao)
        $fn$
        """
    )

    # Funcao nova nasce executavel por `anon` -- o Supabase concede EXECUTE a
    # PUBLIC por padrao. Mesma forma da `20260826_09`.
    op.execute(
        "REVOKE ALL ON FUNCTION public.trailup_tempo_telemetria_min_v2("
        "uuid, text, bigint, bigint, bigint, bigint) FROM PUBLIC, anon"
    )
    op.execute(
        "GRANT EXECUTE ON FUNCTION public.trailup_tempo_telemetria_min_v2("
        "uuid, text, bigint, bigint, bigint, bigint) TO authenticated"
    )

    # A de cinco argumentos DELEGA em vez de repetir o corpo. Ela continua sendo
    # a chamada pelo gatilho de tempo, e duas copias da mesma soma divergiriam
    # na primeira vez que alguem mexesse numa so.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_tempo_telemetria_min(
          p_aluno uuid, p_scope text, p_topico bigint, p_conteudo bigint,
          p_atividade bigint
        )
        RETURNS numeric LANGUAGE sql STABLE
        SET search_path TO 'public', 'pg_temp' AS $fn$
          SELECT public.trailup_tempo_telemetria_min_v2(
            p_aluno, p_scope, p_topico, p_conteudo, p_atividade, NULL
          )
        $fn$
        """
    )

    # ------------------------------------------------------------------
    # 4. Limpeza do que ficou carimbado errado
    # ------------------------------------------------------------------
    # So onde a prova esta na propria linha. O tempo medido continua valendo --
    # o que sai e o ponteiro para a entidade errada, nao a medida.
    op.execute(
        """
        UPDATE telemetria_time_metric_entries
           SET atividade_id = NULL
         WHERE scope = 'content'
           AND atividade_id IS NOT NULL
           AND item_key LIKE 'activity:%'
        """
    )
    op.execute(
        """
        UPDATE telemetria_time_metric_entries
           SET conteudo_id = NULL, atividade_id = NULL, questao_id = NULL
         WHERE scope = 'topic'
           AND (conteudo_id IS NOT NULL
                OR atividade_id IS NOT NULL
                OR questao_id IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.execute(
        "UPDATE telemetria_time_metric_entries SET scope = 'activity' "
        "WHERE scope = 'question'"
    )
    op.execute(
        "ALTER TABLE telemetria_time_metric_entries "
        "DROP CONSTRAINT IF EXISTS ck_telemetria_time_metric_entries_scope"
    )
    op.execute(
        """
        ALTER TABLE telemetria_time_metric_entries
          ADD CONSTRAINT ck_telemetria_time_metric_entries_scope
          CHECK (scope IN ('topic', 'content', 'activity', 'material'))
        """
    )
    op.execute("DROP INDEX IF EXISTS telemetria_tme_questao_id_tempo_idx")
    op.execute(
        "ALTER TABLE telemetria_time_metric_entries DROP COLUMN IF EXISTS questao_id"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.trailup_tempo_telemetria_min_v2("
        "uuid, text, bigint, bigint, bigint, bigint)"
    )
    # A de cinco argumentos volta a somar sozinha: a v2, de quem ela passou a
    # depender, acabou de ser derrubada.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_tempo_telemetria_min(
          p_aluno uuid, p_scope text, p_topico bigint, p_conteudo bigint,
          p_atividade bigint
        )
        RETURNS numeric LANGUAGE sql STABLE
        SET search_path TO 'public', 'pg_temp' AS $fn$
          SELECT COALESCE(round(sum(e.active_sec)::numeric / 60.0, 2), 0)
            FROM public.telemetria_time_metric_entries e
           WHERE e.aluno_id = p_aluno
             AND e.scope = p_scope
             AND (p_topico IS NULL OR e.topico_id = p_topico)
             AND (p_conteudo IS NULL OR e.conteudo_id = p_conteudo)
             AND (p_atividade IS NULL OR e.atividade_id = p_atividade)
        $fn$
        """
    )
    # O gatilho volta a versao sem guarda de escopo (`20260830_01`).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.telemetria_resolver_entidade()
        RETURNS trigger LANGUAGE plpgsql AS $fn$
        DECLARE
          v_id bigint;
        BEGIN
          IF NEW.conteudo_id IS NULL THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'content');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM conteudos c WHERE c.id = v_id) THEN
              NEW.conteudo_id := v_id;
            END IF;
          END IF;

          IF NEW.atividade_id IS NULL THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'activity');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM atividades a WHERE a.id = v_id) THEN
              NEW.atividade_id := v_id;
            END IF;
          END IF;

          IF NEW.topico_id IS NULL THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'topic');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM topicos t WHERE t.id = v_id) THEN
              NEW.topico_id := v_id;
            END IF;
          END IF;

          IF NEW.entry_key IS NULL THEN
            NEW.entry_key := CASE
              WHEN NEW.scope = 'topic'    AND NEW.topico_id    IS NOT NULL
                THEN 'topic:'    || NEW.topico_id::text
              WHEN NEW.scope = 'content'  AND NEW.conteudo_id  IS NOT NULL
                THEN 'content:'  || NEW.conteudo_id::text
              WHEN NEW.scope = 'activity' AND NEW.atividade_id IS NOT NULL
                THEN 'activity:' || NEW.atividade_id::text
              WHEN NEW.material_key IS NOT NULL THEN NEW.material_key
              WHEN NEW.item_key     IS NOT NULL THEN NEW.item_key
              ELSE 'row:' || gen_random_uuid()::text
            END;
          END IF;

          RETURN NEW;
        END;
        $fn$
        """
    )
