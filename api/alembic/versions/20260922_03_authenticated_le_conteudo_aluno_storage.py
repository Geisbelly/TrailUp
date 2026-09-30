"""authenticated ganha SELECT no bucket conteudo_aluno do Storage

Revision ID: 20260922_03b
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

Revision ID termina em "b" de proposito: o PR paralelo
(fix/merge-materiais-confere-storage-antes-de-completar, #227) ja usava
"20260922_03" a partir do mesmo 20260922_02. O rebase que aquele aviso
pedia NAO foi feito no merge: os dois entraram na main como irmaos, e a
"20260922_06" tambem, deixando TRES cabecas e quebrando o
test_alembic_tem_uma_unica_cabeca_e_cadeia_continua em todo PR seguinte.
O down_revision foi corrigido depois, aqui: esta revisao desce da
"20260922_03", e a "20260922_06" desce desta. A ordem entre as tres e'
indiferente - uma policy de Storage, uma funcao SQL de merge e uma
reescrita de URL nao se tocam -- e as tres sao idempotentes, entao
linearizar nao muda o que cada banco ja tem.

CREATE POLICY guardado por IF NOT EXISTS via pg_policies: a mesma policy
ja foi aplicada direto em producao (fora do fluxo de migration, pra
destravar o console do professor sem esperar deploy) e depois espelhada
no Geisbelly/TrailUp com uma migration nao-idempotente -- quando aquele
PR foi mesclado, o `alembic upgrade head` do proprio container tentou
recriar a policy que ja existia, `CREATE POLICY` nao suporta
`IF NOT EXISTS` nativamente, e a excecao (DuplicateObject) derrubou o
startup da API inteira (502 em tudo ate o container ser reiniciado com a
alembic_version corrigida manualmente). Esta versao evita repetir o
incidente em qualquer outro ambiente que rode esta migration contra o
mesmo banco.
"""

from alembic import op

revision = "20260922_03b"
down_revision = "20260922_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'storage'
              AND tablename = 'objects'
              AND policyname = 'authenticated_le_conteudo_aluno_storage'
          ) THEN
            CREATE POLICY "authenticated_le_conteudo_aluno_storage" ON storage.objects
              FOR SELECT TO authenticated
              USING (bucket_id = 'conteudo_aluno');
          END IF;
        END $$;
        """
    )
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(
        'DROP POLICY IF EXISTS "authenticated_le_conteudo_aluno_storage" ON storage.objects;'
    )
    op.execute("NOTIFY pgrst, 'reload schema'")
