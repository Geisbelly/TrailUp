"""Deixa explícito que PR1/PR2 ainda não são estratificados por plataforma (#30).

A janela expõe lotes por plataforma como sinal de cobertura, mas as taxas de PR1/PR2
continuam agregadas: PR1 não registra plataforma por entrada de tempo e os desfechos
de PR2 também não têm essa atribuição. A saída agora declara a limitação sem sugerir
que os lotes por plataforma sejam uma comparação de resultados.

Revision ID: 20261105_29
Revises: 20261105_28
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_29"
down_revision = "20261105_28"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()
ANTIGA = "'aluno na web nao tem camera e a telemetria muda (issue 30); ver lotes_por_plataforma'"
NOVA = (
    "'a plataforma muda a disponibilidade de sinais; lotes_por_plataforma informa cobertura, "
    "mas PR1 e PR2 continuam agregados e nao permitem comparar resultados por plataforma (issue 30)'"
)


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_27", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rpc_anterior() -> str:
    return _load("20261105_11_estudo_relatorio_volta_a_trava.py").rpc_nova()


def rpc_nova() -> str:
    texto = rpc_anterior()
    if texto.count(ANTIGA) != 1:
        raise RuntimeError("A limitação de plataforma mudou; revise a migration 20261105_27")
    return texto.replace(ANTIGA, NOVA)


def upgrade() -> None:
    op.execute(rpc_nova())


def downgrade() -> None:
    op.execute(rpc_anterior())
