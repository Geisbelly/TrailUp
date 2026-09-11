"""Conquista de perfil so destrava para quem e daquele perfil.

`trg_eventos_aluno_after_iud()` avaliava `SELECT * FROM public.conquistas`
sem filtro de audiencia, entao media TODAS as conquistas contra TODO aluno --
e `escopo`/`perfil_alvo` existiam justamente para isso nao acontecer.

Medido em producao, aluno b49f2e21 (representativos: mastermind 85, conqueror
60): ele recebeu "Nova conquista desbloqueada!" de Horizonte Completo
(seeker), Sequencia de Ouro (achiever), Arrancada (daredevil) e Retorno Firme
(survivor), entre outras. A tela de conquistas filtra certo, por
`conquistaVisivelParaPerfis`, e nao as mostrava -- do ponto de vista do aluno,
ele ganhava conquista que nao existe no perfil dele. No banco eram 9 de 14
linhas de conquista de perfil indevidas, pagando 250 pontos ao rank.

O ponto destes testes nao e repetir a regra: e AMARRAR as duas
implementacoes. A audiencia canonica vive no TypeScript do mobile, o gatilho
replica em SQL, e duas copias da mesma regra sem nada ligando uma a outra foi
exatamente o problema que este repo teve com o merge de materiais -- onde a
copia morta ensinava o contrario da viva. Aqui os testes LEEM as constantes do
mobile e falham se o SQL divergir.
"""

from __future__ import annotations

import importlib.util
import re
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parent
MIGRACAO = (
    API_ROOT
    / "alembic"
    / "versions"
    / "20260910_11_conquista_de_perfil_respeita_o_perfil.py"
)
BRAINHEX_TS = REPO_ROOT / "mobile" / "src" / "utils" / "brainHex.ts"
AUDIENCIA_TS = REPO_ROOT / "mobile" / "src" / "utils" / "conquistaAudience.ts"


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
        _offline_alembic_config(output), "20260910_10:20260910_11", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_conquista_perfil", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _constante_ts(nome: str) -> int:
    texto = BRAINHEX_TS.read_text(encoding="utf-8")
    achado = re.search(rf"const\s+{nome}\s*=\s*(\d+)", texto)
    assert achado, f"{nome} nao encontrada em {BRAINHEX_TS.name}"
    return int(achado.group(1))


def test_o_limiar_de_afinidade_bate_com_o_do_mobile() -> None:
    """`DEFAULT_SIGNAL_THRESHOLD` no TypeScript e o `>= N` no SQL tem de ser o
    mesmo numero. Se alguem afinar o limiar de um lado so, o aluno passa a
    ganhar (ou perder) conquista de um perfil que a tela nao mostra -- que e o
    bug original voltando pela porta de tras."""
    limiar = _constante_ts("DEFAULT_SIGNAL_THRESHOLD")
    filtro = _modulo()._FILTRO

    assert f"rep.af >= {limiar}" in filtro, (
        f"o SQL nao usa o limiar do mobile ({limiar})"
    )


def test_a_janela_de_perfis_bate_com_a_do_mobile() -> None:
    """`SECONDARY_SIGNAL_INDEX = 1` significa que os DOIS primeiros contam
    (indices 0 e 1). No SQL, `row_number()` comeca em 1, entao a traducao
    correta e `pos <= 2`."""
    indice_secundario = _constante_ts("SECONDARY_SIGNAL_INDEX")
    filtro = _modulo()._FILTRO

    assert f"rep.pos <= {indice_secundario + 1}" in filtro, (
        f"SECONDARY_SIGNAL_INDEX={indice_secundario} deveria virar "
        f"pos <= {indice_secundario + 1} no SQL"
    )
    # E o corte por posicao exige afinidade > 0, igual ao
    # `hasMeaningfulAffinity` do TypeScript.
    assert "rep.af > 0 AND rep.pos <=" in filtro


def test_escopo_comum_continua_valendo_para_todos() -> None:
    """`conquistaVisivelParaPerfis` devolve true de saida quando o escopo e
    `comum`. Filtrar comum por perfil quebraria as conquistas que medem estudo
    e uso geral."""
    filtro = _modulo()._FILTRO
    audiencia = AUDIENCIA_TS.read_text(encoding="utf-8")

    assert 'normalizeConquistaEscopo(conquista.escopo) === "comum"' in audiencia
    assert "lower(COALESCE(c.escopo, 'comum')) <> 'perfil'" in filtro


def test_perfil_sem_alvo_nao_destrava() -> None:
    """No TypeScript, `Boolean(alvo && representativos.has(alvo))` rejeita
    conquista marcada como `perfil` sem `perfil_alvo`. No SQL o COALESCE para
    string vazia produz o mesmo efeito: vazio nao casa com nome de perfil."""
    filtro = _modulo()._FILTRO

    assert "lower(COALESCE(c.perfil_alvo, ''))" in filtro


def test_o_calculo_e_uma_vez_por_evento_nao_por_conquista() -> None:
    """O proprio comentario da funcao diz que agregado e 'uma vez por evento,
    nao uma vez por conquista'. Dai CTE no SELECT do laco, e nao subconsulta
    correlacionada avaliada por linha de conquista."""
    filtro = _modulo()._FILTRO

    assert "WITH representativos AS (" in filtro
    assert filtro.index("WITH representativos AS (") < filtro.index("FROM public.conquistas")


def test_a_ancora_do_laco_e_conferida_como_unica() -> None:
    """`replace` troca todas as ocorrencias; se o laco aparecesse duas vezes o
    filtro entraria em lugar errado."""
    sql = _sql()

    assert "v_ocorrencias <> 1" in sql
    assert "esperava 1 ocorrencia do laco de conquistas" in sql


def test_substitui_o_corpo_vivo() -> None:
    """A funcao ja foi alterada por 20260909_01 e por 20260910_08; recolar o
    texto de uma reverteria a outra em silencio."""
    sql = _sql()

    assert "pg_get_functiondef(" in sql
    assert "to_regprocedure('public.trg_eventos_aluno_after_iud()')" in sql
    assert "CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud" not in sql


def test_nao_revoga_conquista_ja_dada() -> None:
    """Revogar conquista que o aluno ja viu, e estornar os 250 pontos do rank,
    e decisao de produto -- nao efeito colateral de uma correcao de gatilho."""
    sql = _sql()

    assert "DELETE FROM public.conquistas_aluno" not in sql
    assert "DELETE FROM conquistas_aluno" not in sql


def test_nao_usa_sinal_de_porcentagem() -> None:
    """O renderer offline do Alembic dobra o caractere."""
    assert "%" not in MIGRACAO.read_text(encoding="utf-8")
    assert "%" not in _sql()
