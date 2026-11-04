"""Arquivo da pesquisa no R2: a telemetria de quem consentiu nunca se perde por prazo (#17).

## Por que

A retenção (`20261024_03`) tira a telemetria bruta do Postgres em 90 dias (180 com consentimento de
pesquisa) e a derivada em 13 meses (24). Medido em 04/11: nenhum dos 184 lotes de produção tinha
cópia no R2 — o envio da API falhava com 401 até a #908, e os lotes que o mobile grava direto no
Supabase quando a API cai nunca passam por ela. Ligar a retenção apagaria a base da pesquisa.

## A regra

| situação | Postgres | R2 `pesquisa/` |
|---|---|---|
| prazo vence | sai, **só se a cópia existir** | **fica** |
| aluno pede exclusão (conta apagada) | sai | **sai** (cascata → fila externa) |

Só entra no arquivo quem consentiu pesquisa (`aluno_finalidade_permitida(aluno, 'pesquisa')`),
avaliado na hora de arquivar — a mesma regra que a retenção usa para o prazo longo.

## Peças

1. `pesquisa_arquivo` — uma linha por registro arquivado (sessão, lote, evento), com o caminho do
   objeto. Sem FK para turma de propósito: apagar a turma apaga a telemetria em cascata, e o arquivo
   tem de sobreviver a isso. FK para `alunos` com CASCADE: a conta apagada leva as linhas, e o
   gatilho põe os objetos na `retencao_fila_externa`, que o worker da API apaga do R2.
   **Só `service_role`**: RLS ligada sem policy é decisão, não esquecimento — nenhum cliente lê.
2. `pesquisa_arquivo_pendentes(limite)` / `pesquisa_arquivo_registrar(itens)` — o que a Edge
   Function `pesquisa-arquivar` chama. Caminho determinístico por registro
   (`pesquisa/<origem>/<aluno>/<AAAA>/<MM>/<DD>/<id>.json`): rodar duas vezes sobrescreve o mesmo
   objeto, nunca deixa cópia órfã.
3. `pesquisa_arquivo_disparar()` + pg_cron `trailup_pesquisa_arquivo` (a cada 10 min) — `net.http_post`
   para a função, com URL e segredo no Vault (`pesquisa_arquivo_url`, `pesquisa_arquivo_segredo`).
   Sem os dois segredos, não faz nada. Regra de fronteira: arquivar não tem modelo de linguagem, então
   não passa pela API.
4. Trava na retenção: `filtro` das quatro políticas que tiram telemetria bruta ou cascateiam para ela
   (`telemetria_lotes` redigir/apagar, `telemetria_eventos_app` apagar, `telemetria_sessoes` apagar)
   passa a exigir a cópia, para quem consentiu.

## O que NÃO está aqui

- Cópia anonimizada quando o aluno pede exclusão (ela fica na pesquisa sem ser dado dele): próxima PR.
  Até lá, a exclusão apaga a cópia identificável sem deixar a anônima.
- Revogação do consentimento de pesquisa: hoje o que já foi arquivado fica. Próxima PR, junto da
  anonimização.
- Telemetria derivada que não é cópia de lote (`telemetria_time_metric_entries`, `estudo_sessoes`):
  prazo de 13 meses, primeira saída em dez/2027.

## Deploy (nada disso foi feito daqui)

1. `supabase functions deploy pesquisa-arquivar` com o secret `PESQUISA_ARQUIVO_SEGREDO` (as `R2_*`
   já existem nos secrets das Edge Functions).
2. No Vault: `pesquisa_arquivo_url` (`https://<ref>.supabase.co/functions/v1/pesquisa-arquivar`) e
   `pesquisa_arquivo_segredo` (o mesmo valor do secret).

Revision ID: 20261104_02
Revises: 20261104_01
Create Date: 2026-11-04
"""

from __future__ import annotations

from alembic import op

revision = "20261104_02"
down_revision = "20261104_01"
branch_labels = None
depends_on = None

JOB = "trailup_pesquisa_arquivo"
CRON = "*/10 * * * *"

ORIGENS = ("telemetria_sessoes", "telemetria_lotes", "telemetria_eventos_app")

