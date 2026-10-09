"""O tema do mapa tem de chegar em quem esta na classe.

`classe_mapa_tema` ficou com RLS ligado e zero policy. O jeito como o mobile
consome a tabela faz essa falha ser muda: `TrilhaContext` le com
`maybeSingle()`, loga o erro num `console.warn` e desenha o tema padrao. Ou
seja, nenhum teste de tela quebra -- o mapa so fica generico, e o tema que o
`class_theme_sync` gerou nunca aparece.

O que estes testes protegem:

1. **A policy existe e e de SELECT.** Sem ela a tabela volta a ser legivel so
   pelo `service_role`, e o aluno perde o tema de novo.
2. **A posse vem de `app_minhas_classes()`.** Repetir o `EXISTS` sobre
   `classe_aluno` aqui entraria em recursao de RLS; o helper
   `SECURITY DEFINER` existe exatamente para isso (CLAUDE.md).
3. **Nao nasce policy de escrita.** O tema e escrito pelo worker da API via
   `service_role`. Abrir INSERT/UPDATE para `authenticated` deixaria um aluno
   reescrever o mapa da turma inteira -- os GRANTs de escrita dele ja estao
   la, e hoje o que segura e nao haver policy.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
POLICY = "classe_mapa_tema_minhas_classes_sel"


def _sql_da_migracao() -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    migrations.command.upgrade(config, "20261003_02:20261003_03", sql=True)
    return output.getvalue()


def test_cria_policy_de_select_na_classe_mapa_tema() -> None:
    sql = _sql_da_migracao().lower()
    assert f"create policy {POLICY.lower()} on public.classe_mapa_tema" in sql
    assert "for select to authenticated" in sql


def test_posse_sai_do_helper_e_nao_de_classe_aluno() -> None:
    sql = _sql_da_migracao().lower()
    assert "public.app_minhas_classes()" in sql
    # repetir o EXISTS sobre classe_aluno aqui recursaria a RLS
    assert "classe_aluno" not in sql


def test_nao_abre_escrita_para_o_cliente() -> None:
    sql = _sql_da_migracao().lower()
    for proibido in ("for insert", "for update", "for delete", "for all"):
        assert proibido not in sql, f"policy de escrita criada: {proibido}"
    assert "grant insert" not in sql
    assert "grant update" not in sql


def test_downgrade_remove_a_policy() -> None:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    migrations.command.downgrade(config, "20261003_03:20261003_02", sql=True)
    assert f"drop policy if exists {POLICY.lower()}" in output.getvalue().lower()
