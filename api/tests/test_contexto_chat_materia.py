from __future__ import annotations

from app.services.contexto_chat_materia import (
    markdown_personalizado,
    montar_conteudo_materia,
    texto_de_estudo_do_conteudo,
)


def test_conteudo_em_texto_vai_inteiro_ate_o_limite() -> None:
    assert texto_de_estudo_do_conteudo({"conteudo": "Fotossíntese é o processo..."}) == "Fotossíntese é o processo..."
    longo = "a " * 2000
    assert len(texto_de_estudo_do_conteudo({"conteudo": longo}, limite=100)) <= 100


def test_conteudo_que_e_so_link_usa_o_texto_extraido_do_arquivo() -> None:
    c = {
        "conteudo": "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/aula.pdf",
        "metadata": {"texto_extraido": "Capítulo 1: células"},
    }
    assert texto_de_estudo_do_conteudo(c) == "Capítulo 1: células"
    c2 = {"conteudo": "materiais/turma-3/aula.pdf", "metadata": {"files": [{"texto_extraido": "A"}, {"texto_extraido": "B"}]}}
    assert texto_de_estudo_do_conteudo(c2) == "A\n\nB"
    assert texto_de_estudo_do_conteudo({"conteudo": "https://x.y/z.mp4"}) == ""


def test_markdown_personalizado_pega_o_primeiro_registro_que_tem() -> None:
    registros = [
        {"materiais": {"audio": {"url": "x"}}},
        {"materiais": {"markdown": {"payload": {"markdown": "# Células\nTexto"}}}},
    ]
    assert markdown_personalizado(registros) == "# Células\nTexto"
    assert markdown_personalizado(None) == ""
    assert markdown_personalizado([{"materiais": "corrompido"}]) == ""


def test_recorte_leva_material_personalizado_e_nao_leva_gabarito() -> None:
    recorte = montar_conteudo_materia(
        conteudos=[{"titulo": "Aula", "tipo": "texto", "conteudo": "Mitose", "ordem": 1}],
        atividades=[{"titulo": "Quiz", "descricao": "d", "tipo": "quiz", "resposta": "B"}],
        questoes=[{"enunciado": "Qual?", "tipo": "multipla", "gabarito": "C"}],
        registros=[{"materiais": {"markdown": {"payload": {"markdown": "Mitose em 4 fases"}}}}],
    )
    assert recorte["conteudos"][0]["texto"] == "Mitose"
    assert recorte["material_personalizado"] == "Mitose em 4 fases"
    assert "resposta" not in recorte["atividades"][0]
    assert "gabarito" not in recorte["questoes_temas"][0]
