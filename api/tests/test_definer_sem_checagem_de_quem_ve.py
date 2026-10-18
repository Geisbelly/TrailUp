"""Funcao SECURITY DEFINER nao pode entregar dado de quem o chamador nao pode ver.

`SECURITY DEFINER` ignora a RLS das tabelas base. Com `GRANT EXECUTE` para
`authenticated` ela vira `/rest/v1/rpc/<nome>` e qualquer sessao passa o id que
quiser. Medido: `fn_nota_90_10` devolvia 87.00 -- a nota real -- para um aluno
que nem colega da vitima era, enquanto o `SELECT` direto na mesma tabela
devolvia 0 linhas.

O que estes testes protegem:

1. **As tres sem cliente perdem o EXECUTE.** Revogar e preferivel a
   acrescentar checagem quando ninguem chama: nao ha predicado a errar.
2. **`social_presenca_aluno` NAO e revogada.** O mobile a chama
   (`socialChatPresenca`); revogar quebraria o chat. Ela ganha o predicado da
   casa, `app_pode_ver_aluno`.
3. **O downgrade devolve o acesso E a funcao sem guarda.** Reverter pela
   metade deixaria a funcao guardada sem o GRANT, que nao e o estado anterior.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

INTERVALO = "20261018_03:20261018_04"

REVOGADAS = ("fn_nota_90_10", "fn_trilha_by_classe", "social_sao_colegas")


def _render(intervalo: str, *, downgrade: bool = False) -> str:
    output = StringIO()
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    comando = migrations.command.downgrade if downgrade else migrations.command.upgrade
    comando(config, intervalo, sql=True)
    return output.getvalue()


def test_revoga_as_tres_sem_cliente() -> None:
    sql = _render(INTERVALO)
    for nome in REVOGADAS:
        assert (
            f"REVOKE ALL ON FUNCTION public.{nome}" in sql
        ), f"{nome} continuaria chamavel por qualquer sessao"


def test_revoga_de_anon_tambem() -> None:
    sql = _render(INTERVALO)
    for nome in REVOGADAS:
        linha = next(l for l in sql.splitlines() if f"REVOKE ALL ON FUNCTION public.{nome}" in l)
        assert "anon" in linha and "authenticated" in linha


def test_presenca_nao_e_revogada_e_ganha_a_guarda() -> None:
    """O mobile chama esta; revogar quebraria o chat."""
    sql = _render(INTERVALO)
    assert "REVOKE ALL ON FUNCTION public.social_presenca_aluno" not in sql
    assert "CREATE OR REPLACE FUNCTION public.social_presenca_aluno" in sql
    assert "app_pode_ver_aluno" in sql


def test_a_guarda_vem_antes_de_ler_a_sessao() -> None:
    """Se a leitura viesse antes, o dado ja teria sido computado."""
    sql = _render(INTERVALO)
    trecho = sql.split("CREATE OR REPLACE FUNCTION public.social_presenca_aluno")[1]
    assert trecho.index("app_pode_ver_aluno") < trecho.index("aluno_sessoes_app")


def test_downgrade_devolve_grant_e_funcao_sem_guarda() -> None:
    sql = _render("20261018_04:20261018_03", downgrade=True)
    for nome in REVOGADAS:
        assert f"GRANT EXECUTE ON FUNCTION public.{nome}" in sql
    assert "CREATE OR REPLACE FUNCTION public.social_presenca_aluno" in sql
    assert "app_pode_ver_aluno" not in sql
