"""Matrícula enfileira a personalização do aluno pelo banco (student_enrollment)

Fase 6 do redesign da tela Turmas (docs/frontend/redesign-fase-2/03-analise-turmas.md,
seção 2.3-7). Até aqui o console gravava a matrícula e DEPOIS chamava
POST /api/v1/personalizar/jobs/enrollment. Com a API dormindo, a matrícula
ficava e o job não: o aluno entrava na turma sem material personalizado, sem
aviso. Enfileirar não tem modelo de linguagem no meio — pela regra de
fronteira do CLAUDE.md, é banco, como já é class_delta_sync (20260827_03) e
class_theme_sync.

O job criado aqui é o MESMO que a API cria para o console
(app/services/personalizacao_jobs.py: enqueue_personalizacao_job +
_build_targets, ramo JOB_KIND_ENROLLMENT), para o worker não distinguir:

- escopo: todos os conteúdos da turma e os tópicos que os têm (o console
  mandava conteudo_ids = todos, e com conteúdo explícito a API reduz os
  tópicos aos que têm conteúdo). Turma com tópicos mas sem nenhum conteúdo:
  todos os tópicos, um alvo (tópico, NULL) cada. Turma sem tópico: não
  enfileira — a API criaria um job vazio;
- alvos: um por conteúdo, com o aluno como dono, o perfil DOMINANTE dele
  (maior afinidade; empate pelo nome; sem perfil = mastermind, mesma
  normalização de ConteudoClasseRepository) e is_profile_template = false;
- job: kind student_enrollment, pending, aluno_id, topico_id/conteudo_id só
  quando há um só, total_targets contado do que foi gravado, media_snapshot
  '{}' e payload {reason, topico_ids, conteudo_ids, target_profile_map}.
  trigger_source e reason são próprios ('db_classe_aluno_trigger',
  'matricula_aluno_db'): o worker não os lê, e eles dizem de onde veio.

Deduplicação: não cria se já há job student_enrollment pending ou
processing para o mesmo (turma, aluno) — mesma janela de
list_open_jobs_by_payload da API. Como o escopo gravado é idêntico ao que o
console mandava, um console antigo que ainda chame a API cai na
deduplicação dela e recebe este mesmo job.

Falha ao enfileirar NÃO desfaz a matrícula (bloco de exceção próprio, como
fn_enqueue_classe_mapa_tema_job): o aluno entra na turma de qualquer jeito, e
a falha fica no log do Postgres.

Revision ID: 20261011_02
Revises: 20261011_01
Create Date: 2026-09-30
"""

from alembic import op

revision = "20261011_02"
down_revision = "20261011_01"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_enqueue_student_enrollment_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_conteudos bigint[];
  v_topicos   bigint[];
  v_perfil    text;
  v_job_id    uuid;
