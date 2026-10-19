from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261019_01:20261019_02", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261019_02:20261019_01", sql=True)
    return output.getvalue()


def test_insert_deixa_de_aceitar_qualquer_aluno_id() -> None:
    """`WITH CHECK (true)` deixava uma sessão autenticada gravar progresso para outro aluno."""
    sql = _upgrade_sql()

    assert 'DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.topico_aluno;' in sql
    assert "CREATE POLICY topico_aluno_posse_ins ON public.topico_aluno" in sql
    assert "WITH CHECK (true)" not in sql


def test_professor_volta_a_ler_o_progresso_da_turma() -> None:
    """Medido: professor lia 0 de 2 em topico_aluno, contra 2/2 e 1/1 nas irmãs."""
    sql = _upgrade_sql()

    assert "CREATE POLICY topico_aluno_posse_sel ON public.topico_aluno" in sql
    assert "aluno_id IN (SELECT public.app_alunos_do_professor())" in sql
    assert "aluno_id = auth.uid()" in sql


def test_predicado_e_o_mesmo_das_irmas() -> None:
    """As três tabelas guardam a mesma coisa. O predicado é copiado de `conteudo_aluno` /
    `atividade_aluno`, não reescrito, para não divergirem de novo."""
    sql = _upgrade_sql()

    for cmd, policy in (
        ("FOR INSERT", "topico_aluno_posse_ins"),
        ("FOR SELECT", "topico_aluno_posse_sel"),
        ("FOR UPDATE", "topico_aluno_posse_upd"),
    ):
        assert f"CREATE POLICY {policy} ON public.topico_aluno\n  {cmd} TO authenticated" in sql

    # UPDATE com WITH CHECK explícito, como nas irmãs.
    pos = sql.index("CREATE POLICY topico_aluno_posse_upd")
    trecho = sql[pos : pos + 260]
    assert "USING (aluno_id = auth.uid())" in trecho
    assert "WITH CHECK (aluno_id = auth.uid())" in trecho


def test_remove_os_nomes_antigos_do_painel() -> None:
    """Os três nomes vinham do painel do Supabase, não de migration. Sem o DROP, a policy
    permissiva continuaria valendo ao lado da nova — policies são OR entre si."""
    sql = _upgrade_sql()

    for antigo in (
        "Enable insert for authenticated users only",
        "Aluno vê só seus progressos",
        "Aluno atualiza só seus progressos",
    ):
        assert f'DROP POLICY IF EXISTS "{antigo}" ON public.topico_aluno;' in sql


def test_downgrade_restaura_as_tres_antigas() -> None:
    sql = _downgrade_sql()

    assert "WITH CHECK (true)" in sql
    assert "app_alunos_do_professor" not in sql
