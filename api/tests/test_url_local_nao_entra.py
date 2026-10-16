"""URL de loopback nao pode ser gravada em material do aluno (#189).

Uma apresentacao ficou gravada como `http://localhost:3002/...` -- material que
nunca carrega, e que falha do pior jeito: conexao recusada, sem dizer por que.
A URL vem de variavel de ambiente no momento da geracao, entao isso volta a
acontecer sempre que alguem gerar com `BRAINHEXPDF_API_URL` local.

O que estes testes protegem:

1. **O CHECK olha so as chaves de URL, nao o texto do JSONB.** O TrailUp ensina
   tecnologia: uma aula sobre servidor web contem "abra http://localhost:3000"
   dentro do markdown. Um CHECK sobre `materiais::text` recusaria esse material
   -- protecao pior que o bug. Este e o teste que trava o desenho.
2. **A funcao e IMMUTABLE.** CHECK nao aceita funcao volatil; sem isso a
   migracao falha no ALTER TABLE, no deploy.
3. **`partes[]` entra na varredura.** A apresentacao e gravada parte a parte;
   olhar so o nivel de cima deixaria passar a parte com URL local.
4. **A funcao nao fica na superficie REST.**
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


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


def test_nao_varre_o_texto_inteiro_do_jsonb() -> None:
    sql = _render("20261003_07:20261003_08")
    assert "materiais::text" not in sql, (
        "varrer o texto do JSONB recusaria aula que apenas MENCIONA localhost"
    )
    # olha chave por chave
    for chave in ("arquivo_url", "url", "audio_url", "apresentacao_url"):
        assert f"'{chave}'" in sql, f"{chave} ficaria sem checagem"


def test_a_funcao_e_immutable() -> None:
    sql = _render("20261003_07:20261003_08")
    assert "IMMUTABLE" in sql, "CHECK nao aceita funcao volatil"


def test_varre_tambem_as_partes_da_apresentacao() -> None:
    sql = _render("20261003_07:20261003_08")
    assert "'partes'" in sql
    assert "jsonb_array_elements" in sql


def test_exige_esquema_e_ancora_o_host() -> None:
    sql = _render("20261003_07:20261003_08")
    # sem exigir esquema, `conteudo_aluno/localhost/x.html` (storage_path
    # relativo) seria barrado; sem ancorar o host com `/` ou fim,
    # `localhost.cdn.trailup.app` seria barrado.
    assert "^[a-z][a-z0-9+.-]*://" in sql
    assert "(:[0-9]+)?(/|$)" in sql
    for alvo in ("localhost", r"127(\.[0-9]{1,3}){3}", r"0\.0\.0\.0", r"\[::1\]"):
        assert alvo in sql, f"{alvo} fora da lista de loopback"


def test_as_duas_tabelas_ganham_a_constraint() -> None:
    sql = _render("20261003_07:20261003_08")
    assert "conteudo_personalizado_sem_url_local" in sql
    assert "fontes_personalizacao_sem_url_local" in sql
    # upload sem link tem arquivo_url nulo e precisa continuar passando
    assert "arquivo_url IS NULL OR" in sql


def test_funcao_fora_da_superficie_rest() -> None:
    sql = _render("20261003_07:20261003_08")
    assert (
        "REVOKE EXECUTE ON FUNCTION public.fn_materiais_com_url_local(jsonb)"
        " FROM PUBLIC, anon, authenticated" in sql
    )


def test_downgrade_remove_constraints_e_funcao() -> None:
    sql = _render("20261003_08:20261003_07", downgrade=True)
    assert "DROP CONSTRAINT IF EXISTS fontes_personalizacao_sem_url_local" in sql
    assert "DROP CONSTRAINT IF EXISTS conteudo_personalizado_sem_url_local" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_materiais_com_url_local" in sql
