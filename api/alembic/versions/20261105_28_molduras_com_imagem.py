"""Molduras com imagem no banco: o dono cadastra, edita, troca a imagem e remove pelo console

Até aqui a imagem de cada moldura vinha no pacote do app (`mobile/src/constants/molduras.ts`), então
moldura nova ou desenho novo dependiam de uma versão do app, e o console só via o nome.

## Imagem

`molduras.imagem_url` e `molduras.abertura` são opcionais: `NULL` nas duas quer dizer "usa o desenho do
pacote". O console mostra essas 40 a partir de `frontend/public/molduras/`. A abertura é onde a foto entra,
na tela de 256 × 256 de `profileFrameLayout.ts`, e não dá para ter uma sem a outra.

O arquivo fica no bucket `molduras`, **público de propósito**: moldura é arte do produto, não dado de
pessoa, e aparece no avatar de todo mundo. Só o dono sobe e apaga. Foto e banner seguem outro caminho
(`docs/lgpd/storage-buckets-e-r2.md`). O console fala direto com o Storage, sem passar pela API, e por
isso o arquivo não vai para o R2: quem escreve no R2 é a API.

A permissão no schema `storage` é de outro papel (`supabase_storage_admin`). Sem privilégio, a migration
avisa e segue em vez de derrubar a API no boot: nesse caso só o envio de imagem falha.

## Remover

`moldura_aluno.moldura_codigo` não tem `ON DELETE`: moldura de aluno não some. Quem tem dono só pode ser
desligada, e a função diz isso. Remover e gravar passam por `economia_auditar`, como o resto da
configuração. Mudar uma rara para outra origem solta a ação que apontava para ela, senão a ação ficaria
ligada a uma moldura que `molduras_admin_salvar_acao` recusaria.

`codigo` não muda depois de criado: é a chave do desenho no pacote e do que o aluno comprou.
"""

from __future__ import annotations

from alembic import op

revision = "20261105_28"
down_revision = "20261105_27"
branch_labels = None
depends_on = None

BUCKET = "molduras"
LIMITE_BYTES = 1024 * 1024

COLUNAS = r"""
ALTER TABLE public.molduras
  ADD COLUMN imagem_url text,
  ADD COLUMN abertura jsonb,
  ADD CONSTRAINT molduras_imagem_com_abertura CHECK ((imagem_url IS NULL) = (abertura IS NULL));
"""

ARMAZENAMENTO = rf"""
DO $b$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('{BUCKET}', '{BUCKET}', true, {LIMITE_BYTES}, ARRAY['image/png', 'image/webp'])
  ON CONFLICT (id) DO UPDATE
    SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS molduras_dono_le ON storage.objects;
  DROP POLICY IF EXISTS molduras_dono_sobe ON storage.objects;
  DROP POLICY IF EXISTS molduras_dono_apaga ON storage.objects;
  CREATE POLICY molduras_dono_le ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = '{BUCKET}' AND public.app_e_dono());
  CREATE POLICY molduras_dono_sobe ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = '{BUCKET}' AND public.app_e_dono());
  CREATE POLICY molduras_dono_apaga ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = '{BUCKET}' AND public.app_e_dono());
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'bucket de molduras sem permissao: o envio de imagem vai falhar ate a policy existir';
END;
$b$;
"""

LEITURA = r"""
CREATE OR REPLACE FUNCTION public.admin_molduras()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto administra molduras.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'molduras', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.grupo, q.ordem)
        FROM (
          SELECT m.codigo, m.nome, m.origem, m.preco, m.ativa, c.nome AS conquista, m.conquista_id, m.ordem,
                 m.imagem_url, m.abertura,
                 CASE m.origem WHEN 'loja' THEN 0 WHEN 'conquista' THEN 1 ELSE 2 END AS grupo,
                 (SELECT count(*) FROM public.moldura_aluno ma WHERE ma.moldura_codigo = m.codigo) AS donos
            FROM public.molduras m
            LEFT JOIN public.conquistas c ON c.id = m.conquista_id
        ) q), '[]'::jsonb),
    'acoes', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.rotulo)
        FROM (
          SELECT a.acao, a.rotulo, a.descricao, a.moldura_codigo, a.ativa,
                 (SELECT count(*) FROM public.moldura_acao_aluno x WHERE x.acao = a.acao) AS feitas
            FROM public.molduras_acoes a
        ) q), '[]'::jsonb),
    'conquistas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'moldura', m.codigo) ORDER BY c.nome, c.id)
        FROM public.conquistas c
        LEFT JOIN public.molduras m ON m.conquista_id = c.id
       WHERE c.classe_id IS NULL AND c.ativa), '[]'::jsonb));
END;
$fn$;
"""

