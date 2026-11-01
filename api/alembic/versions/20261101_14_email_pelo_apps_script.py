"""E-mail sai por um Google Apps Script em vez da Brevo

Os três envios de e-mail do banco trocam de provedor: o contato do app
(`fn_enviar_contato`), o contato do site (`fn_enviar_contato_publico`) e o
aviso de conta inativa (`retencao_avisos_email`). Eles continuam no banco,
por `net.http_post` (regra de fronteira: mandar e-mail não tem modelo de
linguagem no meio), mas o destino agora é um app da web do Apps Script que
envia com `MailApp`, da conta Google que o publicou. O código do script está
em `scripts/apps-script-email/`.

A #172 foi fechada sem rotacionar a chave da Brevo: a exposição antiga deixa
de valer quando a chave for desativada no painel da Brevo. Esta migração não
apaga `brevo_api_key` do Vault (segredo não entra em migração, nem para sair).

## Duas funções novas, para não repetir o envio três vezes

- `fn_email_apps_script(...)`: lê `apps_script_email_url` e
  `apps_script_email_segredo` do Vault e faz o `net.http_post`. Devolve o id do
  pedido. Sem um dos dois, levanta erro claro. Fechada para `anon` e
  `authenticated`: só as funções `SECURITY DEFINER` acima a chamam.
- `fn_email_apps_script_aceito(status, headers, conteudo, timed_out)`: a regra
  que diz se a resposta guardada pelo pg_net é "e-mail enviado". É pura, para
  dar para testar sem banco.

## Por que "2xx" não basta

Medido em produção em 01/11 (pedido 62 do pg_net, e `curl` contra o script
publicado):

- **e-mail enviado:** o app da web responde 302 para
  `script.googleusercontent.com`, e o pg_net 0.20 **segue** o
  redirecionamento. O que fica em `net._http_response` é **200** com
  `{"ok":true,"cota_restante":99}`;
- **script que levantou** (segredo errado, corpo que não é JSON, corpo vazio):
  **200** também, com a página HTML de erro do Google ("Error: segredo
  invalido…"), sem redirecionamento.

Ou seja: o código HTTP é o mesmo nos dois casos. Com a regra antiga (só 2xx),
uma falha contaria como e-mail entregue, e o aviso de conta inativa começaria
a contar o prazo de exclusão de quem nunca foi avisado. Por isso o 2xx só vale
com `"ok": true` no corpo, e o script **levanta** em toda falha em vez de
devolver `{ok: false}` com 200.

O 302 para `script.googleusercontent.com` também é aceito, para o caso de o
pg_net deixar de seguir o redirecionamento. Um 302 para `accounts.google.com`
(implantação sem acesso "Qualquer pessoa", o script nem rodou) não é.

## O que muda além do provedor

- O remetente é a conta Google do script. `retencao_aviso_remetente` deixa de
  ser lido, e o aviso não exige mais remetente configurado.
- `fn_enviar_contato` perde o endereço literal: o destino vem de
  `app_config` (`contato_email_destino`, senão `dono_email`), como no contato
  do site. Em produção `dono_email` é o mesmo endereço que estava no corpo
  (conferido em 01/11), então o destino não muda.
- Tetos, armadilha, validações e contadores ficam como estavam.

## O que precisa estar no Vault antes de enviar

`apps_script_email_url` (a URL `/exec` da implantação) e
`apps_script_email_segredo` (o mesmo valor de `TRAILUP_SEGREDO` nas
propriedades do script). Sem eles, o contato levanta erro e o aviso registra o
motivo na linha e tenta de novo depois, como já fazia sem a chave da Brevo.

Revision ID: 20261101_14
Revises: 20261101_13
Create Date: 2026-11-01
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261101_14"
down_revision = "20261101_13"
branch_labels = None
depends_on = None

CONTATO = "public.fn_enviar_contato(text, text, text, text)"
CONTATO_PUBLICO = "public.fn_enviar_contato_publico(text, text, text, text, text)"
ENVIO = "public.fn_email_apps_script(text, text, text, text, text, text)"
ERRO_CONFIG = "public.fn_email_apps_script_erro_config()"
ACEITO = "public.fn_email_apps_script_aceito(integer, jsonb, text, boolean)"

ENVIO_SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_email_apps_script_erro_config()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_url     text;
  v_segredo text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'apps_script_email_url';
    SELECT decrypted_secret INTO v_segredo FROM vault.decrypted_secrets WHERE name = 'apps_script_email_segredo';
  EXCEPTION WHEN undefined_table OR invalid_schema_name OR insufficient_privilege THEN
    RETURN 'Vault indisponivel';
  END;
  IF NOT starts_with(btrim(coalesce(v_url, '')), 'https://script.google.com/') THEN
    RETURN 'segredo apps_script_email_url ausente ou invalido no Vault';
  END IF;
  IF btrim(coalesce(v_segredo, '')) = '' THEN
    RETURN 'segredo apps_script_email_segredo ausente no Vault';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_email_apps_script_erro_config() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_email_apps_script(
  p_para text, p_assunto text, p_texto text,
  p_html text DEFAULT NULL, p_responder_para text DEFAULT NULL, p_nome_remetente text DEFAULT 'TrailUp'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_erro text := public.fn_email_apps_script_erro_config();
BEGIN
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = v_erro;
  END IF;
  RETURN net.http_post(
    url := btrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'apps_script_email_url')),
    body := jsonb_strip_nulls(jsonb_build_object(
      'segredo',        btrim((SELECT decrypted_secret FROM vault.decrypted_secrets
                                WHERE name = 'apps_script_email_segredo')),
      'para',           p_para,
      'assunto',        p_assunto,
      'texto',          p_texto,
      'html',           p_html,
      'responder_para', p_responder_para,
      'nome_remetente', p_nome_remetente
    )),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    -- O Apps Script pode levar alguns segundos na primeira chamada do dia.
    timeout_milliseconds := 30000
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_email_apps_script(text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- A regra de "e-mail enviado" sobre a resposta guardada pelo pg_net (ver docstring).
CREATE OR REPLACE FUNCTION public.fn_email_apps_script_aceito(
  p_status integer, p_headers jsonb, p_conteudo text, p_timed_out boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT NOT coalesce(p_timed_out, false) AND (
    (p_status IN (302, 303)
      AND starts_with(coalesce(p_headers ->> 'Location', p_headers ->> 'location', ''),
                      'https://script.googleusercontent.com/'))
    OR (p_status BETWEEN 200 AND 299
      AND coalesce(p_conteudo, '') ~ '"ok"\s*:\s*true')
  );
$function$;
"""

