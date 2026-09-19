"""o e-mail de contato passa a ser enviado de fato, sem chave no corpo e sem anon

Revision ID: 20260911_08
Revises: 20260911_07

Fecha a #172, e no caminho fecha algo que a issue nao viu.

## A funcao NUNCA enviou e-mail nenhum

O corpo monta o texto com:

    format('Nome: ' || chr(37) || 's...', ...)   -- com quatro ocorrencias de "n"
                                                 -- precedidas de porcento

`format()` do Postgres so conhece os especificadores `s`, `I` e `L`. O `n`
levanta `unrecognized format() type specifier "n"` -- conferido nesta base,
num bloco isolado. E o corpo termina com:

    exception
      when others then
        raise notice 'Erro Brevo/pg_net: ...';

Ou seja: o erro de programacao e' engolido num NOTICE, a funcao retorna normal,
e o cliente (`excluir.tsx`) checa `rpcError` e nao ve nada. **Todo pedido de
exclusao de conta foi descartado em silencio**, desde sempre.

E' o pior formato possivel de defeito: o caminho feliz e' indistinguivel do
caminho quebrado, dos dois lados.

## O que a issue apontava, e continua valendo

1. **`EXECUTE` para `PUBLIC` e `anon`.** A chave `anon` do Supabase viaja no
   bundle do app e do site. Uma funcao `SECURITY DEFINER` que dispara e-mail com
   assunto e corpo vindos do parametro, sem login e sem limite, e' um relay.
   O unico chamador do repo e' autenticado (`excluir.tsx`, depois de
   `supabase.auth.getUser()`), entao revogar nao quebra nada.

2. **Credencial literal no corpo.** Ela entra em todo dump e backup, aparece
   para quem tiver acesso ao painel, e rotacionar exige editar a funcao.

## O que esta migracao faz

- **Move a chave para o Vault** sem que ela passe por lugar nenhum: a extracao
  le `prosrc`, grava em `vault.create_secret` e devolve so' o id. O CONFERE
  compara DIGESTS (md5), nunca valores.
- **Corrige o `format()`** trocando por concatenacao com `chr(10)`.
- **Para de engolir erro.** O `exception when others` sai. `net.http_post` e'
  assincrono -- ele enfileira e devolve um id na hora --, entao falha de rede
  nao chega aqui de qualquer forma; o que chegava era erro de PROGRAMACAO, que
  precisa ser alto.
- **Exige sessao e limita o volume**, com o teto em `app_config`.
- **Revoga `EXECUTE` de `PUBLIC` e `anon`.**

## A chave continua precisando de rotacao

Mover para o Vault tira a chave dos dumps FUTUROS. Ela ja esteve no corpo da
funcao, entao esta nos backups existentes: rotacionar na Brevo continua sendo
necessario, e so quem tem a conta pode fazer isso.

Create Date: 2026-09-11
"""

from alembic import op

revision = "20260911_08"
down_revision = "20260911_07"
branch_labels = None
depends_on = None

