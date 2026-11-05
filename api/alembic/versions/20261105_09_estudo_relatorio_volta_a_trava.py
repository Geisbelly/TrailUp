"""O relatório do estudo volta a mostrar a trava e a exposição medida (#13, #17)

A `20261104_04` recriou `metricas_estudo_coortes` a partir do texto da `20261102_03` e trocou só a
população. Com isso perdeu, em silêncio, o que a `20261102_05` tinha posto na RPC:

- `contaminacao` voltou a ser "material pronto antes do corte", e não a exposição medida dentro da
  janela retida; com a trava, material pronto antes do corte é o esperado, então
  `baseline_contaminado` passou a acusar toda turma do estudo;
- `contaminacao.exposicao_antes_do_registro` e o bloco `trava` (`retida_agora`, `libera_em`)
  sumiram;
- `limitacoes` voltou a dizer "sem trava de personalizacao", o que deixou de ser verdade.

A trava em si (policies `RESTRICTIVE` e a checagem na API) não foi afetada: só o relatório.

Esta migration grava a RPC da `_05` com a troca de população da `_04_04` por cima, pelo mesmo
caminho das duas (texto da migration de origem + trocas que falham alto se o trecho mudou). O
downgrade volta ao que a `_04_04` deixou.

Revision ID: 20261105_09
Revises: 20261105_08
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_09"
down_revision = "20261105_08"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_05_09", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _consentiu():
    return _load("20261104_04_agregados_so_quem_consentiu.py")


def rpc_anterior() -> str:
    """A RPC como a `20261104_04` a deixou: a da `_03` com a população nova."""
    m = _consentiu()
    return m._trocar(m.estudo_anterior(), m.TROCAS_ESTUDO, "metricas_estudo_coortes")


def rpc_nova() -> str:
    """A RPC da `20261102_05` (trava e exposição medida) com a população da `20261104_04`."""
    m = _consentiu()
    return m._trocar(
        _load("20261102_05_trava_da_personalizacao.py").rpc_nova(),
        m.TROCAS_ESTUDO,
        "metricas_estudo_coortes da 20261102_05; revise a 20261105_09",
    )


def upgrade() -> None:
    op.execute(rpc_nova())


def downgrade() -> None:
    op.execute(rpc_anterior())
