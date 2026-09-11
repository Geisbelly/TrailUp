"""Abandono e conclusao da turma saem da trilha, nao de contagem de eventos.

`vw_metricas_engajamento_aluno_classe` dividia CONTAGEM DE EVENTOS:

    topicos_iniciados  = count(*) FILTER (WHERE event_name = 'topic_open')
    topicos_concluidos = count(*) FILTER (WHERE event_name = 'topic_complete')

`topic_open` e um evento por ABERTURA, nao por topico. Cada revisita infla o
denominador, entao a conclusao desaba e o abandono sobe -- quanto mais o aluno
estuda, pior o numero que o professor ve.

Medido em producao, aluno b49f2e21 na classe 32: 106 eventos `topic_open`
contra 1 `topic_complete`, dando conclusao 0.94 e abandono 99.06, enquanto
`topico_aluno` tinha 4 topicos com 3 concluidos (75.00).

As duas taxas somavam 100 entre si, entao eram coerentes uma com a outra e
erradas juntas -- nada dentro da view as contradizia, e foi por isso que o
defeito passou.

Depois: conclusao 75.00, abandono 25.00, batendo com a trilha.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = (
    API_ROOT
    / "alembic"
    / "versions"
    / "20260911_01_abandono_e_conclusao_da_trilha.py"
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
        _offline_alembic_config(output), "20260910_13:20260911_01", sql=True
    )
    return output.getvalue()


def test_as_duas_taxas_derivam_de_topico_aluno() -> None:
    """`topico_aluno` e a autoridade de progresso -- o percentual sai de
    `trailup_recalcular_topico_aluno` e nenhum cliente escreve a coluna. Usar
    a mesma fonte alinha o painel do professor com a trilha, o rank e as
    metricas do perfil."""
    sql = _sql()

    assert "FROM topico_aluno ta" in sql
    assert "JOIN topicos t_cc ON t_cc.id = ta.topico_id" in sql
    assert "JOIN topicos t_ab ON t_ab.id = ta.topico_id" in sql
    assert "ta.status::text = 'concluido'" in sql


def test_nao_conta_evento_de_telemetria() -> None:
    """Contar topicos DISTINTOS da telemetria tambem nao resolveria: o payload
    de `telemetria_eventos_app` nao carrega `topico_id` -- conferido,
    `count(DISTINCT payload->>'topico_id')` devolve 0 para os 106 eventos."""
    sql = _sql()

    assert "'topic_open'" not in sql
    assert "'topic_complete'" not in sql


def test_a_ancora_e_conferida_como_unica() -> None:
    """`replace` troca todas as ocorrencias; a expressao tem de aparecer uma
    vez so, senao a substituicao pega o lugar errado da view."""
    sql = _sql()

    assert "v_ocorrencias <> 1" in sql
    assert "esperava 1 ocorrencia da expressao" in sql


def test_reafirma_security_invoker() -> None:
    """Toda view nasce e permanece com `security_invoker = on` (CLAUDE.md).
    Sem reafirmar no CREATE OR REPLACE, a view passaria a rodar com os
    privilegios do dono e as policies das tabelas base deixariam de valer."""
    sql = _sql()

    assert "WITH (security_invoker = on)" in sql


def test_nao_mexe_nas_outras_colunas() -> None:
    """`CREATE OR REPLACE VIEW` exige a mesma lista de colunas, na mesma ordem
    e tipo. Mexer na CTE de eventos arriscaria as outras metricas que dependem
    dela -- por isso a mudanca sao duas subconsultas, e nada mais."""
    sql = _sql()

    # A substituicao parte da definicao VIVA, nao de um SELECT recolado aqui:
    # o unico CREATE OR REPLACE e o dinamico, montado com o texto lido do
    # catalogo. Nao ha nenhum CREATE literal com o corpo da view neste arquivo.
    assert "pg_get_viewdef(" in sql
    assert "EXECUTE 'CREATE OR REPLACE VIEW" in sql
    assert "SELECT sb.aluno_id" not in sql


def test_a_sentinela_de_idempotencia_e_parametro() -> None:
    """Licao da migracao anterior, agora estrutural: a sentinela e passada como
    argumento porque o downgrade usa a MESMA funcao com as pontas invertidas.
    Uma sentinela fixa faria o downgrade sair sem reverter nada."""
    fonte = MIGRACAO.read_text(encoding="utf-8")

    assert "def _troca(ancora: str, troca: str, sentinela: str) -> str:" in fonte
    assert '_troca(_TROCA_CONCLUSAO, _ANCORA_CONCLUSAO, "te.topicos_concluidos)::numeric")' in fonte


def test_confere_compara_com_a_trilha() -> None:
    """Verificacao que compara com a FONTE, nao so com o texto da view."""
    sql = _sql()

    assert "taxa de conclusao ainda divergente da trilha" in sql
    assert "FROM public.topico_aluno ta" in sql


def test_nao_usa_sinal_de_porcentagem_no_sql() -> None:
    """O renderer offline do Alembic dobra o caractere -- no SQL.

    A checagem e sobre o SQL RENDERIZADO, nao sobre o arquivo: a docstring
    desta migracao fala de "99%" e "75%" em prosa, e prosa de docstring nunca
    passa pelo renderer. Assertar o arquivo inteiro proibiria escrever numero
    percentual na explicacao, que e onde ele ajuda mais."""
    assert "%" not in _sql()
