"""Buckets do aluno privados: politicas de leitura e o fechamento em duas etapas (#195)

`conteudo_aluno`, `perfil_fotos` e `banners_fotos` eram buckets PUBLICOS do
Storage: quem tivesse o endereco baixava o arquivo, sem sessao. Material
gerado por turma, fontes enviadas pelo aluno, foto e banner de perfil sao
dados pessoais (LGPD art. 46); o endereco vaza por log, print e historico.

## O que esta migration faz (ja no deploy, sem quebrar nada)

1. `trailup_pode_ler_arquivo(bucket, nome)`: quem pode ler cada objeto.

   - `perfil_fotos` / `banners_fotos` (o nome comeca com o uuid do dono:
     `<uuid>-<ts>.<ext>` no app antigo, `<uuid>/<ts>.<ext>` no novo): o
     proprio aluno; o colega de alguma turma em comum (ranking, guilda, chat
     e perfil publico ja mostram a foto so a quem divide turma, ver
     `social_perfil_publico`); o professor de alguma turma do aluno; o dono do
     app (`app_e_dono()`).
   - `conteudo_aluno`, `brainhex/<perfil>/classe-N/...` (material gerado):
     o aluno matriculado em N, o professor de N e o dono. O material e' por
     perfil de aprendizagem dentro da turma, nao por aluno.
   - `conteudo_aluno`, `fontes/classe-N/...` (fonte enviada na
     personalizacao): o professor de N, o dono, e o aluno quando a linha de
     `fontes_personalizacao` e' dele ou nao e' `individual` e ele esta em N.
   - `conteudo_aluno`, `<uuid>/...` (avatar do chefe gerado para o aluno):
     o proprio aluno e o dono.
   - Qualquer outro caminho: ninguem (o service role passa por cima do RLS).

2. Politicas em `storage.objects`: SELECT pelos tres buckets via essa funcao;
   INSERT/UPDATE/DELETE nas fotos so' na pasta/prefixo do proprio uuid.
   Saem as amplas: `authenticated_le_conteudo_aluno_storage` (20260922_03b,
   qualquer logado lia qualquer material) e as quatro de upload/update das
   fotos criadas fora do alembic (qualquer logado gravava por cima da foto
   de qualquer um).

   Enquanto o bucket for publico, a URL publica continua funcionando; as
   politicas so' restringem o que passa pela API do Storage
   (`download`/`createSignedUrl`). O app antigo continua subindo foto
   (`<uuid>-<ts>.<ext>` casa com o prefixo do dono).

3. `trailup_fechar_buckets_privados()` e `trailup_reabrir_buckets_publicos()`,
   so' para o service role/postgres. O fechamento NAO roda aqui porque o
   alembic roda no startup da API: fechar no deploy quebraria todo cliente
   ainda no codigo velho (app nativo na loja, aba aberta). Ordem:

   1. publicar a edge function `storage-redirect` (cai na URL assinada);
   2. deploy da API/microservice/brainhexpdf/console/app web e nova versao
      do app nativo (todos ja leem foto/banner por URL assinada);
   3. `select public.trailup_fechar_buckets_privados();` no SQL Editor.

   O fechamento: `public = false` nos tres buckets, limite de 5 MB e so'
   imagem nos de foto, e reescreve o que esta gravado com URL publica:
   `alunos.foto_url`/`banner_url` viram a referencia `perfil_fotos/<caminho>`
   / `banners_fotos/<caminho>` (o app assina na leitura) e a URL publica de
   `conteudo_aluno` em `conteudo_personalizado.materiais` vira a do gateway.
   Idempotente. `trailup_reabrir_buckets_publicos(base_url)` desfaz (base
   opcional: com ela, as referencias voltam a ser URL publica).

`banners_fotos` tambem fecha: e' o banner do perfil do aluno, enviado por ele
(nao e' banner de landing page; a landing usa arquivos estaticos do repo).

Sem efeito onde nao ha schema `storage` (banco local sem Supabase).

Revision ID: 20261024_09
Revises: 20261024_08
Create Date: 2026-10-24
"""

from __future__ import annotations

from alembic import op

revision = "20261024_09"
down_revision = "20261024_08"
branch_labels = None
depends_on = None

