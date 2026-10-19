"""Dois FKs na mesma coluna: o NO ACTION anula o ON DELETE que alguem escreveu

Encontrado varrendo `pg_constraint` em producao. Cinco pares de FK duplicados
(mesma filha, mesma coluna, mesmo pai); em DOIS deles o par tem semantica
CONFLITANTE, e o Postgres aplica os dois:

    "iaDescricao".aluno_id -> alunos
      IADescricao_aluno_id_fkey   (sem ON DELETE  = NO ACTION)
      iadescricao_aluno_id_fkey   ON DELETE CASCADE

    classe_aluno."ultimaAtividade" -> atividades
      classe_aluno_ultimaAtividade_fkey   (sem ON DELETE = NO ACTION)
      classe_aluno_ultimaatividade_fkey   ON DELETE SET NULL

O restritivo ganha sempre: o DELETE levanta 23503 antes de o CASCADE/SET NULL
ter chance de rodar. Quem escreveu o segundo constraint corrigiu o
comportamento e a correcao nunca entrou em vigor -- sem erro, sem aviso.

Demonstrado com um par de tabelas de rascunho dentro de BEGIN/ROLLBACK: com os
dois constraints na mesma coluna, o DELETE no pai e bloqueado e a linha pai
continua la.

## O que isso quebra hoje

1. `alunos.id -> auth.users(id) ON DELETE CASCADE`. Apagar a conta do aluno no
   Auth cascateia para `alunos` -- e esse delete bate no FK sombra do
   `iaDescricao`. Aluno com qualquer linha de `iaDescricao` NAO consegue ter a
   conta apagada. E o caminho de exclusao a pedido (LGPD).

2. `ultimaAtividade` deveria virar NULL quando a atividade e excluida. Como
   nao vira, a atividade fica impossivel de excluir enquanto algum aluno a
   tiver como ultima -- o que e exatamente o caso comum.

## O que esta migracao NAO faz

Os outros tres pares duplicados sao `{a, a}` -- mesma semantica dos dois
lados, entao nao mudam comportamento, so fazem o Postgres checar duas vezes
por escrita (`conteudo_personalizado` -> alunos/conteudos/topicos). Isso e
performance, e cai na #331, que decidiu esperar dado real antes de varrer.
Nao mexo neles aqui para esta migracao continuar sendo so correcao.

Revision ID: 20261018_11
Revises: 20261018_10
Create Date: 2026-10-14
"""

from alembic import op

revision = "20261018_11"
down_revision = "20261018_10"
branch_labels = None
depends_on = None


# (tabela, constraint a remover, constraint que fica, o que ela faz)
SOMBRAS = [
    ('public."iaDescricao"', "IADescricao_aluno_id_fkey", "iadescricao_aluno_id_fkey", "ON DELETE CASCADE"),
    ("public.classe_aluno", "classe_aluno_ultimaAtividade_fkey", "classe_aluno_ultimaatividade_fkey", "ON DELETE SET NULL"),
]


def upgrade() -> None:
    for tabela, sombra, mantido, _efeito in SOMBRAS:
        # Guarda: so remove a sombra se o constraint bom existir de fato. Numa
        # base onde o par nunca foi criado, remover o unico FK deixaria a
        # coluna sem integridade referencial nenhuma.
        op.execute(
            f"""
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{mantido}')
                 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{sombra}') THEN
                ALTER TABLE {tabela} DROP CONSTRAINT "{sombra}";
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    # Recria a sombra como ela era: FK sem ON DELETE. Reverter devolve o
    # bloqueio -- e a unica forma honesta de desfazer.
    op.execute(
        """
        ALTER TABLE public."iaDescricao"
          ADD CONSTRAINT "IADescricao_aluno_id_fkey"
          FOREIGN KEY (aluno_id) REFERENCES public.alunos(id)
        """
    )
    op.execute(
        """
        ALTER TABLE public.classe_aluno
          ADD CONSTRAINT "classe_aluno_ultimaAtividade_fkey"
          FOREIGN KEY ("ultimaAtividade") REFERENCES public.atividades(id)
        """
    )
