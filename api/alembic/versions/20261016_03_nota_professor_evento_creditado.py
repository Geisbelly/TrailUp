"""nota_professor: a nota que o professor dá entra no rank como evento CREDITADO

Primeiro passo do banco da tela Notas (docs/frontend/redesign-fase-2/05-analise-novas-telas.md,
seção 3.3). A issue #136 pede que a nota do professor entre no rank "pelo mesmo caminho
que o resto" — um evento em `eventos_aluno`. Presença, participação e prêmio de conquista
já são eventos **creditados**: quem concede define o valor, o aluno não pode gravá-los
(policy de INSERT), o gatilho de pontuação não os sobrescreve (`20260909_05`) e as
conquistas por métrica não os contam como uso do app (`20260909_01/03`). A nota do
professor tem exatamente esse perfil, então entra na mesma família:

1. `fn_evento_creditado` passa a reconhecer `nota_professor` (mesmo corpo de antes, mais
   um prefixo). Sem isto, o aluno poderia inserir "nota_professor" pelo próprio cliente
   e o gatilho zeraria/sobrescreveria o valor de uma nota legítima.
2. O índice único de idempotência é refeito com o tipo novo: **uma nota por aluno e
   atividade** (a referência será `classe:<id>:nota:<atividade>`); corrigir de novo
   atualiza o mesmo evento em vez de somar duas vezes.

O predicado do índice é lista literal de propósito (ver `20260909_03`): acrescentar um
tipo creditado tem de ser uma migration visível.

Revision ID: 20261016_03
Revises: 20261016_02
Create Date: 2026-10-16
"""

from alembic import op

revision = "20261016_03"
down_revision = "20261016_02"
branch_labels = None
depends_on = None

PREFIXOS_ANTES = ("presenca", "participacao", "conquista")
PREFIXOS_DEPOIS = PREFIXOS_ANTES + ("nota_professor",)
TIPOS_DO_INDICE_ANTES = ("presenca_aula", "participacao_aula", "conquista_desbloqueada")
TIPOS_DO_INDICE_DEPOIS = TIPOS_DO_INDICE_ANTES + ("nota_professor",)


def _funcao(prefixos: tuple[str, ...]) -> str:
    teste = " OR ".join(f"starts_with(lower(p_tipo), '{p}')" for p in prefixos)
    return f"""
CREATE OR REPLACE FUNCTION public.fn_evento_creditado(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT COALESCE(
    {teste},
    false
  );
$fn$;
"""


def _indice(tipos: tuple[str, ...]) -> str:
    lista = ", ".join(f"'{t}'" for t in tipos)
    return f"""
DROP INDEX IF EXISTS public.eventos_aluno_creditado_unico;
CREATE UNIQUE INDEX eventos_aluno_creditado_unico
  ON public.eventos_aluno (aluno_id, tipo, referencia)
  WHERE tipo IN ({lista});
"""


def upgrade() -> None:
    op.execute(_funcao(PREFIXOS_DEPOIS))
    op.execute(_indice(TIPOS_DO_INDICE_DEPOIS))


def downgrade() -> None:
    op.execute(_funcao(PREFIXOS_ANTES))
    op.execute(_indice(TIPOS_DO_INDICE_ANTES))
