"""F1 (segurança) — SQL offline da `20261029_05`: `vw_ranks_info_por_classe` passa a respeitar a RLS.

A `20261021_16` trocou a view com `CREATE OR REPLACE VIEW` sem a cláusula `WITH`, e o Postgres zera as
opções da view nesse caso: o `security_invoker = on` da `20260826_10` se perdeu. Medido em 29/10 com
papel simulado, um `authenticated` sem turma lia 1 rank pela view e 0 pela tabela. Aqui fica o que a
leitura do SQL garante sem banco; a leitura de verdade por aluno e professor está em
`test_e2e_ranks_info_com_invoker.py`.
"""

import re
from io import StringIO

from app.db import migrations
from tests.test_e2e_guilda_mantem_quem_saiu_da_turma import VERSOES
from tests.test_migrations import _offline_alembic_config

VIEW = "public.vw_ranks_info_por_classe"


def _sql(intervalo: str, downgrade: bool = False) -> str:
    output = StringIO()
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(_offline_alembic_config(output), intervalo, sql=True)
    return output.getvalue().replace("%%", "%")


def _upgrade() -> str:
    return _sql("20261029_04:20261029_05")


def _downgrade() -> str:
    return _sql("20261029_05:20261029_04", downgrade=True)


def test_upgrade_liga_o_security_invoker():
    sql = _upgrade()

    assert f"ALTER VIEW {VIEW} SET (security_invoker = on);" in sql


def test_downgrade_tira_a_opcao():
    sql = _downgrade()

    assert f"ALTER VIEW {VIEW} RESET (security_invoker);" in sql


def test_nao_recria_a_view_nem_mexe_nos_grants():
    """Só a opção muda: as colunas ficam (o mobile lê `*`) e o GRANT de `authenticated` também."""
    for sql in (_upgrade(), _downgrade()):
        assert "CREATE VIEW" not in sql and "CREATE OR REPLACE VIEW" not in sql
        assert "DROP VIEW" not in sql
        assert not re.search(r"^\s*(GRANT|REVOKE) ", sql, re.M)


def test_so_a_view_do_rank_info_e_tocada():
    sql = _upgrade()

    assert re.findall(r"ALTER (?:VIEW|TABLE|FUNCTION) \S+", sql) == [f"ALTER VIEW {VIEW}"]


def test_rank_tipo_e_ranks_ja_tem_policy_de_leitura_para_authenticated():
    """A view com invoker lê `ranks` e `rank_tipo` COMO o cliente. As duas policies de SELECT já vêm da
    `20260826_09`; se alguém tirar uma delas, a view passa a devolver vazio em silêncio. Por isso a
    `20261029_05` não acrescenta policy: este teste prende o motivo."""
    texto = (VERSOES / "20260826_09_rls_posse_por_tabela.py").read_text(encoding="utf-8")

    # referência sem dono: leitura livre para autenticado, `USING (true)`
    assert re.search(r'REFERENCIA = \[[^\]]*"rank_tipo"', texto)
    assert "FOR SELECT TO authenticated USING (true)" in texto
    # `ranks` é conteúdo por classe: lê quem é dono OU está matriculado
    assert '("ranks", "classe_id")' in texto
    assert "FOR SELECT TO authenticated\n              USING ({classe_expr} IN (SELECT public.app_minhas_classes()))" in texto
    # e nenhuma migration posterior recria essas policies com outro predicado
    outras = [
        p.name
        for p in VERSOES.glob("*.py")
        if p.name > "20260826_09" and re.search(r"POLICY\s+(rank_tipo|ranks)_posse_sel", p.read_text(encoding="utf-8"))
    ]
    assert outras == []


def test_a_migration_nao_cria_policy():
    assert "CREATE POLICY" not in _upgrade() and "DROP POLICY" not in _upgrade()
