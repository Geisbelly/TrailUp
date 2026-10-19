"""REPLICA IDENTITY FULL so nas tabelas cujo DELETE o cliente precisa ver.

Com `REPLICA IDENTITY DEFAULT`, o old record de um DELETE carrega so a chave
primaria. O mobile assina com filtro em coluna NAO-PK (`aluno_id`,
`classe_id`), entao o filtro nao casa e o evento nunca chega -- em silencio.

O que estes testes protegem:

1. **As tres entram.** Sao as unicas em que a perda do DELETE e observavel:
   matricula removida, evento de conquista apagado, notificacao apagada.
2. **As de progresso NAO entram.** Ligar `FULL` em `topico_aluno`,
   `conteudo_aluno`, `atividade_aluno` ou `conteudo_personalizado` poe a linha
   antiga inteira no WAL a cada evento de progresso -- o caminho mais quente do
   app, e com a maior contagem de UPDATE desta base. Fica para a #331, com
   medicao.
3. **O downgrade devolve DEFAULT**, nao outra coisa: reverter tem que devolver
   o comportamento antigo, senao o downgrade mente.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]

INTERVALO = "20261018_01:20261018_10"

DEVEM_ENTRAR = ("classe_aluno", "notificacoes", "eventos_aluno")

# Assinadas pelo mobile tambem, mas deliberadamente de fora: o custo cai no
# caminho mais quente do app.
DEVEM_FICAR_DE_FORA = (
    "topico_aluno",
    "conteudo_aluno",
    "atividade_aluno",
    "conteudo_personalizado",
)


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


def test_liga_full_nas_tres() -> None:
    sql = _render(INTERVALO)
    for tabela in DEVEM_ENTRAR:
        assert (
            f"ALTER TABLE public.{tabela} REPLICA IDENTITY FULL" in sql
        ), f"{tabela} continuaria sem receber DELETE"


def test_nao_encosta_nas_tabelas_de_progresso() -> None:
    sql = _render(INTERVALO)
    for tabela in DEVEM_FICAR_DE_FORA:
        assert (
            f"ALTER TABLE public.{tabela} REPLICA IDENTITY" not in sql
        ), f"{tabela} esta no caminho quente; ligar FULL nela e decisao da #331"


def test_classe_mapa_tema_nao_precisa() -> None:
    """Ela filtra por `classe_id`, que e a PK dela -- o DELETE ja chega."""
    sql = _render(INTERVALO)
    assert "classe_mapa_tema" not in sql


def test_downgrade_devolve_default() -> None:
    sql = _render("20261018_10:20261018_01", downgrade=True)
    for tabela in DEVEM_ENTRAR:
        assert f"ALTER TABLE public.{tabela} REPLICA IDENTITY DEFAULT" in sql
    assert "REPLICA IDENTITY FULL" not in sql
