"""varredura periodica das notificacoes por pg_cron

Sem isto, ha um buraco no requisito "notificar mesmo com o celular com o app
fechado": a **rotina diaria** ja dispara sozinha, porque o app a agenda como
notificacao LOCAL no aparelho — mas uma sugestao criada pela IA *enquanto o app
esta fechado* fica parada na fila ate o proximo login, porque nada a varre.

`cron.schedule` resolve isso dentro do proprio banco, que e onde o motor mora.
E o unico jeito de fechar o circuito sem depender da API, que hiberna no free
tier do Render — justamente quando ninguem esta com o app aberto.

Best-effort de proposito: `pg_cron` exige privilegio que nem todo ambiente
concede (um banco local de desenvolvedor, por exemplo). Falhar aqui derrubaria o
startup da API por causa de um agendamento opcional, entao a falta de privilegio
so emite NOTICE. O que se perde sem o cron e o alcance ao app fechado; login e
heartbeat continuam entregando tudo normalmente.

Revision ID: 20260826_05
Revises: 20260826_04
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_05"
down_revision = "20260826_04"
branch_labels = None
depends_on = None

# 5 minutos: a granularidade util para "a IA acabou de sugerir algo". Mais curto
# so aumentaria carga sem o aluno perceber diferenca; mais longo faria a
# sugestao chegar velha.
CRON_EXPRESSAO = "*/5 * * * *"
CRON_JOB = "trailup-notificacoes-varrer"


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          CREATE EXTENSION IF NOT EXISTS pg_cron;

          -- Reagendar sem desagendar antes cria job duplicado, e o aluno
          -- receberia a varredura em dobro.
          PERFORM cron.unschedule('{CRON_JOB}')
            WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{CRON_JOB}');

          PERFORM cron.schedule(
            '{CRON_JOB}',
            '{CRON_EXPRESSAO}',
            $cron$SELECT public.notificacoes_varrer(200)$cron$
          );
        EXCEPTION
          WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
            RAISE NOTICE
              'pg_cron indisponivel; a varredura periodica de notificacoes fica desligada. '
              'Login e heartbeat continuam entregando — so o alcance ao app fechado se perde.';
        END $$
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          PERFORM cron.unschedule('{CRON_JOB}')
            WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{CRON_JOB}');
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'pg_cron indisponivel; nada a desagendar.';
        END $$
        """
    )
