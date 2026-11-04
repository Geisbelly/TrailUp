"""Arquivo da pesquisa: cópia anônima quando o aluno pede exclusão, e revogação (#17).

Continua a `20261104_02`. Lá, a conta apagada levava as linhas de `pesquisa_arquivo` e o gatilho
punha os objetos identificáveis direto na fila de exclusão do R2: a pesquisa perdia o aluno inteiro.

## A regra (decisão de 04/11)

| situação | identificável (`pesquisa/<origem>/<aluno>/...`) | anônimo (`pesquisa/anonimo/...`) |
|---|---|---|
| aluno que consentiu pede exclusão | sai, **depois** da cópia anônima | **fica**, sem volta |
| aluno revoga o consentimento de pesquisa | sai | não é feita |

Dado anonimizado não é dado pessoal (LGPD, art. 12): o pedido de exclusão é cumprido e a pesquisa
fica com o que já não é mais do aluno.

## Como

1. `BEFORE DELETE ON alunos` (`trg_pesquisa_anonimizar_antes_da_exclusao`): se o aluno consentia
   pesquisa na hora da exclusão, cada objeto do arquivo dele vira um pedido em
   `pesquisa_anonimizacao`, com um **sal aleatório por exclusão** e o perfil BrainHex dominante.
   Precisa ser BEFORE: depois da cascata o consentimento já está anonimizado e o perfil, apagado.
2. O gatilho de `pesquisa_arquivo` (da `_02`) **não** enfileira a exclusão de objeto que tem pedido
   de anonimização pendente. A fila externa não serve para segurar: item "ainda referenciado" é
   marcado como processado e nunca mais volta.
3. A Edge Function `pesquisa-arquivar` lê o objeto, troca todo identificador por HMAC(sal, valor)
   e grava em `pesquisa/anonimo/...`. Só então `pesquisa_anonimizacao_concluir` apaga o pedido —
   e com ele o sal — e põe o objeto identificável na fila de exclusão.
4. **O pedido do aluno vem primeiro:** pedido com mais de 7 dias sem cópia anônima é abandonado
   (`pesquisa_anonimizacao_vencidas`, no mesmo cron): sai o pedido, o identificável vai para a
   fila. A pesquisa perde aquele aluno, mas nada fica guardado além do prazo.
5. Revogação: gravar `consentimento_pesquisa` ou `consentimento_responsavel` que deixa o aluno sem
   a finalidade `pesquisa` apaga as linhas de `pesquisa_arquivo` dele, e o gatilho da `_02` põe os
   objetos na fila. Sem cópia anônima: quem revogou saiu da pesquisa. Publicar uma versão nova do
   termo **não** dispara isso (não grava linha); só uma decisão gravada dispara.

`pesquisa_anonimizacao` guarda caminho (que tem o id do aluno) e sal juntos, então é dado pessoal
enquanto existe: vive no máximo 7 dias. Só `service_role` — RLS ligada sem policy de propósito.

Revision ID: 20261104_03
Revises: 20261104_02
Create Date: 2026-11-04
"""

from __future__ import annotations

from alembic import op

revision = "20261104_03"
down_revision = "20261104_02"
branch_labels = None
depends_on = None

DIAS_PARA_DESISTIR = 7

