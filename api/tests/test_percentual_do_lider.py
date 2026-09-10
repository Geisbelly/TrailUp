"""`progresso` no rank nunca foi progresso.

Era `pontuacao / max(pontuacao) OVER (PARTITION BY rank_id) * 100`: a pontuacao
relativa ao primeiro colocado. O lider da 100 por construcao, mesmo tendo
concluido 10 por cento da trilha.

O risco desta migracao nao e SQL, e privilegio: renomear coluna exige DROP, DROP
nao preserva grant, e o Supabase tem default privileges que dariam SELECT a
`anon`/`authenticated` em objeto novo no `public` -- recriar a view sem corte sem
cuidado publicaria o ranking inteiro.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260910_05_percentual_do_lider.py"


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260910_04:20260910_05", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_lider", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_a_coluna_troca_de_nome_nas_duas_views() -> None:
    sql = _sql()

    assert "AS percentual_do_lider" in sql
    assert "AS progresso" not in sql
    # A view cortada tambem seleciona pelo nome novo.
    assert "    percentual_do_lider,\n" in sql


def test_a_conta_nao_muda_so_o_nome() -> None:
    """A informacao e legitima -- serve para a barra do rank. O problema era o
    nome convidar a usa-la como progresso na trilha."""
    sql = _sql()

    assert "max(o.pontuacao) OVER (PARTITION BY o.rank_id)" in sql


def test_a_view_sem_corte_nao_fica_legivel_pelo_cliente() -> None:
    """Este e o risco real do DROP. Sem o REVOKE, os default privileges do
    Supabase publicariam o ranking inteiro -- sem o corte de 15 e sem o filtro
    por classe."""
    sql = _sql()

    assert (
        "REVOKE ALL ON TABLE public.vw_rank_posicoes_por_classe_todas "
        "FROM PUBLIC, anon, authenticated;" in sql
    )
    assert "vw_rank_posicoes_por_classe_todas ficou legivel pelo cliente: " in sql


def test_a_view_cortada_mantem_o_select_de_authenticated() -> None:
    """Sem ele o rank simplesmente desaparece do app."""
    sql = _sql()

    assert (
        "GRANT SELECT ON TABLE public.vw_rank_posicoes_por_classe TO authenticated;" in sql
    )
    assert "vw_rank_posicoes_por_classe perdeu o SELECT de authenticated" in sql


def test_o_corte_de_quinze_e_a_propria_linha_continuam() -> None:
    sql = _sql()

    assert "posicao <= app_rank_limite_visivel()" in sql
    assert "id_aluno = auth.uid()" in sql
    assert "app_classes_do_professor()" in sql
    assert "classe_id IN ( SELECT app_minhas_classes() AS app_minhas_classes)" in sql


def test_o_join_do_premio_de_conquista_sobrevive_ao_drop() -> None:
    """A view e recriada do zero: se o join da 20260910_02 nao vier junto, os
    480 pontos de premio param de chegar ao rank outra vez."""
    sql = _sql()

    assert "LEFT JOIN classe_aluno ca_conq" in sql
    assert sql.count("cl.id, ca_conq.classe_id") == 3


def test_a_ordem_do_drop_respeita_a_dependencia() -> None:
    """A cortada depende da `_todas`: derrubar a `_todas` primeiro falharia."""
    sql = _sql()

    cortada = sql.index("DROP VIEW IF EXISTS public.vw_rank_posicoes_por_classe;")
    todas = sql.index("DROP VIEW IF EXISTS public.vw_rank_posicoes_por_classe_todas;")
    assert cortada < todas


def test_a_todas_continua_sem_security_invoker() -> None:
    """Excecao deliberada documentada no CLAUDE.md: somar eventos de varios
    alunos e o que um aluno nao pode fazer lendo `eventos_aluno` linha a linha."""
    assert "security_invoker" not in _sql()


def test_o_downgrade_devolve_o_nome_antigo() -> None:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_05:20260910_04", sql=True
    )
    rendered = output.getvalue()

    assert "AS progresso" in rendered
    assert "AS percentual_do_lider" not in rendered
    # E os grants voltam junto: o downgrade tambem passa pelo DROP.
    assert "GRANT SELECT ON TABLE public.vw_rank_posicoes_por_classe TO authenticated;" in rendered


def test_upgrade_e_downgrade_usam_o_mesmo_corpo() -> None:
    """Duas copias do SQL divergiriam na primeira correcao."""
    modulo = _modulo()

    assert modulo.COLUNA_NOVA == "percentual_do_lider"
    assert modulo.COLUNA_ANTIGA == "progresso"
    assert modulo.COLUNA_NOVA in modulo._corpo_todas(modulo.COLUNA_NOVA)
    assert modulo.COLUNA_ANTIGA in modulo._corpo_todas(modulo.COLUNA_ANTIGA)


def test_o_sql_nao_carrega_porcentagem() -> None:
    assert "%" not in _sql()
