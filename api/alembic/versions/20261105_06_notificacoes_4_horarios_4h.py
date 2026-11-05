"""Rotina do aluno: até 4 horários, com no mínimo 4 h entre eles

Revision ID: 20261105_06
Revises: 20261105_05

Decisão da revisão da fase 2, que chegou depois de a `20261105_05` entrar na `main`. O `intervalo_min`
da `revisao_diaria` desce de 6 h para 4 h: senão o motor adiaria horários que a RPC aceitou. Os
horários continuam dentro do orçamento da categoria `estudo`.

No downgrade, quem tem 4 horários fica com os 3 primeiros, para caber na CHECK de antes.
"""

from __future__ import annotations

from alembic import op

revision = "20261105_06"
down_revision = "20261105_05"
branch_labels = None
depends_on = None


def _ajustar(maximo: int, intervalo_min: int) -> str:
    return f"""
ALTER TABLE public.notificacoes_agendamentos
  DROP CONSTRAINT IF EXISTS notificacoes_agendamentos_horarios_check;
UPDATE public.notificacoes_agendamentos SET horarios = horarios[1:{maximo}]
 WHERE cardinality(horarios) > {maximo};
ALTER TABLE public.notificacoes_agendamentos
  ADD CONSTRAINT notificacoes_agendamentos_horarios_check CHECK (
    horarios IS NULL
    OR (cardinality(horarios) BETWEEN 1 AND {maximo} AND 0 <= ALL (horarios) AND 1439 >= ALL (horarios))
  );
UPDATE public.notificacoes_config SET valor = '{maximo}' WHERE chave = 'rotina_max_horarios';
UPDATE public.notificacoes_tipos SET intervalo_min = {intervalo_min} WHERE tipo = 'revisao_diaria';
"""


def upgrade() -> None:
    op.execute(_ajustar(4, 4 * 60))


def downgrade() -> None:
    op.execute(_ajustar(3, 6 * 60))
