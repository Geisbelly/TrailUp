"""notificacoes_config: marcar o que e publico, em vez de expor a tabela toda

A policy criada em `20260826_04` era `FOR SELECT TO authenticated USING (true)`.
A tabela guarda `push_access_token` — ou seja, qualquer aluno autenticado
conseguia ler a credencial de push do projeto e enviar notificacao em nome do
app. Repeticao exata do erro que aquela mesma migracao veio corrigir nas outras
tabelas, so que cometido por mim ao criar a tabela nova.

A correcao e uma coluna explicita em vez de um padrao no nome da chave. Filtrar
por `chave NOT LIKE '%token%'` funcionaria hoje e falharia em silencio no dia em
que alguem inserisse `push_credencial` ou `api_key`: o default seguro tem que
ser "nao e publico", e a exposicao tem que ser uma decisao registrada linha a
linha.

O app precisa de leitura porque o contador local de tempo de uso compara com
`tempo_uso_limiar_min` sem ida ao servidor.

Revision ID: 20260826_06
Revises: 20260826_05
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_06"
down_revision = "20260826_05"
branch_labels = None
depends_on = None

# So o que o app realmente precisa ler. Tudo o mais fica invisivel por default.
CHAVES_PUBLICAS = (
    "tempo_uso_limiar_min",
    "max_por_dia",
    "janela_silencio_inicio",
    "janela_silencio_fim",
    "rotina_diaria_hora",
    "rotina_diaria_minuto",
    "sessao_ociosa_min",
)


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE notificacoes_config
          ADD COLUMN IF NOT EXISTS publico boolean NOT NULL DEFAULT FALSE
        """
    )
    lista = ", ".join(f"'{chave}'" for chave in CHAVES_PUBLICAS)
    op.execute(f"UPDATE notificacoes_config SET publico = TRUE WHERE chave IN ({lista})")
    op.execute(f"UPDATE notificacoes_config SET publico = FALSE WHERE chave NOT IN ({lista})")

    op.execute("DROP POLICY IF EXISTS notificacoes_config_sel ON notificacoes_config")
    op.execute(
        """
        CREATE POLICY notificacoes_config_sel ON notificacoes_config
          FOR SELECT TO authenticated USING (publico)
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS notificacoes_config_sel ON notificacoes_config")
    # A policy aberta NAO e recriada: ela expunha `push_access_token`.
    op.execute("ALTER TABLE notificacoes_config DROP COLUMN IF EXISTS publico")
