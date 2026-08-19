import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260818_01_geracao_granular_retomavel.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260818_01", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_revision_chain():
    module = _load_migration()
    assert module.revision == "20260818_01"
    assert module.down_revision == "20260803_01"


def test_migration_upgrade_and_downgrade_are_idempotent_sql():
    module = _load_migration()
    # upgrade()/downgrade() só executam op.execute(...) com SQL contendo
    # IF NOT EXISTS/IF EXISTS/DO $$ ... END $$ - roda sem erro de sintaxe
    # aqui via um op fake que só grava as strings, sem precisar de banco.
    executed = []

    class FakeOp:
        def execute(self, sql):
            executed.append(str(sql))

    module.op = FakeOp()
    module.upgrade()
    assert any("personalizacao_blocos_gerados" in s for s in executed)
    assert any("media_kind" in s for s in executed)
    assert any("uq_job_target_legado" in s for s in executed)
    assert any("uq_job_target_granular" in s for s in executed)

    executed.clear()
    module.downgrade()
    assert any("DROP TABLE IF EXISTS personalizacao_blocos_gerados" in s for s in executed)
