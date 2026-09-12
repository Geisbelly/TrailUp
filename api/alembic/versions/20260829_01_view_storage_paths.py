"""view unica de caminhos de material, para o gateway de arquivos no R2

Com os arquivos saindo do Supabase Storage para o R2, o objeto deixa de ter RLS:
no R2 nao existe policy, existe URL assinada. A autorizacao precisa acontecer
ANTES da assinatura, na Edge Function `storage-redirect`.

Hoje (Opcao A do spec) a funcao usa esta view como checagem de EXISTENCIA: ela
so' assina caminho que existe e esta' vivo. Sem isso assinaria qualquer chave
que pedissem, virando um oraculo de assinatura para o bucket inteiro - com ela,
os 537 arquivos orfaos e qualquer chave inventada ficam de fora.

Ela nasce com `security_invoker = on` mesmo assim, e isso e' proposital: e' o
que permite, quando o download do mobile souber mandar header, trocar a service
role pelo JWT do chamador e ganhar a AUTORIZACAO de graca - o RLS das tabelas
base passa a decidir sozinho, sem reimplementar "aluno matriculado ou professor
dono" dentro da funcao. Trocar de postura vira trocar a chave do client.

Por que UNION de tres fontes: o caminho do arquivo aparece em lugares
diferentes conforme quem gravou. Medido no banco: 1.095 objetos em
`conteudo_aluno`, dos quais so' 119 tem linha em `materiais_gerados` - o resto
so' e' alcancavel pelo JSONB `conteudo_personalizado.materiais`, no nivel da
midia e dentro de `partes[]`. Cobrir so' a tabela deixaria a maior parte do
material inacessivel pelo gateway.

Revision ID: 20260829_01
Revises: 20260827_05
"""

from alembic import op

revision = "20260829_01"
down_revision = "20260827_05"
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
        """
    )

    # `anon` nao le nada (20260826_08); quem consulta e' sempre um usuario logado,
    # via JWT repassado pela Edge Function.
    op.execute(f"REVOKE ALL ON {VIEW} FROM PUBLIC")
    op.execute(f"REVOKE ALL ON {VIEW} FROM anon")
    op.execute(f"GRANT SELECT ON {VIEW} TO authenticated")


def downgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {VIEW}")
