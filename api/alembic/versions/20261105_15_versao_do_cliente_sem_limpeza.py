"""Versão do cliente deixa de passar pela limpeza de texto

A primeira sessão real do console gravou `<n>f` no lugar de `7140574f`: `cliente_saude_registrar` limpava a versão
com `fn_cliente_limpar_texto`, que troca 4 ou mais dígitos por `<n>`. Um SHA tem isso quase sempre, e builds
diferentes cairiam na mesma versão no painel e na contagem de erros.

Versão não é texto livre, então a regra é outra: formato de versão (`1.0.6`, `7140574f`) ou NULL. A troca é por texto,
como na `20261104_04`, e falha alto se o trecho mudou. `cliente_erro` fica como está: a versão faz parte da chave
única, e reescrevê-la poderia colidir e impedir a API de subir. O que houver expira em 90 dias.

Revision ID: 20261105_15
Revises: 20261105_14
Create Date: 2026-11-05
"""

from __future__ import annotations

from alembic import op

revision = "20261105_15"
down_revision = "20261105_14"
branch_labels = None
depends_on = None

ANTES = "v_versao text := public.fn_cliente_limpar_texto(p_sessao ->> 'versao', 40);"
DEPOIS = "v_versao text := public.fn_cliente_versao(p_sessao ->> 'versao');"

FUNCAO = r"""
CREATE OR REPLACE FUNCTION public.fn_cliente_versao(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE WHEN p_texto ~ '^[A-Za-z0-9._+-]{1,40}$' THEN p_texto END
$fn$;
REVOKE ALL ON FUNCTION public.fn_cliente_versao(text) FROM PUBLIC, anon, authenticated;
"""

TROCAR = """
DO $troca$
DECLARE
  v_def text := pg_get_functiondef('public.cliente_saude_registrar(jsonb, jsonb)'::regprocedure);
BEGIN
  IF position('__DE__' IN v_def) = 0 THEN
    RAISE EXCEPTION 'cliente_saude_registrar mudou de forma; revise a 20261105_15';
  END IF;
  EXECUTE replace(v_def, '__DE__', '__PARA__');
END
$troca$;
"""

CORRIGIR = "UPDATE public.cliente_sessao SET versao = NULL WHERE versao LIKE '%<n>%';"


def _trocar(de: str, para: str) -> str:
    return TROCAR.replace("__DE__", de.replace("'", "''")).replace("__PARA__", para.replace("'", "''"))


def upgrade() -> None:
    op.execute(FUNCAO)
    op.execute(_trocar(ANTES, DEPOIS))
    op.execute(CORRIGIR)


def downgrade() -> None:
    op.execute(_trocar(DEPOIS, ANTES))
    op.execute("DROP FUNCTION IF EXISTS public.fn_cliente_versao(text)")
