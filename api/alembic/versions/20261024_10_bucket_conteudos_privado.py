"""Bucket `conteudos` (material do professor) privado, no mesmo esquema da 20261024_09 (#195)

`conteudos` guarda o que o professor sobe no console (`<uid>/<topico>/...`,
`<uid>/classes/<turma>/materials/...`): PDF, slide, video, imagem de questao.
Era PUBLICO: quem tivesse o endereco baixava, sem sessao. As politicas de
`storage.objects` tambem eram amplas: `Authenticated can read` deixava QUALQUER
logado ler QUALQUER arquivo de QUALQUER professor pela API do Storage, e
`Professors can upload` deixava qualquer logado gravar em qualquer pasta.

## Quem le um objeto de `conteudos`

`trailup_pode_ler_conteudo_professor(nome)`:

- o professor dono da pasta (`<uid>/...`);
- o dono do app (`app_e_dono()`);
- quem esta numa turma que USA o arquivo: o aluno matriculado e o professor
  da turma. "Usa" = alguma linha viva aponta para o caminho:
  `conteudos.conteudo`, `conteudos.metadata.files[].path`,
  `conteudos.metadata.media_storage_path`, `midias.url`,
  `questoes.midia_url`, `cards.imagem_url` (pelo topico -> turma) ou a fonte
  do professor em `fontes_personalizacao` (aluno so' se nao for
  `individual`). Turma duplicada aponta para o MESMO arquivo da original,
  entao o aluno dela le sem copia nenhuma. A comparacao passa por
  `trailup_caminho_arquivo` (20261024_07): vale o caminho puro, a URL
  publica/assinada antiga e a URL do gateway.

Upload/troca: so' na pasta do proprio professor (primeiro segmento = o uid, e
o uid tem linha em `professor`, ou e' o dono). Apagar: so' na propria pasta.

## Fechamento (mesmas duas etapas da 09)

O alembic roda no startup da API, entao a migration NAO fecha o bucket.
`trailup_fechar_buckets_privados()` passa a fechar `conteudos` tambem (a da
09 vira `trailup_fechar_buckets_do_aluno()` e e' chamada por dentro) e
reescreve o que estiver gravado como URL do Storage de `conteudos`:

- `conteudos.conteudo` (so' quando o campo INTEIRO e' a URL), cada
  `metadata.files[].path`, `metadata.media_storage_path`, `midias.url`,
  `questoes.midia_url` e `cards.imagem_url` viram o CAMINHO puro - o formato
  que o console ja grava, que o app assina na leitura e que o worker de
  remocao e o "arquivo ainda em uso" (20261024_07) comparam;
- `fontes_personalizacao.arquivo_url` e `conteudo_personalizado.materiais`
  (entradas com `storage_path`) viram a URL do gateway `storage-redirect`,
  que ja serve esses caminhos (`vw_material_storage_paths`).

`trailup_reabrir_buckets_publicos(base)` reabre os quatro buckets. Os
caminhos ficam como estao: o caminho puro funciona com o bucket publico ou
privado (quem le assina), entao nao ha o que desfazer.

## Indices

Os mesmos que servem a RLS servem o "ainda em uso" do worker:
`trailup_caminho_arquivo(...)` em `conteudos.conteudo`, `midias.url`,
`questoes.midia_url`, `cards.imagem_url` e GIN `jsonb_path_ops` em
`conteudos.metadata` (o `@>` de `files`/`media_storage_path`).

Sem efeito em `storage` onde nao ha schema `storage` (banco local sem Supabase).

Revision ID: 20261024_10
Revises: 20261024_09
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "20261024_10"
down_revision = "20261024_09"
branch_labels = None
depends_on = None

BUCKET = "conteudos"

# Politicas que existiam em producao para `conteudos` (criadas fora do alembic).
# As duas primeiras sao as amplas; as outras repetem "pasta do proprio uid" e
# saem para nao haver duas fontes da mesma regra.
POLITICAS_ANTIGAS = {
    "Authenticated can read": ("SELECT", "USING (bucket_id = 'conteudos')"),
    "Professors can upload": ("INSERT", "WITH CHECK (bucket_id = 'conteudos')"),
    "Professors can upload own folder": (
        "INSERT",
        "WITH CHECK (bucket_id = 'conteudos' AND (storage.foldername(name))[1] = auth.uid()::text)",
    ),
    "Professors can delete own files": (
        "DELETE",
        "USING (bucket_id = 'conteudos' AND (storage.foldername(name))[1] = auth.uid()::text)",
    ),
    "professors_select_conteudos_storage": (
        "SELECT",
        "USING (bucket_id = 'conteudos' AND (storage.foldername(name))[1] = auth.uid()::text)",
    ),
    "professors_insert_conteudos_storage": (
        "INSERT",
        "WITH CHECK (bucket_id = 'conteudos' AND (storage.foldername(name))[1] = auth.uid()::text)",
    ),
    "professors_update_conteudos_storage": (
        "UPDATE",
        "USING (bucket_id = 'conteudos' AND (storage.foldername(name))[1] = auth.uid()::text)",
    ),
    "professors_delete_conteudos_storage": (
        "DELETE",
        "USING (bucket_id = 'conteudos' AND (storage.foldername(name))[1] = auth.uid()::text)",
    ),
}

POLITICAS_NOVAS = (
    "trailup_le_conteudo_do_professor",
    "trailup_sobe_conteudo_na_propria_pasta",
    "trailup_troca_conteudo_da_propria_pasta",
    "trailup_apaga_conteudo_da_propria_pasta",
)

URL_DO_BUCKET = "/storage/v1/object/(public|sign|authenticated)/conteudos/"

INDICES = (
    ("ix_conteudos_caminho_arquivo", "public.conteudos", "((public.trailup_caminho_arquivo(conteudo)))"),
    ("ix_midias_caminho_arquivo", "public.midias", "((public.trailup_caminho_arquivo(url)))"),
    ("ix_questoes_caminho_arquivo", "public.questoes", "((public.trailup_caminho_arquivo(midia_url)))"),
    ("ix_cards_caminho_arquivo", "public.cards", "((public.trailup_caminho_arquivo(imagem_url)))"),
    ("ix_conteudos_metadata_path_ops", "public.conteudos", "USING gin (metadata jsonb_path_ops)"),
)


def _indices_sql() -> str:
    return "\n".join(f"CREATE INDEX IF NOT EXISTS {nome} ON {tabela} {expr};" for nome, tabela, expr in INDICES)


FUNCOES_SQL = f"""
-- Quem chama e' professor (tem linha em `professor`)?
CREATE OR REPLACE FUNCTION public.trailup_e_professor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.professor WHERE id = auth.uid())
$f$;
REVOKE ALL ON FUNCTION public.trailup_e_professor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_e_professor() TO authenticated, service_role;

