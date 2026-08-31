"""Guardas da `20260831_01` — RLS de telemetria no Alembic e limpeza por CASCADE.

Estatico, como os outros testes de migracao deste repo: carrega o modulo e
inspeciona o SQL emitido.
"""

import importlib.util
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20260831_01_telemetria_rls_no_alembic_e_cascade.py"

TABELAS = (
    "telemetria_sessoes",
    "telemetria_lotes",
    "telemetria_eventos_app",
    "telemetria_time_metric_entries",
)


def _carregar():
    caminho = VERSOES / ARQUIVO
    spec = importlib.util.spec_from_file_location("migration_20260831_01", caminho)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sql(direcao: str = "upgrade") -> str:
    module = _carregar()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return "\n".join(executado)


def _sem_comentarios(sql: str) -> str:
    return " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())


def test_cadeia_de_revisao():
    module = _carregar()
    assert module.revision == "20260831_01"
    assert module.down_revision == "20260830_01"


def test_rls_e_ligado_nas_quatro_tabelas():
    # A lacuna de A6: nenhuma migracao Alembic dava ENABLE ROW LEVEL SECURITY
    # nestas tabelas, entao num ambiente novo elas nasciam sem barreira nenhuma.
    sql = _sql()
    for tabela in TABELAS:
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql, tabela


def test_posse_do_aluno_e_leitura_do_professor():
    sql = _sql()
    for tabela in TABELAS:
        assert f"CREATE POLICY {tabela}_select_own" in sql, tabela
        assert f"CREATE POLICY {tabela}_insert_own" in sql, tabela
        assert f"CREATE POLICY {tabela}_professor_sel" in sql, tabela


def test_delete_e_do_professor_e_nunca_do_aluno():
    # O buraco de 95: sem policy de DELETE o PostgREST filtra tudo, afeta zero
    # linhas e nao retorna erro -- a limpeza do console era um no-op silencioso.
    sql = _sql()
    for tabela in TABELAS:
        assert f"CREATE POLICY {tabela}_professor_del" in sql, tabela

    # Nada de DELETE para o aluno: `20260826_09` decidiu que o app nao apaga o
    # dado do aluno, e telemetria segue a mesma regra.
    assert "_delete_own" not in sql


def test_delete_e_por_classe_do_professor():
    # Apagar telemetria e consequencia de apagar a trilha da classe, entao o
    # predicado e por classe -- e usa o helper SECURITY DEFINER, nao um EXISTS
    # repetido, para nao entrar em recursao de RLS.
    sql = _sql()
    assert "app_classes_do_professor()" in sql


def test_fk_com_cascade_apenas_onde_falta():
    sql = _sql()
    # As duas que nao tinham FK ganham uma, com CASCADE.
    for tabela in ("telemetria_sessoes", "telemetria_lotes"):
        assert f"ADD CONSTRAINT fk_{tabela}_classe" in sql, tabela
    assert sql.count("ON DELETE CASCADE") == 2

    # As outras duas JA tinham FK com CASCADE; recriar seria erro.
    for tabela in ("telemetria_eventos_app", "telemetria_time_metric_entries"):
        assert f"ADD CONSTRAINT fk_{tabela}_classe" not in sql, tabela


def test_orfaos_saem_antes_da_fk():
    # A FK nao pode ser criada com linha apontando para classe inexistente.
    sql = _sql()
    primeiro_delete = sql.index("DELETE FROM telemetria_sessoes")
    primeira_fk = sql.index("ADD CONSTRAINT fk_telemetria_sessoes_classe")
    assert primeiro_delete < primeira_fk


def test_views_entram_versionadas_e_com_security_invoker():
    # Elas existiam no banco e em nenhum arquivo do repo; `20260826_10` so fazia
    # `ALTER VIEW IF EXISTS` sobre elas.
    sql = _sql()
    for view in (
        "vw_telemetria_tempo_topico_aluno",
        "vw_telemetria_tempo_conteudo_aluno",
        "vw_telemetria_tempo_atividade_aluno",
    ):
        assert f"CREATE OR REPLACE VIEW {view}" in sql, view
        assert f"ALTER VIEW {view} SET (security_invoker = on)" in sql, view
        assert f"REVOKE ALL ON {view} FROM anon" in sql, view


def test_views_somam_direto_o_dwell():
    # Elas sempre usaram `sum(dwell_sec)`; era a funcao que somava incrementos.
    # `20260830_01` alinhou a funcao com as views, e este guard impede que o
    # versionamento reintroduza a regra antiga por descuido.
    sql = _sql()
    assert "sum(dwell_sec)" in sql
    assert "lag(" not in _sem_comentarios(sql)


def test_downgrade_nao_abre_buraco_de_acesso():
    # Desligar o RLS num downgrade deixaria a telemetria de todos os alunos
    # aberta para qualquer autenticado. As FKs e a policy de DELETE saem; o RLS
    # fica.
    sql = _sql("downgrade")
    assert "DISABLE ROW LEVEL SECURITY" not in sql
    assert "DROP POLICY IF EXISTS telemetria_sessoes_select_own" not in sql
    assert "DROP CONSTRAINT IF EXISTS fk_telemetria_sessoes_classe" in sql
    assert "DROP POLICY IF EXISTS telemetria_lotes_professor_del" in sql


def test_sql_nao_usa_por_cento():
    # `sa.text()` escapa `%` para `%%`; mesmo guard das outras migracoes.
    for direcao in ("upgrade", "downgrade"):
        assert "%" not in _sem_comentarios(_sql(direcao)), direcao
