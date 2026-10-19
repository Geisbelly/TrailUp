"""RLS: professor lê as guildas das próprias turmas

O console lê `guildas` direto pelo Supabase num único lugar: `listarResultado`
(`frontend/src/components/console/eventos/eventosApi.ts`), que busca o nome de
cada guilda do ranking de um evento encerrado. Só que `guildas` nunca foi aberta
ao cliente — verificado ao vivo em 2026-10-18:

- `relrowsecurity = true` e **nenhuma** policy em `pg_policies`;
- GRANTs: `authenticated` tem **SELECT**, `anon` não tem nada.

Com GRANT e sem policy, o `SELECT` devolve **0 linhas sem erro** — é o "fecha em
silêncio" que o CLAUDE.md descreve, não um 42501. Medido como `authenticated` em
produção: a consulta retorna vazio e não levanta exceção.

Consequência em `listarResultado`: `nomeDaGuilda` nasce vazio e **toda** guilda do
ranking cai no fallback `"Guilda"`. O professor vê o painel, com todas as guildas
com o mesmo nome — não um erro de permissão. Hoje passa despercebido porque ainda
não há guilda no banco, mas `eventos_classe` acabou de ser criada
(`20261017_01`), então vale no primeiro evento em modalidade guilda.

> Uma versão anterior desta docstring afirmava que não havia GRANT e que o erro
> era `42501`. Era leitura errada da ACL: `information_schema.role_table_grants`
> e `has_table_privilege('authenticated', ...)` mostram o SELECT, e a simulação
> de papel confirma que o retorno é vazio, não exceção. O `REVOKE ALL` abaixo
> continua valendo (normaliza `anon` para zero e deixa `authenticated` só com
> SELECT), mas não é ele que conserta o sintoma — é a policy.

Escopo: só o professor dono da turma (`app_classes_do_professor()`), o mesmo
predicado de `eventos_classe_resultado_guilda_professor_sel` (`20261017_03`),
que é a tabela de onde saem os ids. O aluno **não** ganha leitura direta: o app
lê guildas só por RPC `SECURITY DEFINER` (`guilda_listar`, `guilda_chat_listar`),
e abrir a tabela para ele seria superfície nova sem nenhum leitor. As outras
tabelas `guilda_*` continuam sem GRANT e sem policy de propósito — o acesso
delas é só por RPC; nenhum cliente as lê direto.

Só leitura: nenhuma policy de escrita, então criar/editar guilda continua sendo
só pelas funções do banco.

Revision ID: 20261019_03
Revises: 20261019_02
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261019_03"
down_revision = "20261019_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("REVOKE ALL ON public.guildas FROM anon, authenticated")
    op.execute("GRANT SELECT ON public.guildas TO authenticated")
    op.execute("DROP POLICY IF EXISTS guildas_professor_sel ON public.guildas")
    op.execute(
        """
        CREATE POLICY guildas_professor_sel ON public.guildas
          FOR SELECT TO authenticated
          USING (classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS guildas_professor_sel ON public.guildas")
    op.execute("REVOKE SELECT ON public.guildas FROM authenticated")
