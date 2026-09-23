"""reaponta para o gateway as URLs de material que voltaram a ser diretas

A `20260829_02` trocou todas as URLs de material pela do gateway
`storage-redirect`. Depois dela, os hidratadores da API
(`ConteudoPersonalizadoRepository._hydrate_materiais_urls` e cia.) seguiram
reconstruindo a URL a partir do `storage_path` com `build_public_storage_url`,
que monta `/storage/v1/object/public/...` - POR CIMA da URL do gateway que o
microservice gravou. Todo fluxo que lia o registro e salvava `materiais` de
volta persistia a URL direta.

O resultado, medido em 22/09/2026: `materiais.<tipo>.arquivo_url` (hidratado)
direto e morto, `materiais.<tipo>.partes[].arquivo_url` (nao hidratado) no
gateway e vivo, na mesma linha. O material novo so' existe no R2, entao a URL
direta da' 404.

O codigo foi corrigido (`build_material_url`); isto conserta o que ja' foi
gravado. So' toca URL que COMECA com a URL publica do bucket `conteudo_aluno` e
tem `storage_path` ao lado - a URL nova e' funcao pura do caminho, igual a
`20260829_02`, e reexecutar e' inofensivo.

Sem downgrade de dados: a URL direta e' justamente a quebrada.

Revision ID: 20260922_06
Revises: 20260922_05
"""

import os

from alembic import op

revision = "20260922_06"
down_revision = "20260922_05"
branch_labels = None
depends_on = None

BUCKET = "conteudo_aluno"


def _base_url() -> str:
    """Mesma resolucao da `20260829_02`: ambiente primeiro, settings depois."""
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
            "SUPABASE_URL ausente no ambiente e nas settings; sem ela nao da' para "
            "reconhecer a URL direta nem montar a do gateway."
        )
    return bruto


def upgrade() -> None:
    base = _base_url()
    direta = f"{base}/storage/v1/object/public/{BUCKET}/"
    gateway = f"'{base}/functions/v1/storage-redirect?path=' || "

    # Casa pelo prefixo literal, sem LIKE: `_` e' curinga no LIKE e o nome do
    # bucket tem um.
    def eh_direta(expr: str) -> str:
        return f"left({expr}, {len(direta)}) = '{direta}'"

    op.execute("SET LOCAL statement_timeout = '120s'")

    op.execute(
        f"""
        UPDATE public.materiais_gerados
           SET arquivo_url = {gateway}storage_path
         WHERE storage_path IS NOT NULL
           AND {eh_direta("arquivo_url")}
        """
    )

    # Mesma reconstrucao da 20260829_02: preserva toda chave e reagrega `partes`
    # COM ORDINALITY (a ordem e' o percurso do aluno). Os parenteses em volta de
    # `->>` sao obrigatorios - `||` e `->>` tem a mesma precedencia.
    op.execute(
        f"""
        WITH reescrito AS (
          SELECT cp.id,
                 jsonb_object_agg(
                   e.k,
                   CASE WHEN jsonb_typeof(e.v) <> 'object' THEN e.v
                   ELSE e.v
                     || CASE WHEN (e.v ->> 'storage_path') IS NOT NULL
                              AND {eh_direta("(e.v ->> 'arquivo_url')")}
                             THEN jsonb_build_object(
                                    'arquivo_url', {gateway}(e.v ->> 'storage_path'))
                             ELSE '{{}}'::jsonb END
                     || CASE WHEN jsonb_typeof(e.v -> 'partes') = 'array'
                             THEN jsonb_build_object('partes', COALESCE((
                                    SELECT jsonb_agg(
                                             CASE WHEN (p ->> 'storage_path') IS NOT NULL
                                                   AND {eh_direta("(p ->> 'arquivo_url')")}
                                                  THEN p || jsonb_build_object(
                                                         'arquivo_url', {gateway}(p ->> 'storage_path'))
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
             AND position('{direta}' in cp.materiais::text) > 0
           GROUP BY cp.id
        )
        UPDATE public.conteudo_personalizado cp
           SET materiais = r.materiais_novo
          FROM reescrito r
         WHERE r.id = cp.id
           AND r.materiais_novo IS DISTINCT FROM cp.materiais
        """
    )


def downgrade() -> None:
    # Voltar para a URL direta seria voltar para o 404.
    pass
