"""Geração personalizada em lote pelo banco: turma, tópicos ou conteúdos × perfis

O console tinha dois botões que passavam pela API: "gerar" um tópico ou
conteúdo para UM perfil (`POST /jobs/manual-generate`) e "gerar tudo" da turma
para UM perfil (`POST /jobs/manual-generate-all`). Pedir a turma inteira para
os 7 perfis eram 7 cliques, e tópicos ou conteúdos escolhidos não tinham
caminho nenhum.

Enfileirar não tem modelo de linguagem no meio. Pela regra de fronteira do
CLAUDE.md é banco, como já são `class_delta_sync` (20260827_03) e
`student_enrollment` (20261011_02): o console chama `supabase.rpc(...)` e o
pedido entra mesmo com a API fora do ar. Quem processa a fila continua sendo o
worker da API.

`personalizacao_gerar_em_lote(classe, tópicos, conteúdos, perfis)` cria o MESMO
job que `enqueue_personalizacao_job` cria para os kinds manuais
(app/services/personalizacao_jobs.py), para o worker não distinguir:

- kind: `manual_profile_generate_all` quando o pedido é a turma inteira (sem
  tópico e sem conteúdo), `manual_profile_generate` quando tem escopo. Os dois
  estão em `_KINDS_MANUAIS` (furam o circuit breaker, a retomada vale) e em
  `KINDS_BASE_POR_PERFIL` (alvo é base: `aluno_id` NULL, template);
- escopo: os conteúdos pedidos mais todos os conteúdos dos tópicos pedidos;
  tópico pedido sem conteúdo nenhum ganha um alvo (tópico, NULL), como na API.
  Só vale o que é da turma: id de outra turma é ignorado, e pedido em que
  nada sobra é erro (nunca vira "a turma inteira");
- perfis: os pedidos, normalizados (`lower(btrim)`, `socialiser` →
  `socializer`) e só os 7 conhecidos. Lista vazia = os perfis que a turma tem
  (`personalizacao_perfis_da_turma`), e aí o payload vai com
  `brainhex_profile_keys = []`, para o worker continuar filtrando pela turma de
  agora (`_pular_base_de_perfil_ausente`). Pedido explícito nunca é filtrado;
- payload `{reason, topico_ids, conteudo_ids, target_profile_map: {},
  brainhex_profile_keys}` com `topico_ids` = tópicos dos alvos e
  `conteudo_ids` = conteúdos do escopo quando algum conteúdo foi pedido
  (pedido só por tópico grava `[]`, como a API);
- `topico_id`/`conteudo_id` do job só quando há um só.

Uma diferença deliberada: onde a API criaria um job vazio (turma sem aluno e
sem perfil escolhido, ou nenhum id da turma no pedido), a RPC recusa com
`22023` e uma mensagem para o professor. Job de 0 alvos fecha `completed` e
parece "gerou tudo".

Deduplicação e retomada são as da API, com a MESMA trava
(`personalizacao_enfileirar:<kind>:<classe>:None`, `hashtextextended`): um
pedido igual a um job `pending`/`processing` devolve esse job; igual a um job
`partial`/`failed` com alvo por fazer reabre só os alvos `failed`/`pending`
(tentativas zeradas). Pedido igual é o mesmo `topico_ids`, `conteudo_ids` e
`brainhex_profile_keys` normalizados. Um clique duplo no console, ou o mesmo
pedido pela API e pela RPC, cai num job só.

A posse é conferida ANTES de ler qualquer coisa (`app_classes_do_professor()`).
As duas funções são `SECURITY DEFINER` porque `personalizacao_jobs` não tem
policy de INSERT para o professor, e só `authenticated` pode executá-las.

Revision ID: 20261115_03
Revises: 20261115_02
Create Date: 2026-11-15
"""

from alembic import op

revision = "20261115_03"
down_revision = "20261115_02"
branch_labels = None
depends_on = None


