"""class_delta_sync sai da API e passa a ser enfileirado pelo proprio Postgres

O console do professor nao conseguia salvar topico nem disparar geracao: toda
chamada a `/trailup-api/api/v1/personalizar/jobs*` voltava 502. A API estava
fora do ar, e enquanto ela estiver fora TUDO que dependia dela para de
funcionar -- inclusive coisas que nao tem modelo de linguagem nenhum no meio.

Enfileirar job e' encanamento, nao IA. Pela regra de fronteira do repo
(CLAUDE.md), encanamento mora no banco: a API dorme no free tier, o Postgres
nao. Esta migration move o disparo de `class_delta_sync` para um trigger, no
mesmo padrao que `fn_enqueue_classe_mapa_tema_job` ja usa para
`class_theme_sync` desde antes. Quem PROCESSA a fila continua sendo o worker
da API -- isso e' geracao, e geracao e' IA. A diferenca e' que agora o job
espera na fila em vez de o clique do professor falhar.

O trigger cobre as CINCO tabelas que o editor de trilha escreve -- `topicos`,
`conteudos`, `atividades`, `questoes` e `cards` -- porque o console
enfileirava depois de escrever em todas elas (`syncDeltaJob` em
TopicEditDrawer). Cobrir so topico e conteudo teria trocado um 502 visivel
por uma regeneracao que silenciosamente deixaria de acontecer ao editar uma
questao ou um card.

## Coalescencia, e por que ela nao e' opcional aqui

O console salva reordenacao e mapa de dependencias com um `UPDATE` por linha
(`Promise.all(updates.map(...))` em TopicsManager). Um trigger FOR EACH ROW
veria N statements independentes e criaria N jobs -- pior que o comportamento
atual, em que o console juntava todos os ids em UMA chamada.

Por isso o trigger nao cria um job por evento: ele procura um job
`class_delta_sync` ainda `pending` da mesma classe, trava a linha com
`FOR UPDATE` e funde o novo escopo no payload dela. As N transacoes da
reordenacao serializam nessa linha e saem como um job so. Um job que ja esta
`processing`/`partial` NAO e' reaproveitado: o worker ja leu `total_targets`
dele, e crescer o escopo no meio da execucao deixaria a contagem de progresso
mentindo.

## O escopo, quando dois eventos se fundem

Editar um conteudo escopa o job naquele conteudo; editar o topico escopa no
topico inteiro (todos os conteudos). Ao fundir os dois, a uniao crua de
`conteudo_ids` ENCOLHERIA o escopo: um pedido de "todo o topico" seguido de
"conteudo 11" viraria so o 11, e os demais conteudos ficariam sem regenerar.
A regra aqui e' a inversa e explicita: se qualquer um dos lados pediu o topico
inteiro, o resultado da fusao e' o topico inteiro.

## Falhar aqui nunca pode derrubar o save

O bloco termina em `EXCEPTION WHEN OTHERS` que so emite `RAISE NOTICE`. Se o
enfileiramento quebrar, o professor ainda salva o topico -- que e' exatamente
a falha que ele esta vendo hoje pelo outro lado (o 502 do enqueue derrubando a
acao inteira no console).

## RLS

`personalizacao_jobs` so tinha policy de SELECT para o ALUNO. O professor
nunca leu essa tabela direto porque sempre passou pela API (que usa service
role). Com a listagem indo para o cliente, ele precisa de policy propria --
via `app_classes_do_professor()`, o helper SECURITY DEFINER que o resto do
repo ja usa para nao cair em recursao de RLS.

`personalizacao_job_targets` fica sem policy nova de proposito: o console
lista jobs, e `total_targets`/`processed_targets` sao colunas de
`personalizacao_jobs`. Ninguem no cliente le target linha a linha.

Revision ID: 20260827_03
Revises: 20260827_02
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260827_03"
down_revision = "20260827_02"
branch_labels = None
depends_on = None


FN_ENQUEUE = """
CREATE OR REPLACE FUNCTION public.fn_enqueue_class_delta_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_classe_id       bigint;
  v_topico_id       bigint;
  v_topico_origem   bigint;
  v_conteudo_id     bigint;
  v_geracao_auto    boolean;
  v_job_id          uuid;
  v_reason          text;
  v_trigger_source  text;
  v_topico_ids      bigint[];
  v_conteudo_ids    bigint[];
  v_prev_topicos    bigint[];
  v_prev_conteudos  bigint[];
  v_escopo_total    boolean;
  v_profile_map     jsonb;
  v_removidos       jsonb;
  v_total           integer;
  v_job_topico_id   bigint;
  v_job_conteudo_id bigint;
