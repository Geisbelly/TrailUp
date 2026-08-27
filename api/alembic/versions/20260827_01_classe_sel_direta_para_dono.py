"""RLS: classe_posse_sel ganha checagem direta de dono

`INSERT ... RETURNING` em `classe` (e o `.select()` encadeado apos `.insert()`
do supabase-js, que o console do professor usa pra criar turma) falhava com
`42501` mesmo com o `WITH CHECK` do INSERT batendo certinho. Isolado por
teste direto no banco (`SET LOCAL role authenticated` + `request.jwt.claims`
simulando o professor dono): sem `RETURNING` o INSERT passa liso; com
`RETURNING` (mesmo pedindo so `id`), quebra.

A causa: `classe_posse_sel` depende de `app_classes_do_professor()`, que e
`STABLE SECURITY DEFINER` e faz um `SELECT` na PROPRIA `classe` — a mesma
tabela do INSERT. Uma subquery auto-referente assim nao tem garantia de
enxergar a linha que o comando ATUAL acabou de inserir (a combinacao
STABLE + SECURITY DEFINER nao propaga automaticamente a escrita ainda nao
commitada da mesma statement para essa subquery). Resultado: o professor cria
a propria classe e o RETURNING falha achando que ele nao pode ve-la.

As demais tabelas de `CONTEUDO_POR_CLASSE` (topicos, conteudos, atividades,
questoes...) nao tem esse problema: os helpers delas (`app_classe_do_topico`
etc.) sempre consultam uma tabela DIFERENTE da que esta recebendo o INSERT
(topicos consulta `classe`, conteudos consulta `topicos`...), entao a
subquery le uma tabela que nao foi tocada pelo comando atual.

Fix: acrescenta um check direto na coluna (`professor_id = auth.uid()`) ao
lado do caminho via `app_minhas_classes()`. Ler a coluna da propria linha que
ja esta sendo varrida nao precisa reconsultar a tabela, entao nao sofre desse
problema — cobre "sou o dono" sem depender do helper auto-referente. O
caminho do aluno matriculado (via `classe_aluno`, tabela diferente) continua
identico.

Revision ID: 20260827_01
Revises: 20260826_19
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260827_01"
down_revision = "20260826_19"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS classe_posse_sel ON classe")
    op.execute(
        """
        CREATE POLICY classe_posse_sel ON classe
          FOR SELECT TO authenticated
          USING (
            professor_id = auth.uid()
            OR id IN (SELECT public.app_minhas_classes())
          )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS classe_posse_sel ON classe")
    op.execute(
        """
        CREATE POLICY classe_posse_sel ON classe
          FOR SELECT TO authenticated
          USING (id IN (SELECT public.app_minhas_classes()))
        """
    )