SQL = r"""
-- Os 7 perfis em ordem canônica (_BRAINHEX_PROFILE_KEYS) e a normalização de
-- _normalize_profile_key. Chave desconhecida sai NULL: quem chama descarta.
CREATE OR REPLACE FUNCTION public.fn_personalizacao_perfil_normalizado(p_perfil text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp AS $function$
  SELECT CASE lower(btrim(coalesce(p_perfil, '')))
    WHEN 'socialiser' THEN 'socializer'
    WHEN 'seeker' THEN 'seeker'
    WHEN 'survivor' THEN 'survivor'
    WHEN 'daredevil' THEN 'daredevil'
    WHEN 'mastermind' THEN 'mastermind'
    WHEN 'conqueror' THEN 'conqueror'
    WHEN 'socializer' THEN 'socializer'
    WHEN 'achiever' THEN 'achiever'
  END
$function$;

CREATE OR REPLACE FUNCTION public.fn_personalizacao_ordem_do_perfil(p_perfil text)
RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp AS $function$
  SELECT array_position(
    ARRAY['seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer', 'achiever'],
    p_perfil
  )
$function$;

-- Perfis que algum aluno da turma tem como principal ou representativo: a
-- regra de _perfis_presentes_na_turma. Aluno sem aluno_perfil conta como
-- mastermind. Sem posse da turma, lista vazia.
CREATE OR REPLACE FUNCTION public.personalizacao_perfis_da_turma(p_classe_id bigint)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_perfis text[];
BEGIN
  -- Sem sessão não há professor: nada a mostrar. A posse vem logo abaixo.
  IF auth.uid() IS NULL OR p_classe_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minhas(id) WHERE minhas.id = p_classe_id) THEN
    RETURN ARRAY[]::text[];
  END IF;

  WITH alunos_turma AS (
    SELECT DISTINCT ca.aluno_id FROM public.classe_aluno ca WHERE ca.classe_id = p_classe_id
  ),
  presentes AS (
    -- Principal: 1º de afinidade DESC NULLS LAST, nome ASC (a mesma ordem da API).
    SELECT coalesce(
      public.fn_personalizacao_perfil_normalizado((
        SELECT p.nome
          FROM public.aluno_perfil ap
          JOIN public.perfil p ON p.id = ap.perfil_id
         WHERE ap.aluno_id = at.aluno_id
         ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
         LIMIT 1
      )),
      'mastermind'
    ) AS perfil
      FROM alunos_turma at
    UNION
    SELECT public.fn_personalizacao_perfil_normalizado(r.perfil)
      FROM alunos_turma at
      CROSS JOIN LATERAL unnest(public.app_perfis_representativos(at.aluno_id)) AS r(perfil)
  )
  SELECT coalesce(array_agg(perfil ORDER BY public.fn_personalizacao_ordem_do_perfil(perfil)), ARRAY[]::text[])
    INTO v_perfis
    FROM presentes
   WHERE perfil IS NOT NULL;

  RETURN v_perfis;
END;
$function$;

CREATE OR REPLACE FUNCTION public.personalizacao_gerar_em_lote(
  p_classe_id bigint,
  p_topico_ids bigint[] DEFAULT NULL,
  p_conteudo_ids bigint[] DEFAULT NULL,
  p_perfis text[] DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_turma_inteira  boolean := cardinality(coalesce(p_topico_ids, ARRAY[]::bigint[])) = 0
                              AND cardinality(coalesce(p_conteudo_ids, ARRAY[]::bigint[])) = 0;
  v_kind           text;
  v_pedidos        text[];  -- perfis pedidos, normalizados ([] = os da turma)
  v_perfis         text[];  -- perfis que viram alvo
  v_topicos_ped    bigint[];
  v_conteudos_ped  bigint[];
  v_alvos_topicos  bigint[];
  v_payload_cont   bigint[];
  v_conteudos_alvo bigint[];
  v_job            record;
  v_reabertos      integer;
BEGIN
  -- DEFINER ignora a RLS: a sessão e a posse da turma são a única barreira.
  IF auth.uid() IS NULL OR p_classe_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minhas(id) WHERE minhas.id = p_classe_id) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  v_kind := CASE WHEN v_turma_inteira THEN 'manual_profile_generate_all' ELSE 'manual_profile_generate' END;

  SELECT coalesce(array_agg(DISTINCT n ORDER BY n), ARRAY[]::text[])
    INTO v_pedidos
    FROM (SELECT public.fn_personalizacao_perfil_normalizado(x) AS n FROM unnest(coalesce(p_perfis, ARRAY[]::text[])) AS x) s
   WHERE n IS NOT NULL;
  -- Ordem alfabética no payload (sorted() da API); a canônica só nos alvos.
  v_perfis := CASE
    WHEN cardinality(v_pedidos) > 0 THEN
      (SELECT array_agg(n ORDER BY public.fn_personalizacao_ordem_do_perfil(n)) FROM unnest(v_pedidos) AS n)
    ELSE public.personalizacao_perfis_da_turma(p_classe_id)
  END;
  IF cardinality(coalesce(p_perfis, ARRAY[]::text[])) > 0 AND cardinality(v_pedidos) = 0 THEN
    RAISE EXCEPTION 'Nenhum perfil BrainHex reconhecido no pedido.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_perfis) = 0 THEN
    RAISE EXCEPTION 'A turma ainda não tem aluno, então não tem perfil. Escolha os perfis.' USING ERRCODE = '22023';
  END IF;

  -- Escopo: só o que é desta turma.
  IF v_turma_inteira THEN
    SELECT coalesce(array_agg(t.id ORDER BY t.id), ARRAY[]::bigint[])
      INTO v_topicos_ped
      FROM public.topicos t WHERE t.classe_id = p_classe_id;
    v_conteudos_ped := ARRAY[]::bigint[];
  ELSE
    SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::bigint[])
      INTO v_topicos_ped
      FROM public.topicos t
     WHERE t.classe_id = p_classe_id AND t.id = ANY(coalesce(p_topico_ids, ARRAY[]::bigint[]));
    SELECT coalesce(array_agg(DISTINCT c.id ORDER BY c.id), ARRAY[]::bigint[])
      INTO v_conteudos_ped
      FROM public.conteudos c
      JOIN public.topicos t ON t.id = c.topico_id
     WHERE t.classe_id = p_classe_id AND c.id = ANY(coalesce(p_conteudo_ids, ARRAY[]::bigint[]));
  END IF;

  SELECT coalesce(array_agg(DISTINCT c.id ORDER BY c.id), ARRAY[]::bigint[])
    INTO v_conteudos_alvo
    FROM public.conteudos c
   WHERE c.id = ANY(v_conteudos_ped) OR c.topico_id = ANY(v_topicos_ped);

  -- Tópicos dos alvos: os dos conteúdos e os pedidos que não têm conteúdo.
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), ARRAY[]::bigint[])
    INTO v_alvos_topicos
    FROM (
      SELECT c.topico_id AS x FROM public.conteudos c WHERE c.id = ANY(v_conteudos_alvo)
      UNION
      SELECT t FROM unnest(v_topicos_ped) AS t
    ) s;

  IF cardinality(v_alvos_topicos) = 0 THEN
    RAISE EXCEPTION 'Nada a gerar: nenhum tópico ou conteúdo desta turma no pedido.' USING ERRCODE = '22023';
  END IF;

  v_payload_cont := CASE WHEN cardinality(v_conteudos_ped) > 0 THEN v_conteudos_alvo ELSE ARRAY[]::bigint[] END;

  -- A mesma trava da API (travar_enfileiramento): f"...:{aluno_id}" com None. O ':' fica
  -- separado de 'None' porque o text() do Alembic leria os dois juntos como parâmetro.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'personalizacao_enfileirar:' || v_kind || ':' || p_classe_id || ':' || 'None', 0));

  -- Pedido igual já aberto: devolve esse job.
  SELECT j.* INTO v_job
    FROM public.personalizacao_jobs j
   WHERE j.kind = v_kind
     AND j.classe_id = p_classe_id
     AND j.status IN ('pending', 'processing')
     AND public.fn_personalizacao_ids_do_payload(j.payload, 'topico_ids') = v_alvos_topicos
     AND public.fn_personalizacao_ids_do_payload(j.payload, 'conteudo_ids') = v_payload_cont
     AND public.fn_personalizacao_perfis_do_payload(j.payload) = v_pedidos
   ORDER BY j.created_at DESC, j.id DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('job_id', v_job.id, 'kind', v_job.kind, 'status', v_job.status,
                              'total_targets', v_job.total_targets, 'existente', true, 'retomado', false);
  END IF;

  -- Pedido igual que terminou partial/failed com alvo por fazer: retoma.
  FOR v_job IN
    SELECT j.*
      FROM public.personalizacao_jobs j
     WHERE j.kind = v_kind
       AND j.classe_id = p_classe_id
       AND j.status IN ('partial', 'failed')
       AND public.fn_personalizacao_ids_do_payload(j.payload, 'topico_ids') = v_alvos_topicos
       AND public.fn_personalizacao_ids_do_payload(j.payload, 'conteudo_ids') = v_payload_cont
       AND public.fn_personalizacao_perfis_do_payload(j.payload) = v_pedidos
       AND EXISTS (SELECT 1 FROM public.personalizacao_job_targets t
                    WHERE t.job_id = j.id AND t.status IN ('failed', 'pending'))
     ORDER BY j.created_at DESC, j.id DESC
  LOOP
    UPDATE public.personalizacao_job_targets
       SET status = 'pending', attempts = 0, last_error = NULL, updated_at = now()
     WHERE job_id = v_job.id AND status IN ('failed', 'pending');
    GET DIAGNOSTICS v_reabertos = ROW_COUNT;
    CONTINUE WHEN v_reabertos = 0;
    UPDATE public.personalizacao_jobs
       SET status = 'pending', finished_at = NULL, last_error = NULL, updated_at = now()
     WHERE id = v_job.id;
    RETURN jsonb_build_object('job_id', v_job.id, 'kind', v_job.kind, 'status', 'pending',
                              'total_targets', v_job.total_targets, 'existente', true, 'retomado', true,
                              'alvos_reabertos', v_reabertos);
  END LOOP;

  INSERT INTO public.personalizacao_jobs (
    kind, status, classe_id, aluno_id, topico_id, conteudo_id,
    trigger_source, payload, media_snapshot, total_targets
  ) VALUES (
    v_kind, 'pending', p_classe_id, NULL,
    CASE WHEN cardinality(v_alvos_topicos) = 1 THEN v_alvos_topicos[1] END,
    CASE WHEN cardinality(v_conteudos_alvo) = 1 THEN v_conteudos_alvo[1] END,
    'web_console',
    jsonb_build_object(
      'reason', CASE WHEN v_turma_inteira THEN 'geracao_em_lote_turma_console' ELSE 'geracao_em_lote_console' END,
      'topico_ids', to_jsonb(v_alvos_topicos),
      'conteudo_ids', to_jsonb(v_payload_cont),
      'target_profile_map', '{}'::jsonb,
      'brainhex_profile_keys', to_jsonb(v_pedidos)
    ),
    '{}'::jsonb,
    0
  )
  RETURNING * INTO v_job;

  -- Um alvo de base por (conteúdo × perfil); tópico sem conteúdo, (tópico, NULL).
  INSERT INTO public.personalizacao_job_targets (
    job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key,
    is_profile_template, status, attempts, created_at, updated_at
  )
  SELECT v_job.id, NULL, alvo.topico_id, alvo.conteudo_id, perfil.chave,
         true, 'pending', 0, now(), now()
    FROM (
      SELECT c.topico_id, c.id AS conteudo_id
        FROM public.conteudos c
       WHERE c.id = ANY(v_conteudos_alvo)
      UNION ALL
      SELECT t, NULL::bigint
        FROM unnest(v_topicos_ped) AS t
       WHERE NOT EXISTS (SELECT 1 FROM public.conteudos c WHERE c.topico_id = t)
    ) AS alvo
    CROSS JOIN unnest(v_perfis) AS perfil(chave)
   ORDER BY alvo.topico_id, alvo.conteudo_id NULLS FIRST, public.fn_personalizacao_ordem_do_perfil(perfil.chave);

  UPDATE public.personalizacao_jobs j
     SET total_targets = (SELECT count(*)::integer FROM public.personalizacao_job_targets t WHERE t.job_id = j.id),
         updated_at = now()
   WHERE j.id = v_job.id
  RETURNING * INTO v_job;

  RETURN jsonb_build_object('job_id', v_job.id, 'kind', v_job.kind, 'status', v_job.status,
                            'total_targets', v_job.total_targets, 'existente', false, 'retomado', false);
END;
$function$;
"""

