"""Foto de perfil do professor: `professor.foto_url`

O professor sobe, troca e remove a foto em "Meus dados", e ela aparece no topo do console e no
cabeçalho do site quando ele está logado. O arquivo vai para o bucket privado `perfil_fotos`, no
mesmo esquema do aluno (20261024_09): o nome do objeto é `<uid>/<timestamp>.<ext>`, e as policies
`trailup_sobe_propria_foto` / `_troca_` / `_apaga_` de `storage.objects` já deixam cada conta gravar
só na pasta do próprio uuid — servem para o professor sem mudança. A leitura também: o dono do
arquivo lê pela `trailup_pode_ler_arquivo`.

A coluna guarda a REFERÊNCIA `perfil_fotos/<uid>/<arquivo>` (o console assina na hora de mostrar),
nunca URL pública, que dá 400 com o bucket fechado. O CHECK prende a referência à pasta do próprio
professor: sem ele, `foto_url` poderia apontar para a foto de outra conta.

Sem policy nova: o professor já atualiza a própria linha de `professor` (nome, instituição, ...) e o
GRANT de UPDATE é da tabela, então a coluna nova entra nele.

Revision ID: 20261103_13
Revises: 20261103_12
Create Date: 2026-11-03
"""

from alembic import op

revision = "20261103_13"
down_revision = "20261103_12"
branch_labels = None
depends_on = None

UPGRADE_SQL = r"""
ALTER TABLE public.professor ADD COLUMN IF NOT EXISTS foto_url text;

ALTER TABLE public.professor DROP CONSTRAINT IF EXISTS professor_foto_url_na_pasta_do_dono;
ALTER TABLE public.professor ADD CONSTRAINT professor_foto_url_na_pasta_do_dono
  CHECK (foto_url IS NULL OR left(foto_url, length('perfil_fotos/' || id::text || '/'))
                             = 'perfil_fotos/' || id::text || '/');

COMMENT ON COLUMN public.professor.foto_url IS
  'Referencia perfil_fotos/<uid>/<arquivo> da foto de perfil (20261103_12); o console assina na leitura.';
"""

DOWNGRADE_SQL = """
ALTER TABLE public.professor DROP CONSTRAINT IF EXISTS professor_foto_url_na_pasta_do_dono;
ALTER TABLE public.professor DROP COLUMN IF EXISTS foto_url;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
