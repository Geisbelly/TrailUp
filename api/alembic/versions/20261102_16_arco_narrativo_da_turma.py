"""Arco narrativo da turma, escrito pelo professor (#145)

## Por quê

A camada narrativa existe só por perfil (guia, assinatura editorial). O'Donovan et al. (§6.4)
mediram que a história do curso foi o elemento pior avaliado porque estava desconectada do
material, e a primeira recomendação (§7) é integrá-la ao conteúdo. Quem escreve o conteúdo é o
professor, então é ele quem escreve o arco. O arco entra na geração do material por perfil
(API e microservice); aqui fica só o que é banco: guardar e marcar para regerar.

## O que entra

`classe_arco_narrativo`: uma linha por turma (`classe_id` é a chave), com o texto do arco.
Sem linha = sem arco, e a geração segue igual a antes.

- **RLS e policy no mesmo commit.** O professor dono lê e escreve a linha da própria turma
  (`app_classes_do_professor()`). O aluno **não lê**: a issue não pede, e o arco chega a ele só
  dentro do material gerado. Anônimo não tem GRANT. A API lê como `service_role`.
- **Texto de 1 a 3000 caracteres** (depois do `btrim`). Apagar o arco é apagar a linha, não
  gravar texto vazio. O teto é o mesmo que o microservice aceita em `class_story_arc`.
- `updated_at` e `atualizado_por` saem do gatilho, não do cliente.

## Editar o arco marca a turma para regerar

O arco entra no `source_hash` do material (`_build_source_hash`), então material com o arco
antigo deixa de valer. Sem um job, porém, nada o regeraria até a próxima edição de conteúdo, e
"o professor mudou a história e nada aconteceu" é a armadilha que a issue aponta.

`fn_enqueue_arco_narrativo_job` (AFTER INSERT, UPDATE OF texto, DELETE) faz o mesmo que
`fn_enqueue_class_delta_job` faz para o editor de trilha, com escopo de **turma inteira**:

- job `class_delta_sync` com todos os tópicos da turma e `conteudo_ids` vazio (o tópico
  inteiro), e os 7 perfis por (tópico, conteúdo), sem dono. Mesma forma de target da
  `20260827_05`;
- **coalescência:** se já há job `pending` da turma, trava a linha (`FOR UPDATE`) e funde nele.
  Como o arco pede tudo, a fusão vira a turma inteira. Job em `processing` nunca é reaproveitado;
- **portão de geração manual:** professor com `geracao_automatica = false` não ganha job, como no
  editor. O hash muda do mesmo jeito, e o material é regerado quando ele pedir;
- UPDATE que não muda o texto (fora espaço nas pontas) não enfileira;
- turma sem tópico, ou já apagada (o DELETE em cascata da turma também apaga o arco), não
  enfileira;
- falha ao enfileirar nunca desfaz o save do professor (`EXCEPTION WHEN OTHERS`).

Enfileirar não tem modelo de linguagem no meio, então é banco (regra de fronteira). Quem processa
o job continua sendo o worker da API.

Sem `%` no SQL (o SQL offline do Alembic o dobra): o aviso de falha usa `RAISE ... USING MESSAGE`.

## Fora daqui

`duplicar_classe` não copia o arco. Copiar exige refazer o corpo daquela função, e a cópia de
turma já deixa de fora a personalização; fica como evolução.

## Downgrade

Derruba os gatilhos, as funções e a tabela (o texto dos arcos se perde).

Revision ID: 20261102_16
Revises: 20261102_15
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_16"
down_revision = "20261102_15"
branch_labels = None
depends_on = None

TEXTO_MAXIMO = 3000

TABELA = f"""
CREATE TABLE IF NOT EXISTS public.classe_arco_narrativo (
  classe_id bigint NOT NULL,
  texto text NOT NULL,
  atualizado_por uuid NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT classe_arco_narrativo_pkey PRIMARY KEY (classe_id),
  CONSTRAINT classe_arco_narrativo_classe_id_fkey
    FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE CASCADE,
  CONSTRAINT classe_arco_narrativo_texto_chk
    CHECK (char_length(btrim(texto)) BETWEEN 1 AND {TEXTO_MAXIMO})
);
"""

RLS = """
ALTER TABLE public.classe_arco_narrativo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.classe_arco_narrativo FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classe_arco_narrativo TO authenticated;
GRANT ALL ON public.classe_arco_narrativo TO service_role;
DROP POLICY IF EXISTS classe_arco_narrativo_professor_all ON public.classe_arco_narrativo;
CREATE POLICY classe_arco_narrativo_professor_all ON public.classe_arco_narrativo
  FOR ALL TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));
