"""Conteúdo idêntico se vincula ao material que já existe, em vez de gerar de novo.

Spec: `docs/superpowers/specs/2026-11-04-reuso-de-personalizacao-design.md`.

Cada turma × tópico × conteúdo × perfil continua com a sua linha em `conteudo_personalizado`, e no
reuso essa linha é o vínculo: cita os mesmos arquivos da linha que gerou. A N:N pedida ("um material,
várias turmas") é a relação entre linhas com a mesma `impressao_conteudo`. Foi uma decisão: uma linha
única com tabela de vínculo reescreveria a RLS, 14 funções e o progresso, e tiraria o material do app
já instalado. Com a linha por turma, RLS, gateway, retenção, trava do estudo, aviso de material novo,
progresso e telemetria seguem iguais, porque todos partem de uma linha da turma.

- `impressao_conteudo`: SHA-256 do que entra na geração, sem nenhum id, URL ou caminho
  (`reuso_personalizacao.py`). `editado` marca material que não serve de origem.
- `vinculado_de_id`: a linha de onde esta veio. `SET NULL`: apagar a turma de origem não leva o
  material das outras, e a retenção só apaga arquivo que ninguém mais cita (`_ainda_usado`).

**Gatilho `trg_conteudo_personalizado_reuso`, BEFORE INSERT OR UPDATE.** Faz duas coisas:

1. **Editar desvincula.** `source_hash` mudou e a impressão não veio junto: as duas colunas zeram.
   Fica no banco para nenhum caminho de código esquecer, e só alcança a linha editada.
2. **Cliente não forja origem.** O professor tem ALL na própria linha (`professor_all_...`) e o reuso
   vale entre professores: sem isto, gravar a impressão de um conteúdo alheio numa linha com material
   inventado serviria esse material a outra turma. Quem escreve como `anon`/`authenticated` não muda
   as duas colunas, e mudar `materiais` ou `plano` por essa via marca `editado`. O mesmo no INSERT.

**`trailup_vincular_personalizacao`** faz o vínculo numa transação: linha da turma, `materiais_gerados`
e cards. Confere a origem de novo sob `FOR SHARE`, porque ela pode ter mudado desde a decisão do
worker. Sem GRANT para os papéis de cliente. `metadata.generation_key` é reescrito para a chave da
linha nova: sem isso `_motivo_da_midia_incompleta` a veria como "geração antiga" e regeraria tudo.

O `UPDATE` da impressão é separado do upsert de propósito: o upsert pode trocar `source_hash`
mantendo a mesma impressão (mesmo arquivo, enviado de novo), e o gatilho zeraria o que acabou de vir.

Revision ID: 20261104_08
Revises: 20261104_07
Create Date: 2026-11-04
"""

from __future__ import annotations

from alembic import op

revision = "20261104_08"
down_revision = "20261104_07"
branch_labels = None
depends_on = None

COLUNAS = """
ALTER TABLE public.conteudo_personalizado
  ADD COLUMN IF NOT EXISTS impressao_conteudo text,
  ADD COLUMN IF NOT EXISTS vinculado_de_id bigint
    REFERENCES public.conteudo_personalizado (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conteudo_personalizado_impressao
  ON public.conteudo_personalizado (impressao_conteudo, brainhex_profile_key)
  WHERE aluno_id IS NULL AND impressao_conteudo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conteudo_personalizado_vinculado_de
  ON public.conteudo_personalizado (vinculado_de_id)
  WHERE vinculado_de_id IS NOT NULL;
"""

