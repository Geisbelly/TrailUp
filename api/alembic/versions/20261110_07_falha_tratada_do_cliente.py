"""Falha tratada do cliente: o que o app já pegou e mostrou como aviso também chega ao banco

## O que foi medido (10/11)

`cliente_erro` tinha 5 linhas desde 05/11, nenhuma do app Android, e a única dos últimos 3 dias era
`promessa` / `Desconhecido` / sem mensagem. Enquanto isso, a queixa era de muito erro ao confirmar
resposta, sincronizar, corrigir e na arena. Os dois motivos estão no cliente:

- o coletor só pega o que **escapa**: manipulador global, promessa sem `catch`, tela que quebra. As
  falhas da queixa caem em `try/catch` que mostram aviso e escrevem `console.warn`, e somem;
- o erro do Supabase (`PostgrestError`) é um objeto comum, não `Error`, e `descreverErro` o gravava
  como `Desconhecido` sem mensagem. É a linha que havia.

## O que muda aqui

- `cliente_erro.tipo` aceita `tratado`, e `cliente_saude_registrar` deixa de descartá-lo.
- `fn_cliente_saude_varrer` **não** muda: o e-mail continua só para `tela` e `fatal`. Falha tratada é
  para medir no painel, não para acordar ninguém.

A troca na função é a da `20261105_17`: lê o corpo vigente com `pg_get_functiondef` e falha alto se o
trecho mudou.

Revision ID: 20261110_07
Revises: 20261110_06
Create Date: 2026-11-10
"""

from __future__ import annotations

from alembic import op

revision = "20261110_07"
down_revision = "20261110_06"
branch_labels = None
depends_on = None

TIPOS_ANTES = "('erro', 'promessa', 'tela', 'fatal')"
TIPOS_DEPOIS = "('erro', 'promessa', 'tela', 'fatal', 'tratado')"

ANTES = f"CONTINUE WHEN v_tipo IS NULL OR v_tipo NOT IN {TIPOS_ANTES};"
DEPOIS = f"CONTINUE WHEN v_tipo IS NULL OR v_tipo NOT IN {TIPOS_DEPOIS};"

TROCAR = """
DO $troca$
DECLARE
  v_def text := pg_get_functiondef('public.cliente_saude_registrar(jsonb, jsonb)'::regprocedure);
BEGIN
  IF position('__DE__' IN v_def) = 0 THEN
    RAISE EXCEPTION 'cliente_saude_registrar mudou de forma; revise a 20261110_07';
  END IF;
  EXECUTE replace(v_def, '__DE__', '__PARA__');
END
$troca$;
"""


def _trocar(de: str, para: str) -> str:
    return TROCAR.replace("__DE__", de.replace("'", "''")).replace("__PARA__", para.replace("'", "''"))


def _restricao(tipos: str) -> str:
    return (
        "ALTER TABLE public.cliente_erro DROP CONSTRAINT IF EXISTS cliente_erro_tipo_check;\n"
        f"ALTER TABLE public.cliente_erro ADD CONSTRAINT cliente_erro_tipo_check CHECK (tipo IN {tipos});"
    )


def upgrade() -> None:
    op.execute(_restricao(TIPOS_DEPOIS))
    op.execute(_trocar(ANTES, DEPOIS))


def downgrade() -> None:
    op.execute(_trocar(DEPOIS, ANTES))
    # A restrição de antes não aceita as linhas novas. Elas são só contagem agregada, sem pessoa.
    op.execute("DELETE FROM public.cliente_erro WHERE tipo = 'tratado';")
    op.execute(_restricao(TIPOS_ANTES))