BEGIN
  -- 1. De onde veio. A mesma funcao serve as cinco tabelas que o console
  --    edita; plpgsql resolve os campos de NEW/OLD em tempo de execucao, entao
  --    so o ramo que executa precisa existir na tabela. Todas levam a um
  --    topico -- direto (topicos, conteudos, atividades) ou por um salto
  --    (questoes -> atividades, cards -> conteudos).
  IF TG_TABLE_NAME = 'topicos' THEN
    v_trigger_source := 'db_topico_trigger';
    IF TG_OP = 'DELETE' THEN
      v_classe_id := OLD.classe_id;
      v_topico_id := OLD.id;
    ELSE
      v_classe_id := NEW.classe_id;
      v_topico_id := NEW.id;
    END IF;

  ELSIF TG_TABLE_NAME = 'conteudos' THEN
    v_trigger_source := 'db_conteudo_trigger';
    IF TG_OP = 'DELETE' THEN
      v_topico_id   := OLD.topico_id;
      v_conteudo_id := OLD.id;
    ELSE
      v_topico_id   := NEW.topico_id;
      v_conteudo_id := NEW.id;
      -- Mover conteudo de topico afeta os DOIS lados: o de destino ganha o
      -- material e o de origem precisa ser reavaliado sem ele. O console fazia
      -- isso com duas chamadas (`conteudo_movido_de_topico_console`); num
      -- trigger de linha o OLD ja esta aqui, entao da' para cobrir de uma vez.
      IF TG_OP = 'UPDATE' AND OLD.topico_id IS DISTINCT FROM NEW.topico_id THEN
        v_topico_origem := OLD.topico_id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'atividades' THEN
    v_trigger_source := 'db_atividade_trigger';
    IF TG_OP = 'DELETE' THEN v_topico_id := OLD.topico_id;
    ELSE v_topico_id := NEW.topico_id; END IF;

  ELSIF TG_TABLE_NAME = 'questoes' THEN
    v_trigger_source := 'db_questao_trigger';
    SELECT a.topico_id INTO v_topico_id
    FROM atividades a
    WHERE a.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.atividade_id ELSE NEW.atividade_id END;

  ELSE
    v_trigger_source := 'db_card_trigger';
    v_conteudo_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.conteudo_id ELSE NEW.conteudo_id END;
    SELECT c.topico_id INTO v_topico_id FROM conteudos c WHERE c.id = v_conteudo_id;
  END IF;

  IF v_classe_id IS NULL AND v_topico_id IS NOT NULL THEN
    SELECT t.classe_id INTO v_classe_id FROM topicos t WHERE t.id = v_topico_id;
  END IF;

  -- Cascata pode ter levado o pai junto (excluir conteudo apaga os cards): sem
  -- classe nao ha job a que pertencer, e nao ha o que regenerar.
  IF v_classe_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Portao de geracao manual. Mesma semantica de
  --    ProfessorRepository.buscar_geracao_automatica_por_classe: ausencia de
  --    dado NUNCA bloqueia, so um desligamento explicito do professor.
  SELECT p.geracao_automatica
    INTO v_geracao_auto
  FROM classe c
  JOIN professor p ON p.id = c.professor_id
  WHERE c.id = v_classe_id;

  IF v_geracao_auto IS NOT NULL AND NOT v_geracao_auto THEN
    RETURN NULL;
  END IF;

  v_reason := CASE TG_TABLE_NAME
    WHEN 'topicos'    THEN lower(TG_OP) || '_topico_db'
    WHEN 'conteudos'  THEN lower(TG_OP) || '_conteudo_db'
    WHEN 'atividades' THEN lower(TG_OP) || '_atividade_db'
    WHEN 'questoes'   THEN lower(TG_OP) || '_questao_db'
    ELSE lower(TG_OP) || '_card_db'
  END;

  -- Um topico removido nao entra no escopo: a linha nao existe mais e
  -- personalizacao_job_targets.topico_id tem FK para topicos. O mesmo vale
  -- quando o topico ja sumiu por cascata antes de chegarmos aqui.
  IF v_topico_id IS NULL OR (TG_TABLE_NAME = 'topicos' AND TG_OP = 'DELETE') THEN
    v_topico_ids := ARRAY[]::bigint[];
  ELSE
    v_topico_ids := ARRAY[v_topico_id];
  END IF;

  -- conteudo_ids vazio significa "o topico inteiro", nao "nenhum conteudo".
  -- Card e' sempre escopado no conteudo dono dele, inclusive na remocao: o
  -- conteudo continua existindo e e' ele que precisa ser regerado sem o card.
  -- Atividade e questao nao tem conteudo proprio: escopo e' o topico inteiro.
  IF TG_TABLE_NAME = 'cards' AND v_conteudo_id IS NOT NULL THEN
    v_conteudo_ids := ARRAY[v_conteudo_id];
  ELSIF TG_TABLE_NAME = 'conteudos' AND TG_OP <> 'DELETE' THEN
    v_conteudo_ids := ARRAY[v_conteudo_id];
  ELSE
    v_conteudo_ids := ARRAY[]::bigint[];
  END IF;

  -- Topico de origem de um conteudo movido entra no escopo inteiro (nao da'
  -- para escopar num conteudo que nao mora mais nele). So quando ele e' da
  -- MESMA classe: um job pertence a uma classe so, e mover entre classes
  -- teria de virar dois jobs -- caso que o console nem oferece.
  IF v_topico_origem IS NOT NULL
     AND EXISTS (SELECT 1 FROM topicos t WHERE t.id = v_topico_origem AND t.classe_id = v_classe_id)
  THEN
    v_topico_ids   := v_topico_ids || v_topico_origem;
    v_conteudo_ids := ARRAY[]::bigint[];
    v_reason       := 'conteudo_movido_de_topico_db';
  END IF;

  v_removidos := CASE
    WHEN TG_OP = 'DELETE' THEN jsonb_build_array(
      jsonb_build_object('tabela', TG_TABLE_NAME, 'id', COALESCE(v_conteudo_id, v_topico_id))
    )
    ELSE '[]'::jsonb
  END;

  -- 3. Coalescencia. Trava o job pending da classe para que as N transacoes de
  --    uma reordenacao serializem aqui e virem um job so.
  SELECT j.id
    INTO v_job_id
  FROM personalizacao_jobs j
  WHERE j.kind = 'class_delta_sync'
    AND j.classe_id = v_classe_id
    AND j.status = 'pending'
  ORDER BY j.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_job_id IS NULL THEN
    v_prev_topicos   := ARRAY[]::bigint[];
    v_prev_conteudos := ARRAY[]::bigint[];
    v_escopo_total   := (cardinality(v_conteudo_ids) = 0);

    INSERT INTO personalizacao_jobs (kind, status, classe_id, trigger_source, payload)
    VALUES ('class_delta_sync', 'pending', v_classe_id, v_trigger_source, '{}'::jsonb)
    RETURNING id INTO v_job_id;
  ELSE
    SELECT
      COALESCE((
        SELECT array_agg(e.valor::bigint)
        FROM jsonb_array_elements_text(COALESCE(j.payload -> 'topico_ids', '[]'::jsonb)) AS e(valor)
      ), ARRAY[]::bigint[]),
      COALESCE((
        SELECT array_agg(e.valor::bigint)
        FROM jsonb_array_elements_text(COALESCE(j.payload -> 'conteudo_ids', '[]'::jsonb)) AS e(valor)
      ), ARRAY[]::bigint[]),
      COALESCE(j.payload -> 'removidos', '[]'::jsonb) || v_removidos
      INTO v_prev_topicos, v_prev_conteudos, v_removidos
    FROM personalizacao_jobs j
    WHERE j.id = v_job_id;

    -- Se QUALQUER um dos lados pediu o topico inteiro, a fusao e' o topico
    -- inteiro. A uniao crua de conteudo_ids encolheria o escopo.
    v_escopo_total := (cardinality(v_conteudo_ids) = 0)
                   OR (cardinality(v_prev_conteudos) = 0 AND cardinality(v_prev_topicos) > 0);
  END IF;

  v_topico_ids := ARRAY(
    SELECT DISTINCT u FROM unnest(v_prev_topicos || v_topico_ids) AS u ORDER BY u
  );

  IF v_escopo_total THEN
    v_conteudo_ids := ARRAY[]::bigint[];
  ELSE
    v_conteudo_ids := ARRAY(
      SELECT DISTINCT u FROM unnest(v_prev_conteudos || v_conteudo_ids) AS u ORDER BY u
    );
  END IF;

  -- 4. Targets: 7 perfis BrainHex x representante x (topico, conteudo). Mesma
  --    forma de _build_targets em api/app/services/personalizacao_jobs.py: um
  --    aluno representante por perfil (o primeiro da turma com aquele perfil
  --    dominante, senao o primeiro aluno da turma), e is_profile_template
  --    marca quando o material nao e' do perfil do proprio dono.
  WITH alunos AS (
    SELECT DISTINCT ca.aluno_id
    FROM classe_aluno ca
    WHERE ca.classe_id = v_classe_id
  ),
  dominante AS (
    SELECT
      a.aluno_id,
      COALESCE((
        SELECT lower(pf.nome)
        FROM aluno_perfil ap
        JOIN perfil pf ON pf.id = ap.perfil_id
        WHERE ap.aluno_id = a.aluno_id
        ORDER BY ap.afinidade DESC NULLS LAST, pf.nome ASC
        LIMIT 1
      ), 'mastermind') AS perfil
    FROM alunos a
  ),
  perfis(chave) AS (
    VALUES ('seeker'), ('survivor'), ('daredevil'), ('mastermind'),
           ('conqueror'), ('socializer'), ('achiever')
  ),
  representante AS (
    SELECT
      p.chave,
      COALESCE(
        (SELECT d.aluno_id FROM dominante d WHERE d.perfil = p.chave ORDER BY d.aluno_id LIMIT 1),
        (SELECT d.aluno_id FROM dominante d ORDER BY d.aluno_id LIMIT 1)
      ) AS aluno_id
    FROM perfis p
  ),
  escopo AS (
    SELECT t.id AS topico_id, c.id AS conteudo_id
    FROM topicos t
    JOIN conteudos c ON c.topico_id = t.id
    WHERE t.id = ANY(v_topico_ids)
      AND (cardinality(v_conteudo_ids) = 0 OR c.id = ANY(v_conteudo_ids))
    UNION ALL
    -- Topico sem conteudo no escopo ainda gera o material agregado do topico.
    SELECT t.id, NULL::bigint
    FROM topicos t
    WHERE t.id = ANY(v_topico_ids)
      AND NOT EXISTS (
        SELECT 1 FROM conteudos c2
        WHERE c2.topico_id = t.id
          AND (cardinality(v_conteudo_ids) = 0 OR c2.id = ANY(v_conteudo_ids))
      )
  )
  INSERT INTO personalizacao_job_targets (
    job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key, is_profile_template, status
  )
  SELECT
    v_job_id,
    r.aluno_id,
    e.topico_id,
    e.conteudo_id,
    r.chave,
    (d.perfil IS DISTINCT FROM r.chave),
    'pending'
  FROM escopo e
  CROSS JOIN representante r
  LEFT JOIN dominante d ON d.aluno_id = r.aluno_id
  WHERE r.aluno_id IS NOT NULL
  ON CONFLICT (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key)
    WHERE media_kind IS NULL
  DO NOTHING;

  -- 5. Payload e contadores saem do que FOI persistido, nunca do conjunto
  --    pre-insercao: numa fusao o job ja tem targets de eventos anteriores.
  SELECT
    COUNT(*)::integer,
    COALESCE(
      jsonb_object_agg(
        t.aluno_id::text || ':' || t.topico_id::text || ':' || COALESCE(t.conteudo_id, 0)::text,
        t.brainhex_profile_key
      ),
      '{}'::jsonb
    )
    INTO v_total, v_profile_map
  FROM personalizacao_job_targets t
  WHERE t.job_id = v_job_id
    AND t.media_kind IS NULL;

  v_job_topico_id := CASE WHEN cardinality(v_topico_ids) = 1 THEN v_topico_ids[1] END;

  -- conteudo_id em personalizacao_jobs tem FK para conteudos: so pode sair de
  -- um conteudo que os targets confirmaram existir, nunca do id cru do evento
  -- (um DELETE de conteudo ja apagou a linha e quebraria a FK).
  SELECT CASE WHEN COUNT(DISTINCT t.conteudo_id) = 1 THEN MIN(t.conteudo_id) END
    INTO v_job_conteudo_id
  FROM personalizacao_job_targets t
  WHERE t.job_id = v_job_id
    AND t.media_kind IS NULL
    AND t.conteudo_id IS NOT NULL;

  UPDATE personalizacao_jobs
     SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
           'reason', v_reason,
           'topico_ids', to_jsonb(v_topico_ids),
           'conteudo_ids', to_jsonb(v_conteudo_ids),
           'removidos', v_removidos,
           'target_profile_map', v_profile_map
         ),
         topico_id = v_job_topico_id,
         conteudo_id = v_job_conteudo_id,
         total_targets = v_total,
         trigger_source = v_trigger_source,
         updated_at = now()
   WHERE id = v_job_id;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Fila quebrada nunca pode derrubar o save do professor.
    RAISE NOTICE 'fn_enqueue_class_delta_job falhou (% em %): %', TG_OP, TG_TABLE_NAME, SQLERRM;
    RETURN NULL;