# Filtros das políticas de retenção, antes e depois. O de antes é o que a 20261024_03 semeou
# (conferido em produção em 04/11).
FILTROS: tuple[tuple[str, str, str | None, str], ...] = (
    (
        "telemetria_lotes",
        "redigir",
        "NOT (t.payload ? 'redigido_em')",
        "NOT (t.payload ? 'redigido_em') AND public.pesquisa_arquivo_pode_sair('telemetria_lotes', t.id, t.aluno_id)",
    ),
    (
        "telemetria_lotes",
        "apagar",
        None,
        "public.pesquisa_arquivo_pode_sair('telemetria_lotes', t.id, t.aluno_id)",
    ),
    (
        "telemetria_eventos_app",
        "apagar",
        None,
        "public.pesquisa_arquivo_pode_sair('telemetria_eventos_app', t.id, t.aluno_id)",
    ),
    (
        "telemetria_sessoes",
        "apagar",
        None,
        "public.pesquisa_sessao_pode_sair(t.id, t.aluno_id)",
    ),
)


def _q(valor: str | None) -> str:
    return "NULL" if valor is None else "'" + valor.replace("'", "''") + "'"


def _filtros(depois: bool) -> str:
    linhas = []
    for tabela, acao, antes, novo in FILTROS:
        valor = novo if depois else antes
        linhas.append(
            f"UPDATE public.retencao_politica SET filtro = {_q(valor)}, revisado_em = current_date"
            f" WHERE tabela = {_q(tabela)} AND acao = {_q(acao)};"
        )
    return "\n".join(linhas)


