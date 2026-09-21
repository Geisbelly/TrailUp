"""Missao e uma atividade com `tipo = 'missao'` (#150).

O criterio de aceite que justifica NAO criar tabela propria: missao concluida
move o progresso do topico. Uma tabela `missoes` seria invisivel para
`trailup_recalcular_topico_aluno`, que conta `conteudo_aluno`, `atividade_aluno`
e `personalizacao_item_progresso` -- o aluno cumpriria tudo e veria a barra
parada, que e o defeito que a `20260826_18` existe para corrigir.

Medido nesta base, com o bloco desfeito por excecao: criar a missao semeia a
linha em `atividade_aluno` e conclui-la leva o topico 133 de 0% para 8,33%.

O CHECK de tipo so e seguro por causa da normalizacao em
`app/services/tipos_de_atividade.py`: a geracao tirava `tipo` direto do payload
do modelo, entao um CHECK sozinho derrubaria o pipeline.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations
from app.services.tipos_de_atividade import (
    TIPO_DE_MISSAO,
    TIPOS_DE_ATIVIDADE,
    eh_missao,
    normalizar_tipo_de_atividade,
)

API_ROOT = Path(__file__).resolve().parents[1]


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
        _offline_alembic_config(output), "20260911_06:20260911_07", sql=True
    )
    return output.getvalue()


def _sql_downgrade() -> str:
    output = StringIO()
    migrations.command.downgrade(
        _offline_alembic_config(output), "20260911_07:20260911_06", sql=True
    )
    return output.getvalue()


def test_nao_existe_tabela_de_missao() -> None:
    """E a decisao central da issue: missao e atividade."""
    sql = _sql()

    assert "CREATE TABLE" not in sql.upper()
    assert "missoes" not in sql


def test_a_sonda_prova_que_a_missao_move_o_topico() -> None:
    """Sem isso, a decisao de nao criar tabela nao se sustenta."""
    sql = _sql()

    assert "concluir a missao nao moveu o percentual do topico" in sql
    assert "e o motivo de missao nao ter tabela propria" in sql


def test_a_sonda_confere_que_o_aluno_recebe_a_linha() -> None:
    """Sem linha em `atividade_aluno` o aluno nem veria a missao."""
    sql = _sql()

    assert "a missao nao gerou linha em atividade_aluno" in sql


def test_a_sonda_nao_deixa_rastro() -> None:
    sql = _sql()

    assert "RAISE EXCEPTION USING ERRCODE = 'ZZ001'" in sql
    assert "EXCEPTION WHEN SQLSTATE 'ZZ001' THEN" in sql


def test_o_tipo_vira_lista_fechada() -> None:
    sql = _sql()

    assert "atividades_tipo_conhecido" in sql
    assert "'quiz', 'true_false', 'fill_blank', 'essay', 'missao'" in sql


def test_o_check_aceita_nulo() -> None:
    """`tipo` e anulavel hoje; fechar sem essa folga quebraria linha existente
    e qualquer INSERT que ainda omita a coluna."""
    sql = _sql()

    assert "CHECK (tipo IS NULL OR tipo IN (" in sql


def test_a_migracao_aborta_dizendo_qual_tipo_esta_fora() -> None:
    """O erro cru da constraint diz apenas que alguma linha falhou. A lista do
    que esta fora e o que permite corrigir."""
    sql = _sql()

    assert "ha atividade com tipo fora da lista: " in sql
    assert "normalize antes de fechar o CHECK" in sql


def test_o_downgrade_nao_apaga_missao() -> None:
    """Missoes sao atividades de verdade, com questoes e progresso de aluno
    pendurados. Apagar levaria o trabalho junto."""
    sql = _sql_downgrade()

    assert "UPDATE public.atividades SET tipo = 'quiz' WHERE tipo = 'missao'" in sql
    assert "DELETE FROM public.atividades" not in sql


def test_o_sql_renderizado_esta_limpo() -> None:
    import re

    for sql in (_sql(), _sql_downgrade()):
        assert "%" not in sql
        assert not re.findall(r"(?<!:):[A-Za-z_]\w*", sql)


# ---------------------------------------------------------------------------
# A normalizacao, que e o que torna o CHECK seguro
# ---------------------------------------------------------------------------


def test_o_vocabulario_do_modelo_cai_na_lista() -> None:
    """A geracao tirava `tipo` do payload do modelo sem tratar. Com um CHECK e
    sem isto, a geracao inteira falharia."""
    assert normalizar_tipo_de_atividade("multipla_escolha") == "quiz"
    assert normalizar_tipo_de_atividade("dissertativa") == "essay"
    assert normalizar_tipo_de_atividade("verdadeiro_falso") == "true_false"
    assert normalizar_tipo_de_atividade("fill_in_the_blank") == "fill_blank"


def test_o_desconhecido_cai_no_padrao_em_vez_de_ser_gravado() -> None:
    """Perder a nuance do nome custa menos que uma atividade ineditavel: o
    console sabe editar `quiz` e nao sabe editar `multipla_escolha`."""
    assert normalizar_tipo_de_atividade("coisa que o modelo inventou") == "quiz"
    assert normalizar_tipo_de_atividade("") == "quiz"
    assert normalizar_tipo_de_atividade(None) == "quiz"


def test_a_normalizacao_nunca_devolve_algo_fora_do_check() -> None:
    """E a propriedade que o CHECK depende."""
    entradas = [
        "quiz", "MISSAO", " essay ", "multipla", "vf", "lacuna", "texto",
        "", None, "xyz", "true_false", 123,
    ]
    for entrada in entradas:
        assert normalizar_tipo_de_atividade(entrada) in TIPOS_DE_ATIVIDADE, entrada


def test_missao_e_reconhecida_sem_se_importar_com_caixa() -> None:
    assert eh_missao("missao") is True
    assert eh_missao("  MISSAO ") is True
    assert eh_missao("mission") is True
    assert eh_missao("quiz") is False


def test_a_lista_python_e_a_do_check() -> None:
    """Os dois lugares precisam concordar; sao arquivos diferentes."""
    sql = _sql()
    for tipo in TIPOS_DE_ATIVIDADE:
        assert f"'{tipo}'" in sql, tipo
    assert TIPO_DE_MISSAO in TIPOS_DE_ATIVIDADE
