"""Missão ganha categoria: principal ou secundária

## O que já existia, medido antes de escrever

O schema de `missoes` cobria quase tudo que a trilha precisa — e descobrir isso evitou
reconstruir o que já estava feito:

| pedido | estado |
| --- | --- |
| o professor define | `origem` já aceita `'professor' | 'ia' | 'sistema'`, e há `criado_por` |
| missão individual × de guilda | `escopo` já aceita `'aluno' | 'turma' | 'guilda'` |
| perfis diferentes, missões específicas | `perfil_alvo` já tem CHECK com os 7 perfis BrainHex |
| o sistema direciona | `fn_missao_diaria_gerar` já usa `perfil_alvo`, e `fn_perfil_da_missao` resolve o perfil do aluno |

`fn_perfil_da_missao` merece nota: ela implementa a MESMA regra que o mobile usa em
`perfilVisualDoAluno` — o `perfil_ativo` salvo se ainda for representativo, senão o primeiro
representativo. Banco e app concordam sobre quem é o aluno; não há uma terceira resposta aqui.

## O que faltava

Uma coisa só: **não havia como dizer se a missão é principal ou secundária**. `slot` é do
rodízio diário (1..9) e não serve — duas missões do mesmo dia precisam de peso diferente na
trilha, e `slot` já significa "qual das do dia".

## A coluna

`categoria`, com CHECK em `principal`/`secundaria` e default `secundaria`.

O default não é neutralidade: as 48 missões que já existem são todas `origem='sistema'` e do
rodízio diário (medido). Nenhuma delas é a missão principal de um tópico, e promovê-las em
massa encheria a trilha de destaque falso. Principal passa a ser o que **alguém marcou como
principal** — que é o "o professor define" do pedido.

A coluna vale para qualquer escopo de propósito. Hoje só `escopo='aluno'` usa — a trilha —, mas
proibir por CHECK fecharia a porta para uma missão principal de guilda sem ganhar nada: o
`escopo` já diz onde cada uma aparece.

## O índice

A leitura da trilha é "as missões ativas desta turma, deste escopo, nesta categoria". O índice
parcial em `ativa` existe porque missão inativa nunca entra nessa consulta, e deixá-la fora
mantém o índice do tamanho do que é lido.

## O que esta migration NÃO faz

Não cria missão nenhuma, não mexe nas 48 existentes além do default, e não muda quem direciona
— `fn_missao_diaria_gerar` continua como está. A tela da trilha e o formulário do professor
(issue #150) são os dois pares desta coluna, e vêm depois.

## Downgrade

Remove a coluna e o índice. Perde-se a marcação de principal, que é o único dado novo aqui.

Revision ID: 20261022_03
Revises: 20261022_02
Create Date: 2026-10-22
"""

from alembic import op

revision = "20261022_03"
down_revision = "20261022_02"
branch_labels = None
depends_on = None


COLUNA = """
ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'secundaria';

ALTER TABLE public.missoes
  DROP CONSTRAINT IF EXISTS missoes_categoria_check;

ALTER TABLE public.missoes
  ADD CONSTRAINT missoes_categoria_check
  CHECK (categoria = ANY (ARRAY['principal'::text, 'secundaria'::text]));
"""

INDICE = """
CREATE INDEX IF NOT EXISTS missoes_trilha_idx
    ON public.missoes (classe_id, escopo, categoria)
 WHERE ativa;
"""


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(INDICE)


def downgrade() -> None:
    # A marcacao de principal e' o unico dado novo; o resto da linha continua intacto.
    op.execute("DROP INDEX IF EXISTS public.missoes_trilha_idx;")
    op.execute(
        "ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_categoria_check;"
    )
    op.execute("ALTER TABLE public.missoes DROP COLUMN IF EXISTS categoria;")
