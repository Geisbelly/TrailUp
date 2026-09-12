from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260912_06_social_amizades.py"
SQL = (ROOT / "docs/mobile/sql/20260912_02_social_amizades.sql").read_text(encoding="utf-8")


def test_modelo_canonico_e_estados():
    assert "social_relacionamentos" in SQL
    assert "UNIQUE (aluno_a_id, aluno_b_id)" in SQL
    for state in ("pending", "accepted", "declined", "blocked"):
        assert state in SQL


def test_rpcs_e_leitura_segura():
    for fn in ("social_enviar_convite", "social_aceitar_convite", "social_recusar_convite",
               "social_desfazer_amizade", "social_bloquear", "social_desbloquear", "social_listar_pessoas"):
        assert f"social_{fn.removeprefix('social_')}" in SQL
    assert "REVOKE ALL ON public.social_relacionamentos FROM authenticated" in SQL
    assert "app_colegas_de_turma" in SQL


def test_privacidade_nao_expoe_telemetria_ou_email():
    assert "email" not in SQL
    assert "telemetria" not in SQL


def test_social_fica_depois_da_cadeia_da_loja():
    source = MIGRATION.read_text(encoding="utf-8")
    assert 'revision = "20260912_06"' in source
    assert 'down_revision = "20260912_05"' in source
    assert "CREATE TABLE" not in source
    assert "guild_relacionamentos" not in source.lower()
