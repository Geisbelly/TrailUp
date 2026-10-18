"""Traz o envio de contato para migracao e corrige o nome do provedor (#172)

A issue #172 pedia seis coisas. Conferi uma por uma ao vivo no banco de
producao antes de escrever isto, e **quatro ja estavam feitas**:

| item da #172                                   | estado |
| ---------------------------------------------- | ------ |
| 1. revogar EXECUTE de PUBLIC/anon              | FEITO (ACL: postgres, authenticated, service_role) |
| 2. rotacionar a chave da Brevo                 | nao da' para verificar daqui |
| 3. tirar a credencial do corpo                 | FEITO (le de `vault.decrypted_secrets`, sem `xkeysib-` no corpo) |
| 4. limite por aluno                            | FEITO (teto/hora de `app_config`, contado em `contato_envios`) |
| 5. renomear para o provedor real               | **esta migracao** |
| 6. trazer para uma migracao Alembic            | **esta migracao** |

Os itens 5 e 6 nao eram cosmeticos: a funcao E a tabela `contato_envios`
existiam **so no banco vivo**. Nao eram reproduziveis em outro ambiente, nunca
passaram por PR e nao tinham historico -- a divida de schema nao versionado que
o CLAUDE.md descreve. Um ambiente novo subia sem o caminho de solicitacao de
exclusao de conta, e ninguem descobriria antes de um aluno tentar usar.

## O corpo e portado BYTE A BYTE do que esta em producao

De proposito. Se eu "melhorasse" o corpo aqui, rodar `alembic upgrade head`
passaria a MUDAR producao -- e o objetivo deste PR e o contrario: registrar o
que existe, para que a migracao seja no-op contra o banco atual e fiel em
ambiente novo. Duas coisas que vi e deliberadamente NAO mudei:

- `v_from` e um endereco literal no corpo. Mover para `app_config` e melhor
  (rotacionar deixa de exigir editar funcao), mas e mudanca de comportamento;
  fica para um PR proprio.
- a mensagem nao inclui `p_assunto` no corpo do texto, so no `subject`. E o
  que producao faz hoje.

## O que esta migracao muda

`fn_enviar_contato` passa a ser a implementacao, e
`fn_enviar_contato_sendgrid` vira um repassador fino para ela. O nome antigo
**nao e removido**: app Expo ja instalado no aparelho do aluno continua
chamando `fn_enviar_contato_sendgrid`, e nao da' para forcar atualizacao. Sem
o repassador, a solicitacao de exclusao de conta quebraria para quem nao
atualizou -- justamente num fluxo de LGPD.

## O detalhe que sustenta o teto por hora

`contato_envios` tem RLS **ligada e sem policy nenhuma**, e e' isso -- nao os
GRANTs -- que impede o aluno de mexer no proprio contador. Os GRANTs de
INSERT/UPDATE/DELETE para `authenticated` estao lá (como nas outras 84
tabelas); o que barra e' a ausencia de policy. **Quem adicionar uma policy de
DELETE aqui derruba o limite de abuso:** o aluno apaga as proprias linhas e o
`count(*)` da janela de uma hora volta a zero. Se um dia for preciso o aluno
ler o historico dele, crie policy **somente de SELECT**.

Por isso a tabela nasce aqui com RLS ligada e sem policy, e isso e' decisao
registrada, nao esquecimento (ver a regra de "tabela nova nasce com RLS
fechada" no CLAUDE.md).

## O que esta migracao NAO faz

Nao cria o segredo `brevo_api_key` no Vault nem o toca. Segredo nao entra em
migracao. Em ambiente novo, a funcao levanta
`segredo brevo_api_key ausente no Vault` -- erro claro, em vez de e-mail
silenciosamente nao enviado.

Revision ID: 20261003_07
Revises: 20261003_06
Create Date: 2026-10-07
"""

from alembic import op

revision = "20261003_07"
down_revision = "20261003_06"
branch_labels = None
depends_on = None

NOVA = "public.fn_enviar_contato(text, text, text, text)"
ANTIGA = "public.fn_enviar_contato_sendgrid(text, text, text, text)"

