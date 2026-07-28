from pathlib import Path

from sqlalchemy.engine import make_url

from app.db import migrations


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