BUCKETS_PRIVADOS = ("conteudo_aluno", "perfil_fotos", "banners_fotos")
BUCKETS_DE_FOTO = ("perfil_fotos", "banners_fotos")
LIMITE_FOTO_BYTES = 5 * 1024 * 1024

# Politicas antigas, amplas, que saem.
POLITICAS_ANTIGAS = (
    "authenticated_le_conteudo_aluno_storage",
    "upload perfil_fotos",
    "update perfil_fotos",
    "upload banners_fotos",
    "update banners_fotos",
)

UUID_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

FUNCOES_SQL = f"""
CREATE OR REPLACE FUNCTION public.trailup_dono_do_arquivo(p_nome text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $f$
  SELECT CASE WHEN lower(left(coalesce(p_nome, ''), 36)) ~ '{UUID_RE}'
              THEN lower(left(p_nome, 36))::uuid END
$f$;

CREATE OR REPLACE FUNCTION public.trailup_pode_ler_arquivo(p_bucket text, p_nome text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_dono uuid;
  v_m text[];
  v_classe bigint;
BEGIN
  IF v_uid IS NULL OR p_nome IS NULL OR p_bucket IS NULL THEN
    RETURN false;
  END IF;
  IF public.app_e_dono() THEN
    RETURN true;
  END IF;

  IF p_bucket IN ('perfil_fotos', 'banners_fotos') THEN
    v_dono := public.trailup_dono_do_arquivo(p_nome);
    IF v_dono IS NULL THEN
      RETURN false;
    END IF;
    RETURN v_dono = v_uid
        OR EXISTS (SELECT 1 FROM public.classe_aluno a
                     JOIN public.classe_aluno b ON b.classe_id = a.classe_id
                    WHERE a.aluno_id = v_dono AND b.aluno_id = v_uid)
        OR EXISTS (SELECT 1 FROM public.classe_aluno a
                     JOIN public.classe c ON c.id = a.classe_id
                    WHERE a.aluno_id = v_dono AND c.professor_id = v_uid);
  END IF;

  IF p_bucket = 'conteudo_aluno' THEN
    -- Pasta do proprio aluno (avatar do chefe).
    IF substr(p_nome, 37, 1) = '/' AND public.trailup_dono_do_arquivo(p_nome) = v_uid THEN
      RETURN true;
    END IF;
    v_m := regexp_match(p_nome, '^(brainhex/[^/]+|fontes)/classe-([0-9]{{1,18}})/');
    IF v_m IS NULL THEN
      RETURN false;
    END IF;
    v_classe := v_m[2]::bigint;
    IF EXISTS (SELECT 1 FROM public.classe WHERE id = v_classe AND professor_id = v_uid) THEN
      RETURN true;
    END IF;
    IF v_m[1] = 'fontes' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.fontes_personalizacao f
         WHERE f.classe_id = v_classe AND f.storage_path = p_nome
           AND (f.aluno_id = v_uid
                OR (f.visibilidade <> 'individual'
                    AND EXISTS (SELECT 1 FROM public.classe_aluno ca
                                 WHERE ca.classe_id = v_classe AND ca.aluno_id = v_uid))));
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.classe_aluno
                    WHERE classe_id = v_classe AND aluno_id = v_uid);
  END IF;

  RETURN false;
END;
$f$;

COMMENT ON FUNCTION public.trailup_pode_ler_arquivo(text, text) IS
  'RLS de storage.objects (20261024_09): quem le cada objeto dos buckets privados do aluno.';

REVOKE ALL ON FUNCTION public.trailup_pode_ler_arquivo(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_pode_ler_arquivo(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trailup_dono_do_arquivo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_dono_do_arquivo(text) TO authenticated, service_role;

-- URL do Storage (publica, assinada ou autenticada) de foto/banner -> referencia
-- "<bucket>/<caminho>". O resto passa como veio.
CREATE OR REPLACE FUNCTION public.trailup_ref_de_imagem(p_valor text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $f$
  SELECT CASE
    WHEN p_valor ~ '/storage/v1/object/(public|sign|authenticated)/(perfil_fotos|banners_fotos)/'
    THEN regexp_replace(split_part(split_part(p_valor, '?', 1), '#', 1),
           '^.*/storage/v1/object/(public|sign|authenticated)/(perfil_fotos|banners_fotos)/', '\\2/')
    ELSE p_valor END
$f$;

CREATE OR REPLACE FUNCTION public.trailup_fechar_buckets_privados()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_buckets int;
  v_fotos int;
  v_banners int;
  v_materiais int;
BEGIN
  UPDATE storage.buckets SET public = false
   WHERE id IN ('conteudo_aluno', 'perfil_fotos', 'banners_fotos') AND public;
  GET DIAGNOSTICS v_buckets = ROW_COUNT;
  UPDATE storage.buckets
     SET file_size_limit = {LIMITE_FOTO_BYTES}, allowed_mime_types = ARRAY['image/*']
   WHERE id IN ('perfil_fotos', 'banners_fotos');

  UPDATE public.alunos SET foto_url = public.trailup_ref_de_imagem(foto_url)
   WHERE foto_url IS DISTINCT FROM public.trailup_ref_de_imagem(foto_url);
  GET DIAGNOSTICS v_fotos = ROW_COUNT;
  UPDATE public.alunos SET banner_url = public.trailup_ref_de_imagem(banner_url)
   WHERE banner_url IS DISTINCT FROM public.trailup_ref_de_imagem(banner_url);
  GET DIAGNOSTICS v_banners = ROW_COUNT;

  -- Mesma reescrita da 20260922_06, com a base tirada da propria URL: so'
  -- entrada com storage_path (o gateway serve pelo caminho).
  WITH reescrito AS (
    SELECT cp.id,
           jsonb_object_agg(
             e.k,
             CASE WHEN jsonb_typeof(e.v) <> 'object' THEN e.v
             ELSE e.v
               || CASE WHEN (e.v ->> 'storage_path') IS NOT NULL
                        AND (e.v ->> 'arquivo_url') ~ '/storage/v1/object/public/conteudo_aluno/'
                       THEN jsonb_build_object('arquivo_url',
                              split_part(e.v ->> 'arquivo_url', '/storage/v1/object/public/', 1)
                              || '/functions/v1/storage-redirect?path=' || (e.v ->> 'storage_path'))
                       ELSE '{{}}'::jsonb END
               || CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                       THEN jsonb_build_object('partes', COALESCE((
                              SELECT jsonb_agg(
                                       CASE WHEN (p ->> 'storage_path') IS NOT NULL
                                             AND (p ->> 'arquivo_url') ~ '/storage/v1/object/public/conteudo_aluno/'
                                            THEN p || jsonb_build_object('arquivo_url',
                                                   split_part(p ->> 'arquivo_url', '/storage/v1/object/public/', 1)
                                                   || '/functions/v1/storage-redirect?path=' || (p ->> 'storage_path'))
                                            ELSE p END
                                       ORDER BY ord)
                                FROM jsonb_array_elements(e.v -> 'partes') WITH ORDINALITY AS t(p, ord)
                            ), '[]'::jsonb))
                       ELSE '{{}}'::jsonb END
             END) AS materiais_novo
      FROM public.conteudo_personalizado cp,
           LATERAL jsonb_each(cp.materiais) AS e(k, v)
     WHERE jsonb_typeof(cp.materiais) = 'object'
       AND position('/storage/v1/object/public/conteudo_aluno/' in cp.materiais::text) > 0
     GROUP BY cp.id
  )
  UPDATE public.conteudo_personalizado cp
     SET materiais = r.materiais_novo
    FROM reescrito r
   WHERE r.id = cp.id AND r.materiais_novo IS DISTINCT FROM cp.materiais;
  GET DIAGNOSTICS v_materiais = ROW_COUNT;

  RETURN jsonb_build_object('buckets_fechados', v_buckets, 'fotos', v_fotos,
                            'banners', v_banners, 'conteudos_personalizados', v_materiais);
END;
$f$;

CREATE OR REPLACE FUNCTION public.trailup_reabrir_buckets_publicos(p_base_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_buckets int;
  v_refs int := 0;
  v_base text := nullif(rtrim(coalesce(p_base_url, ''), '/'), '');
BEGIN
  UPDATE storage.buckets SET public = true
   WHERE id IN ('conteudo_aluno', 'perfil_fotos', 'banners_fotos') AND NOT public;
  GET DIAGNOSTICS v_buckets = ROW_COUNT;
  IF v_base IS NOT NULL THEN
    UPDATE public.alunos
       SET foto_url = CASE WHEN foto_url ~ '^perfil_fotos/'
                           THEN v_base || '/storage/v1/object/public/' || foto_url ELSE foto_url END,
           banner_url = CASE WHEN banner_url ~ '^banners_fotos/'
                             THEN v_base || '/storage/v1/object/public/' || banner_url ELSE banner_url END
     WHERE foto_url ~ '^perfil_fotos/' OR banner_url ~ '^banners_fotos/';
    GET DIAGNOSTICS v_refs = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('buckets_reabertos', v_buckets, 'alunos_com_url_publica', v_refs);
END;
$f$;

REVOKE ALL ON FUNCTION public.trailup_ref_de_imagem(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_ref_de_imagem(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trailup_fechar_buckets_privados() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trailup_reabrir_buckets_publicos(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trailup_fechar_buckets_privados() TO service_role;
GRANT EXECUTE ON FUNCTION public.trailup_reabrir_buckets_publicos(text) TO service_role;
"""


