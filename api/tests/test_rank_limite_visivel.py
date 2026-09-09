"""O corte do ranking: topo visivel mais a propria linha, sempre.

O que estes testes protegem, em ordem de gravidade:

1. **O corte e de dados.** Se sair da view, vira decoracao: nome e pontuacao de
   todos os colegas voltam a trafegar ate o aparelho.
2. **O professor continua vendo a turma inteira.** `app_minhas_classes()` serve
   aluno e professor, e o console le a mesma view -- sem a condicao dele, o
   professor perde a metade de baixo, que e a metade que o sinal de risco de
   reprovacao precisa.
3. **A base nao pode ser tocada.** `posicao` sai de `dense_rank()` e `progresso`
   e normalizado por `MAX(...) OVER (PARTITION BY rank_id)`: cortando la, a 14a
   posicao vira 100%.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql_da_migracao() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260909_01:20260909_02", sql=True
    )
    return output.getvalue()


def test_o_corte_tem_as_tres_condicoes() -> None:
    sql = _sql_da_migracao()

    assert "posicao <= public.app_rank_limite_visivel()" in sql
    assert "id_aluno = auth.uid()" in sql
    # A que o console depende. Perde-la nao quebra nada visivelmente: o professor
    # simplesmente para de ver quem esta atras.
    assert "app_classes_do_professor()" in sql


def test_o_corte_fica_na_view_embrulhada_e_nao_na_base() -> None:
    sql = _sql_da_migracao()

    assert "CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe AS" in sql
    # A base so aparece como origem do SELECT, nunca como alvo de CREATE.
    assert "CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas" not in sql
    assert "FROM vw_rank_posicoes_por_classe_todas" in sql

    # Se estes aparecessem aqui, o corte teria descido para a base.
    assert "dense_rank()" not in sql
    assert "PARTITION BY" not in sql


def test_o_limite_e_configuracao_e_nao_constante_no_sql() -> None:
    sql = _sql_da_migracao()

    assert "CREATE TABLE IF NOT EXISTS public.app_config" in sql
    assert "'rank_limite_visivel'" in sql
    assert "CREATE OR REPLACE FUNCTION public.app_rank_limite_visivel()" in sql

    # O numero aparece como semente e como fallback da funcao -- nunca dentro do
    # predicado da view.
    assert "posicao <= 15" not in sql


def test_limite_ausente_ou_zerado_nao_vira_mostra_tudo() -> None:
    """Config apagada tem que cair no padrao, e `0` nao pode esconder todo mundo."""
    sql = _sql_da_migracao()

    assert "GREATEST(" in sql
    assert "COALESCE(" in sql
    # Le a config com privilegio proprio: se alguem desligar o flag `publico`, o
    # corte precisa continuar valendo.
    assert "SECURITY DEFINER" in sql


def test_app_config_nao_e_gravavel_pelo_cliente() -> None:
    """Mesma forma de `notificacoes_config`: le so o publico, nao escreve nada."""
    sql = _sql_da_migracao()

    assert "ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE POLICY app_config_sel ON public.app_config" in sql
    assert "USING (publico)" in sql
    assert "REVOKE INSERT, UPDATE, DELETE ON public.app_config FROM anon, authenticated" in sql


def test_o_sql_nao_carrega_porcentagem() -> None:
    """`%` vira `%%` no render do Alembic; num predicado de view isso passa
    despercebido e corta o que nao devia."""
    assert "%" not in _sql_da_migracao()
