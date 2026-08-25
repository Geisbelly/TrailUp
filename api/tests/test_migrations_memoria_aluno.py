import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260819_01_memoria_aluno.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260819_01", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_revision_chain():
    module = _load_migration()
    assert module.revision == "20260819_01"
    assert module.down_revision == "20260818_01"


def test_migration_upgrade_and_downgrade_are_idempotent_sql():
    module = _load_migration()
    executed = []

    class FakeOp:
        def execute(self, sql):
            executed.append(str(sql))

    module.op = FakeOp()
    module.upgrade()
    assert any("CREATE TABLE IF NOT EXISTS aluno_topico_dominio" in s for s in executed)
    assert any("UNIQUE (aluno_id, topico_id)" in s for s in executed)

    executed.clear()
    module.downgrade()
    assert any("DROP TABLE IF EXISTS aluno_topico_dominio" in s for s in executed)
