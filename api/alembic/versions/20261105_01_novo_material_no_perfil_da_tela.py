"""O aviso de material novo vai para quem vê aquele perfil na tela, não para quem o tem como dominante.

`notificacoes_novo_material_produzir` (`20261102_21`) escolhia os alunos com
`notificacoes_perfil_dominante(aluno) = perfil da linha`. Só que o app lê o material pelo perfil
**da tela** (`perfilVisualDoAluno`: o `perfil_ativo` quando ele é representativo, senão o dominante),
e desde a `20261103_12` o banco tem a mesma regra em `notificacoes_perfil_do_aluno`, que já escolhe o
guia e o texto das notificações.

Com a base gerada também para o perfil secundário da turma (#873), o desencontro deixa de ser
teórico. Um aluno Socializer (dominante) que escolheu Mastermind no app:

- recebia "ganhou material no seu estilo" quando ficava pronto o material **Socializer**, que ele não vê;
- não recebia nada quando ficava pronto o **Mastermind**, que é o que a tela dele abre.

Agora o filtro é `notificacoes_perfil_do_aluno(aluno) = perfil da linha`. O resto da função fica
igual: a matriz de quem recebe cada tipo (`notificacoes_destino`, dentro de
`notificacoes_enfileirar_evento`) continua no dominante, como a `20261103_12` decidiu.

Medido em produção em 05/11/2026: nenhum aluno tem perfil da tela diferente do dominante, então
nenhum aviso saiu errado até aqui. A correção é para o primeiro que trocar de perfil.

O corpo da função vem da `20261102_21`, com uma única troca conferida aqui: se aquele texto mudar e
a troca não casar exatamente uma vez, a migração para em vez de gravar a função errada.

Revision ID: 20261105_01
Revises: 20261104_08
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_01"
down_revision = "20261104_08"
branch_labels = None
depends_on = None

ANTES = "AND public.notificacoes_perfil_dominante(ca.aluno_id) = v_perfil"
DEPOIS = "AND public.notificacoes_perfil_do_aluno(ca.aluno_id) = v_perfil"
INICIO = "CREATE OR REPLACE FUNCTION public.notificacoes_novo_material_produzir()"
FIM = "-- sequencia:"


def _funcao_original() -> str:
    """A `notificacoes_novo_material_produzir` como a `20261102_21` a deixou."""
    caminho = Path(__file__).with_name("20261102_21_notificacao_novo_material_e_sequencia.py")
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {caminho.name}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    funcoes: str = modulo.FUNCOES
    inicio, fim = funcoes.index(INICIO), funcoes.index(FIM)
    return funcoes[inicio:fim].rstrip() + "\n"


def funcao_nova() -> str:
    original = _funcao_original()
    if original.count(ANTES) != 1:
        raise RuntimeError(f"esperava uma ocorrência de {ANTES!r}, achei {original.count(ANTES)}")
    return original.replace(ANTES, DEPOIS)


RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(funcao_nova())
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(_funcao_original())
    op.execute(RELOAD)