def _drop_antigas() -> str:
    return "\n".join(f'  DROP POLICY IF EXISTS "{nome}" ON storage.objects;' for nome in POLITICAS_ANTIGAS)


POLITICAS_SQL = f"""
DO $do$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE '20261024_09: sem storage.objects, politicas puladas';
    RETURN;
  END IF;
{_drop_antigas()}
  DROP POLICY IF EXISTS "trailup_le_arquivos_do_aluno" ON storage.objects;
  DROP POLICY IF EXISTS "trailup_sobe_propria_foto" ON storage.objects;
  DROP POLICY IF EXISTS "trailup_troca_propria_foto" ON storage.objects;
  DROP POLICY IF EXISTS "trailup_apaga_propria_foto" ON storage.objects;

  CREATE POLICY "trailup_le_arquivos_do_aluno" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id IN ('conteudo_aluno', 'perfil_fotos', 'banners_fotos')
           AND public.trailup_pode_ler_arquivo(bucket_id, name));

  CREATE POLICY "trailup_sobe_propria_foto" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('perfil_fotos', 'banners_fotos')
                AND public.trailup_dono_do_arquivo(name) = auth.uid());

  CREATE POLICY "trailup_troca_propria_foto" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id IN ('perfil_fotos', 'banners_fotos')
           AND public.trailup_dono_do_arquivo(name) = auth.uid())
    WITH CHECK (bucket_id IN ('perfil_fotos', 'banners_fotos')
                AND public.trailup_dono_do_arquivo(name) = auth.uid());

  CREATE POLICY "trailup_apaga_propria_foto" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id IN ('perfil_fotos', 'banners_fotos')
           AND public.trailup_dono_do_arquivo(name) = auth.uid());
END
$do$;
"""