-- URL do Storage de `conteudos` (o campo INTEIRO) -> caminho puro. Texto com a
-- URL no meio, caminho puro, URL do gateway e de outro bucket passam como vieram.
CREATE OR REPLACE FUNCTION public.trailup_ref_de_conteudo(p_valor text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $f$
  SELECT CASE
    WHEN p_valor ~* '^\\s*https?://\\S+\\s*$' AND p_valor ~ '{URL_DO_BUCKET}'
    THEN coalesce(nullif(regexp_replace(split_part(split_part(btrim(p_valor), '?', 1), '#', 1),
                                        '^.*{URL_DO_BUCKET}', ''), ''), p_valor)
    ELSE p_valor END
$f$;
REVOKE ALL ON FUNCTION public.trailup_ref_de_conteudo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_ref_de_conteudo(text) TO authenticated, service_role;

-- Turmas cujas linhas vivas apontam para o caminho, e se o ALUNO da turma pode
-- ler (fonte `individual` do professor: so' o professor da turma).
CREATE OR REPLACE FUNCTION public.trailup_turmas_que_usam_conteudo(p_nome text)
RETURNS TABLE (classe_id bigint, aluno_le boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
  SELECT t.classe_id, true
    FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id
   WHERE public.trailup_caminho_arquivo(c.conteudo) = p_nome
  UNION ALL
  SELECT t.classe_id, true
    FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id
   WHERE jsonb_typeof(c.metadata) = 'object'
     AND (public.trailup_caminho_arquivo(c.metadata ->> 'media_storage_path') = p_nome
          OR EXISTS (SELECT 1
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.metadata -> 'files') = 'array'
                                                      THEN c.metadata -> 'files' ELSE '[]'::jsonb END) AS f
                      WHERE public.trailup_caminho_arquivo(f ->> 'path') = p_nome))
  UNION ALL
  SELECT t.classe_id, true
    FROM public.midias m
    JOIN public.conteudos c ON c.id = m.conteudo_id
    JOIN public.topicos t ON t.id = c.topico_id
   WHERE public.trailup_caminho_arquivo(m.url) = p_nome
  UNION ALL
  SELECT t.classe_id, true
    FROM public.questoes q
    JOIN public.atividades a ON a.id = q.atividade_id
    JOIN public.topicos t ON t.id = a.topico_id
   WHERE public.trailup_caminho_arquivo(q.midia_url) = p_nome
  UNION ALL
  SELECT t.classe_id, true
    FROM public.cards k
    JOIN public.conteudos c ON c.id = k.conteudo_id
    JOIN public.topicos t ON t.id = c.topico_id
   WHERE public.trailup_caminho_arquivo(k.imagem_url) = p_nome
  UNION ALL
  SELECT fp.classe_id, fp.visibilidade <> 'individual'
    FROM public.fontes_personalizacao fp
   WHERE fp.storage_path = p_nome AND fp.aluno_id IS NULL
     AND coalesce(fp.metadata ->> 'bucket', 'conteudos') = 'conteudos'
$f$;
REVOKE ALL ON FUNCTION public.trailup_turmas_que_usam_conteudo(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trailup_turmas_que_usam_conteudo(text) TO service_role;

CREATE OR REPLACE FUNCTION public.trailup_pode_ler_conteudo_professor(p_nome text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_nome IS NULL THEN
    RETURN false;
  END IF;
  IF public.app_e_dono() THEN
    RETURN true;
  END IF;
  -- Pasta do proprio professor.
  IF substr(p_nome, 37, 1) = '/' AND public.trailup_dono_do_arquivo(p_nome) = v_uid THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.trailup_turmas_que_usam_conteudo(p_nome) u
     WHERE EXISTS (SELECT 1 FROM public.classe c WHERE c.id = u.classe_id AND c.professor_id = v_uid)
        OR (u.aluno_le AND EXISTS (SELECT 1 FROM public.classe_aluno ca
                                    WHERE ca.classe_id = u.classe_id AND ca.aluno_id = v_uid)));
END;
$f$;
COMMENT ON FUNCTION public.trailup_pode_ler_conteudo_professor(text) IS
  'RLS de storage.objects (20261024_10): quem le cada objeto do bucket conteudos (material do professor).';
REVOKE ALL ON FUNCTION public.trailup_pode_ler_conteudo_professor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_pode_ler_conteudo_professor(text) TO authenticated, service_role;

{_indices_sql()}

-- Fecha so' `conteudos` e reescreve as URLs antigas. Chamada por
-- `trailup_fechar_buckets_privados()`; sozinha, so' para o servico.
CREATE OR REPLACE FUNCTION public.trailup_fechar_bucket_conteudos()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_bucket int := 0;
  v_conteudos int;
  v_metadata int;
  v_midias int;
  v_questoes int;
  v_cards int;
  v_fontes int;
  v_materiais int;
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets SET public = false WHERE id = 'conteudos' AND public;
    GET DIAGNOSTICS v_bucket = ROW_COUNT;
  END IF;

  UPDATE public.conteudos SET conteudo = public.trailup_ref_de_conteudo(conteudo)
   WHERE conteudo ~ '{URL_DO_BUCKET}'
     AND conteudo IS DISTINCT FROM public.trailup_ref_de_conteudo(conteudo);
  GET DIAGNOSTICS v_conteudos = ROW_COUNT;

  WITH reescrito AS (
    SELECT c.id,
           c.metadata
             || CASE WHEN jsonb_typeof(c.metadata -> 'files') = 'array'
                     THEN jsonb_build_object('files', COALESCE((
                            SELECT jsonb_agg(
                                     CASE WHEN jsonb_typeof(f) = 'object' AND jsonb_typeof(f -> 'path') = 'string'
                                          THEN f || jsonb_build_object('path', public.trailup_ref_de_conteudo(f ->> 'path'))
                                          ELSE f END
                                     ORDER BY ord)
                              FROM jsonb_array_elements(c.metadata -> 'files') WITH ORDINALITY AS x(f, ord)
                          ), '[]'::jsonb))
                     ELSE '{{}}'::jsonb END
             || CASE WHEN jsonb_typeof(c.metadata -> 'media_storage_path') = 'string'
                     THEN jsonb_build_object('media_storage_path',
                            public.trailup_ref_de_conteudo(c.metadata ->> 'media_storage_path'))
                     ELSE '{{}}'::jsonb END AS metadata_novo
      FROM public.conteudos c
     WHERE jsonb_typeof(c.metadata) = 'object'
       AND c.metadata::text ~ '{URL_DO_BUCKET}'
  )
  UPDATE public.conteudos c SET metadata = r.metadata_novo
    FROM reescrito r
   WHERE r.id = c.id AND r.metadata_novo IS DISTINCT FROM c.metadata;
  GET DIAGNOSTICS v_metadata = ROW_COUNT;

  UPDATE public.midias SET url = public.trailup_ref_de_conteudo(url)
   WHERE url ~ '{URL_DO_BUCKET}' AND url IS DISTINCT FROM public.trailup_ref_de_conteudo(url);
  GET DIAGNOSTICS v_midias = ROW_COUNT;
  UPDATE public.questoes SET midia_url = public.trailup_ref_de_conteudo(midia_url)
   WHERE midia_url ~ '{URL_DO_BUCKET}' AND midia_url IS DISTINCT FROM public.trailup_ref_de_conteudo(midia_url);
  GET DIAGNOSTICS v_questoes = ROW_COUNT;
  UPDATE public.cards SET imagem_url = public.trailup_ref_de_conteudo(imagem_url)
   WHERE imagem_url ~ '{URL_DO_BUCKET}' AND imagem_url IS DISTINCT FROM public.trailup_ref_de_conteudo(imagem_url);
  GET DIAGNOSTICS v_cards = ROW_COUNT;

  -- Fonte do professor: o gateway ja' serve o storage_path (view 20260922_02).
  UPDATE public.fontes_personalizacao
     SET arquivo_url = split_part(arquivo_url, '/storage/v1/object/', 1)
                       || '/functions/v1/storage-redirect?path=' || storage_path
   WHERE storage_path IS NOT NULL AND storage_path !~* '^https?://'
     AND arquivo_url ~ '/storage/v1/object/public/conteudos/';
  GET DIAGNOSTICS v_fontes = ROW_COUNT;

  WITH reescrito AS (
    SELECT cp.id,
           jsonb_object_agg(
             e.k,
             CASE WHEN jsonb_typeof(e.v) <> 'object' THEN e.v
             ELSE e.v
               || CASE WHEN (e.v ->> 'storage_path') IS NOT NULL
                        AND (e.v ->> 'arquivo_url') ~ '/storage/v1/object/public/conteudos/'
                       THEN jsonb_build_object('arquivo_url',
                              split_part(e.v ->> 'arquivo_url', '/storage/v1/object/public/', 1)
                              || '/functions/v1/storage-redirect?path=' || (e.v ->> 'storage_path'))
                       ELSE '{{}}'::jsonb END
               || CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                       THEN jsonb_build_object('partes', COALESCE((
                              SELECT jsonb_agg(
                                       CASE WHEN (p ->> 'storage_path') IS NOT NULL
                                             AND (p ->> 'arquivo_url') ~ '/storage/v1/object/public/conteudos/'
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
       AND position('/storage/v1/object/public/conteudos/' in cp.materiais::text) > 0
     GROUP BY cp.id
  )
  UPDATE public.conteudo_personalizado cp
     SET materiais = r.materiais_novo
    FROM reescrito r
   WHERE r.id = cp.id AND r.materiais_novo IS DISTINCT FROM cp.materiais;
  GET DIAGNOSTICS v_materiais = ROW_COUNT;

  RETURN jsonb_build_object(
    'bucket_fechado', v_bucket, 'conteudos', v_conteudos, 'metadata', v_metadata,
    'midias', v_midias, 'questoes', v_questoes, 'cards', v_cards,
    'fontes', v_fontes, 'conteudos_personalizados', v_materiais);
END;
$f$;

-- A da 09 continua igual, com outro nome; a publica chama as duas.
ALTER FUNCTION public.trailup_fechar_buckets_privados() RENAME TO trailup_fechar_buckets_do_aluno;
ALTER FUNCTION public.trailup_reabrir_buckets_publicos(text) RENAME TO trailup_reabrir_buckets_do_aluno;

CREATE FUNCTION public.trailup_fechar_buckets_privados()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_aluno jsonb := public.trailup_fechar_buckets_do_aluno();
  v_prof jsonb := public.trailup_fechar_bucket_conteudos();
BEGIN
  RETURN v_aluno || jsonb_build_object(
    'buckets_fechados', (v_aluno ->> 'buckets_fechados')::int + (v_prof ->> 'bucket_fechado')::int,
    'conteudos_professor', v_prof - 'bucket_fechado');
END;
$f$;

CREATE FUNCTION public.trailup_reabrir_buckets_publicos(p_base_url text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_aluno jsonb := public.trailup_reabrir_buckets_do_aluno(p_base_url);
  v_prof int := 0;
BEGIN
  -- Os caminhos puros de `conteudos` servem com o bucket publico ou privado.
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets SET public = true WHERE id = 'conteudos' AND NOT public;
    GET DIAGNOSTICS v_prof = ROW_COUNT;
  END IF;
  RETURN v_aluno || jsonb_build_object(
    'buckets_reabertos', (v_aluno ->> 'buckets_reabertos')::int + v_prof);
END;
$f$;

REVOKE ALL ON FUNCTION public.trailup_fechar_bucket_conteudos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trailup_fechar_buckets_do_aluno() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trailup_reabrir_buckets_do_aluno(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trailup_fechar_buckets_privados() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trailup_reabrir_buckets_publicos(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trailup_fechar_bucket_conteudos() TO service_role;
GRANT EXECUTE ON FUNCTION public.trailup_fechar_buckets_do_aluno() TO service_role;
GRANT EXECUTE ON FUNCTION public.trailup_reabrir_buckets_do_aluno(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trailup_fechar_buckets_privados() TO service_role;
GRANT EXECUTE ON FUNCTION public.trailup_reabrir_buckets_publicos(text) TO service_role;
"""


def _drop(nomes) -> str:
    return "\n".join(f'  DROP POLICY IF EXISTS "{nome}" ON storage.objects;' for nome in nomes)


_PASTA_PROPRIA = "substr(name, 37, 1) = '/' AND public.trailup_dono_do_arquivo(name) = auth.uid()"
_PODE_GRAVAR = f"bucket_id = 'conteudos' AND {_PASTA_PROPRIA} AND (public.trailup_e_professor() OR public.app_e_dono())"

POLITICAS_SQL = f"""
DO $do$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE '20261024_10: sem storage.objects, politicas puladas';
    RETURN;
  END IF;
{_drop(POLITICAS_ANTIGAS)}
{_drop(POLITICAS_NOVAS)}

  CREATE POLICY "trailup_le_conteudo_do_professor" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'conteudos' AND public.trailup_pode_ler_conteudo_professor(name));

  CREATE POLICY "trailup_sobe_conteudo_na_propria_pasta" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK ({_PODE_GRAVAR});

  CREATE POLICY "trailup_troca_conteudo_da_propria_pasta" ON storage.objects
    FOR UPDATE TO authenticated
    USING ({_PODE_GRAVAR})
    WITH CHECK ({_PODE_GRAVAR});

  CREATE POLICY "trailup_apaga_conteudo_da_propria_pasta" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'conteudos' AND {_PASTA_PROPRIA});
END
$do$;
"""


def upgrade() -> None:
    op.execute(FUNCOES_SQL)
    op.execute(POLITICAS_SQL)
    op.execute("NOTIFY pgrst, 'reload schema'")


def _recria_antigas() -> str:
    return "\n".join(
        f'  CREATE POLICY "{nome}" ON storage.objects FOR {cmd} TO authenticated {expr};'
        for nome, (cmd, expr) in POLITICAS_ANTIGAS.items()
    )


DOWNGRADE_POLITICAS_SQL = f"""
DO $do$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;
{_drop(POLITICAS_NOVAS)}
{_drop(POLITICAS_ANTIGAS)}
  -- Volta ao que havia em producao (amplo), para nao travar leitura nem upload.
{_recria_antigas()}
END
$do$;
"""


def downgrade() -> None:
    op.execute(DOWNGRADE_POLITICAS_SQL)
    op.execute("DROP FUNCTION IF EXISTS public.trailup_fechar_buckets_privados()")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_reabrir_buckets_publicos(text)")
    op.execute("ALTER FUNCTION public.trailup_fechar_buckets_do_aluno() RENAME TO trailup_fechar_buckets_privados")
    op.execute(
        "ALTER FUNCTION public.trailup_reabrir_buckets_do_aluno(text) RENAME TO trailup_reabrir_buckets_publicos"
    )
    op.execute("DROP FUNCTION IF EXISTS public.trailup_fechar_bucket_conteudos()")
    for nome, _tabela, _expr in INDICES:
        op.execute(f"DROP INDEX IF EXISTS public.{nome}")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_pode_ler_conteudo_professor(text)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_turmas_que_usam_conteudo(text)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_ref_de_conteudo(text)")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_e_professor()")
    op.execute("NOTIFY pgrst, 'reload schema'")
