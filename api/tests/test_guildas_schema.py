from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "api/alembic/versions/20260912_07_guildas_perfil_publico.py"
FIX_MIGRATION = ROOT / "api/alembic/versions/20260912_10_fix_perfil_publico_sem_classe.py"
GUILD_CLASS_MIGRATION = ROOT / "api/alembic/versions/20260912_11_resolve_guilda_class.py"
SQL = (ROOT / "docs/mobile/sql/20260912_03_guildas_perfil_publico.sql").read_text(encoding="utf-8")


def test_migracao_e_tabelas_do_dominio():
    source = MIGRATION.read_text(encoding="utf-8")
    assert 'revision = "20260912_07"' in source
    assert 'down_revision = "20260912_06"' in source
    for table in ("guildas", "guilda_membros", "guilda_convites", "guilda_config_turma", "guilda_evento_snapshot"):
        assert f"public.{table}" in SQL


def test_rpcs_cobrem_ciclo_de_guilda_e_perfil():
    for fn in (
        "guilda_listar", "guilda_criar", "guilda_atualizar", "guilda_convidar",
        "guilda_aceitar_convite", "guilda_recusar_convite", "guilda_cancelar_convite",
        "guilda_entrar", "guilda_sair", "guilda_dissolver", "guilda_configurar_turma",
        "guilda_congelar_composicao", "social_perfil_publico",
    ):
        assert f"FUNCTION public.{fn}" in SQL


def test_regras_de_integridade_privacidade_e_bloqueio():
    assert "FOR UPDATE" in SQL
    assert "social_relacionamentos" in SQL
    assert "social_bloqueio_impede_guilda" in SQL
    assert "classe_aluno" in SQL
    assert "conquistas_aluno" in SQL
    assert "email" not in SQL.lower()
    assert "telemetria" not in SQL.lower()
    assert "ROW LEVEL SECURITY" in SQL
    assert "REVOKE ALL ON public.guildas FROM anon, authenticated" in SQL


def test_snapshot_e_historico_sao_imutaveis():
    assert "UNIQUE (evento_id, guilda_id, aluno_id)" in SQL
    assert "CREATE OR REPLACE FUNCTION public.guilda_congelar_composicao" in SQL
    assert "UPDATE public.guilda_evento_snapshot" not in SQL
    assert "DELETE FROM public.guilda_evento_snapshot" not in SQL


def test_social_e_guilda_respeitam_a_turma_atual():
    assert "social_listar_pessoas(p_classe_id bigint)" in SQL
    assert "a.classe_id=p_classe_id" in SQL
    assert "NULLIF(p_classe_id,0)" in FIX_MIGRATION.read_text(encoding="utf-8")


def test_guilda_resolve_turma_no_banco():
    source = GUILD_CLASS_MIGRATION.read_text(encoding="utf-8")
    assert "guilda_classe_atual" in source
    assert "p_classe_id" in source
    assert "COALESCE" in source
