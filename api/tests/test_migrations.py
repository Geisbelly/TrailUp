from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def test_upgrade_database_to_head_uses_project_alembic_config(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def upgrade_stub(config, revision: str) -> None:
        captured["config"] = config
        captured["revision"] = revision

    monkeypatch.setattr(migrations.command, "upgrade", upgrade_stub)

    database_url = "postgresql+asyncpg://user:secret@db.example.test:5432/trailup"
    migrations.upgrade_database_to_head(database_url)

    config = captured["config"]
    assert captured["revision"] == "head"
    assert Path(config.config_file_name).name == "alembic.ini"
    assert Path(config.get_main_option("script_location")).name == "alembic"
    assert config.attributes["database_url_override"] == database_url


def test_normalize_database_url_preserves_real_password() -> None:
    normalized = migrations.normalize_database_url_for_alembic(
        "postgresql+asyncpg://postgres.project:p%40ss%2Aword@db.example.test:6543/postgres"
    )

    parsed = make_url(normalized)
    assert parsed.drivername == "postgresql+psycopg"
    assert parsed.password == "p@ss*word"
    assert "***" not in normalized


def test_alembic_tem_uma_unica_cabeca_e_cadeia_continua() -> None:
    """Duas cabecas fazem `upgrade head` falhar -- e o nome antigo deste teste
    ("idempotent_generated_materials_is_the_only_alembic_head") ja nao dizia a
    verdade: ele fixava uma revisao qualquer, que virava divida a cada migracao
    nova. O invariante que importa e este: uma cabeca so, e caminho continuo
    dela ate a base.
    """
    scripts = ScriptDirectory.from_config(_offline_alembic_config())

    heads = scripts.get_heads()
    assert len(heads) == 1, f"cadeia ramificada: {heads}"

    visitadas = set()
    atual = scripts.get_revision(heads[0])
    while atual is not None:
        assert atual.revision not in visitadas, f"ciclo em {atual.revision}"
        visitadas.add(atual.revision)
        anterior = atual.down_revision
        if anterior is None:
            break
        assert isinstance(anterior, str), f"merge inesperado em {atual.revision}"
        atual = scripts.get_revision(anterior)

    # Toda migracao no diretorio precisa estar nesse caminho; uma solta nunca
    # roda e passa despercebida.
    todas = {revisao.revision for revisao in scripts.walk_revisions()}
    assert visitadas == todas, f"fora da cadeia: {sorted(todas - visitadas)}"


def test_personalizacao_jobs_conteudo_fk_renders_idempotent_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260801_01:20260803_01",
        sql=True,
    )
    rendered = output.getvalue()

    assert "fk_personalizacao_jobs_conteudo" in rendered
    assert "pg_constraint WHERE conname = 'fk_personalizacao_jobs_conteudo'" in rendered
    assert "FOREIGN KEY (conteudo_id) REFERENCES conteudos(id)" in rendered
    assert "UPDATE alembic_version SET version_num='20260803_01'" in rendered


def test_content_scoped_personalization_indexes_render_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_03:20260728_04",
        sql=True,
    )
    rendered = output.getvalue()

    assert "uq_conteudo_personalizado_aluno_topico_conteudo_perfil" in rendered
    assert "aluno_id,\n          topico_id,\n          conteudo_id" in rendered
    assert "conteudo_id IS NOT NULL" in rendered
    assert "uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo" in rendered
    assert "conteudo_id IS NULL" in rendered
    assert "DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_perfil" in rendered
    assert "UPDATE alembic_version SET version_num='20260728_04'" in rendered


def test_generation_fencing_rpc_repair_renders_complete_idempotent_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_02:20260728_03",
        sql=True,
    )
    rendered = output.getvalue()

    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.merge_personalizacao_materiais_v2"
        )
        == 1
    )
    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.mark_personalizacao_failed_v2"
        )
        == 1
    )
    assert "pg_advisory_xact_lock(p_id)" in rendered
    assert "stale_generation para personalizacao" in rendered
    assert "ARRAY['audio', 'markdown', 'apresentacao']" in rendered
    assert "'generation_key', v_generation_key" in rendered
    assert "k <> 'apresentacao'" in rendered
    assert rendered.count("media_kind <> 'apresentacao'") == 2
    assert rendered.count("'puppeteer-html-v2'") == 3
    assert rendered.count("'2026-07-28.3'") == 3
    assert (
        "GRANT EXECUTE ON FUNCTION public.merge_personalizacao_materiais_v2"
        in rendered
    )
    assert (
        "GRANT EXECUTE ON FUNCTION public.mark_personalizacao_failed_v2"
        in rendered
    )
    assert "NOTIFY pgrst, 'reload schema'" in rendered
    assert "UPDATE alembic_version SET version_num='20260728_03'" in rendered
    assert "DROP FUNCTION" not in rendered
    assert "%%" not in rendered


def test_dynamic_generation_fencing_has_no_hardcoded_pipeline_version() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_04:20260728_05",
        sql=True,
    )
    rendered = output.getvalue()

    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.merge_personalizacao_materiais_v2"
        )
        == 1
    )
    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.mark_personalizacao_failed_v2"
        )
        == 1
    )
    assert "pg_advisory_xact_lock(p_id)" in rendered
    assert "stale_generation para personalizacao" in rendered
    assert "IS NOT DISTINCT FROM" in rendered
    assert "media_pipeline_version" in rendered
    assert "design_system" in rendered
    assert "puppeteer-html-v2" not in rendered
    assert "2026-07-28.3" not in rendered
    assert "UPDATE alembic_version SET version_num='20260728_05'" in rendered


def test_generated_material_history_is_idempotent_per_generation() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_05:20260728_06",
        sql=True,
    )
    rendered = output.getvalue()

    assert "ADD COLUMN IF NOT EXISTS generation_key TEXT" in rendered
    assert "GENERATED ALWAYS AS" in rendered
    assert "ROW_NUMBER() OVER" in rendered
    assert "uq_materiais_gerados_personalizacao_tipo_generation" in rendered
    assert "personalizacao_id,\n          tipo,\n          generation_key" in rendered
    assert "UPDATE alembic_version SET version_num='20260728_06'" in rendered


def test_sugestao_material_tables_render_idempotent_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260821_01:20260825_01",
        sql=True,
    )
    rendered = output.getvalue()

    # As duas tabelas, e o log referenciando a sugestao com SET NULL: apagar a
    # sugestao atual nao pode apagar o historico, que e a base da metrica.
    assert "CREATE TABLE IF NOT EXISTS personalizacao_sugestao" in rendered
    assert "CREATE TABLE IF NOT EXISTS personalizacao_sugestao_log" in rendered
    assert "ON DELETE SET NULL" in rendered
    assert "CASCADE" not in rendered

    # Unico por alvo, com COALESCE porque NULL nao colide com NULL em UNIQUE.
    assert "personalizacao_sugestao_alvo_uidx" in rendered
    assert "COALESCE(conteudo_id, -1)" in rendered

    # Estados validos travados no banco, nao so no codigo.
    assert "origem IN ('inicial', 'revisao')" in rendered
    assert "acao IN ('criada', 'revisada', 'mantida')" in rendered

    assert "UPDATE alembic_version SET version_num='20260825_01'" in rendered