GRAVAR = rf"""
CREATE FUNCTION public.admin_moldura_gravar(
  p_nova boolean, p_codigo text, p_nome text, p_origem text, p_preco integer, p_conquista bigint,
  p_ativa boolean, p_imagem_url text, p_abertura jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ator    text := coalesce(auth.jwt() ->> 'email', 'console');
  v_nome    text := nullif(btrim(coalesce(p_nome, '')), '');
  v_antes   public.molduras%ROWTYPE;
  v_depois  public.molduras%ROWTYPE;
  v_x       numeric;
  v_y       numeric;
  v_raio    numeric;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto administra molduras.' USING ERRCODE = '42501';
  END IF;
  IF v_nome IS NULL OR char_length(v_nome) > 60 THEN
    RAISE EXCEPTION 'O nome precisa ter de 1 a 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('loja', 'conquista', 'acao') THEN
    RAISE EXCEPTION 'Origem desconhecida.' USING ERRCODE = '22023';
  END IF;
  IF p_origem = 'loja' AND (p_preco IS NULL OR p_preco NOT BETWEEN 1 AND 1000) THEN
    RAISE EXCEPTION 'O preço na loja vai de 1 a 1000 moedas.' USING ERRCODE = '22023';
  END IF;
  IF p_origem = 'conquista' THEN
    IF NOT EXISTS (SELECT 1 FROM public.conquistas c WHERE c.id = p_conquista AND c.classe_id IS NULL AND c.ativa) THEN
      RAISE EXCEPTION 'Escolha uma conquista do sistema que esteja ativa.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.molduras m WHERE m.conquista_id = p_conquista AND m.codigo <> p_codigo) THEN
      RAISE EXCEPTION 'Essa conquista já libera outra moldura.' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF p_imagem_url IS NOT NULL THEN
    IF p_imagem_url !~ '^https://[^/]+/storage/v1/object/public/{BUCKET}/[A-Za-z0-9._-]+$' THEN
      RAISE EXCEPTION 'A imagem precisa estar no bucket de molduras.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_x := (p_abertura ->> 'x')::numeric;
      v_y := (p_abertura ->> 'y')::numeric;
      v_raio := (p_abertura ->> 'radius')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Abertura inválida.' USING ERRCODE = '22023';
    END;
    IF v_x IS NULL OR v_y IS NULL OR v_raio IS NULL OR v_raio NOT BETWEEN 20 AND 128
       OR v_x - v_raio < 0 OR v_y - v_raio < 0 OR v_x + v_raio > 256 OR v_y + v_raio > 256 THEN
      RAISE EXCEPTION 'A abertura precisa caber na imagem.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF coalesce(p_nova, false) THEN
    IF p_codigo IS NULL OR p_codigo !~ '^[a-z][a-z0-9_]{{1,40}}$' THEN
      RAISE EXCEPTION 'Código inválido.' USING ERRCODE = '22023';
    END IF;
    IF p_imagem_url IS NULL THEN
      RAISE EXCEPTION 'Moldura nova precisa de imagem.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.molduras m WHERE m.codigo = p_codigo) THEN
      RAISE EXCEPTION 'Já existe uma moldura com esse nome. Troque o nome.' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.molduras (codigo, nome, origem, preco, conquista_id, ativa, ordem, imagem_url, abertura)
    VALUES (
      p_codigo, v_nome, p_origem,
      CASE WHEN p_origem = 'loja' THEN p_preco END,
      CASE WHEN p_origem = 'conquista' THEN p_conquista END,
      coalesce(p_ativa, true),
      (SELECT coalesce(max(m.ordem), 0) + 1 FROM public.molduras m WHERE m.origem = p_origem),
      p_imagem_url, p_abertura
    )
    RETURNING * INTO v_depois;
    PERFORM public.economia_auditar('config', 'molduras', p_codigo, NULL, NULL, NULL,
      to_jsonb(v_depois) || jsonb_build_object('ator', v_ator));
    RETURN jsonb_build_object('codigo', p_codigo, 'imagem_anterior', NULL);
  END IF;

  SELECT * INTO v_antes FROM public.molduras m WHERE m.codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moldura não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.molduras m
     SET nome = v_nome,
         origem = p_origem,
         preco = CASE WHEN p_origem = 'loja' THEN p_preco END,
         conquista_id = CASE WHEN p_origem = 'conquista' THEN p_conquista END,
         ativa = coalesce(p_ativa, m.ativa),
         imagem_url = coalesce(p_imagem_url, m.imagem_url),
         abertura = CASE WHEN p_imagem_url IS NULL THEN m.abertura ELSE p_abertura END,
         atualizado_em = now()
   WHERE m.codigo = p_codigo
  RETURNING * INTO v_depois;
  IF v_antes.origem = 'acao' AND p_origem <> 'acao' THEN
    UPDATE public.molduras_acoes a SET moldura_codigo = NULL, atualizado_em = now() WHERE a.moldura_codigo = p_codigo;
  END IF;
  PERFORM public.economia_auditar('config', 'molduras', p_codigo, NULL, NULL, to_jsonb(v_antes),
    to_jsonb(v_depois) || jsonb_build_object('ator', v_ator));
  RETURN jsonb_build_object(
    'codigo', p_codigo,
    'imagem_anterior', CASE WHEN p_imagem_url IS DISTINCT FROM v_antes.imagem_url AND p_imagem_url IS NOT NULL
                            THEN v_antes.imagem_url END);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_moldura_gravar(boolean, text, text, text, integer, bigint, boolean, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moldura_gravar(boolean, text, text, text, integer, bigint, boolean, text, jsonb) TO authenticated;

CREATE FUNCTION public.admin_moldura_remover(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes public.molduras%ROWTYPE;
  v_donos bigint;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto administra molduras.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_antes FROM public.molduras m WHERE m.codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moldura não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  SELECT count(*) INTO v_donos FROM public.moldura_aluno ma WHERE ma.moldura_codigo = p_codigo;
  IF v_donos > 0 THEN
    RAISE EXCEPTION 'Esta moldura é de % aluno(s). Desligue em vez de remover.', v_donos USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.molduras m WHERE m.codigo = p_codigo;
  PERFORM public.economia_auditar('config', 'molduras', p_codigo, NULL, NULL, to_jsonb(v_antes),
    jsonb_build_object('removida', true, 'ator', coalesce(auth.jwt() ->> 'email', 'console')));
  RETURN jsonb_build_object('codigo', p_codigo, 'imagem_anterior', v_antes.imagem_url);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_moldura_remover(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moldura_remover(text) TO authenticated;
"""

ANTES = r"""
DO $b$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS molduras_dono_le ON storage.objects;
    DROP POLICY IF EXISTS molduras_dono_sobe ON storage.objects;
    DROP POLICY IF EXISTS molduras_dono_apaga ON storage.objects;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'policies do bucket de molduras ficaram';
END;
$b$;
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(ARMAZENAMENTO)
    op.execute(LEITURA)
    op.execute(GRAVAR)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.admin_moldura_remover(text)")
    op.execute(
        "DROP FUNCTION IF EXISTS public.admin_moldura_gravar"
        "(boolean, text, text, text, integer, bigint, boolean, text, jsonb)"
    )
    op.execute(ANTES)
    # `admin_molduras` lê as colunas que saem aqui.
    op.execute(LEITURA.replace("m.conquista_id, m.ordem,\n                 m.imagem_url, m.abertura,", "m.ordem,"))
    op.execute(
        "ALTER TABLE public.molduras DROP CONSTRAINT IF EXISTS molduras_imagem_com_abertura,"
        " DROP COLUMN IF EXISTS abertura, DROP COLUMN IF EXISTS imagem_url"
    )
