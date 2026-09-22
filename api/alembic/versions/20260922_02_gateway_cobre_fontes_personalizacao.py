"""vw_material_storage_paths passa a cobrir fontes_personalizacao (bucket 'conteudos')

O material do PROFESSOR (pptx/pdf anexado a um `conteudo`, sincronizado para
`fontes_personalizacao` com `metadata->>'bucket' = 'conteudos'`) nunca entrou
na view que o gateway `storage-redirect` usa para checar existencia. Ela so
cobria os TRES lugares onde midia GERADA (por aluno/perfil) guarda o caminho —
`materiais_gerados`, `conteudo_personalizado.materiais` e suas `partes[]`.

Com os arquivos saindo do Supabase Storage para o R2 (ver `20260829_01`), o
download direto do professor.pptx (usado como fonte pra gerar o material)
comecou a voltar 400/404 "Object not found": o arquivo real ja nao esta mais
no Storage, so no R2, e o gateway nunca soube resolver esse caminho porque a
view nao o continha.

Revision ID: 20260922_02
Revises: 20260922_01
Create Date: 2026-09-22
"""

from alembic import op

revision = "20260922_02"
down_revision = "20260922_01"
branch_labels = None
depends_on = None

VIEW = "public.vw_material_storage_paths"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE OR REPLACE VIEW {VIEW}
        WITH (security_invoker = on) AS
        -- 1. Artefatos com linha propria.
        SELECT mg.storage_path      AS storage_path,
               mg.personalizacao_id AS personalizacao_id,
               mg.conteudo_id       AS conteudo_id
          FROM public.materiais_gerados mg
         WHERE mg.storage_path IS NOT NULL

        UNION

        -- 2. Caminho no nivel da midia (materiais -> audio/markdown/apresentacao).
        SELECT e.v ->> 'storage_path',
               cp.id,
               cp.conteudo_id
          FROM public.conteudo_personalizado cp,
               LATERAL jsonb_each(cp.materiais) AS e(k, v)
         WHERE jsonb_typeof(cp.materiais) = 'object'
           AND jsonb_typeof(e.v) = 'object'
           AND jsonb_exists(e.v, 'storage_path')
           AND e.v ->> 'storage_path' IS NOT NULL

        UNION

        -- 3. Caminho de cada parte (materiais -> <midia> -> partes[]).
        SELECT parte ->> 'storage_path',
               cp.id,
               cp.conteudo_id
          FROM public.conteudo_personalizado cp,
               LATERAL jsonb_each(cp.materiais) AS e(k, v),
               LATERAL jsonb_array_elements(
                   CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                        THEN e.v -> 'partes'
                        ELSE '[]'::jsonb
                   END
               ) AS parte
         WHERE jsonb_typeof(cp.materiais) = 'object'
           AND parte ->> 'storage_path' IS NOT NULL

        UNION

        -- 4. Fonte do professor (upload/sync de `conteudos`), bucket 'conteudos'.
        --    Sem personalizacao_id/conteudo_id de conteudo_personalizado: usa o
        --    conteudo_id da propria fonte, quando houver.
        SELECT fp.storage_path,
               NULL::bigint,
               fp.conteudo_id
          FROM public.fontes_personalizacao fp
         WHERE fp.storage_path IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        CREATE OR REPLACE VIEW {VIEW}
        WITH (security_invoker = on) AS
        SELECT mg.storage_path      AS storage_path,
               mg.personalizacao_id AS personalizacao_id,
               mg.conteudo_id       AS conteudo_id
          FROM public.materiais_gerados mg
         WHERE mg.storage_path IS NOT NULL

        UNION

        SELECT e.v ->> 'storage_path',
               cp.id,
               cp.conteudo_id
          FROM public.conteudo_personalizado cp,
               LATERAL jsonb_each(cp.materiais) AS e(k, v)
         WHERE jsonb_typeof(cp.materiais) = 'object'
           AND jsonb_typeof(e.v) = 'object'
           AND jsonb_exists(e.v, 'storage_path')
           AND e.v ->> 'storage_path' IS NOT NULL

        UNION

        SELECT parte ->> 'storage_path',
               cp.id,
               cp.conteudo_id
          FROM public.conteudo_personalizado cp,
               LATERAL jsonb_each(cp.materiais) AS e(k, v),
               LATERAL jsonb_array_elements(
                   CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                        THEN e.v -> 'partes'
                        ELSE '[]'::jsonb
                   END
               ) AS parte
         WHERE jsonb_typeof(cp.materiais) = 'object'
           AND parte ->> 'storage_path' IS NOT NULL
        """
    )