def upgrade() -> None:
    op.execute(FUNCOES_SQL)
    op.execute(POLITICAS_SQL)
    op.execute("NOTIFY pgrst, 'reload schema'")


DOWNGRADE_POLITICAS_SQL = """
DO $do$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "trailup_le_arquivos_do_aluno" ON storage.objects;
  DROP POLICY IF EXISTS "trailup_sobe_propria_foto" ON storage.objects;
  DROP POLICY IF EXISTS "trailup_troca_propria_foto" ON storage.objects;
  DROP POLICY IF EXISTS "trailup_apaga_propria_foto" ON storage.objects;
  -- Volta ao que havia antes (amplo), para nao travar leitura nem upload.
  CREATE POLICY "authenticated_le_conteudo_aluno_storage" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'conteudo_aluno');
  CREATE POLICY "upload perfil_fotos" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'perfil_fotos');
  CREATE POLICY "update perfil_fotos" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'perfil_fotos');
  CREATE POLICY "upload banners_fotos" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'banners_fotos');
  CREATE POLICY "update banners_fotos" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'banners_fotos');
END
$do$;
"""


def downgrade() -> None:
    op.execute(DOWNGRADE_POLITICAS_SQL)
    op.execute("DROP FUNCTION IF EXISTS public.trailup_reabrir_buckets_publicos(text)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_fechar_buckets_privados()")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_ref_de_imagem(text)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_pode_ler_arquivo(text, text)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_dono_do_arquivo(text)")
    op.execute("NOTIFY pgrst, 'reload schema'")
