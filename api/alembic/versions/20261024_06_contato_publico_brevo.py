"""Contato do site público pelo mesmo envio Brevo do app, sem formsubmit (#195)

O formulário de `/contato` do site mandava nome, e-mail e mensagem para
`formsubmit.co` (EUA, sem contrato), com o e-mail de destino escrito no
frontend. Esta migração cria `fn_enviar_contato_publico`, que reaproveita o
caminho que o app já usa em `fn_enviar_contato`: a mesma chave
`brevo_api_key` do Vault e o mesmo `net.http_post` para a API da Brevo. Não
entra provedor novo.

## Por que uma função nova e não abrir `fn_enviar_contato` para `anon`

`fn_enviar_contato` exige sessão de propósito: sem login ela é um relay
aberto (#172), e o teto dela é por aluno. O site público não tem sessão, então
a função nova tem a própria proteção:

- **armadilha (honeypot):** `p_armadilha` vem de um campo invisível. Se vier
  preenchido, a função devolve como se tivesse enviado e não envia nada, para o
  robô não aprender a evitar o campo;
- **tamanhos e formato:** nome 2–120, e-mail até 254 com formato básico,
  assunto 2–150, mensagem 10–5000; quebras de linha do nome e do assunto viram
  espaço;
- **teto por origem e teto global por hora:** em `app_config`
  (`contato_publico_por_hora_origem`, padrão 3; `contato_publico_por_hora_total`,
  padrão 30). A origem é o IP que o gateway da Supabase repassa em
  `request.headers` (`cf-connecting-ip`, senão o primeiro `x-forwarded-for`).
  Esse IP pode ser forjado em parte, e por isso existe o teto global, que segura o
  volume mesmo com origem trocada. Um advisory lock serializa a contagem.

## Dado guardado

`contato_publico_envios` guarda só `sha256(origem)` e a hora. Não guarda nome,
e-mail nem mensagem: a mensagem vai só para a Brevo e para a caixa de destino.
As linhas com mais de 24 h são apagadas pela própria função a cada chamada. A
tabela nasce com RLS ligada, sem policy e sem GRANT para `anon` ou
`authenticated` (mesma regra de `contato_envios`).

## Destino

O destino não está no código. Ele vem de `app_config.contato_email_destino`,
uma chave **opcional** que esta migração não cria. Sem ela, vale
`app_config.dono_email`, o e-mail do dono que já existe (20261013_02, privado).
O mesmo endereço é o remetente, como em `fn_enviar_contato`; por isso ele tem
de ser um remetente verificado na Brevo.

Esta migração não cria nem lê nenhum segredo: se `brevo_api_key` faltar no
Vault, a função levanta erro claro.

Revision ID: 20261024_06
Revises: 20261024_05
Create Date: 2026-10-24
"""

from alembic import op

revision = "20261024_06"
down_revision = "20261024_05"
branch_labels = None
depends_on = None

ASSINATURA = "public.fn_enviar_contato_publico(text, text, text, text, text)"

SQL = r"""
CREATE TABLE IF NOT EXISTS public.contato_publico_envios (
  id           bigserial   PRIMARY KEY,
  origem_hash  text        NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contato_publico_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contato_publico_envios FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS contato_publico_envios_tempo_idx
  ON public.contato_publico_envios (criado_em DESC);

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('contato_publico_por_hora_origem', '3',
   'Teto de mensagens do formulario publico do site por origem (IP) por hora.', false),
  ('contato_publico_por_hora_total', '30',
   'Teto global de mensagens do formulario publico do site por hora.', false)
ON CONFLICT (chave) DO NOTHING;

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
  v_api_key   text;
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

  SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets WHERE name = 'brevo_api_key';
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'segredo brevo_api_key ausente no Vault';
  END IF;

  v_req_id := net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    body := jsonb_build_object(
      'sender',  jsonb_build_object('email', v_destino, 'name', 'TrailUp Contato (site)'),
      'to',      jsonb_build_array(jsonb_build_object('email', v_destino, 'name', 'TrailUp Contato')),
      'replyTo', jsonb_build_object('email', v_email, 'name', v_nome),
      'subject', '[Site] ' || v_assunto,
      'textContent', 'Origem: formulario publico do site' || v_nl
                  || 'Nome: ' || v_nome || v_nl
                  || 'Email: ' || v_email || v_nl
                  || 'Assunto: ' || v_assunto || v_nl || v_nl
                  || 'Mensagem:' || v_nl || v_mensagem
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'api-key', v_api_key),
    timeout_milliseconds := 10000
  );

  INSERT INTO public.contato_publico_envios (origem_hash) VALUES (v_hash);
  RAISE NOTICE USING MESSAGE = 'Brevo request_id = ' || coalesce(v_req_id::text, 'nulo');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_enviar_contato_publico(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_enviar_contato_publico(text, text, text, text, text) TO anon, authenticated;
"""

DOWNGRADE = r"""
DROP FUNCTION IF EXISTS public.fn_enviar_contato_publico(text, text, text, text, text);
DROP TABLE IF EXISTS public.contato_publico_envios;
DELETE FROM public.app_config
 WHERE chave IN ('contato_publico_por_hora_origem', 'contato_publico_por_hora_total');
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE)
