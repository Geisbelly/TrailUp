"""RLS: professor lê as guildas das próprias turmas

O console lê `guildas` direto pelo Supabase num único lugar: `listarResultado`
(`frontend/src/components/console/eventos/eventosApi.ts`), que busca o nome de
cada guilda do ranking de um evento encerrado. Só que `guildas` nunca foi aberta
ao cliente — verificado ao vivo em 2026-10-18:

- `relrowsecurity = true` e **nenhuma** policy em `pg_policies`;
- nenhum GRANT para `anon`/`authenticated` (ACL só `postgres` e `service_role`).

Então não é nem o "fecha em silêncio" da lista vazia: como `authenticated`, o
`SELECT` dá `42501 permission denied for table guildas`. `listarResultado` lança,
e `traduzirErroDeEvento` transforma isso em "Você não tem permissão para isso
nesta turma." — o professor dono do evento não vê o resultado de nenhum evento
com modalidade de guilda. Hoje passa despercebido porque ainda não há guilda no
banco.

Escopo: só o professor dono da turma (`app_classes_do_professor()`), o mesmo
predicado de `eventos_classe_resultado_guilda_professor_sel` (`20261017_03`),
que é a tabela de onde saem os ids. O aluno **não** ganha leitura direta: o app
lê guildas só por RPC `SECURITY DEFINER` (`guilda_listar`, `guilda_chat_listar`),
e abrir a tabela para ele seria superfície nova sem nenhum leitor. As outras
tabelas `guilda_*` continuam sem GRANT e sem policy de propósito — o acesso
delas é só por RPC; nenhum cliente as lê direto.

Só leitura: nenhuma policy de escrita, então criar/editar guilda continua sendo
só pelas funções do banco.

Revision ID: 20261018_01
Revises: 20261017_10
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261018_01"
down_revision = "20261017_10"
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
