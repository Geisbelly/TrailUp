"""tira o `anon` das SECURITY DEFINER alcancaveis por RPC

Revision ID: 20260920_04
Revises: 20260920_03
Create Date: 2026-09-20

A primeira linha da RLS daqui e "anonimo nao le nada" (`20260826_08`). Uma
funcao `SECURITY DEFINER` executavel por `anon` fura isso inteiro: ela roda
como dono, entao **policy nenhuma se aplica**, e o PostgREST a publica em
`/rest/v1/rpc/<nome>` para quem tiver a chave publica.

Eram 74, e **73 saem daqui** — sobra uma excecao declarada.

Das 74, oito retornam `trigger` e o Postgres de fato recusa a chamada direta
("trigger functions can only be called as triggers"), entao nao eram
alcancaveis. Mas a nona, `rls_auto_enable`, retorna `event_trigger` e eu
presumi que caisse na mesma regra. **Nao cai**: medido, ela EXECUTA quando
chamada direto por `anon`. Vira no-op, porque `pg_event_trigger_ddl_commands()`
nao devolve linha fora do contexto de event trigger — mas "hoje nao faz nada" e
garantia mais fraca que "nao da para chamar", e depende do corpo continuar como
esta. As 9 entram no laco junto com as outras.

Revogar NAO desliga gatilho: execucao de gatilho nao consulta EXECUTE. Medido
numa transacao revertida, com o grant ja revogado das 9 — um `CREATE TABLE`
ainda fez `rls_auto_enable` ligar a RLS na tabela nova, e um INSERT em
`telemetria_time_metric_entries` ainda fez `telemetria_resolver_entidade`
derivar `question:1049`.

Sobravam, entao, **65 alcancaveis por RPC sem login** mais essas 9.

## O que dava para fazer, medido assumindo a role `anon`

**Escrita sem autenticacao nenhuma.** `provisionar_estrutura_aluno_classe`
aceita qualquer aluno e qualquer turma e insere. Chamada com um aluno NAO
matriculado na classe 32, numa transacao revertida:

    topico_aluno     0 -> 4
    conteudo_aluno   0 -> 4
    atividade_aluno  0 -> 12     (matriculado_na_32 = 0)

Vinte linhas de progresso para alguem que nao esta na turma, sem login.

**Enumeracao de usuario.** `fn_auth_email_exists` le `auth.users` como dono:
devolveu `true` para um e-mail real e `false` para um inventado.

**Dado social.** `social_sao_colegas` confirmou que dois alunos especificos sao
colegas; `social_presenca_turma(32)` devolveu linha de presenca.

Das 65, 46 tem guarda `auth.uid()` e degradam para VAZIO quando o chamador e
anonimo (`social_listar_pessoas(32)` devolve 0 linhas) — modo de falha seguro.
As outras 19 nao tinham guarda nenhuma, e 8 delas escrevem.

## A correcao, e por que ela nao quebra o app

Revogar `anon` **nao toca em `authenticated`**. Varrendo o monorepo, sao 13
RPCs chamadas ao todo e **so uma roda antes do login**: `fn_auth_email_exists`,
nas telas de cadastro. Ela e a unica excecao.

Os dois riscos que nao dava para presumir foram conferidos:

- As Edge Functions (`generate-content-ai`, `validate-essay-answer-ai`) usam a
  chave anon MAS encaminham o `Authorization` do chamador — a role efetiva e
  `authenticated`.
- `service_role` tem grant PROPRIO em todas as 65 (`service_role=X/postgres` no
  `proacl`), entao `REVOKE ... FROM PUBLIC, anon` nao o alcanca. Medido: 0
  funcoes perderam `service_role`. Isso importa porque a API, o microservice e
  o BrainHexPDF usam SERVICE_ROLE_KEY.

O `anon` tinha o privilegio por DOIS caminhos — grant explicito (`anon=X`) e
`PUBLIC` (`=X`). Revogar so de `anon` nao adiantaria; e por isso que a forma e
`FROM PUBLIC, anon`, a mesma da `20260826_09`.

## Por catalogo, e nao por lista

A `20260826_09` usou lista fixa. Aqui nao: o conjunto e definido por uma
PROPRIEDADE ("`SECURITY DEFINER` que `anon` alcanca"), nao por identidade, e o
proprio `CLAUDE.md` registra que *"funcao nova nasce executavel por `anon`"* —
lista fixa envelhece na proxima funcao criada. O laco varre o catalogo, e a
guarda no fim exige que NAO sobre nenhuma fora da excecao.

`fn_trilha_by_classe` entra no laco como as outras. Ela esta quebrada por outro
motivo (le `public.v_trilha_topicos`, que nao existe) e tirar o `anon` nao
conserta isso — so reduz a superficie de uma funcao morta.
"""

