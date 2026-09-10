"""A referencia do evento nao pode ser jogada fora.

`_sanitize_reference` normaliza a referencia para `prefixo:<id>`, que e o formato
que `vw_rank_posicoes_por_classe_todas` sabe resolver. Quando nao havia id
numerico, ela devolvia `None` -- e a linha ia para `eventos_aluno` sem nenhuma
pista do que marcava.

Medido em producao: 13 de 15 `conteudo_concluido` e 9 de 9 `conteudo_aberto`
gravados sem referencia. A view falha em resolver a classe com ou sem a string,
entao descartar nao ganhava nada e perdia a identidade do evento.
"""

from __future__ import annotations

from app.repositories.evento import EventoRepository

sanear = EventoRepository._sanitize_reference


def test_o_id_numerico_vira_o_formato_que_a_view_resolve() -> None:
    assert sanear("conteudo_concluido", "content:12") == "conteudo:12"
    assert sanear("conteudo_concluido", 12) == "conteudo:12"
    assert sanear("topico_aberto", "topico:114") == "topico:114"
    assert sanear("atividade_revisada", "atividade:1056") == "atividade:1056"


def test_sem_id_numerico_a_referencia_sobrevive() -> None:
    """Era aqui que o evento perdia a identidade."""
    assert sanear("conteudo_aberto", "content:personalizado-3") == "content:personalizado-3"
    assert sanear("conteudo_concluido", "item:abc") == "item:abc"


def test_vazio_continua_sendo_nada() -> None:
    # Nao ha identidade a preservar quando nada foi enviado.
    assert sanear("conteudo_aberto", None) is None
    assert sanear("conteudo_aberto", "   ") is None


def test_tipo_sem_prefixo_conhecido_mantem_o_que_veio() -> None:
    assert sanear("ciclo_iniciado", "028ffbe8-1558-4dc5-b89b-908758a9e160") == (
        "028ffbe8-1558-4dc5-b89b-908758a9e160"
    )
    assert sanear("inatividade", "42") == "42"


def test_a_referencia_declarada_vence_o_tipo_do_evento() -> None:
    """Este teste dizia o contrario, e o contrario estava errado.

    A regra antiga era "o prefixo sai do TIPO", justificada por a view do rank
    casar pelo prefixo do tipo. So que trocar `content:12` por `atividade:12`
    nao resolvia a view: inventava uma atividade 12 que pode nao existir, e
    entao a view nao resolvia classe nenhuma e os pontos morriam ali.

    Medido em producao: 66 ids de referencia orfaos, e 4 deles eram conteudo do
    proprio aluno com o prefixo trocado por este caminho. A view passou a
    resolver pela FORMA da referencia (20260910_06), e o id e' a parte
    confiavel -- o prefixo do tipo e' palpite, e vale so quando a referencia
    nao diz nada de si.
    """
    assert sanear("atividade_concluida", "content:12") == "conteudo:12"
    assert sanear("conteudo_concluido", "activity:1056") == "atividade:1056"
    assert sanear("atividade_revisada", "topic:114") == "topico:114"


def test_sem_prefixo_declarado_o_tipo_ainda_decide() -> None:
    """Referencia crua (`122`) nao diz o que e': o tipo continua sendo a unica
    pista, e e' legitimo usa-lo."""
    assert sanear("topico_iniciado", "122") == "topico:122"
    assert sanear("conteudo_concluido", 174) == "conteudo:174"
    assert sanear("atividade_concluida", "1056") == "atividade:1056"


def test_prefixo_desconhecido_nao_e_tratado_como_declaracao() -> None:
    """`item:` nao aponta para tabela alguma, entao o tipo volta a decidir --
    senao um vocabulario novo do cliente viraria referencia insalvavel."""
    assert sanear("conteudo_concluido", "item:12") == "conteudo:12"