# Corpo identico ao que esta em producao hoje (pg_get_functiondef), so com o
# nome trocado. Nao reformatar: divergencia aqui faz o upgrade mudar producao.
_CORPO = """
        DECLARE
          v_aluno   uuid := auth.uid();
          v_api_key text;
          v_from    text := 'geisbelly19@gmail.com';
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

          SELECT decrypted_secret INTO v_api_key
            FROM vault.decrypted_secrets WHERE name = 'brevo_api_key';

          IF v_api_key IS NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'segredo brevo_api_key ausente no Vault';
          END IF;

          -- A montagem por interpolacao saiu. O corpo antigo usava um
          -- especificador que o Postgres nao conhece, e o erro era engolido
          -- pela captura generica logo abaixo -- nenhum e-mail saiu daqui,
          -- nunca. Concatenacao nao tem especificador para errar.
          v_corpo := 'Nome: ' || COALESCE(p_nome, '') || v_nl
                  || 'Email: ' || COALESCE(p_email, '') || v_nl || v_nl
                  || 'Mensagem:' || v_nl
                  || COALESCE(p_mensagem, '');

          v_req_id := net.http_post(
            url := 'https://api.brevo.com/v3/smtp/email',
            body := jsonb_build_object(
              'sender',  jsonb_build_object('email', v_from, 'name', 'TrailUp Contato'),
              'to',      jsonb_build_array(
                           jsonb_build_object('email', v_from, 'name', 'TrailUp Contato')
                         ),
              'replyTo', jsonb_build_object('email', p_email, 'name', p_nome),
              'subject', p_assunto,
              'textContent', v_corpo
            ),
            params := '{}'::jsonb,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'api-key',      v_api_key
            ),
            timeout_milliseconds := 10000
          );

          INSERT INTO public.contato_envios (aluno_id, assunto)
          VALUES (v_aluno, p_assunto);

          -- SEM captura generica de excecao. `net.http_post` e' assincrono:
          -- ele enfileira e devolve o id na hora, entao falha de rede nao
          -- chega aqui. O que chegava era erro de PROGRAMACAO, e engoli-lo foi
          -- o que manteve a funcao quebrada sem ninguem notar.
          RAISE NOTICE USING MESSAGE =
            'Brevo request_id = ' || COALESCE(v_req_id::text, 'nulo');
        END;
        """


def upgrade() -> None:
    # --- tabela do contador (RLS ligada, SEM policy: ver docstring) ---
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.contato_envios (
          id         bigserial   PRIMARY KEY,
          aluno_id   uuid        NOT NULL
                     REFERENCES public.alunos (id) ON DELETE CASCADE,
          assunto    text,
          criado_em  timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("ALTER TABLE public.contato_envios ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS contato_envios_aluno_tempo_idx
          ON public.contato_envios (aluno_id, criado_em DESC)
        """
    )

    # --- parametro do teto ---
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.app_config (
          chave          text        PRIMARY KEY,
          valor          text        NOT NULL,
          descricao      text,
          publico        boolean     NOT NULL DEFAULT false,
          atualizado_em  timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        INSERT INTO public.app_config (chave, valor, descricao, publico)
        VALUES ('contato_envios_por_hora', '5',
                'Teto de mensagens de contato por aluno por hora.', false)
        ON CONFLICT (chave) DO NOTHING
        """
    )

    # --- a funcao, com o nome do provedor real ---
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.fn_enviar_contato(
          p_nome text, p_email text, p_assunto text, p_mensagem text
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
        AS $function${_CORPO}$function$
        """
    )

    # --- nome antigo vira repassador: app instalado ainda chama por ele ---
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_enviar_contato_sendgrid(
          p_nome text, p_email text, p_assunto text, p_mensagem text
        )
        RETURNS void
        LANGUAGE sql
        AS $function$
          -- OBSOLETO: o provedor e' Brevo, nunca foi SendGrid. Mantido porque
          -- app Expo ja instalado chama este nome e nao da' para forcar
          -- atualizacao. Remover so' quando a telemetria mostrar que nenhuma
          -- versao antiga ainda o chama.
          SELECT public.fn_enviar_contato(p_nome, p_email, p_assunto, p_mensagem);
        $function$
        """
    )

    for assinatura in (NOVA, ANTIGA):
        op.execute(f"REVOKE EXECUTE ON FUNCTION {assinatura} FROM PUBLIC, anon")
        op.execute(f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated")


def downgrade() -> None:
    # Volta o nome antigo a ser a implementacao e remove o novo. Tabelas e
    # parametro ficam: apagar o contador reabriria o limite de abuso, e
    # `app_config` e' compartilhada com outras chaves.
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.fn_enviar_contato_sendgrid(
          p_nome text, p_email text, p_assunto text, p_mensagem text
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
        AS $function${_CORPO}$function$
        """
    )
    op.execute(f"REVOKE EXECUTE ON FUNCTION {ANTIGA} FROM PUBLIC, anon")
    op.execute(f"GRANT EXECUTE ON FUNCTION {ANTIGA} TO authenticated")
    op.execute(f"DROP FUNCTION IF EXISTS {NOVA}")
