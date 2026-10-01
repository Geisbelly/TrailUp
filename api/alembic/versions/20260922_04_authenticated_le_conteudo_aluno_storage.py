"""authenticated ganha SELECT no bucket conteudo_aluno do Storage

Revision ID: 20260922_04
Revises: 20260922_03

`conteudo_aluno` (onde ficam os decks HTML/audio/PDF gerados pela
personalizacao) nunca teve nenhuma policy de SELECT em `storage.objects`.
Qualquer usuario autenticado (professor ou aluno) que tentasse baixar um
arquivo de la via `supabase.storage.download()` — exatamente o que
`HtmlDeckEmbed` (frontend/src/components/console/personalizacoes/
htmlDeckSource.ts) faz para renderizar a apresentacao no console do
professor — recebia erro de permissao, MESMO quando o arquivo existia de
verdade no bucket. Confirmado comparando apresentacoes que geraram com
sucesso (arquivo presente em storage.objects) e mesmo assim ficavam
bloqueadas na hora de pre-visualizar — ou seja, um bug de leitura
independente de qualquer falha de geracao.

O bucket irmao `conteudos` (upload do professor) ja tem essa policy
("Authenticated can read", bucket_id = 'conteudos'); `conteudo_aluno` ficou
de fora. Mesmo nivel de acesso: leitura ampla para qualquer usuario
logado, sem escopo por dono — o bucket ja e publico (metadata `public =
true`) e o path nao carrega aluno_id (base por perfil tambem vive aqui),
entao nao ha uma chave de posse pra restringir por linha sem quebrar o
caso de uso.
"""

from alembic import op

revision = "20260922_04"
down_revision = "20260922_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE POLICY "authenticated_le_conteudo_aluno_storage" ON storage.objects
          FOR SELECT TO authenticated
          USING (bucket_id = 'conteudo_aluno');
        """
    )
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(
        'DROP POLICY IF EXISTS "authenticated_le_conteudo_aluno_storage" ON storage.objects;'
    )
    op.execute("NOTIFY pgrst, 'reload schema'")
