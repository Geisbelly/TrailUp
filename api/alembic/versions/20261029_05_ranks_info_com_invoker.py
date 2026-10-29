"""F1 (segurança): `vw_ranks_info_por_classe` respeita a RLS de `ranks`

## O que quebrou

A `20260826_10` pôs todas as views do cliente em `security_invoker = on`. A `20261021_16` trocou
`vw_ranks_info_por_classe` (para listar só o período aberto e ganhar `periodo`/`inicio`) com
`CREATE OR REPLACE VIEW` **sem** a cláusula `WITH`, e o Postgres zera as opções da view nessa troca:
a opção se perdeu sem erro nenhum. Sem invoker a view roda como o dono (`postgres`), então a policy
`ranks_posse_sel` (`classe_id IN app_minhas_classes()`) não se aplica, e a view tem GRANT para
`authenticated`.

Medido em 29/10 com papel simulado: um `authenticated` sem turma lia **1 rank** pela view e **0**
pela tabela. É a mesma classe de falha que a I11 da F0 (`20261029_03`) caça, e essa view não está na
allowlist dela: a allowlist é só o par do ranking cru/filtrado (ver CLAUDE.md).

## O que muda

`ALTER VIEW ... SET (security_invoker = on)`. Só a opção: as colunas ficam como estão (o mobile lê
`*`), o GRANT de `authenticated` também. Não se recria a view, para não repetir a causa.

## `rank_tipo` e a policy

A view junta `ranks` com `rank_tipo`, e com invoker as duas são lidas COMO o cliente. Conferido no
código: `ranks` tem `ranks_posse_sel` (dono OU matriculado, por `app_minhas_classes()`) e `rank_tipo`
é "referência" na `20260826_09`, com `rank_tipo_posse_sel FOR SELECT TO authenticated USING (true)`.
Nenhuma migration posterior as recria. O aluno então lê o nome e o ícone do tipo do rank da turma
dele, e só dele. Por isso esta migration **não acrescenta policy**: nenhuma falta. Se faltasse, a view
voltaria vazia em silêncio (o `supabase-js` não levanta exceção), e a regra do CLAUDE.md é policy no
mesmo commit. O teste offline prende esse motivo.

## Downgrade

`RESET (security_invoker)`: volta ao estado de produção anterior, que é o defeito. Existe para a
migration ser reversível; não é um estado a manter.

Revision ID: 20261029_05
Revises: 20261029_04
Create Date: 2026-10-29
"""

from __future__ import annotations

from alembic import op

revision = "20261029_05"
down_revision = "20261029_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER VIEW public.vw_ranks_info_por_classe SET (security_invoker = on);")


def downgrade() -> None:
    op.execute("ALTER VIEW public.vw_ranks_info_por_classe RESET (security_invoker);")
