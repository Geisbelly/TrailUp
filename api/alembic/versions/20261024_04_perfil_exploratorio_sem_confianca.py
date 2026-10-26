"""Permite ausência de confiança na adaptação exploratória BrainHex v3.

Não atribuir zero a uma estimativa inexistente. Medidas v2 e suas políticas
permanecem intactas; v3 exige NULL. Sem tabela, grants ou coleta adicional.
Aplicar antes do frontend v3. Não executada automaticamente por este PR.
"""

from alembic import op

revision = "20261024_04"
# Renumerada (era 20261024_03, colidia com retencao_e_expurgo); encadeada depois dela.
down_revision = "20261024_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.aluno_perfil_medida ALTER COLUMN confianca DROP NOT NULL")
    op.execute("""
        ALTER TABLE public.aluno_perfil_medida
        ADD CONSTRAINT aluno_perfil_medida_v3_sem_confianca_chk
        CHECK (versao_instrumento <> '2026-10-24-v3-exploratorio' OR confianca IS NULL)
    """)
    op.execute("""
        COMMENT ON COLUMN public.aluno_perfil_medida.confianca IS
        'Legado v2: indice heuristico, nao probabilidade calibrada. v3: NULL, nao estimada.'
    """)


def downgrade() -> None:
    # SET NOT NULL rejeita o rollback se já houver medidas sem confiança.
    # A transação preserva dados/constraint; nunca inventar números para forçar retorno.
    op.execute("ALTER TABLE public.aluno_perfil_medida ALTER COLUMN confianca SET NOT NULL")
    op.execute("""
        ALTER TABLE public.aluno_perfil_medida
        DROP CONSTRAINT aluno_perfil_medida_v3_sem_confianca_chk
    """)
    op.execute("COMMENT ON COLUMN public.aluno_perfil_medida.confianca IS NULL")
