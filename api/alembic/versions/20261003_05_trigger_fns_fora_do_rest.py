"""Funcao de trigger sai da superficie REST de anon/authenticated

O linter do Supabase aponta 3 funcoes `SECURITY DEFINER` executaveis por `anon`
(`fn_questoes_espelha_gabarito`, `trailup_sync_tempo_da_telemetria` e
`fn_auth_email_exists`) e 106 por `authenticated`. Varrendo a classe inteira:
**27 funcoes que retornam `trigger`** tinham EXECUTE para `PUBLIC`, `anon` ou
`authenticated`, 9 delas `SECURITY DEFINER`.

**Isto e endurecimento, nao vulnerabilidade.** Conferido ao vivo: o proprio
Postgres recusa a chamada direta das tres com

    0A000 / trigger functions can only be called as triggers

Ou seja, ninguem conseguia executar nenhuma delas por
`/rest/v1/rpc/<nome>` hoje. O que esta migracao faz e tirar da ACL um direito
que nao servia para nada e que so polui o linter -- 109 avisos que escondem
os achados reais na proxima varredura.

Revogar EXECUTE **nao impede o trigger de disparar**: o Postgres nao checa esse
privilegio na hora de rodar o trigger. Verificado ao vivo, numa transacao
revertida: com EXECUTE revogado de `PUBLIC`/`anon`/`authenticated`, um INSERT
feito como `authenticated` disparou o trigger e gravou o valor que ele escreve.

O loop e dinamico de proposito -- pega tambem as funcoes que vieram de schema
nao versionado (`atualiza_updated_at`, `prevent_topico_cycle`,
`update_updated_at_column`...), que sao a maioria, e qualquer trigger futura.

Efeito medido ao vivo (transacao revertida):

    antes:  27 trigger fns executaveis por anon/authenticated
    depois:  0
    depois: 31 ainda executaveis por service_role    (intacto)
    depois: 249 RPCs normais intactas p/ authenticated (intacto)

**`fn_auth_email_exists` fica fora disto de proposito.** Ela nao e trigger, e
`anon` executa de verdade -- `CadastroAluno.tsx` e `CadastroProfessor.tsx`
chamam antes do login para decidir entre "entre com a senha" e "crie sua
conta". Revogar quebraria os dois cadastros. Que ela seja um oraculo de
enumeracao de email e um trade-off de produto, nao um descuido de ACL, e nao
se resolve numa migracao.

Revision ID: 20261003_05
Revises: 20261003_04
Create Date: 2026-10-06
"""

from alembic import op

revision = "20261003_05"
down_revision = "20261003_04"
branch_labels = None
depends_on = None

PAPEIS = "PUBLIC, anon, authenticated"


def _loop(comando: str) -> str:
    return f"""
        DO $$
        DECLARE
          f record;
        BEGIN
          FOR f IN
            SELECT p.oid::regprocedure AS fn
              FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace
               AND pg_get_function_result(p.oid) = 'trigger'
          LOOP
            EXECUTE format('{comando} ON FUNCTION %s {"FROM" if comando.startswith("REVOKE") else "TO"} {PAPEIS}', f.fn);
          END LOOP;
        END $$;
    """


def upgrade() -> None:
    op.execute(_loop("REVOKE EXECUTE"))


def downgrade() -> None:
    # devolve o estado anterior: EXECUTE para PUBLIC/anon/authenticated.
    op.execute(_loop("GRANT EXECUTE"))