CONTATO_SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_enviar_contato(
  p_nome text, p_email text, p_assunto text, p_mensagem text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_aluno   uuid := auth.uid();
  v_destino text;
  v_teto    integer;
  v_usados  integer;
  v_corpo   text;
  v_req_id  bigint;
  v_nl      text := chr(10);
BEGIN
  -- A funcao e' SECURITY DEFINER e dispara e-mail com assunto e corpo
  -- vindos do parametro. Sem sessao ela e' um relay aberto.
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sem sessao';
  END IF;

  v_teto := COALESCE(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'contato_envios_por_hora'),
    5
  );

  SELECT count(*) INTO v_usados
    FROM public.contato_envios
   WHERE aluno_id = v_aluno
     AND criado_em > now() - interval '1 hour';

  IF v_usados >= v_teto THEN
    RAISE EXCEPTION USING MESSAGE =
      'limite de ' || v_teto::text || ' mensagens por hora atingido';
  END IF;

  v_destino := nullif(btrim(coalesce(
    (SELECT valor FROM public.app_config WHERE chave = 'contato_email_destino'),
    (SELECT valor FROM public.app_config WHERE chave = 'dono_email'),
    ''
  )), '');
  IF v_destino IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'contato: destino nao configurado em app_config';
  END IF;

  v_corpo := 'Nome: ' || COALESCE(p_nome, '') || v_nl
          || 'Email: ' || COALESCE(p_email, '') || v_nl || v_nl
          || 'Mensagem:' || v_nl
          || COALESCE(p_mensagem, '');

  -- Responder-para so' com e-mail valido: o script recusa o envio inteiro
  -- se o campo vier malformado.
  v_req_id := public.fn_email_apps_script(
    p_para           := v_destino,
    p_assunto        := p_assunto,
    p_texto          := v_corpo,
    p_responder_para := CASE WHEN btrim(coalesce(p_email, '')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                             THEN btrim(p_email) END,
    p_nome_remetente := 'TrailUp Contato'
  );

  INSERT INTO public.contato_envios (aluno_id, assunto)
  VALUES (v_aluno, p_assunto);

  -- `net.http_post` e' assincrono: enfileira e devolve o id na hora, entao
  -- falha de rede nao chega aqui.
  RAISE NOTICE USING MESSAGE =
    'Apps Script request_id = ' || COALESCE(v_req_id::text, 'nulo');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_enviar_contato(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_enviar_contato(text, text, text, text) TO authenticated;
"""

CONTATO_PUBLICO_SQL = r"""
CREATE OR REPLACE FUNCTION public.fn_enviar_contato_publico(
  p_nome text, p_email text, p_assunto text, p_mensagem text, p_armadilha text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_nome      text := btrim(regexp_replace(coalesce(p_nome, ''), '[\r\n]+', ' ', 'g'));
  v_email     text := btrim(coalesce(p_email, ''));
  v_assunto   text := btrim(regexp_replace(coalesce(p_assunto, ''), '[\r\n]+', ' ', 'g'));
  v_mensagem  text := btrim(coalesce(p_mensagem, ''));
  v_headers   json;
  v_origem    text;
  v_hash      text;
  v_teto_orig integer;
  v_teto_tot  integer;
  v_usados    integer;
  v_total     integer;
  v_destino   text;
  v_req_id    bigint;
  v_nl        text := chr(10);
BEGIN
  -- Armadilha: campo invisível preenchido = robô. Finge sucesso, não envia.
  IF btrim(coalesce(p_armadilha, '')) <> '' THEN
    RETURN;
  END IF;

  IF char_length(v_nome) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'contato: nome invalido';
  END IF;
  IF char_length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'contato: email invalido';
  END IF;
  IF char_length(v_assunto) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'contato: assunto invalido';
  END IF;
  IF char_length(v_mensagem) NOT BETWEEN 10 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'contato: mensagem invalida';
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_origem := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'desconhecida'
  );
  v_hash := encode(extensions.digest(v_origem, 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtext('fn_enviar_contato_publico'));
  DELETE FROM public.contato_publico_envios WHERE criado_em < now() - interval '24 hours';

  v_teto_orig := coalesce((SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
                             FROM public.app_config WHERE chave = 'contato_publico_por_hora_origem'), 3);
  v_teto_tot  := coalesce((SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
                             FROM public.app_config WHERE chave = 'contato_publico_por_hora_total'), 30);

  SELECT count(*) FILTER (WHERE origem_hash = v_hash), count(*)
    INTO v_usados, v_total
    FROM public.contato_publico_envios
   WHERE criado_em > now() - interval '1 hour';

  IF v_usados >= v_teto_orig OR v_total >= v_teto_tot THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'contato: limite de mensagens por hora atingido';
  END IF;

  v_destino := nullif(btrim(coalesce(
    (SELECT valor FROM public.app_config WHERE chave = 'contato_email_destino'),
    (SELECT valor FROM public.app_config WHERE chave = 'dono_email'),
    ''
  )), '');
  IF v_destino IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'contato: destino nao configurado em app_config';
  END IF;

  v_req_id := public.fn_email_apps_script(
    p_para           := v_destino,
    p_assunto        := '[Site] ' || v_assunto,
    p_texto          := 'Origem: formulario publico do site' || v_nl
                     || 'Nome: ' || v_nome || v_nl
                     || 'Email: ' || v_email || v_nl
                     || 'Assunto: ' || v_assunto || v_nl || v_nl
                     || 'Mensagem:' || v_nl || v_mensagem,
    p_responder_para := v_email,
    p_nome_remetente := 'TrailUp Contato (site)'
  );

  INSERT INTO public.contato_publico_envios (origem_hash) VALUES (v_hash);
  RAISE NOTICE USING MESSAGE = 'Apps Script request_id = ' || coalesce(v_req_id::text, 'nulo');
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_enviar_contato_publico(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enviar_contato_publico(text, text, text, text, text) TO anon, authenticated;
"""

AVISO_SQL = r"""CREATE OR REPLACE FUNCTION public.retencao_avisos_email(p_aplicar boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
AS $function$
DECLARE
  v_aplicar     boolean;
  v_aviso       integer;
  v_lote        integer;
  v_max_tent    integer;
  v_espera_seg  integer;
  v_link        text;
  v_tem_net     boolean := to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NOT NULL;
  v_tem_resp    boolean := to_regclass('net._http_response') IS NOT NULL;
  v_confirmados bigint := 0;
  v_falhas      bigint := 0;
  v_enviados    bigint := 0;
  v_sem_email   bigint := 0;
  v_pendentes   bigint := 0;
  v_aguardando  bigint := 0;
  v_esgotados   bigint := 0;
  v_erro_cfg    text;
  v_n_sem_resposta bigint;
  v_prazo       text;
  v_req_id      bigint;
  v_texto       text;
  v_html        text;
  v_nl          text := chr(10);
  r             record;
BEGIN
  v_aplicar := coalesce(
    p_aplicar,
    (SELECT valor = 'aplicar' FROM public.app_config WHERE chave = 'retencao_modo'),
    false);
  v_aviso      := public.retencao_config_int('retencao_conta_aviso_dias', 30);
  v_lote       := greatest(public.retencao_config_int('retencao_aviso_email_lote', 100), 1);
  v_max_tent   := greatest(public.retencao_config_int('retencao_aviso_email_max_tentativas', 10), 1);
  v_espera_seg := 6 * 3600; -- o pg_net guarda a resposta por 6 horas

  SELECT count(*) FILTER (WHERE v.email_request_id IS NOT NULL),
         count(*) FILTER (WHERE v.email_request_id IS NULL AND v.email_tentativas >= v_max_tent),
         count(*) FILTER (WHERE v.email_request_id IS NULL AND v.email_tentativas < v_max_tent
                            AND v.email_proxima_tentativa_em <= now())
    INTO v_aguardando, v_esgotados, v_pendentes
    FROM public.retencao_avisos_inatividade v
   WHERE v.email_enviado_em IS NULL AND v.exclusao_enfileirada_em IS NULL;

  IF NOT v_aplicar THEN
    RETURN jsonb_build_object(
      'modo', 'simular', 'enviaria', v_pendentes, 'aguardando_resposta', v_aguardando,
      'esgotados', v_esgotados);
  END IF;

  -- Duas execucoes ao mesmo tempo (cron + worker) nao mandam o mesmo e-mail.
  IF NOT pg_try_advisory_xact_lock(hashtext('retencao_avisos_email')) THEN
    RETURN jsonb_build_object('pulado', 'outra execucao em andamento');
  END IF;

  -- 1) Confere os pedidos ja feitos ao pg_net (assincrono: a resposta chega
  --    depois do COMMIT de quem pediu). "Aceito" e' a regra do Apps Script:
  --    2xx com "ok": true no corpo, nao so' 2xx: o script que falhou tambem
  --    responde 200, com a pagina de erro (ver 20261101_14).
  IF v_tem_resp THEN
    WITH resp AS (
      SELECT v.aluno_id, hr.status_code, hr.timed_out, hr.error_msg, hr.created,
             public.fn_email_apps_script_aceito(hr.status_code, hr.headers, hr.content, hr.timed_out) AS aceito
        FROM public.retencao_avisos_inatividade v
        JOIN net._http_response hr ON hr.id = v.email_request_id
       WHERE v.email_request_id IS NOT NULL AND v.email_enviado_em IS NULL),
    ok AS (
      UPDATE public.retencao_avisos_inatividade v
         SET email_enviado_em = coalesce(resp.created, now()),
             email_request_id = NULL, email_ultimo_erro = NULL
        FROM resp
       WHERE resp.aluno_id = v.aluno_id
         AND resp.aceito
      RETURNING 1),
    falhou AS (
      UPDATE public.retencao_avisos_inatividade v
         SET email_request_id = NULL,
             email_ultimo_erro = left(coalesce('HTTP ' || resp.status_code::text, '')
                                      || CASE WHEN resp.timed_out THEN ' timeout' ELSE '' END
                                      || coalesce(' ' || resp.error_msg, ''), 300),
             email_proxima_tentativa_em = now() + make_interval(
               secs => least(900 * (2 ^ greatest(v.email_tentativas - 1, 0))::integer, 86400))
        FROM resp
       WHERE resp.aluno_id = v.aluno_id
         AND NOT resp.aceito
      RETURNING 1)
    SELECT (SELECT count(*) FROM ok), (SELECT count(*) FROM falhou) INTO v_confirmados, v_falhas;
  END IF;

  -- Pedido sem resposta depois do prazo do pg_net: conta como falha e tenta de novo.
  UPDATE public.retencao_avisos_inatividade v
     SET email_request_id = NULL,
         email_ultimo_erro = 'sem resposta do pg_net',
         email_proxima_tentativa_em = now()
   WHERE v.email_request_id IS NOT NULL AND v.email_enviado_em IS NULL
     AND v.email_solicitado_em < now() - make_interval(secs => v_espera_seg);
  GET DIAGNOSTICS v_n_sem_resposta = ROW_COUNT;
  v_falhas := v_falhas + v_n_sem_resposta;

  -- 2) Configuracao. Faltando algo, nada e enviado e o motivo fica na linha.
  --    O remetente e' a conta Google do script: nao ha remetente a configurar.
  v_link := coalesce(nullif(btrim((SELECT valor FROM public.app_config WHERE chave = 'retencao_aviso_link')), ''),
                     'https://trailup.vercel.app');
  IF NOT v_tem_net THEN
    v_erro_cfg := 'pg_net ausente';
  ELSE
    v_erro_cfg := public.fn_email_apps_script_erro_config();
  END IF;

  -- 3) Envia os pendentes.
  FOR r IN
    SELECT v.aluno_id,
           nullif(btrim(coalesce(u.email, a.email, '')), '') AS email
      FROM public.retencao_avisos_inatividade v
      LEFT JOIN auth.users u ON u.id = v.aluno_id
      LEFT JOIN public.alunos a ON a.id = v.aluno_id
     WHERE v.email_enviado_em IS NULL
       AND v.email_request_id IS NULL
       AND v.exclusao_enfileirada_em IS NULL
       AND v.email_tentativas < v_max_tent
       AND v.email_proxima_tentativa_em <= now()
     ORDER BY v.avisado_em
     LIMIT v_lote
     FOR UPDATE OF v SKIP LOCKED
  LOOP
    IF r.email IS NULL OR char_length(r.email) > 254 OR r.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      -- Sem e-mail valido: nao conta tentativa; olha de novo amanha (o titular
      -- pode cadastrar um). A conta NAO e apagada enquanto isso.
      UPDATE public.retencao_avisos_inatividade
         SET email_ultimo_erro = 'sem_email', email_proxima_tentativa_em = now() + interval '1 day'
       WHERE aluno_id = r.aluno_id;
      v_sem_email := v_sem_email + 1;
      CONTINUE;
    END IF;
    IF v_erro_cfg IS NOT NULL THEN
      UPDATE public.retencao_avisos_inatividade
         SET email_ultimo_erro = v_erro_cfg, email_proxima_tentativa_em = now() + interval '1 hour'
       WHERE aluno_id = r.aluno_id;
      v_falhas := v_falhas + 1;
      CONTINUE;
    END IF;

    v_prazo := to_char((now() + make_interval(days => v_aviso)) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    v_texto := 'Olá!' || v_nl || v_nl
      || 'Faz mais de dois anos que você não entra no TrailUp. Pela nossa política de privacidade, '
      || 'contas paradas por tanto tempo são apagadas.' || v_nl || v_nl
      || 'Quer manter a sua conta? É só entrar até ' || v_prazo || ':' || v_nl
      || v_link || v_nl || v_nl
      || 'Se você não entrar até essa data, a conta e os dados dela serão apagados de vez.' || v_nl || v_nl
      || 'Se você tem menos de 18 anos, mostre este e-mail ao seu responsável.' || v_nl || v_nl
      || 'Equipe TrailUp';
    v_html := '<p>Olá!</p>'
      || '<p>Faz mais de dois anos que você não entra no TrailUp. Pela nossa política de privacidade, '
      || 'contas paradas por tanto tempo são apagadas.</p>'
      || '<p>Quer manter a sua conta? É só entrar até <strong>' || v_prazo || '</strong>:</p>'
      || '<p><a href="' || replace(v_link, '"', '%22') || '">Entrar no TrailUp</a></p>'
      || '<p>Se você não entrar até essa data, a conta e os dados dela serão apagados de vez.</p>'
      || '<p>Se você tem menos de 18 anos, mostre este e-mail ao seu responsável.</p>'
      || '<p>Equipe TrailUp</p>';

    BEGIN
      v_req_id := public.fn_email_apps_script(
        p_para           := r.email,
        p_assunto        := 'Sua conta no TrailUp será apagada se você não entrar até ' || v_prazo,
        p_texto          := v_texto,
        p_html           := v_html,
        p_nome_remetente := 'TrailUp'
      );
      UPDATE public.retencao_avisos_inatividade
         SET email_request_id = v_req_id, email_solicitado_em = now(),
             email_tentativas = email_tentativas + 1, email_ultimo_erro = NULL
       WHERE aluno_id = r.aluno_id;
      v_enviados := v_enviados + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.retencao_avisos_inatividade
         SET email_tentativas = email_tentativas + 1,
             email_ultimo_erro = left(SQLERRM, 300),
             email_proxima_tentativa_em = now() + interval '1 hour'
       WHERE aluno_id = r.aluno_id;
      v_falhas := v_falhas + 1;
    END;
  END LOOP;

  IF v_falhas > 0 OR v_sem_email > 0 THEN
    RAISE LOG 'retencao_avisos_email: % falha(s), % sem e-mail', v_falhas, v_sem_email;
  END IF;

  RETURN jsonb_build_object(
    'modo', 'aplicar', 'confirmados', v_confirmados, 'enviados', v_enviados,
    'falhas', v_falhas, 'sem_email', v_sem_email, 'esgotados', v_esgotados,
    'erro_configuracao', v_erro_cfg);
END;
$function$;
REVOKE ALL ON FUNCTION public.retencao_avisos_email(boolean) FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(ENVIO_SQL)
    op.execute(CONTATO_SQL)
    op.execute(CONTATO_PUBLICO_SQL)
    op.execute(AVISO_SQL)


def _modulo(nome_arquivo: str):
    arquivo = Path(__file__).with_name(nome_arquivo)
    spec = importlib.util.spec_from_file_location(f"para_14_{arquivo.stem}", arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _contato_da_brevo() -> str:
    """`fn_enviar_contato` como a 20261003_07 deixou."""
    corpo = _modulo("20261003_07_contato_versionado.py")._CORPO
    return f"""
        CREATE OR REPLACE FUNCTION public.fn_enviar_contato(
          p_nome text, p_email text, p_assunto text, p_mensagem text
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
        AS $function${corpo}$function$;
        REVOKE EXECUTE ON FUNCTION {CONTATO} FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION {CONTATO} TO authenticated;
        """


def _contato_publico_da_brevo() -> str:
    """`fn_enviar_contato_publico` como a 20261024_06 deixou (só a função)."""
    sql = _modulo("20261024_06_contato_publico_brevo.py").SQL
    m = re.search(r"CREATE OR REPLACE FUNCTION public\.fn_enviar_contato_publico\(.*?\$function\$;", sql, re.S)
    if m is None:
        raise RuntimeError("fn_enviar_contato_publico da 20261024_06 nao encontrado")
    return (
        m.group(0)
        + f"\nREVOKE ALL ON FUNCTION {CONTATO_PUBLICO} FROM PUBLIC;"
        + f"\nGRANT EXECUTE ON FUNCTION {CONTATO_PUBLICO} TO anon, authenticated;"
    )


def downgrade() -> None:
    op.execute(_contato_da_brevo())
    op.execute(_contato_publico_da_brevo())
    op.execute(_modulo("20261024_07_exclusao_professor_e_aviso_inatividade.py").EMAIL_SQL)
    op.execute(f"DROP FUNCTION IF EXISTS {ENVIO}")
    op.execute(f"DROP FUNCTION IF EXISTS {ERRO_CONFIG}")
    op.execute(f"DROP FUNCTION IF EXISTS {ACEITO}")
