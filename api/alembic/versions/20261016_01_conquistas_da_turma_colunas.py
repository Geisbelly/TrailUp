"""conquistas da turma: reproduz classe_id/criado_por, e acrescenta `ativa` e o teto por turma

Primeiro passo do banco da tela Conquistas (docs/frontend/redesign-fase-2/05-analise-novas-telas.md,
seção 3.1). Três coisas:

1. **Captura o schema real.** `conquistas.classe_id` e `criado_por` já existem em produção
   (estão nos tipos gerados) e não estão em nenhuma migration — o mesmo "schema não
   versionado" de docs/architecture/schema-nao-versionado.md. `ADD COLUMN IF NOT EXISTS`
   torna isto inofensivo onde a coluna já existe e faz um banco novo ficar igual a
   produção. Em produção, o `REFERENCES` não é reaplicado (a coluna já existe).

2. **`ativa`.** "Desativar" no lugar de "excluir": apagar a conquista apagaria a posse
   de quem já ganhou (`conquistas_aluno` referencia `conquista_id`). A coluna só guarda o
   estado; **o gatilho que avalia conquistas ainda NÃO a lê** — a função do gatilho é
   composta por várias migrations e por trechos não versionados, e reescrevê-la às cegas
   é arriscado. Enquanto o gatilho não ignorar `ativa = false`, desativar só esconde a
   conquista da lista da turma. Esse passo exige conferir a função ao vivo.

3. **`conquistas_por_turma_max`** em `app_config` (padrão 20, `publico = true`: é parâmetro
   de tela, o console precisa ler para mostrar "12 de 20"). Os tetos anti-abuso continuam
   privados.

Revision ID: 20261016_01
Revises: 20261013_03
Create Date: 2026-10-16
"""

from alembic import op

revision = "20261016_01"
down_revision = "20261013_03"
branch_labels = None
depends_on = None


SQL = r"""
ALTER TABLE public.conquistas
  ADD COLUMN IF NOT EXISTS classe_id bigint REFERENCES public.classe(id) ON DELETE CASCADE;
ALTER TABLE public.conquistas
  ADD COLUMN IF NOT EXISTS criado_por uuid;
ALTER TABLE public.conquistas
  ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.conquistas.classe_id IS
  'NULL = conquista global da plataforma; preenchido = conquista exclusiva desta turma.';
COMMENT ON COLUMN public.conquistas.ativa IS
  'false = desativada pelo professor. Ninguem perde o que ja ganhou (a posse fica em conquistas_aluno).';

CREATE INDEX IF NOT EXISTS ix_conquistas_classe ON public.conquistas (classe_id) WHERE classe_id IS NOT NULL;

INSERT INTO public.app_config (chave, valor, descricao, publico)
VALUES (
  'conquistas_por_turma_max',
  '20',
  'Quantas conquistas proprias cada turma pode ter (ativas e desativadas). As globais nao contam.',
  true
)
ON CONFLICT (chave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    # classe_id e criado_por existiam antes desta migration em produção: não são removidas.
    op.execute("DELETE FROM public.app_config WHERE chave = 'conquistas_por_turma_max'")
    op.execute("DROP INDEX IF EXISTS public.ix_conquistas_classe")
    op.execute("ALTER TABLE public.conquistas DROP COLUMN IF EXISTS ativa")
    op.execute("NOTIFY pgrst, 'reload schema'")