SQL = r"""
CREATE TABLE IF NOT EXISTS public.pesquisa_arquivo (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origem       text NOT NULL,
  origem_id    uuid NOT NULL,
  aluno_id     uuid NOT NULL REFERENCES public.alunos (id) ON DELETE CASCADE,
  bucket       text NOT NULL,
  caminho      text NOT NULL,
  arquivado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pesquisa_arquivo_origem_chk CHECK (origem IN ('telemetria_sessoes', 'telemetria_lotes', 'telemetria_eventos_app')),
  CONSTRAINT pesquisa_arquivo_caminho_chk CHECK (left(caminho, 9) = 'pesquisa/'),
  CONSTRAINT pesquisa_arquivo_registro_uq UNIQUE (origem, origem_id)
);
CREATE INDEX IF NOT EXISTS pesquisa_arquivo_aluno_idx ON public.pesquisa_arquivo (aluno_id);
CREATE INDEX IF NOT EXISTS pesquisa_arquivo_caminho_idx ON public.pesquisa_arquivo (caminho);
COMMENT ON TABLE public.pesquisa_arquivo IS
  'Registro do arquivo da pesquisa no R2 (#17). So service_role: RLS ligada sem policy de proposito.';

ALTER TABLE public.pesquisa_arquivo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pesquisa_arquivo FROM PUBLIC, anon, authenticated;

-- Vive enquanto a conta existir: o prazo da retencao nao alcanca o arquivo.
INSERT INTO public.retencao_politica (tabela, acao, categoria, motivo) VALUES
  ('pesquisa_arquivo', 'vida_da_conta', 'vida_da_conta',
   'arquivo da pesquisa no R2 (so quem consentiu); sai com a conta, nunca por prazo')
ON CONFLICT (tabela, acao) DO NOTHING;

-- Conta apagada -> linhas saem em cascata -> objeto vai para a fila externa (worker da API apaga).
-- Gatilho de comando com tabela de transicao, como os da 20261024_03.
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
REVOKE EXECUTE ON FUNCTION public.trg_pesquisa_arquivo_fila() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_pesquisa_arquivo_fila ON public.pesquisa_arquivo;
CREATE TRIGGER trg_pesquisa_arquivo_fila
  AFTER DELETE ON public.pesquisa_arquivo
  REFERENCING OLD TABLE AS velhas
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_pesquisa_arquivo_fila();

-- O que falta arquivar, do mais antigo para o mais novo. Espera 15 min depois de gravado: a sessao
-- ainda recebe `ended_at`, e o lote recem-chegado ainda passa pelos gatilhos de resolucao.
CREATE OR REPLACE FUNCTION public.pesquisa_arquivo_pendentes(p_limite integer DEFAULT 300)
RETURNS TABLE (origem text, origem_id uuid, aluno_id uuid, criado_em timestamptz, registro jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH lim AS (SELECT greatest(1, least(coalesce(p_limite, 300), 1000)) AS n,
                      now() - interval '15 minutes' AS ate)
  (SELECT 'telemetria_sessoes'::text, s.id, s.aluno_id, s.created_at, to_jsonb(s)
     FROM public.telemetria_sessoes s, lim
    WHERE s.created_at < lim.ate
      AND (s.ended_at IS NOT NULL OR s.created_at < now() - interval '1 day')
      AND public.aluno_finalidade_permitida(s.aluno_id, 'pesquisa')
      AND NOT EXISTS (SELECT 1 FROM public.pesquisa_arquivo p
                       WHERE p.origem = 'telemetria_sessoes' AND p.origem_id = s.id)
    ORDER BY s.created_at
    LIMIT (SELECT n FROM lim))
  UNION ALL
  (SELECT 'telemetria_lotes'::text, l.id, l.aluno_id, l.created_at, to_jsonb(l)
     FROM public.telemetria_lotes l, lim
    WHERE l.created_at < lim.ate
      AND l.aluno_id IS NOT NULL
      AND NOT (l.payload ? 'redigido_em')
      AND public.aluno_finalidade_permitida(l.aluno_id, 'pesquisa')
      AND NOT EXISTS (SELECT 1 FROM public.pesquisa_arquivo p
                       WHERE p.origem = 'telemetria_lotes' AND p.origem_id = l.id)
    ORDER BY l.created_at
    LIMIT (SELECT n FROM lim))
  UNION ALL
  (SELECT 'telemetria_eventos_app'::text, e.id, e.aluno_id, e.created_at, to_jsonb(e)
     FROM public.telemetria_eventos_app e, lim
    WHERE e.created_at < lim.ate
      AND e.aluno_id IS NOT NULL
      AND public.aluno_finalidade_permitida(e.aluno_id, 'pesquisa')
      AND NOT EXISTS (SELECT 1 FROM public.pesquisa_arquivo p
                       WHERE p.origem = 'telemetria_eventos_app' AND p.origem_id = e.id)
    ORDER BY e.created_at
    LIMIT (SELECT n FROM lim));
$function$;

-- Registra o que a funcao subiu. Aluno que sumiu entre o upload e o registro (pediu exclusao no meio)
-- nao ganha linha: o objeto vai direto para a fila externa, senao ficaria no R2 sem ninguem saber.
CREATE OR REPLACE FUNCTION public.pesquisa_arquivo_registrar(p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_registrados integer;
  v_orfaos integer;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'itens_invalidos' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pesquisa_arquivo_itens (
    origem text, origem_id uuid, aluno_id uuid, bucket text, caminho text) ON COMMIT DROP;
  TRUNCATE pg_temp.pesquisa_arquivo_itens;
  INSERT INTO pg_temp.pesquisa_arquivo_itens
  SELECT x.origem, x.origem_id, x.aluno_id, x.bucket, x.caminho
    FROM jsonb_to_recordset(p_itens) AS x (origem text, origem_id uuid, aluno_id uuid, bucket text, caminho text)
   WHERE x.origem IN ('telemetria_sessoes', 'telemetria_lotes', 'telemetria_eventos_app')
     AND x.origem_id IS NOT NULL AND x.aluno_id IS NOT NULL
     AND coalesce(x.bucket, '') <> '' AND left(x.caminho, 9) = 'pesquisa/';

  INSERT INTO public.pesquisa_arquivo (origem, origem_id, aluno_id, bucket, caminho)
  SELECT i.origem, i.origem_id, i.aluno_id, i.bucket, i.caminho
    FROM pg_temp.pesquisa_arquivo_itens i
   WHERE EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = i.aluno_id)
  ON CONFLICT (origem, origem_id) DO NOTHING;
  GET DIAGNOSTICS v_registrados = ROW_COUNT;

  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT ON (i.caminho) 'r2', i.bucket, i.caminho,
         jsonb_build_object('tabela', 'pesquisa_arquivo', 'origem', i.origem, 'motivo', 'aluno_ausente')
    FROM pg_temp.pesquisa_arquivo_itens i
   WHERE NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = i.aluno_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_orfaos = ROW_COUNT;

  RETURN jsonb_build_object('registrados', v_registrados, 'orfaos_na_fila', v_orfaos);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pesquisa_arquivo_pendentes(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pesquisa_arquivo_registrar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pesquisa_arquivo_pendentes(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pesquisa_arquivo_registrar(jsonb) TO service_role;

-- Trava da retencao: de quem consentiu, so sai do Postgres o que ja tem copia no arquivo.
CREATE OR REPLACE FUNCTION public.pesquisa_arquivo_pode_sair(p_origem text, p_id uuid, p_aluno uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_aluno IS NULL
      OR NOT public.aluno_finalidade_permitida(p_aluno, 'pesquisa')
      OR EXISTS (SELECT 1 FROM public.pesquisa_arquivo a WHERE a.origem = p_origem AND a.origem_id = p_id);
$function$;

-- Sessao apagada leva lotes e eventos em cascata: so sai se ela e tudo dela estiverem arquivados.
CREATE OR REPLACE FUNCTION public.pesquisa_sessao_pode_sair(p_sessao uuid, p_aluno uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.pesquisa_arquivo_pode_sair('telemetria_sessoes', p_sessao, p_aluno)
     AND NOT EXISTS (SELECT 1 FROM public.telemetria_lotes l
                      WHERE l.sessao_id = p_sessao
                        AND NOT public.pesquisa_arquivo_pode_sair('telemetria_lotes', l.id, l.aluno_id))
     AND NOT EXISTS (SELECT 1 FROM public.telemetria_eventos_app e
                      WHERE e.sessao_id = p_sessao
                        AND NOT public.pesquisa_arquivo_pode_sair('telemetria_eventos_app', e.id, e.aluno_id));
$function$;

REVOKE EXECUTE ON FUNCTION public.pesquisa_arquivo_pode_sair(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pesquisa_sessao_pode_sair(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Disparo: pg_cron -> net.http_post -> Edge Function `pesquisa-arquivar`. Sem os segredos do Vault ou
-- sem pg_net, nao faz nada (devolve NULL) - o mesmo comportamento do e-mail pelo Apps Script.
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
  -- O disparo nunca pode derrubar o cron.
  RAISE WARNING 'pesquisa_arquivo_disparar: %', SQLERRM;
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.pesquisa_arquivo_disparar() FROM PUBLIC, anon, authenticated;
"""