BEGIN
  IF NEW.aluno_id IS NULL OR NEW.classe_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- Duas matrículas simultâneas do mesmo aluno na mesma turma não criam
    -- dois jobs.
    PERFORM pg_advisory_xact_lock(hashtext('student_enrollment:' || NEW.classe_id || ':' || NEW.aluno_id::text));

    IF EXISTS (
      SELECT 1 FROM public.personalizacao_jobs j
       WHERE j.kind = 'student_enrollment'
         AND j.classe_id = NEW.classe_id
         AND j.aluno_id = NEW.aluno_id
         AND j.status IN ('pending', 'processing')
    ) THEN
      RETURN NULL;
    END IF;

    SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::bigint[])
      INTO v_conteudos
      FROM public.conteudos c
      JOIN public.topicos t ON t.id = c.topico_id
     WHERE t.classe_id = NEW.classe_id;

    IF cardinality(v_conteudos) > 0 THEN
      SELECT array_agg(DISTINCT c.topico_id ORDER BY c.topico_id)
        INTO v_topicos
        FROM public.conteudos c
       WHERE c.id = ANY(v_conteudos);
    ELSE
      SELECT coalesce(array_agg(t.id ORDER BY t.id), ARRAY[]::bigint[])
        INTO v_topicos
        FROM public.topicos t
       WHERE t.classe_id = NEW.classe_id;
    END IF;

    IF cardinality(v_topicos) = 0 THEN
      RETURN NULL;  -- turma sem trilha: nada a gerar
    END IF;

    -- Perfil dominante: mesma ordem de listar_alunos_classe_com_perfil_dominante
    -- e a mesma normalização de _normalize_profile_key.
    SELECT lower(btrim(p.nome))
      INTO v_perfil
      FROM public.aluno_perfil ap
      JOIN public.perfil p ON p.id = ap.perfil_id
     WHERE ap.aluno_id = NEW.aluno_id
     ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
     LIMIT 1;
    v_perfil := CASE
      WHEN v_perfil IS NULL OR v_perfil = '' THEN 'mastermind'
      WHEN v_perfil = 'socialiser' THEN 'socializer'
      ELSE v_perfil
    END;

    INSERT INTO public.personalizacao_jobs (
      kind, status, classe_id, aluno_id, topico_id, conteudo_id,
      trigger_source, payload, media_snapshot, total_targets
    ) VALUES (
      'student_enrollment', 'pending', NEW.classe_id, NEW.aluno_id,
      CASE WHEN cardinality(v_topicos) = 1 THEN v_topicos[1] END,
      CASE WHEN cardinality(v_conteudos) = 1 THEN v_conteudos[1] END,
      'db_classe_aluno_trigger',
      jsonb_build_object(
        'reason', 'matricula_aluno_db',
        'topico_ids', to_jsonb(v_topicos),
        'conteudo_ids', to_jsonb(v_conteudos)
      ),
      '{}'::jsonb,
      0
    )
    RETURNING id INTO v_job_id;

    -- Um alvo por conteúdo; sem conteúdo nenhum, um por tópico (conteudo NULL).
    INSERT INTO public.personalizacao_job_targets (
      job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key,
      is_profile_template, status, attempts, created_at, updated_at
    )
    SELECT v_job_id, NEW.aluno_id, alvo.topico_id, alvo.conteudo_id, v_perfil,
           false, 'pending', 0, now(), now()
      FROM (
        SELECT c.topico_id, c.id AS conteudo_id
          FROM public.conteudos c
         WHERE c.id = ANY(v_conteudos)
        UNION ALL
        SELECT t, NULL::bigint
          FROM unnest(v_topicos) AS t
         WHERE cardinality(v_conteudos) = 0
      ) AS alvo;

    -- Contadores e mapa saem do que FOI gravado (mesma chave de
    -- _target_profile_map_key: "aluno:topico:conteudo_ou_0").
    UPDATE public.personalizacao_jobs j
       SET total_targets = alvos.total,
           payload = j.payload || jsonb_build_object('target_profile_map', alvos.mapa),
           updated_at = now()
      FROM (
        SELECT count(*)::integer AS total,
               coalesce(jsonb_object_agg(
                 t.aluno_id::text || ':' || t.topico_id || ':' || coalesce(t.conteudo_id, 0),
                 t.brainhex_profile_key
               ), '{}'::jsonb) AS mapa
          FROM public.personalizacao_job_targets t
         WHERE t.job_id = v_job_id
      ) AS alvos
     WHERE j.id = v_job_id;
  EXCEPTION WHEN OTHERS THEN
    -- A matrícula vale mesmo se o enfileiramento falhar.
    RAISE WARNING 'fn_enqueue_student_enrollment_job: turma % aluno %: %', NEW.classe_id, NEW.aluno_id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_classe_aluno_enrollment_job ON public.classe_aluno;
CREATE TRIGGER trg_classe_aluno_enrollment_job
  AFTER INSERT ON public.classe_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_student_enrollment_job();
REVOKE ALL ON FUNCTION public.fn_enqueue_student_enrollment_job() FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_classe_aluno_enrollment_job ON public.classe_aluno")
    op.execute("DROP FUNCTION IF EXISTS public.fn_enqueue_student_enrollment_job()")
