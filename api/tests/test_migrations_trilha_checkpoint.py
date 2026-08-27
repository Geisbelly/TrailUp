import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260826_01_trilha_checkpoint_navegacao.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260826_01", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sem_comentarios(sql: str) -> str:
    """Remove comentarios `--` antes de asseverar sobre o SQL.

    Sem isso a analise casa com a PROSA da migracao: o comentario que explica
    por que nao existe `CHECK (block_id > 0)` contem justamente esse texto, e o
    teste passava a acusar o que ele deveria proteger.
    """
    return " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())


def _sql_do_upgrade():
    module = _load_migration()
    executed: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executed.append(str(sql))

    module.op = FakeOp()
    module.upgrade()
    return executed


def test_migration_revision_chain():
    module = _load_migration()
    assert module.revision == "20260826_01"
    assert module.down_revision == "20260825_01"


def test_cria_tabela_de_forma_idempotente():
    # A tabela ja existe em alguns ambientes (nasceu fora do Alembic); a
    # migracao nao pode quebrar neles.
    sql = _sql_do_upgrade()

    assert any(
        "CREATE TABLE IF NOT EXISTS trilha_checkpoint_navegacao" in s for s in sql
    )


def test_unique_bate_exatamente_com_o_onconflict_do_app():
    # O cliente grava com upsert onConflict
    # 'aluno_id,classe_id,topico_id,scope_id'. O Postgres exige um indice unico
    # nessas colunas para resolver o ON CONFLICT -- sem ele o upsert falha, e
    # falha em silencio porque saveTrilhaCheckpoint engole o erro.
    sql = " ".join(_sql_do_upgrade())

    assert "UNIQUE (aluno_id, classe_id, topico_id, scope_id)" in sql


def test_block_id_aceita_negativo():
    # Material personalizado usa id negativo estavel. Um CHECK de positividade
    # aqui quebraria a retomada justamente nos passos personalizados.
    sql = _sem_comentarios(" ".join(_sql_do_upgrade()))

    assert "block_id > 0" not in sql
    assert "block_id >= 0" not in sql


def test_block_kind_restrito_aos_dois_tipos_de_bloco():
    sql = " ".join(_sql_do_upgrade())

    assert "block_kind IN ('conteudo', 'atividade')" in sql
    # Nulo tem que passar: o checkpoint de "mostrar resumo" nao aponta bloco.
    assert "block_kind IS NULL OR" in sql


def test_updated_at_nunca_fica_vazio():
    # normalizeCheckpoint devolve null sem `updated_at`, e o app reabre o topico
    # no inicio. DEFAULT e trigger cobrem quem gravar sem o campo.
    sql = " ".join(_sql_do_upgrade())

    assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in sql
    assert "set_trilha_checkpoint_navegacao_updated_at" in sql
    assert "BEFORE INSERT OR UPDATE ON trilha_checkpoint_navegacao" in sql


def test_trigger_e_recriada_sem_duplicar():
    sql = _sql_do_upgrade()

    assert any("DROP TRIGGER IF EXISTS" in s for s in sql)
    assert any("CREATE OR REPLACE FUNCTION" in s for s in sql)


def test_downgrade_desfaz_tabela_funcao_e_trigger():
    module = _load_migration()
    executed: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executed.append(str(sql))

    module.op = FakeOp()
    module.downgrade()
    sql = " ".join(executed)

    assert "DROP TABLE IF EXISTS trilha_checkpoint_navegacao" in sql
    assert "DROP FUNCTION IF EXISTS set_trilha_checkpoint_navegacao_updated_at()" in sql
    assert "DROP TRIGGER IF EXISTS" in sql


def test_rls_cobre_as_quatro_operacoes_que_o_app_usa():
    # O app le, insere, atualiza (upsert) e APAGA (clearTrilhaCheckpoint).
    # Faltando DELETE, o checkpoint velho fica para tras e o topico concluido
    # reabre no meio -- sem erro visivel.
    caminho = (
        Path(__file__).resolve().parents[2]
        / "docs"
        / "mobile"
        / "sql"
        / "20260826_01_rls_trilha_checkpoint_navegacao.sql"
    )
    conteudo = caminho.read_text(encoding="utf-8")

    assert "ENABLE ROW LEVEL SECURITY" in conteudo
    for operacao in ("FOR SELECT", "FOR INSERT", "FOR UPDATE", "FOR DELETE"):
        assert operacao in conteudo, f"politica de {operacao} ausente"
    assert "GRANT SELECT, INSERT, UPDATE, DELETE" in conteudo
    # Escopo por dono, nunca liberado para todos.
    assert conteudo.count("auth.uid() = aluno_id") >= 4