# Comparação de payload como a API faz (_normalized_id_list e sorted()).
# Vêm antes da RPC no upgrade: o corpo plpgsql só as resolve na execução, mas
# a ordem deixa o arquivo legível de cima para baixo.
SQL_PAYLOAD = r"""
CREATE OR REPLACE FUNCTION public.fn_personalizacao_ids_do_payload(p_payload jsonb, p_chave text)
RETURNS bigint[] LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp AS $function$
  SELECT coalesce(array_agg(DISTINCT v::bigint ORDER BY v::bigint), ARRAY[]::bigint[])
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_payload -> p_chave) = 'array' THEN p_payload -> p_chave ELSE '[]'::jsonb END
    ) AS v
   WHERE v IS NOT NULL AND v ~ '^-?[0-9]+$'
$function$;

CREATE OR REPLACE FUNCTION public.fn_personalizacao_perfis_do_payload(p_payload jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp AS $function$
  SELECT coalesce(array_agg(v ORDER BY v), ARRAY[]::text[])
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_payload -> 'brainhex_profile_keys') = 'array'
           THEN p_payload -> 'brainhex_profile_keys' ELSE '[]'::jsonb END
    ) AS v
$function$;
"""

GRANTS = r"""
REVOKE ALL ON FUNCTION public.fn_personalizacao_perfil_normalizado(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_personalizacao_ordem_do_perfil(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_personalizacao_ids_do_payload(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_personalizacao_perfis_do_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.personalizacao_perfis_da_turma(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.personalizacao_gerar_em_lote(bigint, bigint[], bigint[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personalizacao_perfis_da_turma(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.personalizacao_gerar_em_lote(bigint, bigint[], bigint[], text[]) TO authenticated, service_role;
"""


def upgrade() -> None:
    op.execute(SQL_PAYLOAD)
    op.execute(SQL)
    op.execute(GRANTS)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.personalizacao_gerar_em_lote(bigint, bigint[], bigint[], text[])")
    op.execute("DROP FUNCTION IF EXISTS public.personalizacao_perfis_da_turma(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_personalizacao_perfis_do_payload(jsonb)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_personalizacao_ids_do_payload(jsonb, text)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_personalizacao_ordem_do_perfil(text)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_personalizacao_perfil_normalizado(text)")
