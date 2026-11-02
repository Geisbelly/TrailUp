"""A supressão do estudo vale para a célula inteira (#17)

A `20261102_03` publica os indicadores do estudo por `estudo_indicadores_publicos`, que devolve nulo
quando a célula (turma × fase, ou turma × semana) tem menos pareados que `n_minimo` — e a própria RPC
promete isso em `limitacoes`: "celula com menos alunos que n_minimo volta nula". Dois campos passavam
crus mesmo assim:

- `exposicao.ciclos_personalizacao`, a contagem de ciclos de material da turma na janela;
- `lotes_por_plataforma`, os lotes de telemetria dos pareados por plataforma.

Numa turma de três alunos, "1 lote de ios" diz quem tem iPhone e quando estudou. Agora os dois seguem
a regra das outras taxas: com a amostra insuficiente, voltam nulos. Nada muda acima do mínimo.

Fica como está, e o PR diz por quê: `contaminacao` (é sinal de integridade do protocolo, que o
pesquisador precisa ver mesmo numa turma pequena) e as contagens cruas que só existem dentro da
função (`estudo_indicadores_janela` não tem EXECUTE para cliente).

Remenda a função da `_03` por troca de texto, como a `_05` faz com a RPC: se a `_03` mudar de forma,
esta migration falha alto em vez de gravar uma função pela metade.

Revision ID: 20261102_25
Revises: 20261102_24
Create Date: 2026-11-02
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261102_25"
down_revision = "20261102_24"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()
INICIO = "CREATE OR REPLACE FUNCTION public.estudo_indicadores_publicos("
FIM = "$fn$;"

_TROCAS = (
    (
        "    'ciclos_personalizacao', p_bruto -> 'ciclos_personalizacao'\n",
        "    'ciclos_personalizacao', CASE WHEN b.ok THEN p_bruto -> 'ciclos_personalizacao' END\n",
    ),
    (
        "  'lotes_por_plataforma', p_bruto -> 'lotes_por_plataforma'\n",
        "  'lotes_por_plataforma', CASE WHEN b.ok THEN p_bruto -> 'lotes_por_plataforma' END\n",
    ),
)


def _load(nome: str):
    path = AQUI.with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_02_24", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def funcao_anterior() -> str:
    """`estudo_indicadores_publicos` como a `20261102_03` a deixou (o downgrade volta a ela)."""
    texto = _load("20261102_03_metricas_estudo_coortes.py").INTERNAS
    a = texto.index(INICIO)
    return texto[a : texto.index(FIM, a) + len(FIM)]


def funcao_nova() -> str:
    texto = funcao_anterior()
    for antigo, novo in _TROCAS:
        if texto.count(antigo) != 1:
            raise RuntimeError(
                "estudo_indicadores_publicos mudou de forma desde a 20261102_03; revise a 20261102_25"
            )
        texto = texto.replace(antigo, novo)
    return texto


# CREATE OR REPLACE mantém os privilégios, mas o REVOKE vai junto para a migration valer sozinha.
REVOKE = "REVOKE ALL ON FUNCTION public.estudo_indicadores_publicos(jsonb, integer) FROM PUBLIC, anon, authenticated;"


def upgrade() -> None:
    op.execute(funcao_nova())
    op.execute(REVOKE)


def downgrade() -> None:
    op.execute(funcao_anterior())
    op.execute(REVOKE)
