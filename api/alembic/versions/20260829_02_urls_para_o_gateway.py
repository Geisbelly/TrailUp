"""aponta as URLs de material para o gateway storage-redirect

Ultimo passo da migracao para o R2. Depois que os arquivos foram copiados, as
URLs gravadas ainda apontam para o Supabase Storage - e apagar os arquivos de la
sem reescrever isto deixaria todo material quebrado.

Sao 700 URLs em tres lugares (medido em 29/08/2026):

  materiais_gerados.arquivo_url               119
  materiais.<tipo>.arquivo_url                 71
  materiais.<tipo>.partes[].arquivo_url       510

**As 700 tem `storage_path` ao lado.** E por isso que esta migracao existe como
reescrita deterministica em vez de tabela de-para: a URL nova e' funcao pura do
`storage_path`, nos dois sentidos. O downgrade reconstroi a URL publica do
Supabase pelo mesmo caminho, sem precisar ter guardado a antiga.

Reexecutar e' inofensivo: o `storage_path` nao muda, entao a URL gerada e' a
mesma.

`SUPABASE_URL` vem do ambiente (api/.env). Nao ha valor embutido aqui de
proposito - a mesma migracao precisa rodar contra projetos diferentes.

Revision ID: 20260829_02
Revises: 20260829_01
"""

import os

from alembic import op

revision = "20260829_02"
down_revision = "20260829_01"
branch_labels = None
depends_on = None

BUCKET_PADRAO = "conteudo_aluno"


def _base_url() -> str:
    """
    Base do projeto Supabase, do ambiente ou das settings da API.

    O `env.py` do alembic ja' carrega `app.core.settings`, e e' de la' que vem o
    `.env` - `os.environ` sozinho fica vazio quando a migracao roda pelo
    `scripts/db-migrate.ps1`, que e' o caminho documentado. Tentar as duas
    fontes evita que o caminho normal falhe por uma variavel que existe.
    """
    bruto = (os.environ.get("SUPABASE_URL") or "").strip()

    if not bruto:
        try:
            from app.core.settings import get_settings

            bruto = (get_settings().supabase_url or "").strip()
        except Exception:  # noqa: BLE001 - settings indisponivel e' so' mais um "nao achei"
            bruto = ""

    bruto = bruto.rstrip("/")
    if not bruto:
        raise RuntimeError(
            "SUPABASE_URL ausente no ambiente e nas settings. Esta migracao "
            "reescreve URLs de material e precisa saber para qual projeto "
            "apontar; sem isso gravaria URL invalida em 700 registros."
        )
    return bruto


def _guardar_caminhos_seguros() -> None:
    """
    Aborta se algum storage_path tiver caractere que precise de escape na query.

    Hoje os 558 caminhos vivos usam apenas [A-Za-z0-9/_.-], entao concatenar
    direto na query string e' seguro. O Postgres nao tem urlencode nativo; em
    vez de inventar um pela metade, a migracao FALHA se a premissa deixar de
    valer - erro claro em vez de URL silenciosamente quebrada.
    """
    conexao = op.get_bind()
    fora = conexao.exec_driver_sql(
        "SELECT count(*) FROM public.vw_material_storage_paths "
        "WHERE storage_path !~ '^[A-Za-z0-9/_.-]+$'"
    ).scalar()
    if fora:
        raise RuntimeError(
            f"{fora} storage_path contem caractere que precisa de escape na query "
            "string. Adicione a codificacao antes de reescrever as URLs."
        )


def _reescrever(expressao_url: str) -> None:
    """
    Aplica `expressao_url` (SQL que recebe o caminho e devolve a URL nova) nos
    tres lugares onde ha arquivo_url.

    O JSONB e reconstruido com jsonb_object_agg preservando toda chave que nao
    seja arquivo_url, e `partes` e reagregado COM ORDINALITY - sem o `order by
    ord` a ordem dos slides poderia mudar, e a ordem e' o percurso do aluno.

    Os PARENTESES em volta de `->>` nao sao decorativos: `||` e `->>` tem a
    mesma precedencia em Postgres e associam a esquerda, entao
    `'texto' || v ->> 'k'` vira `('texto' || v) ->> 'k'` - que tenta converter
    o texto em JSON e estoura com "invalid input syntax for type json".
    """
    op.execute(
        f"""
        UPDATE public.materiais_gerados
           SET arquivo_url = {expressao_url.format(caminho="(storage_path)")}
         WHERE storage_path IS NOT NULL
        """
    )

    op.execute(
        f"""
        WITH reescrito AS (
          SELECT cp.id,
                 jsonb_object_agg(
                   e.k,
                   CASE WHEN jsonb_typeof(e.v) <> 'object' THEN e.v
                   ELSE e.v
                     || CASE WHEN e.v ->> 'storage_path' IS NOT NULL
                             THEN jsonb_build_object(
                                    'arquivo_url',
                                    {expressao_url.format(caminho="(e.v ->> 'storage_path')")})
                             ELSE '{{}}'::jsonb END
                     || CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                             THEN jsonb_build_object('partes', COALESCE((
                                    SELECT jsonb_agg(
                                             CASE WHEN p ->> 'storage_path' IS NOT NULL
                                                  THEN p || jsonb_build_object(
                                                         'arquivo_url',
                                                         {expressao_url.format(caminho="(p ->> 'storage_path')")})
                                                  ELSE p END
                                             ORDER BY ord)
                                      FROM jsonb_array_elements(e.v -> 'partes')
                                           WITH ORDINALITY AS t(p, ord)
                                  ), '[]'::jsonb))
                             ELSE '{{}}'::jsonb END
                   END
                 ) AS materiais_novo
            FROM public.conteudo_personalizado cp,
                 LATERAL jsonb_each(cp.materiais) AS e(k, v)
           WHERE cp.materiais IS NOT NULL
             AND jsonb_typeof(cp.materiais) = 'object'
           GROUP BY cp.id
        )
        UPDATE public.conteudo_personalizado cp
           SET materiais = r.materiais_novo
          FROM reescrito r
         WHERE r.id = cp.id
           AND r.materiais_novo IS DISTINCT FROM cp.materiais
        """
    )


def upgrade() -> None:
    _guardar_caminhos_seguros()
    base = _base_url()
    # O cliente pede o caminho ao gateway, que responde 302 para o R2.
    op.execute("SET LOCAL statement_timeout = '120s'")
    _reescrever(f"'{base}/functions/v1/storage-redirect?path=' || {{caminho}}")


def downgrade() -> None:
    base = _base_url()
    # Volta para a URL publica do Storage, reconstruida do proprio storage_path.
    _reescrever(f"'{base}/storage/v1/object/public/{BUCKET_PADRAO}/' || {{caminho}}")