SQL = rf"""
CREATE TABLE IF NOT EXISTS public.pesquisa_anonimizacao (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origem               text NOT NULL,
  bucket               text NOT NULL,
  caminho              text NOT NULL,
  sal                  text NOT NULL,
  perfil               text,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  tentativas           integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  ultimo_erro          text,
  CONSTRAINT pesquisa_anonimizacao_caminho_uq UNIQUE (caminho),
  CONSTRAINT pesquisa_anonimizacao_caminho_chk CHECK (left(caminho, 9) = 'pesquisa/'),
  CONSTRAINT pesquisa_anonimizacao_sal_chk CHECK (length(sal) >= 32)
);
COMMENT ON TABLE public.pesquisa_anonimizacao IS
  'Pedidos de copia anonima do arquivo da pesquisa (#17). Vive no maximo {DIAS_PARA_DESISTIR} dias. So service_role.';
ALTER TABLE public.pesquisa_anonimizacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pesquisa_anonimizacao FROM PUBLIC, anon, authenticated;

INSERT INTO public.retencao_politica (tabela, acao, categoria, motivo) VALUES
  ('pesquisa_anonimizacao', 'dedicada', 'vida_da_conta',
   'fila curta da copia anonima: sai ao concluir ou em {DIAS_PARA_DESISTIR} dias (pesquisa_anonimizacao_vencidas)')
ON CONFLICT (tabela, acao) DO NOTHING;

-- 1. Antes da exclusao da conta: pedido de copia anonima para cada objeto de quem consentia.
CREATE OR REPLACE FUNCTION public.trg_pesquisa_anonimizar_antes_da_exclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sal text;
  v_perfil text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pesquisa_arquivo WHERE aluno_id = OLD.id) THEN
    RETURN OLD;
  END IF;
  IF NOT public.aluno_finalidade_permitida(OLD.id, 'pesquisa') THEN
    RETURN OLD;
  END IF;
  -- 256 bits de gen_random_uuid (nucleo do Postgres, sem pgcrypto). Morre com o ultimo pedido.
  v_sal := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  -- Mesmo desempate de listar_alunos_classe_com_perfil_dominante. Sem linha, fica nulo: na
  -- pesquisa, "sem perfil" nao e' mastermind.
  SELECT p.nome INTO v_perfil
    FROM public.aluno_perfil ap
    JOIN public.perfil p ON p.id = ap.perfil_id
   WHERE ap.aluno_id = OLD.id
   ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
   LIMIT 1;
  INSERT INTO public.pesquisa_anonimizacao (origem, bucket, caminho, sal, perfil)
  SELECT a.origem, a.bucket, a.caminho, v_sal, v_perfil
    FROM public.pesquisa_arquivo a
   WHERE a.aluno_id = OLD.id
  ON CONFLICT (caminho) DO NOTHING;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- A exclusao pedida pelo aluno nunca pode falhar por causa da pesquisa. Sem pedido, o gatilho
  -- da 20261104_02 poe o identificavel na fila: perde-se a copia anonima, nao o direito do aluno.
  RAISE WARNING 'trg_pesquisa_anonimizar_antes_da_exclusao: %', SQLERRM;
  RETURN OLD;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trg_pesquisa_anonimizar_antes_da_exclusao() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pesquisa_anonimizar_antes_da_exclusao ON public.alunos;
CREATE TRIGGER trg_pesquisa_anonimizar_antes_da_exclusao
  BEFORE DELETE ON public.alunos
  FOR EACH ROW EXECUTE FUNCTION public.trg_pesquisa_anonimizar_antes_da_exclusao();

-- 2. O gatilho da 20261104_02, agora sem enfileirar o que espera copia anonima.
CREATE OR REPLACE FUNCTION public.trg_pesquisa_arquivo_fila()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT ON (v.caminho) 'r2', v.bucket, v.caminho,
         jsonb_build_object('tabela', 'pesquisa_arquivo', 'origem', v.origem)
    FROM velhas v
   WHERE NOT EXISTS (SELECT 1 FROM public.pesquisa_anonimizacao p WHERE p.caminho = v.caminho)
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

-- 3. O que a Edge Function chama.
CREATE OR REPLACE FUNCTION public.pesquisa_anonimizacao_pendentes(p_limite integer DEFAULT 100)
RETURNS TABLE (id bigint, origem text, bucket text, caminho text, sal text, perfil text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id, a.origem, a.bucket, a.caminho, a.sal, a.perfil
    FROM public.pesquisa_anonimizacao a
   WHERE a.proxima_tentativa_em <= now()
   ORDER BY a.id
   LIMIT greatest(1, least(coalesce(p_limite, 100), 500));
$function$;

-- Concluido (copia anonima gravada, ou o identificavel ja nao existia): sai o pedido - e o sal -, e
-- o identificavel vai para a fila de exclusao.
CREATE OR REPLACE FUNCTION public.pesquisa_anonimizacao_concluir(p_ids bigint[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  WITH saiu AS (
    DELETE FROM public.pesquisa_anonimizacao WHERE id = ANY (coalesce(p_ids, ARRAY[]::bigint[]))
    RETURNING origem, bucket, caminho
  ), fila AS (
    INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
    SELECT 'r2', s.bucket, s.caminho,
           jsonb_build_object('tabela', 'pesquisa_arquivo', 'origem', s.origem, 'motivo', 'exclusao_anonimizada')
      FROM saiu s
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM saiu;
  RETURN v_n;
END;
$function$;

-- Falhou: tenta de novo com espera crescente (o mesmo `_espera` da fila externa, ate 1 dia).
CREATE OR REPLACE FUNCTION public.pesquisa_anonimizacao_falhou(p_itens jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.pesquisa_anonimizacao a
     SET tentativas = a.tentativas + 1,
         ultimo_erro = left(x.erro, 300),
         proxima_tentativa_em = now() + make_interval(secs => least(60 * power(2, a.tentativas), 86400)::int)
    FROM jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) AS x (id bigint, erro text)
   WHERE a.id = x.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- 4. O pedido do aluno vem primeiro: passou do prazo, desiste da copia anonima.
CREATE OR REPLACE FUNCTION public.pesquisa_anonimizacao_vencidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids bigint[];
BEGIN
  SELECT array_agg(id) INTO v_ids
    FROM public.pesquisa_anonimizacao
   WHERE criado_em < now() - interval '{DIAS_PARA_DESISTIR} days';
  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;
  RAISE WARNING 'pesquisa_anonimizacao_vencidas: % objeto(s) saem sem copia anonima', cardinality(v_ids);
  RETURN public.pesquisa_anonimizacao_concluir(v_ids);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pesquisa_anonimizacao_pendentes(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pesquisa_anonimizacao_concluir(bigint[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pesquisa_anonimizacao_falhou(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pesquisa_anonimizacao_vencidas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pesquisa_anonimizacao_pendentes(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pesquisa_anonimizacao_concluir(bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.pesquisa_anonimizacao_falhou(jsonb) TO service_role;

-- O cron da 20261104_02 tambem vence os pedidos parados - mesmo sem a Edge Function no ar.
CREATE OR REPLACE FUNCTION public.pesquisa_arquivo_disparar()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_url text;
  v_segredo text;
BEGIN
  BEGIN
    PERFORM public.pesquisa_anonimizacao_vencidas();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pesquisa_anonimizacao_vencidas: %', SQLERRM;
  END;
  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT btrim(decrypted_secret) INTO v_url FROM vault.decrypted_secrets WHERE name = 'pesquisa_arquivo_url';
  SELECT btrim(decrypted_secret) INTO v_segredo FROM vault.decrypted_secrets WHERE name = 'pesquisa_arquivo_segredo';
  IF coalesce(v_url, '') = '' OR coalesce(v_segredo, '') = '' THEN
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url := v_url,
    body := jsonb_build_object('limite', 300),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trailup-segredo', v_segredo),
    timeout_milliseconds := 120000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pesquisa_arquivo_disparar: %', SQLERRM;
  RETURN NULL;
END;
$function$;

-- 5. Revogacao: decisao gravada que tira a finalidade `pesquisa` apaga o arquivo identificavel.
CREATE OR REPLACE FUNCTION public.trg_pesquisa_revogacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.aluno_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pesquisa_arquivo WHERE aluno_id = NEW.aluno_id)
     AND NOT public.aluno_finalidade_permitida(NEW.aluno_id, 'pesquisa') THEN
    DELETE FROM public.pesquisa_arquivo WHERE aluno_id = NEW.aluno_id;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trg_pesquisa_revogacao() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pesquisa_revogacao ON public.consentimento_pesquisa;
CREATE TRIGGER trg_pesquisa_revogacao
  AFTER INSERT ON public.consentimento_pesquisa
  FOR EACH ROW EXECUTE FUNCTION public.trg_pesquisa_revogacao();
DROP TRIGGER IF EXISTS trg_pesquisa_revogacao ON public.consentimento_responsavel;
CREATE TRIGGER trg_pesquisa_revogacao
  AFTER INSERT ON public.consentimento_responsavel
  FOR EACH ROW EXECUTE FUNCTION public.trg_pesquisa_revogacao();
"""

