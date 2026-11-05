"""O resumo da arena do professor diz de qual evento é cada duelo (#154, fase 4: console)

`arena_professor_resumo` passa a devolver `evento_id` em cada duelo (`guilda_desafios.evento_id`,
`20261105_15`). Com isso o painel "Durante" do evento mostra quantos duelos o evento já teve, sem
uma RPC nova. Nada mais muda: o texto é o da `20261021_08`, trocado num ponto só.

Revision ID: 20261105_20
Revises: 20261105_19
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_20"
down_revision = "20261105_19"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

ANTES = "                 'consequencia', d.consequencia,\n"
DEPOIS = "                 'consequencia', d.consequencia,\n                 'evento_id', d.evento_id,\n"


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_20", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def resumo_anterior() -> str:
    return _load("20261021_08_telas_eixos_e_missoes.py").RESUMO_ARENA


def resumo_novo() -> str:
    texto = resumo_anterior()
    if texto.count(ANTES) != 1:
        raise RuntimeError("arena_professor_resumo mudou de forma; revise a 20261105_20")
    return texto.replace(ANTES, DEPOIS)


def upgrade() -> None:
    op.execute(resumo_novo())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(resumo_anterior())
    op.execute("NOTIFY pgrst, 'reload schema'")