"""

CARIMBO = """
CREATE OR REPLACE FUNCTION public.fn_classe_arco_narrativo_carimbo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  NEW.updated_at := now();
  NEW.atualizado_por := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.classe_id := OLD.classe_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_classe_arco_narrativo_carimbo ON public.classe_arco_narrativo;
CREATE TRIGGER trg_classe_arco_narrativo_carimbo
  BEFORE INSERT OR UPDATE ON public.classe_arco_narrativo
  FOR EACH ROW EXECUTE FUNCTION public.fn_classe_arco_narrativo_carimbo();
"""

ENFILEIRAR = """
CREATE OR REPLACE FUNCTION public.fn_enqueue_arco_narrativo_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_classe_id     bigint;
  v_geracao_auto  boolean;
  v_job_id        uuid;
  v_topico_ids    bigint[];
  v_prev_topicos  bigint[];
  v_removidos     jsonb;
  v_total         integer;
  v_job_conteudo  bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND btrim(NEW.texto) IS NOT DISTINCT FROM btrim(OLD.texto) THEN
    RETURN NULL;
  END IF;

  v_classe_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.classe_id ELSE NEW.classe_id END;

  -- Apagar a turma apaga o arco em cascata: sem turma, nao ha o que regerar.
  IF NOT EXISTS (SELECT 1 FROM classe c WHERE c.id = v_classe_id) THEN
    RETURN NULL;
  END IF;

  -- Portao de geracao manual, com a mesma semantica de fn_enqueue_class_delta_job: ausencia de
  -- dado nunca bloqueia, so um desligamento explicito do professor.
  SELECT p.geracao_automatica
    INTO v_geracao_auto
  FROM classe c
  JOIN professor p ON p.id = c.professor_id
  WHERE c.id = v_classe_id;

  IF v_geracao_auto IS NOT NULL AND NOT v_geracao_auto THEN
    RETURN NULL;
  END IF;

  -- O arco vale para todo material da turma: escopo e todo topico, inteiro.
  v_topico_ids := ARRAY(SELECT t.id FROM topicos t WHERE t.classe_id = v_classe_id ORDER BY t.id);
  IF cardinality(v_topico_ids) = 0 THEN
    RETURN NULL;
  END IF;

  -- Coalescencia: o job pending da turma absorve o pedido. O arco pede o topico inteiro, entao
  -- a fusao tambem e o topico inteiro (conteudo_ids vazio).
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
    v_prev_topicos := ARRAY[]::bigint[];
    v_removidos := '[]'::jsonb;
    INSERT INTO personalizacao_jobs (kind, status, classe_id, trigger_source, payload)
    VALUES ('class_delta_sync', 'pending', v_classe_id, 'db_arco_narrativo_trigger', '{}'::jsonb)
    RETURNING id INTO v_job_id;
  ELSE
    SELECT
      COALESCE((
        SELECT array_agg(e.valor::bigint)
        FROM jsonb_array_elements_text(COALESCE(j.payload -> 'topico_ids', '[]'::jsonb)) AS e(valor)
      ), ARRAY[]::bigint[]),
      COALESCE(j.payload -> 'removidos', '[]'::jsonb)
      INTO v_prev_topicos, v_removidos
    FROM personalizacao_jobs j
    WHERE j.id = v_job_id;
  END IF;

  v_topico_ids := ARRAY(
    SELECT DISTINCT u FROM unnest(v_prev_topicos || v_topico_ids) AS u ORDER BY u
  );

  -- Targets: 7 perfis BrainHex x (topico, conteudo), sem dono. Mesma forma da 20260827_05.
  WITH perfis(chave) AS (
    VALUES ('seeker'), ('survivor'), ('daredevil'), ('mastermind'),
           ('conqueror'), ('socializer'), ('achiever')
  ),
  escopo AS (
    SELECT t.id AS topico_id, c.id AS conteudo_id
    FROM topicos t
    JOIN conteudos c ON c.topico_id = t.id
    WHERE t.id = ANY(v_topico_ids)
    UNION ALL
    SELECT t.id, NULL::bigint
    FROM topicos t
    WHERE t.id = ANY(v_topico_ids)
      AND NOT EXISTS (SELECT 1 FROM conteudos c2 WHERE c2.topico_id = t.id)
  )
  INSERT INTO personalizacao_job_targets (
    job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key, is_profile_template, status
  )
  SELECT v_job_id, NULL::uuid, e.topico_id, e.conteudo_id, p.chave, true, 'pending'
  FROM escopo e
  CROSS JOIN perfis p
  -- uq_job_target_base nao deduplica conteudo_id NULL (topico sem conteudo): sem isto, cada
  -- fusao repetiria esses alvos. A linha do job esta travada, entao a checagem nao corre.
  WHERE NOT EXISTS (
    SELECT 1 FROM personalizacao_job_targets x
    WHERE x.job_id = v_job_id
      AND x.topico_id = e.topico_id
      AND x.conteudo_id IS NOT DISTINCT FROM e.conteudo_id
      AND x.brainhex_profile_key = p.chave
      AND x.aluno_id IS NULL
      AND x.media_kind IS NULL
  )
  -- ON CONFLICT sobre indice PARCIAL exige repetir o predicado (uq_job_target_base).
  ON CONFLICT (job_id, topico_id, conteudo_id, brainhex_profile_key)
    WHERE media_kind IS NULL AND aluno_id IS NULL
  DO NOTHING;

  -- Contadores saem do que foi persistido: numa fusao o job ja tem targets de antes.
  SELECT COUNT(*)::integer
    INTO v_total
  FROM personalizacao_job_targets t
  WHERE t.job_id = v_job_id
    AND t.media_kind IS NULL;

  SELECT CASE WHEN COUNT(DISTINCT t.conteudo_id) = 1 THEN MIN(t.conteudo_id) END
    INTO v_job_conteudo
  FROM personalizacao_job_targets t
  WHERE t.job_id = v_job_id
    AND t.media_kind IS NULL
    AND t.conteudo_id IS NOT NULL;

  UPDATE personalizacao_jobs
     SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
           'reason', lower(TG_OP) || '_arco_narrativo_db',
           'topico_ids', to_jsonb(v_topico_ids),
           'conteudo_ids', '[]'::jsonb,
           'removidos', v_removidos,
           'target_profile_map', '{}'::jsonb
         ),
         topico_id = CASE WHEN cardinality(v_topico_ids) = 1 THEN v_topico_ids[1] END,
         conteudo_id = v_job_conteudo,
         total_targets = v_total,
         trigger_source = 'db_arco_narrativo_trigger',
         updated_at = now()
   WHERE id = v_job_id;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Fila quebrada nunca pode derrubar o save do professor.
    RAISE NOTICE USING MESSAGE = 'fn_enqueue_arco_narrativo_job falhou (' || TG_OP || '): ' || SQLERRM;
    RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_enqueue_arco_narrativo_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_classe_arco_narrativo_enfileira ON public.classe_arco_narrativo;
CREATE TRIGGER trg_classe_arco_narrativo_enfileira
  AFTER INSERT OR UPDATE OF texto OR DELETE ON public.classe_arco_narrativo
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_arco_narrativo_job();
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RLS)
    op.execute(CARIMBO)
    op.execute(ENFILEIRAR)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_classe_arco_narrativo_enfileira ON public.classe_arco_narrativo")
    op.execute("DROP TRIGGER IF EXISTS trg_classe_arco_narrativo_carimbo ON public.classe_arco_narrativo")
    op.execute("DROP FUNCTION IF EXISTS public.fn_enqueue_arco_narrativo_job()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_classe_arco_narrativo_carimbo()")
    op.execute("DROP TABLE IF EXISTS public.classe_arco_narrativo")