END;
$fn$;
"""


def upgrade() -> None:
    op.execute(FN_ENQUEUE)

    op.execute("DROP TRIGGER IF EXISTS trg_topicos_class_delta_job ON topicos")
    op.execute(
        """
        CREATE TRIGGER trg_topicos_class_delta_job
        AFTER INSERT OR DELETE OR UPDATE OF nome, descricao, ordem, next, depende
        ON topicos
        FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_class_delta_job()
        """
    )

    op.execute("DROP TRIGGER IF EXISTS trg_conteudos_class_delta_job ON conteudos")
    op.execute(
        """
        CREATE TRIGGER trg_conteudos_class_delta_job
        AFTER INSERT OR DELETE OR UPDATE OF titulo, tipo, conteudo, ordem, metadata, topico_id
        ON conteudos
        FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_class_delta_job()
        """
    )

    op.execute("DROP TRIGGER IF EXISTS trg_atividades_class_delta_job ON atividades")
    op.execute(
        """
        CREATE TRIGGER trg_atividades_class_delta_job
        AFTER INSERT OR DELETE OR UPDATE OF titulo, descricao, tipo, pontuacao_maxima,
                                            data_entrega, metadata, topico_id
        ON atividades
        FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_class_delta_job()
        """
    )

    op.execute("DROP TRIGGER IF EXISTS trg_questoes_class_delta_job ON questoes")
    op.execute(
        """
        CREATE TRIGGER trg_questoes_class_delta_job
        AFTER INSERT OR DELETE OR UPDATE OF enunciado, tipo, alternativas, resposta_correta,
                                            midia_url, nota_estabelecida, atividade_id
        ON questoes
        FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_class_delta_job()
        """
    )

    op.execute("DROP TRIGGER IF EXISTS trg_cards_class_delta_job ON cards")
    op.execute(
        """
        CREATE TRIGGER trg_cards_class_delta_job
        AFTER INSERT OR DELETE OR UPDATE OF titulo, descricao, imagem_url, cor, ordem, conteudo_id
        ON cards
        FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_class_delta_job()
        """
    )

    op.execute("DROP POLICY IF EXISTS personalizacao_jobs_professor_sel ON personalizacao_jobs")
    op.execute(
        """
        CREATE POLICY personalizacao_jobs_professor_sel ON personalizacao_jobs
          FOR SELECT TO authenticated
          USING (classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS personalizacao_jobs_professor_sel ON personalizacao_jobs")
    op.execute("DROP TRIGGER IF EXISTS trg_cards_class_delta_job ON cards")
    op.execute("DROP TRIGGER IF EXISTS trg_questoes_class_delta_job ON questoes")
    op.execute("DROP TRIGGER IF EXISTS trg_atividades_class_delta_job ON atividades")
    op.execute("DROP TRIGGER IF EXISTS trg_conteudos_class_delta_job ON conteudos")
    op.execute("DROP TRIGGER IF EXISTS trg_topicos_class_delta_job ON topicos")
    op.execute("DROP FUNCTION IF EXISTS public.fn_enqueue_class_delta_job()")
