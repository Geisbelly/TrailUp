"""telemetria_lotes guarda por que a analise falhou, em vez de so um NULL

Medido em producao (2026-09-30): os 290 lotes de 20 a 27/09 tem
`analysis_ciclo_id IS NULL`. Nenhum ciclo rodou na janela inteira --
`aluno_mental_state_history` e `ia_decision_logs` estao as duas VAZIAS, e o
ultimo `ciclo_executado` e de 25/07, dois meses antes.

Nao havia como descobrir o motivo depois do fato. `run_analysis` e chamada
para todo lote dentro de um `try/except` que joga o erro so na resposta HTTP
ao app (`TelemetriaAnalysisResponse.erros`) -- que ninguem guarda. O lote fica
com ciclo nulo e o banco nao distingue "a analise nao rodou", "rodou e nao
produziu ciclo" e "rodou e explodiu".

Esta coluna fecha essa cegueira: guarda a primeira mensagem de erro, truncada.
Com ela, `SELECT analysis_error, count(*) ... GROUP BY 1` responde em um
comando o que hoje exige reproduzir o problema ao vivo.

Nao e log de auditoria e nao substitui `ia_decision_logs` -- e o minimo para
que a falha deixe de ser invisivel.

`IF NOT EXISTS` de proposito: o schema de producao ja divergiu do repositorio
(ver docs/architecture/schema-nao-versionado.md), e esta migracao precisa ser
inofensiva se a coluna ja existir.

Revision ID: 20260930_01
Revises: 20260922_06
Create Date: 2026-09-30
"""

from alembic import op

revision = "20260930_01"
down_revision = "20260922_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.telemetria_lotes
          ADD COLUMN IF NOT EXISTS analysis_error text
        """
    )
    op.execute(
        """
        COMMENT ON COLUMN public.telemetria_lotes.analysis_error IS
          'Primeira mensagem de erro de run_analysis para este lote, truncada. '
          'NULL = sem erro. Com analysis_ciclo_id NULL e analysis_error NULL, a '
          'analise rodou e nao produziu ciclo -- que e diferente de ter falhado.'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE public.telemetria_lotes
          DROP COLUMN IF EXISTS analysis_error
        """
    )
