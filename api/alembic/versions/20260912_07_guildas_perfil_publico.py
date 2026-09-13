"""Create guild mechanics, event composition snapshots and public profiles."""

from pathlib import Path

from alembic import op

revision = "20260912_07"
down_revision = "20260912_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "docs" / "mobile" / "sql" / "20260912_03_guildas_perfil_publico.sql"
    op.execute(path.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("""
      DROP FUNCTION IF EXISTS public.social_perfil_publico(uuid,bigint);
      DROP FUNCTION IF EXISTS public.guilda_congelar_composicao(text,bigint);
      DROP FUNCTION IF EXISTS public.guilda_configurar_turma(bigint,integer,timestamptz,timestamptz);
      DROP FUNCTION IF EXISTS public.guilda_dissolver(uuid);
      DROP FUNCTION IF EXISTS public.guilda_sair(uuid);
      DROP FUNCTION IF EXISTS public.guilda_entrar(uuid);
      DROP FUNCTION IF EXISTS public.guilda_cancelar_convite(uuid);
      DROP FUNCTION IF EXISTS public.guilda_recusar_convite(uuid);
      DROP FUNCTION IF EXISTS public.guilda_aceitar_convite(uuid);
      DROP FUNCTION IF EXISTS public.guilda_convidar(uuid,uuid);
      DROP FUNCTION IF EXISTS public.guilda_atualizar(uuid,text,text,text);
      DROP FUNCTION IF EXISTS public.guilda_criar(bigint,text,text,text);
      DROP FUNCTION IF EXISTS public.guilda_listar(bigint);
      DROP FUNCTION IF EXISTS public.guilda_bloqueio_ativo(uuid,uuid);
      DROP FUNCTION IF EXISTS public.guilda_janela_aberta(bigint);
      DROP FUNCTION IF EXISTS public.guilda_e_colega(uuid,bigint);
      DROP TABLE IF EXISTS public.guilda_evento_snapshot;
      DROP TABLE IF EXISTS public.guilda_config_turma;
      DROP TABLE IF EXISTS public.guilda_convites;
      DROP TABLE IF EXISTS public.guilda_membros;
      DROP TABLE IF EXISTS public.guildas;
    """)