from alembic import op

revision = "20260920_04"
down_revision = "20260920_03"
branch_labels = None
depends_on = None


# A UNICA chamada pre-login do monorepo: `CadastroAluno.tsx` e
# `CadastroProfessor.tsx` perguntam se o e-mail ja existe antes de haver sessao.
#
# O custo e enumeracao de usuario, e ele e consciente. Mitigar de verdade pede
# rate limit ou uma Edge Function no meio -- nao e o que esta migracao faz.
_EXCECOES_PRE_LOGIN = ("fn_auth_email_exists",)


_SELECT_ALVOS = """
      SELECT p.oid::regprocedure::text AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
       WHERE n.nspname = 'public'
         AND l.lanname IN ('sql', 'plpgsql')
         AND p.prosecdef
         AND has_function_privilege('anon', p.oid, 'execute')
         AND p.proname <> ALL (%(excecoes)s)
"""


def _lista_de_excecoes() -> str:
    nomes = ", ".join(f"'{nome}'" for nome in _EXCECOES_PRE_LOGIN)
    return f"ARRAY[{nomes}]::text[]"


def upgrade() -> None:
    alvos = _SELECT_ALVOS % {"excecoes": _lista_de_excecoes()}

    op.execute(
        f"""
        DO $revoga$
        DECLARE
          r record;
          v_n int := 0;
        BEGIN
          FOR r IN {alvos}
          LOOP
            -- `FROM PUBLIC, anon`: o privilegio chega pelos dois caminhos, e
            -- revogar so de um deixa a funcao aberta do mesmo jeito.
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
            -- Reafirma o grant de quem DEVE chamar. `service_role` tem grant
            -- proprio e nao e alcancado pelo REVOKE acima.
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
            v_n := v_n + 1;
          END LOOP;

          RAISE NOTICE 'anon revogado de % funcao(oes) SECURITY DEFINER', v_n;
        END
        $revoga$
        """
    )

    # A guarda e o ponto: nao "as 64 que eu contei", e sim NENHUMA sobrando
    # fora da excecao declarada.
    op.execute(
        f"""
        DO $guarda$
        DECLARE
          v_sobrou text;
        BEGIN
          SELECT string_agg(sig, ', ' ORDER BY sig) INTO v_sobrou
            FROM ({alvos}) alvos;

          IF v_sobrou IS NOT NULL THEN
            RAISE EXCEPTION
              'SECURITY DEFINER ainda alcancavel por anon: %', v_sobrou;
          END IF;
        END
        $guarda$
        """
    )


def downgrade() -> None:
    # Devolve o `anon` SO para as que esta migracao tirou. Nao ha registro de
    # quais eram, entao o criterio e o mesmo do upgrade lido ao contrario:
    # `SECURITY DEFINER`, chamavel por RPC, que hoje `anon` NAO alcanca.
    #
    # Isso inclui as seis internas do motor de notificacoes
    # (`notificacoes_varrer`, `_enviar_push`...), que nunca tiveram `anon` e
    # tambem nao tem `authenticated` -- elas sao de `service_role`, chamadas por
    # `pg_cron`. Por isso o filtro exige `authenticated`: quem nunca foi de
    # usuario nao volta a ser.
    #
    # ASSIMETRIA DELIBERADA: o upgrade revoga de 73, a volta devolve 64. As 9 de
    # `trigger`/`event_trigger` ficam revogadas. Devolve-las nao restauraria
    # comportamento nenhum -- gatilho nao consulta EXECUTE para disparar, e as
    # oito de `trigger` o Postgres nem deixa chamar. Seria reabrir superficie
    # para nada.
    op.execute(
        """
        DO $volta$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT p.oid::regprocedure::text AS sig
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              JOIN pg_language l ON l.oid = p.prolang
             WHERE n.nspname = 'public'
               AND l.lanname IN ('sql', 'plpgsql')
               AND p.prosecdef
               AND NOT has_function_privilege('anon', p.oid, 'execute')
               AND has_function_privilege('authenticated', p.oid, 'execute')
               AND pg_get_function_result(p.oid) NOT IN ('trigger', 'event_trigger')
          LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
          END LOOP;
        END
        $volta$
        """
    )
