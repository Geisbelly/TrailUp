import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260826_02_progresso_no_banco.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260826_02", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sql(direcao: str = "upgrade") -> str:
    module = _load_migration()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return "\n".join(executado)


def test_migration_revision_chain():
    module = _load_migration()
    assert module.revision == "20260826_02"
    assert module.down_revision == "20260826_01"


def test_recalculo_considera_as_tres_fontes_de_progresso():
    # O calculo do cliente conhecia so conteudo/atividade do professor; era isso
    # que gravava o topico como concluido com o material personalizado intocado.
    sql = _sql()

    assert "FROM conteudos c" in sql
    assert "FROM atividades a" in sql
    assert "FROM personalizacao_item_progresso pip" in sql


def test_interacoes_de_slide_ficam_fora_do_percurso():
    # Sao eventos dentro da apresentacao; contar faria o progresso depender de
    # quantos quizzes o deck gerou.
    assert "left(coalesce(pip.item_key, ''), 6) <> 'slide:'" in _sql()


def test_sql_nao_usa_por_cento():
    # `sa.text()` escapa `%` para `%%` pro paramstyle do driver. Sem parametros
    # na execucao, o `%%` chega literal ao Postgres: `LIKE 'slide:%%'` passaria a
    # casar um por-cento literal e o filtro morreria em silencio. Por isso
    # `left()`/`position()` no lugar de LIKE -- e por isso este guard, que
    # tambem cobre o downgrade.
    for direcao in ("upgrade", "downgrade"):
        sql = _sql(direcao)
        # Comentarios podem citar o problema; o SQL executavel, nao.
        executavel = " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())
        assert "%" not in executavel, f"{direcao} tem % no SQL executavel"


def test_nao_recalcula_tempo():
    # Tempo e contador incremental do app (cada flush soma). Derivar dos itens
    # dobraria a conta ou perderia o que ja estava gravado.
    sql = _sql()

    assert "trailup_recalcular_topico_aluno" in sql
    assert "tempo_gasto_min = " not in sql
    assert "SET percentual_concluido = EXCLUDED.percentual_concluido" in sql


def test_gatilho_nas_tres_tabelas_de_item():
    sql = _sql()

    for tabela in ("conteudo_aluno", "atividade_aluno", "personalizacao_item_progresso"):
        assert f"CREATE TRIGGER trg_{tabela}_progresso" in sql
        assert f"ON {tabela}" in sql


def test_gatilho_roda_depois_da_escrita():
    # O recalculo LE as tabelas de item: em BEFORE, leria o estado anterior.
    sql = _sql()

    assert "AFTER INSERT OR UPDATE OR DELETE" in sql
    assert "BEFORE INSERT" not in sql


def test_gatilho_e_recriado_sem_duplicar():
    sql = _sql()

    assert sql.count("DROP TRIGGER IF EXISTS") >= 3
    assert sql.count("CREATE OR REPLACE FUNCTION") >= 3


def test_classe_aluno_detecta_o_dialeto_da_coluna():
    # A tabela existe em camelCase e em minusculas neste projeto; assumir um dos
    # dois falharia em silencio no outro ambiente.
    sql = _sql()

    assert "porcentagemConcluida" in sql
    assert "porcentagemconcluida" in sql
    assert "information_schema.columns" in sql
    assert "EXECUTE v_sql USING" in sql


def test_percentual_fica_entre_0_e_100():
    sql = _sql()

    assert "GREATEST(0, LEAST(100" in sql


def test_status_derivado_do_percentual():
    sql = _sql()

    for esperado in ("'concluido'", "'em andamento'", "'nao iniciado'"):
        assert esperado in sql


def test_downgrade_remove_gatilhos_e_funcoes():
    sql = _sql("downgrade")

    assert sql.count("DROP TRIGGER IF EXISTS") >= 3
    assert "DROP FUNCTION IF EXISTS trailup_progresso_after_item()" in sql
    assert "DROP FUNCTION IF EXISTS trailup_recalcular_topico_aluno(uuid, bigint)" in sql
    assert "DROP FUNCTION IF EXISTS trailup_recalcular_classe_aluno(uuid, bigint)" in sql