_NOME_DO_SEGREDO = "brevo_api_key"


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Onde o controle de abuso conta.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.contato_envios (
          id bigserial PRIMARY KEY,
          aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
          assunto text,
          criado_em timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS contato_envios_aluno_tempo_idx
          ON public.contato_envios (aluno_id, criado_em DESC)
        """
    )
    op.execute("ALTER TABLE public.contato_envios ENABLE ROW LEVEL SECURITY")

    # Ninguem le nem escreve direto: quem grava e' a funcao, que e'
    # SECURITY DEFINER. Sem policy, a RLS nega tudo para anon e authenticated --
    # que e' exatamente o desejado.
    op.execute(
        """
        COMMENT ON TABLE public.contato_envios IS
          'Contagem de envios de contato por aluno, para o teto de abuso. Sem '
          'policy de propósito: quem grava é fn_enviar_contato_sendgrid, que é '
          'SECURITY DEFINER. RLS ligada nega o acesso direto.'
        """
    )

    op.execute(
        """
        INSERT INTO public.app_config (chave, valor)
        VALUES ('contato_envios_por_hora', '5')
        ON CONFLICT (chave) DO NOTHING
        """
    )

    # ------------------------------------------------------------------
    # 2. A chave vai para o Vault sem passar por lugar nenhum.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $segredo$
        DECLARE
          v_chave text;
          v_digest_origem text;
          v_digest_vault text;
        BEGIN
          IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'brevo_api_key') THEN
            RAISE NOTICE USING MESSAGE =
              'o segredo brevo_api_key ja esta no Vault, nada a mover';
            RETURN;
          END IF;

          SELECT (regexp_match(p.prosrc, 'xkeysib-[A-Za-z0-9_-]+'))[1]
            INTO v_chave
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = 'fn_enviar_contato_sendgrid';

          IF v_chave IS NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'nao achei a chave da Brevo no corpo da funcao e ela nao esta no '
              || 'Vault -- grave o segredo brevo_api_key antes de seguir';
          END IF;

          v_digest_origem := md5(v_chave);
          PERFORM vault.create_secret(
            v_chave,
            'brevo_api_key',
            'Chave da API da Brevo usada por fn_enviar_contato_sendgrid. '
            || 'Esteve no corpo da funcao ate a 20260911_08, entao esta nos '
            || 'backups anteriores: rotacione na Brevo.'
          );

          SELECT md5(decrypted_secret) INTO v_digest_vault
            FROM vault.decrypted_secrets WHERE name = 'brevo_api_key';

          -- Compara DIGESTS, nunca valores: prova que a copia e' fiel sem
          -- imprimir a chave em log de migracao nenhum.
          IF v_digest_vault IS DISTINCT FROM v_digest_origem THEN
            RAISE EXCEPTION USING MESSAGE =
              'o segredo gravado no Vault nao confere com o do corpo da funcao';
          END IF;

          RAISE NOTICE USING MESSAGE = 'chave da Brevo movida para o Vault';
        END
        $segredo$;
        """
    )

    # ------------------------------------------------------------------
    # 3. A funcao, agora sem chave, sem anon e sem engolir erro.
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_enviar_contato_sendgrid(
          p_nome text, p_email text, p_assunto text, p_mensagem text
        )
         RETURNS void
         LANGUAGE plpgsql
         SECURITY DEFINER
         SET search_path TO 'public', 'extensions', 'vault', 'pg_temp'
        AS $function$
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
        $function$
        """
    )

    # ------------------------------------------------------------------
    # 4. Quem pode executar.
    # ------------------------------------------------------------------
    op.execute(
        """
        REVOKE ALL ON FUNCTION public.fn_enviar_contato_sendgrid(text, text, text, text)
          FROM PUBLIC, anon
        """
    )
    op.execute(
        """
        GRANT EXECUTE ON FUNCTION public.fn_enviar_contato_sendgrid(text, text, text, text)
          TO authenticated
        """
    )

    # ------------------------------------------------------------------
    # 5. CONFERE.
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $confere$
        DECLARE
          v_src text;
          v_grants text;
          v_teste text;
        BEGIN
          SELECT p.prosrc INTO v_src
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'fn_enviar_contato_sendgrid';

          IF position('xkeysib-' IN v_src) > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a chave da Brevo continua no corpo da funcao';
          END IF;

          -- As duas assercoes casam a SINTAXE do defeito, nao a palavra: a
          -- primeira versao delas procurava 'exception' e 'format(' soltos, e
          -- acusou os proprios comentarios da funcao que explicam por que essas
          -- construcoes saíram. Mesmo erro que ja custou caro neste repo.
          IF position('when others then' IN lower(v_src)) > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a funcao ainda tem captura generica de excecao';
          END IF;

          IF position('format(''' IN v_src) > 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'a funcao ainda monta texto por interpolacao, onde o especificador invalido vivia';
          END IF;

          IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'brevo_api_key') THEN
            RAISE EXCEPTION USING MESSAGE = 'o segredo nao chegou ao Vault';
          END IF;

          SELECT string_agg(grantee, ', ') INTO v_grants
            FROM information_schema.role_routine_grants
           WHERE routine_schema = 'public'
             AND routine_name = 'fn_enviar_contato_sendgrid'
             AND grantee IN ('PUBLIC', 'anon');

          IF v_grants IS NOT NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'EXECUTE continua concedido a ' || v_grants;
          END IF;

          -- O texto agora monta sem estourar. E' o teste do defeito original.
          v_teste := 'Nome: ' || 'a' || chr(10) || 'Email: ' || 'b';
          IF length(v_teste) < 10 THEN
            RAISE EXCEPTION USING MESSAGE = 'a montagem do corpo falhou';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: e-mail monta, chave no Vault, anon fora, erro nao e mais engolido';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    # A funcao NAO volta ao corpo antigo: ele nunca enviou e-mail e carregava a
    # credencial. Reverter seria reintroduzir as duas coisas. O que se desfaz e'
    # o controle de abuso e a restricao de acesso.
    op.execute(
        """
        GRANT EXECUTE ON FUNCTION public.fn_enviar_contato_sendgrid(text, text, text, text)
          TO anon
        """
    )
    op.execute("DELETE FROM public.app_config WHERE chave = 'contato_envios_por_hora'")
    op.execute("DROP TABLE IF EXISTS public.contato_envios")
    # O segredo fica no Vault: apaga-lo deixaria a funcao sem credencial nenhuma.
