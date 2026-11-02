"""Estrutura da `20261102_07` (demanda do conteúdo, leitura da sugestão, revisão pelo banco).

O que estes testes protegem:

1. **Tabela nova nasce com policy no mesmo commit**, e só de leitura para o cliente.
2. **O aluno lê só a própria sugestão**, e a trava do estudo vale também aqui.
3. **Os gatilhos são `SECURITY DEFINER`, nunca derrubam a escrita que os disparou e não
   escrevem em `atividade_aluno`.**
4. **Sem `%` no SQL**: o SQL offline do Alembic o dobra e corrompe o plpgsql sem erro.
5. **O downgrade tira tudo.**
"""

from __future__ import annotations

import re
from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRATION = API_ROOT / "alembic" / "versions" / "20261102_07_recomendacao_conteudo_x_aluno.py"


def _sql(alvo: str) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = "postgresql://user:password@localhost:5432/trailup"
    if alvo == "upgrade":
        migrations.command.upgrade(config, "20261102_06:20261102_07", sql=True)
    else:
        migrations.command.downgrade(config, "20261102_07:20261102_06", sql=True)
    return output.getvalue().lower()


def _corpo(sql: str, funcao: str) -> str:
    inicio = sql.index(f"create or replace function public.{funcao}()")
    return sql[inicio : sql.index("$fn$;", inicio)]


def test_sem_porcento_no_sql() -> None:
    assert "%" not in MIGRATION.read_text(encoding="utf-8")


def test_tabela_da_demanda_nasce_com_rls_e_policy_de_leitura_do_professor() -> None:
    sql = _sql("upgrade")
    assert "create table if not exists public.conteudo_demanda_formato" in sql
    assert "conteudo_id  bigint      not null unique" in sql
    assert "check (origem in ('modelo', 'heuristica', 'professor'))" in sql
    assert "alter table public.conteudo_demanda_formato enable row level security" in sql
    assert "create policy conteudo_demanda_formato_professor_sel on public.conteudo_demanda_formato" in sql
    assert "revoke all on public.conteudo_demanda_formato from anon" in sql


def test_cliente_nao_escreve_em_nenhuma_das_tres_tabelas() -> None:
    sql = _sql("upgrade")
    for proibido in ("for insert", "for update", "for delete", "for all", "grant insert", "grant update", "grant delete"):
        assert proibido not in sql, proibido
    for tabela in ("conteudo_demanda_formato", "personalizacao_sugestao", "personalizacao_sugestao_log"):
        assert f"revoke insert, update, delete on public.{tabela} from authenticated" in sql


def test_aluno_le_so_a_propria_sugestao_e_professor_a_da_turma() -> None:
    sql = _sql("upgrade")
    aluno = sql[sql.index("create policy personalizacao_sugestao_aluno_sel") :]
    assert "using (aluno_id = auth.uid())" in aluno[: aluno.index(";")]
    for policy in ("personalizacao_sugestao_professor_sel", "personalizacao_sugestao_log_professor_sel"):
        trecho = sql[sql.index(f"create policy {policy}") :]
        assert "public.app_classes_do_professor()" in trecho[: trecho.index(";")]
    # O log não tem policy de aluno.
    assert not re.search(r"create policy \w+ on public\.personalizacao_sugestao_log\s+for select to authenticated\s+using \(aluno_id", sql)


def test_trava_do_estudo_vale_para_a_sugestao() -> None:
    sql = _sql("upgrade")
    trava = sql[sql.index("create policy estudo_trava_sel on public.personalizacao_sugestao") :]
    trava = trava[: trava.index(";")]
    assert "as restrictive" in trava
    assert "public.app_classes_retidas_do_aluno()" in trava
    assert "classe_id is null" in trava


def test_gatilhos_sao_definer_seguros_e_nao_escrevem_na_atividade() -> None:
    sql = _sql("upgrade")
    for funcao in ("fn_sugestao_revisar_por_atividade", "fn_sugestao_revisar_por_demanda"):
        corpo = _corpo(sql, funcao)
        assert "security definer" in corpo
        assert "set search_path to 'public', 'pg_temp'" in corpo
        assert "exception when others then" in corpo
        assert "raise warning" in corpo
        assert f"revoke all on function public.{funcao}() from public, anon, authenticated" in sql
    corpo = _corpo(sql, "fn_sugestao_revisar_por_atividade")
    assert "update public.atividade_aluno" not in corpo
    assert "insert into public.atividade_aluno" not in corpo
    # Enum comparado como texto, com o rótulo exato do banco.
    assert "new.status::text <> 'concluido'" in corpo
    assert "after insert or update of status, acertos_percentual on public.atividade_aluno" in sql
    assert "after insert or update of demanda on public.conteudo_demanda_formato" in sql


def test_motivos_da_revisao_batem_com_a_api() -> None:
    from app.repositories.sugestao_material import MOTIVOS_REVISAO

    sql = _sql("upgrade")
    for motivo in MOTIVOS_REVISAO:
        assert f"revisao_motivo = '{motivo}'" in sql
    assert "revisao_motivo in ('atividade_concluida', 'demanda_do_conteudo')" in sql


def test_downgrade_remove_tudo() -> None:
    sql = _sql("downgrade")
    for item in (
        "drop trigger if exists trg_atividade_aluno_sugestao_revisar",
        "drop function if exists public.fn_sugestao_revisar_por_atividade()",
        "drop function if exists public.fn_sugestao_revisar_por_demanda()",
        "drop policy if exists personalizacao_sugestao_aluno_sel",
        "drop policy if exists personalizacao_sugestao_professor_sel",
        "drop policy if exists personalizacao_sugestao_log_professor_sel",
        "drop policy if exists estudo_trava_sel on public.personalizacao_sugestao",
        "drop column if exists revisao_pendente",
        "drop table if exists public.conteudo_demanda_formato",
    ):
        assert item in sql, item
