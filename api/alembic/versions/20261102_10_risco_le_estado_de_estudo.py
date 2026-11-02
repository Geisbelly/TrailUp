"""Risco de reprovação lê o estado de estudo, não emoção (DAT-45)

`aluno_mental_state_history` deixa de receber emoção inferida (`frustrated`, `anxious`,
`overwhelmed`, `tired`) e passa a receber, a cada ciclo de análise, o estado de estudo observado:
`abandono`, `dificuldade` ou `sem_alerta` (`app/services/estado_de_estudo.py`). A tabela estava
vazia em produção (nenhum caminho gravava), então não há linha antiga para converter.

`professor_risco_reprovacao_turma` (`20261101_03`) filtrava os quatro rótulos de emoção e passaria a
nunca disparar o fator. Aqui ele vira `abandono_recorrente`: 3 dos últimos 5 ciclos com atividade
aberta e deixada sem concluir. `dificuldade` fica de fora **de propósito**: ela sai do acerto baixo
nas atividades concluídas, e o fator `acertos_baixos` já conta isso. Contar de novo faria um aluno
com acerto baixo e nada mais bater os 2 fatores do corte sozinho.

O corpo é o da `20261101_03`, carregado do arquivo e trocado em dois pontos (os rótulos e o objeto
do fator). Cada troca confere que achou o trecho: se a função mudar depois, esta migration falha em
vez de gravar o corpo antigo pela metade.

Revision ID: 20261102_10
Revises: 20261102_09
Create Date: 2026-11-02
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261102_10"
down_revision = "20261102_09"
branch_labels = None
depends_on = None

TROCAS = (
    (
        "WHERE e.pos <= 5 AND e.kind IN ('frustrated', 'anxious', 'overwhelmed', 'tired')",
        "WHERE e.pos <= 5 AND e.kind = 'abandono'",
    ),
    (
        "-- 3 dos últimos 5 com o mesmo estado negativo: a mesma regra de `memoria_aluno`.",
        "-- 3 dos últimos 5 ciclos com abandono: a mesma regra de `memoria_aluno`. `dificuldade` fica\n"
        "    -- de fora porque `acertos_baixos` já conta o acerto baixo (20261102_10).",
    ),
    (
        """                 'fator', 'estado_negativo_recorrente',
                 'texto', format('Mesmo estado difícil em %s dos últimos 5 ciclos de estudo', rc.vezes),
                 'valor', rc.vezes, 'referencia', 5, 'estado', rc.kind)""",
        """                 'fator', 'abandono_recorrente',
                 'texto', format('Atividade aberta e deixada sem concluir em %s dos últimos 5 ciclos de estudo', rc.vezes),
                 'valor', rc.vezes, 'referencia', 5)""",
    ),
)


def _funcao_da_20261101_03() -> str:
    caminho = Path(__file__).with_name("20261101_03_risco_de_reprovacao.py")
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError("não achei 20261101_03_risco_de_reprovacao.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return str(modulo.FUNCAO)


def funcao_nova() -> str:
    corpo = _funcao_da_20261101_03()
    for antes, depois in TROCAS:
        if corpo.count(antes) != 1:
            raise RuntimeError(f"trecho não encontrado uma única vez na 20261101_03: {antes[:60]!r}")
        corpo = corpo.replace(antes, depois)
    return corpo


def upgrade() -> None:
    op.execute(funcao_nova())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_funcao_da_20261101_03())
    op.execute("NOTIFY pgrst, 'reload schema'")
