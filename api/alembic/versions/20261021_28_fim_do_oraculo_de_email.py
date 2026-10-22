"""#329: o oráculo de enumeração de e-mail morre com o cadastro em duas etapas

Issue #329, P0, decidida em 21/10 pelo caminho 2 das quatro opções que ela listava: **fundir as
etapas do cadastro**. O par é a mudança no frontend (`CadastroAluno.tsx`,
`CadastroProfessor.tsx`, `lib/cadastroEmUmaEtapa.ts`) — esta migration só recolhe o que sobrou
no banco.

## O que a função permitia

    POST /rest/v1/rpc/fn_auth_email_exists
    {"p_email": "alguem@exemplo.com"}  ->  true | false

`SECURITY DEFINER` com `search_path = public, auth`, corpo lendo `auth.users`, e EXECUTE para
**`PUBLIC`** e `anon` (medido: `proacl` traz `=X/postgres` além de `anon=X`). Qualquer pessoa na
internet descobria se um e-mail tem conta no TrailUp — sem autenticar e **sem rate limit**.

Não era descuido de ACL: o cadastro em duas telas pedia o e-mail primeiro e chamava isto para
decidir entre "entrar" e "criar". Por isso a migration de endurecimento (#328) a deixou de fora
de propósito, e por isso o caso virou issue em vez de PR.

## Por que dá para remover agora

| | |
| --- | --- |
| chamadores no cliente | **nenhum** depois da fusão — conferido por busca em `frontend/src` e `mobile/src`; só restam menções em comentário |
| chamadores no banco | **nenhum** (`prosrc` de nenhuma outra função a menciona) |
| quem decide "entrar ou criar" agora | `signIn` e, se ele falhar por credencial inválida, `signUp` — pela API de auth, que tem limite de taxa |

A indistinção que substitui o oráculo é a do próprio Supabase: `Invalid login credentials` é a
resposta tanto para conta inexistente quanto para senha errada. O frontend garante que
"conta já existe" (do `signUp`) caia na **mesma** mensagem — há teste em
`frontend/src/lib/cadastroEmUmaEtapa.test.ts` cobrando exatamente essa igualdade, porque é ali
que o oráculo voltaria se alguém quisesse ser mais prestativo.

## ORDEM DE APLICAÇÃO — importa

Aplicar **depois** de o frontend novo estar publicado. O site em produção que ainda chama a
função recebe PGRST202 e o cadastro quebra. Diferente do mobile, o frontend não tem base
instalada: publicar a Vercel resolve de uma vez, e aí esta migration pode entrar.

Por isso ela **não** foi aplicada junto com a escrita.

## Downgrade: recria a função, mas NÃO devolve o acesso anônimo

Assimetria deliberada, mesma decisão da `20261002_02`. Reverter um commit não deveria reabrir em
silêncio um oráculo não autenticado: a função volta para `authenticated`/`service_role`, e quem
precisar do fluxo antigo de duas etapas concede a `anon` à mão, sabendo o que está fazendo.

> Como na `20261021_24`, o corpo de produção tem CRLF (foi escrito no painel, no Windows) e aqui
> está normalizado para LF. O downgrade recria a função equivalente, não byte a byte — e isso só
> importaria se alguém fosse comparar md5 com a produção de antes, que é justamente o estado que
> não queremos de volta.

Revision ID: 20261021_28
Revises: 20261021_27
Create Date: 2026-10-21
"""

from alembic import op

revision = "20261021_28"
down_revision = "20261021_27"
branch_labels = None
depends_on = None


ASSINATURA = "public.fn_auth_email_exists(text)"

REMOVE = """
DROP FUNCTION IF EXISTS public.fn_auth_email_exists(text);

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(REMOVE)


def downgrade() -> None:
    # Recria a função SEM `anon`/PUBLIC — ver o docstring. O `REVOKE` é explícito porque o
    # `ALTER DEFAULT PRIVILEGES` do schema concede EXECUTE a `anon` em toda função nova, então
    # sem ele a reversão reabriria exatamente o buraco que a #329 descreve.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_auth_email_exists(p_email text)
         RETURNS boolean
         LANGUAGE plpgsql
         SECURITY DEFINER
         SET search_path TO 'public', 'auth'
        AS $function$
        DECLARE
          v_exists boolean;
        BEGIN
          SELECT EXISTS (
            SELECT 1
            FROM auth.users u
            WHERE lower(u.email) = lower(p_email)
          )
          INTO v_exists;

          RETURN v_exists;
        END;
        $function$;

        REVOKE ALL ON FUNCTION public.fn_auth_email_exists(text) FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.fn_auth_email_exists(text) TO authenticated, service_role;

        NOTIFY pgrst, 'reload schema';
        """
    )
