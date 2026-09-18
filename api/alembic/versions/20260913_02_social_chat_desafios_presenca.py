"""Add private chat, guild challenges, question gating and online presence."""

from pathlib import Path

from alembic import op

revision = "20260913_02"
down_revision = "20260913_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260913_02_social_chat_desafios_presenca.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("""
      DROP FUNCTION IF EXISTS public.guilda_desafio_responder(uuid,bigint,text);
      DROP FUNCTION IF EXISTS public.guilda_desafio_criar(uuid,text,integer);
      DROP FUNCTION IF EXISTS public.social_chat_enviar(uuid,text);
      DROP FUNCTION IF EXISTS public.social_chat_listar(uuid);
      DROP FUNCTION IF EXISTS public.social_presenca_turma(bigint);
      DROP FUNCTION IF EXISTS public.fn_questao_liberada(bigint);
      DROP TABLE IF EXISTS public.guilda_desafio_respostas, public.guilda_desafio_questoes, public.guilda_desafios, public.social_mensagens;
    """)
