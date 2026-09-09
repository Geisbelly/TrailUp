"""A migracao que tira as conquistas mortas do ar.

21 das 27 conquistas nunca destravavam porque `trg_eventos_aluno_after_iud`
despachava por `conquistas.tipo` numa cadeia `IF/ELSIF` fechada em seis valores,
sem `ELSE`. A `20260826_12` inseriu 21 linhas com `tipo` novo e nenhum ramo.

Estes testes fixam os dois invariantes que teriam impedido aquilo:

1. a lista de metricas aceitas e os ramos que as avaliam saem da MESMA
   estrutura, entao nao ha como declarar uma e esquecer a outra;
2. o SQL nao carrega `%`, porque o render do Alembic o duplica para `%%` e o
   resultado seria um `LIKE` que nunca casa -- silenciosamente.
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
    API_ROOT / "alembic" / "versions" / "20260909_01_conquistas_por_metrica.py"
)


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
        _offline_alembic_config(output), "20260831_02:20260909_01", sql=True
    )
    return output.getvalue()


def _modulo_da_migracao() -> ModuleType:
    """Carrega o arquivo de versao pelo caminho -- `alembic/versions` nao e pacote."""
    spec = importlib.util.spec_from_file_location("migracao_conquistas", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_toda_metrica_aceita_pelo_banco_tem_ramo_que_a_avalia() -> None:
    """O defeito original em uma linha: valor aceito, ramo inexistente.

    Aqui a lista e os ramos vem do mesmo dicionario, entao o teste confere que a
    geracao continua acoplada -- se alguem trocar por duas listas soltas, isto
    quebra.
    """
    modulo = _modulo_da_migracao()
    metricas = set(modulo.METRICAS)
    assert metricas, "sem metricas nao ha conquista avaliavel"

    sql = _sql_da_migracao()

    for metrica in metricas:
        assert f"'{metrica}'" in sql, f"metrica {metrica} nao aparece no SQL"
        assert f"v_metrica = '{metrica}'" in sql, f"metrica {metrica} nao tem ramo"

    # Um IF e o resto ELSIF: a contagem so fecha se todos os ramos foram gerados.
    assert sql.count("v_metrica = '") == len(metricas)


def test_o_sql_nao_carrega_porcentagem() -> None:
    """`%` vira `%%` no render, e um `LIKE 'topico%%'` nao casa com nada.

    A view do rank filtra por `WHERE ... IS NOT NULL`, entao o evento cairia fora
    da soma sem erro nenhum -- o mesmo formato de falha que esta migracao veio
    corrigir. Por isso os prefixos usam `starts_with` e a mensagem do RAISE usa
    concatenacao.
    """
    sql = _sql_da_migracao()

    assert "%" not in sql
    assert "starts_with(lower(COALESCE(e.tipo" in sql
    assert "ILIKE" not in sql


def test_a_metrica_e_obrigatoria_no_banco_e_nao_so_no_codigo() -> None:
    """CHECK vale mais que teste: a linha morta nao chega a existir."""
    sql = _sql_da_migracao()

    assert "CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada" in sql
    assert "ADD CONSTRAINT conquistas_metrica_suportada" in sql
    assert "public.fn_conquista_metrica_suportada(criterio->>'metrica')" in sql

    # Falha com o nome das conquistas, nao com estouro de constraint.
    # `RAISE EXCEPTION 'texto' || expr` e erro de sintaxe em PL/pgSQL: o
    # formato tem que ser literal. `USING MESSAGE` aceita expressao -- e nao
    # carrega `%`, que o render do Alembic duplicaria.
    assert "RAISE EXCEPTION USING MESSAGE = 'conquistas sem metrica suportada: '" in sql


def test_premio_da_conquista_chega_ao_rank_sem_reentrar_no_gatilho() -> None:
    """Os dois lados do segundo defeito: pagar, e pagar sem se morder."""
    modulo = _modulo_da_migracao()
    evento = modulo.EVENTO_PREMIO
    sql = _sql_da_migracao()

    # Paga: o evento existe e carrega `pontos_recompensa`.
    assert f"'{evento}'" in sql
    assert "v_conquista.pontos_recompensa," in sql

    # Nao se morde: o gatilho roda em AFTER INSERT sobre a propria tabela.
    assert f"IF v_tipo = '{evento}' THEN" in sql

    # Paga uma vez so: os dois unicos caminhos que ligam v_premiar sao a criacao
    # da linha e a conclusao de uma linha que ainda nao estava concluida.
    assert sql.count("v_premiar := true;") == 2

    # E chega ao rank: sem este ramo a view descartaria o evento em silencio,
    # porque so conhecia topico/conteudo/atividade.
    assert "starts_with(lower(COALESCE(e.tipo, ''::text)), 'conquista')" in sql
    assert "'classe:' || v_classe_id::text" in sql


def test_topicos_concluidos_le_a_tabela_e_nao_um_evento_que_ninguem_emite() -> None:
    """Duas conquistas do Conqueror pediam `topico_concluido`.

    Esse tipo de evento nao aparece entre os que os clientes emitem, entao mesmo
    com o despacho correto elas continuariam mortas. Passam a ler
    `topico_aluno`, que o trigger de progresso ja mantem.
    """
    sql = _sql_da_migracao()

    assert "WHEN criterio ? 'evento' AND criterio->>'evento' = 'topico_concluido'" in sql
    assert "THEN 'topicos_concluidos'" in sql
    assert "v_atingiu := v_topicos_concluidos >=" in sql


def test_agregados_saem_do_laco() -> None:
    """Antes cada conquista rodava a propria agregacao, 27 vezes por evento."""
    sql = _sql_da_migracao()

    corpo = sql[sql.index("CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud") :]
    inicio_laco = corpo.index("FOR v_conquista IN SELECT")

    antes, dentro = corpo[:inicio_laco], corpo[inicio_laco:]

    for agregado in (
        "INTO v_eventos_totais",
        "INTO v_dias_seguidos",
        "INTO v_minutos_totais",
        "INTO v_melhor_acertos",
        "INTO v_melhor_trilha",
        "INTO v_topicos_concluidos",
        "INTO v_contagem_por_tipo",
    ):
        assert agregado in antes, f"{agregado} deveria ser calculado antes do laco"
        assert agregado not in dentro, f"{agregado} voltou para dentro do laco"


def test_o_enum_de_status_nao_e_coagido_e_o_acento_sobrevive() -> None:
    """`status` e o enum `status_atividade`; COALESCE sem `::text` aborta em
    producao, e os rotulos tem acento (`não iniciado`). O projeto ja teve os
    dois problemas."""
    sql = _sql_da_migracao()

    assert "coalesce(status::text, '')" in sql
    assert "ta.status::text <> 'não iniciado'" in sql
    assert "'nao iniciado'" not in sql