CRON_SQL = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.pesquisa_arquivo_disparar()');
  END IF;
END
$cron$;
"""

DOWN_CRON_SQL = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
  END IF;
END
$cron$;
"""

DOWN_SQL = r"""
DROP FUNCTION IF EXISTS public.pesquisa_arquivo_disparar();
DROP FUNCTION IF EXISTS public.pesquisa_sessao_pode_sair(uuid, uuid);
DROP FUNCTION IF EXISTS public.pesquisa_arquivo_pode_sair(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.pesquisa_arquivo_registrar(jsonb);
DROP FUNCTION IF EXISTS public.pesquisa_arquivo_pendentes(integer);
DELETE FROM public.retencao_politica WHERE tabela = 'pesquisa_arquivo';
-- A tabela fica: ela diz quais objetos existem no R2. Apaga-la deixaria o arquivo sem indice.
DROP TRIGGER IF EXISTS trg_pesquisa_arquivo_fila ON public.pesquisa_arquivo;
DROP FUNCTION IF EXISTS public.trg_pesquisa_arquivo_fila();
"""


def upgrade() -> None:
    op.execute(SQL)
    op.execute(_filtros(depois=True))
    op.execute(CRON_SQL)


def downgrade() -> None:
    op.execute(DOWN_CRON_SQL)
    # Volta o filtro antes de derrubar as funcoes que ele cita.
    op.execute(_filtros(depois=False))
    op.execute(DOWN_SQL)