DOWN_SQL = r"""
DROP TRIGGER IF EXISTS trg_pesquisa_revogacao ON public.consentimento_responsavel;
DROP TRIGGER IF EXISTS trg_pesquisa_revogacao ON public.consentimento_pesquisa;
DROP FUNCTION IF EXISTS public.trg_pesquisa_revogacao();
DROP TRIGGER IF EXISTS trg_pesquisa_anonimizar_antes_da_exclusao ON public.alunos;
DROP FUNCTION IF EXISTS public.trg_pesquisa_anonimizar_antes_da_exclusao();

-- Volta o gatilho e o disparo da 20261104_02.
CREATE OR REPLACE FUNCTION public.trg_pesquisa_arquivo_fila()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT ON (v.caminho) 'r2', v.bucket, v.caminho,
         jsonb_build_object('tabela', 'pesquisa_arquivo', 'origem', v.origem)
    FROM velhas v
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

-- Pedido pendente nao pode prender o identificavel: vai para a fila antes de a tabela sumir.
SELECT public.pesquisa_anonimizacao_concluir(array_agg(id)) FROM public.pesquisa_anonimizacao;
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWN_SQL)
    # Recria o disparo da 20261104_02 (sem o vencimento) antes de derrubar as funcoes que ele chama.
    import importlib.util
    from pathlib import Path

    caminho = Path(__file__).with_name("20261104_02_arquivo_da_pesquisa_no_r2.py")
    spec = importlib.util.spec_from_file_location("m_20261104_02", caminho)
    anterior = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(anterior)
    inicio = anterior.SQL.index("CREATE OR REPLACE FUNCTION public.pesquisa_arquivo_disparar()")
    fim = anterior.SQL.index("REVOKE EXECUTE ON FUNCTION public.pesquisa_arquivo_disparar()")
    op.execute(anterior.SQL[inicio:fim])
    op.execute(
        """
DROP FUNCTION IF EXISTS public.pesquisa_anonimizacao_vencidas();
DROP FUNCTION IF EXISTS public.pesquisa_anonimizacao_falhou(jsonb);
DROP FUNCTION IF EXISTS public.pesquisa_anonimizacao_concluir(bigint[]);
DROP FUNCTION IF EXISTS public.pesquisa_anonimizacao_pendentes(integer);
DELETE FROM public.retencao_politica WHERE tabela = 'pesquisa_anonimizacao';
DROP TABLE IF EXISTS public.pesquisa_anonimizacao;
"""
    )
