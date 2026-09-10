"""O premio da conquista tem de chegar ao rank.

Medido em producao: 340 dos 752 pontos do aluno de demonstracao eram premio de
conquista, e nenhum chegava a rank algum -- os 12 eventos nasceram com
`referencia = NULL`, porque o premio herdava a classe do evento que o disparou.
E faltavam 140: 6 conquistas ja estavam concluidas antes da `20260909_01`, que
paga so' na transicao.
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = (
    API_ROOT
    / "alembic"
    / "versions"
    / "20260910_02_premio_de_conquista_chega_ao_rank.py"
)


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
        _offline_alembic_config(output), "20260910_01:20260910_02", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_premio", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_a_referencia_do_premio_e_a_conquista_nunca_a_classe() -> None:
    """`conquistas.escopo` so' tem `comum` e `perfil`: conquista nao pertence a
    classe alguma, entao herdar a classe do evento disparador era errado de
    origem -- e como a maioria dos eventos nao resolve classe, dava NULL."""
    sql = _sql()

    assert "'ELSE ''conquista:'' || v_conquista.id::text END,'" in sql
    assert "'CASE WHEN v_conquista.id IS NULL THEN NULL'" in sql


def test_o_indice_unico_volta_a_deduplicar() -> None:
    """Com `referencia = NULL` o `ON CONFLICT` nao casava nada: NULL nunca e'
    igual a NULL num indice unico. Com `conquista:<id>` uma conquista paga uma
    vez por aluno."""
    modulo = _modulo()
    sql = _sql()

    assert "conquista_desbloqueada" in modulo.PREDICADO_CREDITADO
    # O predicado do ON CONFLICT repete o do indice parcial.
    assert "ON CONFLICT (aluno_id, tipo, referencia)" in sql
    assert f"WHERE {modulo.PREDICADO_CREDITADO}" in sql


def test_a_view_atribui_o_premio_a_todas_as_classes_do_aluno() -> None:
    """Um pagamento, N atribuicoes. Gravar uma linha por classe inflaria o
    razao: o aluno de tres turmas apareceria com o premio pago tres vezes."""
    sql = _sql()

    assert "LEFT JOIN classe_aluno ca_conq" in sql
    assert "starts_with(lower(e.referencia_bruta), 'conquista:')" in sql
    assert "AND ca_conq.aluno_id = e.aluno_id" in sql
    # Entra no COALESCE em todos os tres lugares: SELECT, WHERE e GROUP BY.
    assert sql.count("cl.id, ca_conq.classe_id") == 3


def test_o_backfill_repaga_a_partir_da_fonte_da_verdade() -> None:
    """As 12 linhas antigas sao inatribuiveis -- quatro conquistas dividem o
    mesmo `pontos_recompensa`, entao o valor sozinho nao diz a qual delas cada
    linha pertence. `conquistas_aluno` diz."""
    sql = _sql()

    assert "DELETE FROM public.eventos_aluno" in sql
    assert "AND referencia IS NULL;" in sql
    assert "FROM public.conquistas_aluno ca" in sql
    assert "WHERE ca.concluida IS TRUE" in sql
    # So' quem tem premio: conquista de 0 ponto nao gera evento.
    assert "AND COALESCE(c.pontos_recompensa, 0) > 0" in sql


def test_a_data_do_premio_e_convertida_explicitamente() -> None:
    """`criado_em` e' timestamp SEM tz e `data_conquista` e' COM. Deixar a
    conversao implicita esconderia uma dependencia do TimeZone da sessao."""
    assert "(COALESCE(ca.data_conquista, now()))::timestamp" in _sql()


def test_usa_substituicao_e_nao_recola_o_corpo_gerado() -> None:
    """O gatilho e' gerado do dicionario de metricas da `20260909_01`. Recolar
    o corpo aqui congelaria aquela geracao dentro desta migracao."""
    sql = _sql()

    assert "SELECT p.prosrc INTO v_src" in sql
    # O `CREATE OR REPLACE` existe, mas montado em volta do corpo LIDO do
    # catalogo -- nao de um corpo escrito aqui.
    assert "|| v_novo || '$fn$'" in sql
    # Nenhum ramo de metrica veio junto.
    assert "eventos_totais" not in sql
    assert "v_atingiu" not in sql
    assert "v_conquista.criterio" not in sql


def test_a_migracao_aborta_se_o_premio_nao_fechar() -> None:
    """Falhar na migracao e melhor que servir um rank silenciosamente errado."""
    sql = _sql()

    assert "premio de conquista ainda sem referencia: " in sql
    assert "premio com referencia fora do formato conquista:<id>: " in sql
    assert "premio pago (" in sql
    assert "difere do devido (" in sql


def test_a_substituicao_e_idempotente() -> None:
    """Rodar de novo sobre um gatilho ja corrigido nao pode falhar dizendo que
    nao encontrou o ponto de insercao."""
    sql = _sql()

    assert "ja aplicado" in sql
    assert "position('ELSE ''conquista:'' || v_conquista.id::text END,' in v_src) > 0" in sql


def test_o_downgrade_devolve_a_referencia_por_classe() -> None:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260910_02:20260910_01", sql=True
    )
    rendered = output.getvalue()

    assert "':conquista:'" in rendered or "'':conquista:''" in rendered
    assert "v_classe_id" in rendered


def test_o_sql_nao_carrega_porcentagem() -> None:
    """O renderizador offline dobra `%` para `%%`, o que quebraria silenciosamente
    qualquer comparacao de texto."""
    assert "%" not in _sql()