GATILHO = """
CREATE OR REPLACE FUNCTION public.trg_conteudo_personalizado_reuso()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $f$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.impressao_conteudo := 'editado';
      NEW.vinculado_de_id := NULL;
      RETURN NEW;
    END IF;
    NEW.impressao_conteudo := OLD.impressao_conteudo;
    NEW.vinculado_de_id := OLD.vinculado_de_id;
    IF NEW.materiais IS DISTINCT FROM OLD.materiais OR NEW.plano IS DISTINCT FROM OLD.plano THEN
      NEW.impressao_conteudo := 'editado';
      NEW.vinculado_de_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.source_hash IS DISTINCT FROM OLD.source_hash
     AND NEW.impressao_conteudo IS NOT DISTINCT FROM OLD.impressao_conteudo THEN
    NEW.impressao_conteudo := NULL;
    NEW.vinculado_de_id := NULL;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_conteudo_personalizado_reuso ON public.conteudo_personalizado;
CREATE TRIGGER trg_conteudo_personalizado_reuso
  BEFORE INSERT OR UPDATE ON public.conteudo_personalizado
  FOR EACH ROW EXECUTE FUNCTION public.trg_conteudo_personalizado_reuso();

REVOKE ALL ON FUNCTION public.trg_conteudo_personalizado_reuso() FROM PUBLIC, anon, authenticated;
"""

