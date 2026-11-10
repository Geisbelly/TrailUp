"""A fila de correção traz só o que o professor corrige: dissertativa, código e entrega

## O problema (medido em produção, 10/11)

`notas_fila()` escolhia pela coluna `atividades.tipo`, com NULL e vazio valendo dissertação
(`coalesce(..., 'essay')`, da `20261018_05`). A atividade 1367 ("Desafio: encontre o x", turma 66)
tem `tipo` NULL e uma questão de **múltipla escolha**. O aluno concluiu, e ela aparecia na tela
Notas como pendente para o professor corrigir. Mas a objetiva já foi corrigida pelo banco no
momento da resposta (`questao_responder`, `20261108_01`), com o gabarito de `questao_gabarito`.
Não há o que esperar.

## A regra agora

A fila decide pelas **questões**, com a mesma pergunta que o banco já usa para saber quem corrige
(`fn_questao_corrigida_por_ia`, `20261110_02`):

- **entra** a atividade com pelo menos uma questão dissertativa ou de código, que a IA corrige e o
  professor revisa;
- **entra** a atividade sem questão nenhuma cujo tipo é de dissertação (trabalho, entrega). Aí o
  tipo da atividade é o único sinal, e a regra de antes continua valendo;
- **não entra** a atividade só com múltipla escolha, V/F, lacuna, numérica ou expressão, qualquer
  que seja o `tipo` dela.

Na atividade mista, a linha mostra a questão aberta e a resposta **dela**, não a da primeira
objetiva. Antes eram a primeira questão por id e a última resposta da atividade.

Nada muda no app nem na nota: a objetiva já era corrigida na hora. Isto tira da tela do professor
o que ele não tem o que corrigir.

Revision ID: 20261110_03
Revises: 20261110_02
Create Date: 2026-11-10
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261110_03"
down_revision = "20261110_02"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_RICAS = _modulo("20261110_02_respostas_ricas.py")
NOTAS_FILA_ANTES = _RICAS.NOTAS_FILA

TIPOS_DE_ENTREGA = "('essay', 'dissertativa', 'questao', 'texto', 'code')"

NOTAS_FILA = _RICAS._trocar(
    NOTAS_FILA_ANTES,
    [
        (
            "JOIN public.atividades a ON a.topico_id = t.id\n"
            f"     AND lower(coalesce(nullif(btrim(a.tipo), ''), 'essay')) IN {TIPOS_DE_ENTREGA}\n",
            "JOIN public.atividades a ON a.topico_id = t.id\n"
            "     -- Pelas questões (20261110_03): a objetiva o banco já corrigiu na resposta.\n"
            "     AND (EXISTS (SELECT 1 FROM public.questoes qm\n"
            "                   WHERE qm.atividade_id = a.id AND public.fn_questao_corrigida_por_ia(qm.id))\n"
            "          OR (NOT EXISTS (SELECT 1 FROM public.questoes qm WHERE qm.atividade_id = a.id)\n"
            f"              AND lower(coalesce(nullif(btrim(a.tipo), ''), 'essay')) IN {TIPOS_DE_ENTREGA}))\n",
            1,
        ),
        (
            "      SELECT q1.enunciado, COALESCE(g1.resposta_correta, q1.resposta_correta) AS resposta_correta\n",
            "      SELECT q1.id, q1.enunciado, COALESCE(g1.resposta_correta, q1.resposta_correta) AS resposta_correta\n",
            1,
        ),
        (
            "       WHERE q1.atividade_id = a.id\n       ORDER BY q1.id\n",
            "       WHERE q1.atividade_id = a.id\n"
            "       -- Na atividade mista, a questão que o professor corrige.\n"
            "       ORDER BY public.fn_questao_corrigida_por_ia(q1.id) DESC, q1.id\n",
            1,
        ),
        (
            "       WHERE qa.aluno_id = ca.aluno_id AND qa.atividade_id = a.id\n",
            "       WHERE qa.aluno_id = ca.aluno_id AND qa.atividade_id = a.id\n"
            "         AND (q.id IS NULL OR qa.questao_id = q.id)\n",
            1,
        ),
    ],
)


def upgrade() -> None:
    op.execute(NOTAS_FILA)


def downgrade() -> None:
    op.execute(NOTAS_FILA_ANTES)
