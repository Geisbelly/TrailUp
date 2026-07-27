from pathlib import Path

from app.db import migrations


def test_upgrade_database_to_head_uses_project_alembic_config(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def upgrade_stub(config, revision: str) -> None:
        captured["config"] = config
        captured["revision"] = revision

    monkeypatch.setattr(migrations.command, "upgrade", upgrade_stub)

    migrations.upgrade_database_to_head()

    config = captured["config"]
    assert captured["revision"] == "head"
    assert Path(config.config_file_name).name == "alembic.ini"
    assert Path(config.get_main_option("script_location")).name == "alembic"
