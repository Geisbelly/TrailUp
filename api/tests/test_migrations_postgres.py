"""Executor Alembic real em banco Docker descartável, sem DSN externo ou .env."""

import os
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

API_ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(
    os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker"
)


@pytest.fixture
def database():
    name = f"trailup-migration-test-{secrets.token_hex(5)}"
    password = secrets.token_hex(24)
    try:
        subprocess.run([
            "docker", "run", "--detach", "--name", name, "--tmpfs", "/var/lib/postgresql/data",
            "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD", "postgres:17.6-alpine",
        ], env={**os.environ, "POSTGRES_PASSWORD": password}, check=True, capture_output=True)
        port = subprocess.check_output(["docker", "port", name, "5432/tcp"], text=True).strip().rsplit(":", 1)[1]
        url = f"postgresql+psycopg://postgres:{password}@127.0.0.1:{port}/postgres"
        engine = create_engine(url, connect_args={"connect_timeout": 2})
        try:
            for attempt in range(50):
                try:
                    with engine.connect() as connection:
                        connection.execute(text("SELECT 1"))
                    break
                except Exception:
                    if attempt == 49:
                        raise RuntimeError("PostgreSQL local não ficou disponível") from None
                    time.sleep(0.1)
            yield engine, url
        finally:
            engine.dispose()
    finally:
        subprocess.run(["docker", "rm", "--force", name], capture_output=True, check=False)


@pytest.fixture
def migration_project(tmp_path, database):
    engine, url = database
    versions = tmp_path / "versions"
    versions.mkdir()
    # Executa o env.py de produção, sem o monkeypatch do antigo alembic_local.py.
    shutil.copyfile(API_ROOT / "alembic/env.py", tmp_path / "env.py")
    config = tmp_path / "alembic.ini"
    config.write_text((API_ROOT / "alembic.ini").read_text().replace(
        "script_location = alembic", f"script_location = {tmp_path}"
    ))
    environment = {
        "PATH": os.environ["PATH"], "PYTHONPATH": str(API_ROOT),
        "DATABASE_URL": url, "ALEMBIC_DATABASE_URL": url,
        "SUPABASE_JWT_SECRET": "local-test", "ADMIN_PANEL_PASSWORD": "local-test",
    }

    def run():
        return subprocess.Popen(
            [sys.executable, "-m", "alembic", "-c", str(config), "upgrade", "head"],
            cwd=tmp_path, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

    yield engine, versions, run


def write_revision(versions, name, previous, body):
    (versions / f"{name}.py").write_text(
        f"from alembic import op\nrevision = {name!r}\ndown_revision = {previous!r}\n"
        f"def upgrade():\n{body}\n"
    )


def wait_success(process):
    stdout, stderr = process.communicate(timeout=30)
    assert process.returncode == 0, stdout + stderr


def test_commits_revision_and_data_and_retry_is_noop(migration_project):
    engine, versions, run = migration_project
    write_revision(versions, "probe", None,
                   '    op.execute("CREATE TABLE probe (id integer PRIMARY KEY)")\n'
                   '    op.execute("INSERT INTO probe VALUES (1)")')
    wait_success(run())
    wait_success(run())
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "probe"
        assert connection.execute(text("SELECT count(*) FROM probe")).scalar_one() == 1


def test_failed_migration_rolls_back_data_and_revision(migration_project):
    engine, versions, run = migration_project
    write_revision(versions, "first", None, '    op.execute("CREATE TABLE probe (id integer)")')
    wait_success(run())
    write_revision(versions, "bad", "first",
                   '    op.execute("INSERT INTO probe VALUES (2)")\n'
                   '    op.execute("CREATE TABLE must_rollback (id integer)")\n'
                   '    raise RuntimeError("planned failure")')
    process = run()
    _, stderr = process.communicate(timeout=30)
    assert process.returncode != 0
    assert "planned failure" in stderr
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "first"
        assert connection.execute(text("SELECT count(*) FROM probe")).scalar_one() == 0
        assert connection.execute(text("SELECT to_regclass('must_rollback')")).scalar_one() is None


def test_two_processes_wait_on_same_session_lock_and_apply_once(migration_project):
    from app.db.migrations import MIGRATION_ADVISORY_LOCK_KEY

    engine, versions, run = migration_project
    write_revision(versions, "concurrent", None,
                   '    op.execute("CREATE TABLE only_once (id integer)")\n'
                   '    op.execute("INSERT INTO only_once VALUES (1)")')
    processes = []
    with engine.connect() as blocker:
        blocker.execute(text("SELECT pg_advisory_lock(:key)"), {"key": MIGRATION_ADVISORY_LOCK_KEY})
        blocker.commit()
        try:
            processes = [run(), run()]
            # Observa concorrência real: dois backends esperando na trava, sem depender de sleep fixo.
            for _ in range(200):
                with engine.connect() as observer:
                    waiting = observer.execute(text(
                        "SELECT count(DISTINCT pid) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
                    )).scalar_one()
                if waiting == 2:
                    break
                if any(process.poll() is not None for process in processes):
                    pytest.fail("processo terminou antes de esperar a trava")
                time.sleep(0.05)
            assert waiting == 2
        finally:
            blocker.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": MIGRATION_ADVISORY_LOCK_KEY})
            blocker.commit()
            failures = []
            for process in processes:
                try:
                    wait_success(process)
                except Exception as error:
                    failures.append(error)
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.communicate()
            if failures:
                raise failures[0]
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "concurrent"
        assert connection.execute(text("SELECT count(*) FROM only_once")).scalar_one() == 1