VINCULAR = """
CREATE OR REPLACE FUNCTION public.trailup_vincular_personalizacao(
  p_origem_id bigint,
  p_classe_id bigint,
  p_topico_id bigint,
  p_conteudo_id bigint,
  p_perfil text,
  p_ciclo_id text,
  p_source_hash text,
  p_impressao text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  o public.conteudo_personalizado%ROWTYPE;
  v_chave text := p_ciclo_id || ':' || p_source_hash;
  v_chave_origem text;
  v_materiais jsonb;
  v_plano jsonb;
  v_cards_origem text[];
  v_cards bigint[];
  v_id bigint;
BEGIN
  SELECT * INTO o
    FROM public.conteudo_personalizado
   WHERE id = p_origem_id
     AND aluno_id IS NULL
     AND status = 'pronto'
     AND impressao_conteudo = p_impressao
     AND brainhex_profile_key = p_perfil
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_chave_origem := o.ciclo_id || ':' || o.source_hash;

  SELECT coalesce(jsonb_object_agg(
           e.k,
           CASE WHEN jsonb_typeof(e.v -> 'metadata') = 'object'
                THEN jsonb_set(e.v, '{metadata,generation_key}', to_jsonb(v_chave))
                ELSE e.v END
         ), '{}'::jsonb)
    INTO v_materiais
    FROM jsonb_each(coalesce(o.materiais, '{}'::jsonb)) AS e (k, v);

  -- Os cards vão para a turma nova. Mobile lê por classe_id, e o id do card é da turma.
  v_cards_origem := ARRAY(
    SELECT x FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(o.plano -> 'cards_personalizados_ids') = 'array'
           THEN o.plano -> 'cards_personalizados_ids' ELSE '[]'::jsonb END) AS t (x));

  UPDATE public.cards_personalizados c
     SET ativo = false, obsoleto_em = now(), atualizado_em = now()
   WHERE c.classe_id = p_classe_id AND c.topico_id = p_topico_id AND c.conteudo_id = p_conteudo_id
     AND c.aluno_id IS NULL AND c.ativo
     AND NOT coalesce(c.metadata ->> 'copiado_de' = ANY (v_cards_origem), false)
     AND c.metadata ->> 'brainhex_profile_key' = p_perfil;

  INSERT INTO public.cards_personalizados
    (aluno_id, classe_id, topico_id, conteudo_id, ciclo_id, ordem, titulo, descricao, icone,
     dificuldade, xp, metadata)
  SELECT NULL, p_classe_id, p_topico_id, p_conteudo_id, p_ciclo_id, c.ordem, c.titulo, c.descricao,
         c.icone, c.dificuldade, c.xp,
         c.metadata || jsonb_build_object(
           'classe_id', p_classe_id, 'topico_id', p_topico_id, 'conteudo_id', p_conteudo_id,
           'ciclo_id', p_ciclo_id, 'source_hash', p_source_hash, 'copiado_de', c.id::text)
    FROM public.cards_personalizados c
   WHERE c.id::text = ANY (v_cards_origem)
     AND c.ativo
     AND NOT EXISTS (
       SELECT 1 FROM public.cards_personalizados d
        WHERE d.classe_id = p_classe_id AND d.topico_id = p_topico_id
          AND d.conteudo_id = p_conteudo_id AND d.aluno_id IS NULL AND d.ativo
          AND d.metadata ->> 'copiado_de' = c.id::text);

  v_cards := ARRAY(
    SELECT d.id FROM public.cards_personalizados d
     WHERE d.classe_id = p_classe_id AND d.topico_id = p_topico_id
       AND d.conteudo_id = p_conteudo_id AND d.aluno_id IS NULL AND d.ativo
       AND d.metadata ->> 'copiado_de' = ANY (v_cards_origem)
     ORDER BY d.ordem, d.id);

  v_plano := coalesce(o.plano, '{}'::jsonb)
    || jsonb_build_object('cards_personalizados_ids', to_jsonb(v_cards), 'reuso_origem_id', o.id);
  IF jsonb_typeof(v_plano -> 'content_enrichment') = 'object' THEN
    v_plano := jsonb_set(v_plano, '{content_enrichment,source_hash}', to_jsonb(p_source_hash));
  END IF;

  INSERT INTO public.conteudo_personalizado (
    aluno_id, classe_id, topico_id, conteudo_id, brainhex_profile_key, ciclo_id, plano, materiais,
    ai_patch, formato_prioritario, formatos_gerados, status, source_hash, gerado_em, updated_at
  )
  VALUES (
    NULL, p_classe_id, p_topico_id, p_conteudo_id, p_perfil, p_ciclo_id, v_plano, v_materiais,
    NULL, o.formato_prioritario, o.formatos_gerados, 'pronto', p_source_hash, now(), now()
  )
  ON CONFLICT (classe_id, topico_id, conteudo_id, brainhex_profile_key)
    WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL
  DO UPDATE SET
    ciclo_id = EXCLUDED.ciclo_id,
    plano = EXCLUDED.plano,
    materiais = EXCLUDED.materiais,
    ai_patch = NULL,
    formato_prioritario = EXCLUDED.formato_prioritario,
    formatos_gerados = EXCLUDED.formatos_gerados,
    status = 'pronto',
    source_hash = EXCLUDED.source_hash,
    gerado_em = now(),
    updated_at = now()
  RETURNING id INTO v_id;

  -- Separado do upsert: ver o docstring da migration.
  UPDATE public.conteudo_personalizado
     SET impressao_conteudo = p_impressao, vinculado_de_id = o.id
   WHERE id = v_id;

  INSERT INTO public.materiais_gerados
    (aluno_id, conteudo_id, tipo, payload, arquivo_url, personalizacao_id, storage_path, metadata)
  SELECT NULL, p_conteudo_id, m.tipo, m.payload, m.arquivo_url, v_id, m.storage_path,
         jsonb_set(m.metadata, '{generation_key}', to_jsonb(v_chave))
    FROM public.materiais_gerados m
   WHERE m.personalizacao_id = o.id AND m.generation_key = v_chave_origem
  ON CONFLICT (personalizacao_id, tipo, generation_key) DO NOTHING;

  RETURN v_id;
END;
$f$;

REVOKE ALL ON FUNCTION public.trailup_vincular_personalizacao(
  bigint, bigint, bigint, bigint, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trailup_vincular_personalizacao(
  bigint, bigint, bigint, bigint, text, text, text, text
) TO service_role;
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(GATILHO)
    op.execute(VINCULAR)


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION IF EXISTS public.trailup_vincular_personalizacao(
          bigint, bigint, bigint, bigint, text, text, text, text
        );
        DROP TRIGGER IF EXISTS trg_conteudo_personalizado_reuso ON public.conteudo_personalizado;
        DROP FUNCTION IF EXISTS public.trg_conteudo_personalizado_reuso();
        ALTER TABLE public.conteudo_personalizado
          DROP COLUMN IF EXISTS vinculado_de_id,
          DROP COLUMN IF EXISTS impressao_conteudo;
        """
    )
