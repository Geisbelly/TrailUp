from __future__ import annotations

import json

from app.services.contexto_chat_materia import (
    gabarito_na_resposta,
    markdown_personalizado,
    montar_conteudo_materia,
    montar_gabarito_protegido,
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


# --- Guia apoia sem entregar a resposta (07/11) -------------------------------------------------

_QUESTAO = {
    "enunciado": "Quanto é metade de 1/2?",
    "tipo": "multipla",
    "alternativas": ["1/4", "1/3", "2/4", "1"],
    "resposta_correta": "1/4",
}
_CARD_PROFESSOR = {"titulo": "O que é o denominador?", "descricao": "É o número de partes iguais em que o inteiro foi dividido."}
_REGISTRO = {
    "materiais": {
        "cards": {"payload": [{"frente": "O que é fração própria?", "verso": "É a fração em que o numerador é menor que o denominador."}]},
        "quiz": {
            "payload": {
                "atividades": [
                    {
                        "titulo": "Quiz",
                        "questoes": [
                            {
                                "pergunta": "Qual fração representa três partes de quatro?",
                                "alternativas": ["3/4", "4/3"],
                                "resposta_correta": "3/4",
                                "explicacao": "Três partes de quatro: 3/4.",
                            }
                        ],
                    }
                ]
            }
        },
    }
}


def test_guia_recebe_enunciado_alternativas_e_frente_mas_nunca_a_resposta() -> None:
    recorte = montar_conteudo_materia(
        conteudos=[],
        atividades=[],
        questoes=[_QUESTAO],
        registros=[_REGISTRO],
        cards=[_CARD_PROFESSOR],
    )
    questoes = recorte["questoes_temas"]
    assert questoes[0] == {"enunciado": "Quanto é metade de 1/2?", "tipo": "multipla", "alternativas": ["1/4", "1/3", "2/4", "1"]}
    assert questoes[1]["enunciado"] == "Qual fração representa três partes de quatro?"
    assert recorte["cards_frente"] == ["O que é o denominador?", "O que é fração própria?"]

    texto = json.dumps(recorte, ensure_ascii=False)
    for proibido in ("resposta_correta", "explicacao", "número de partes iguais", "numerador é menor", "Três partes de quatro: 3/4"):
        assert proibido not in texto, proibido


def test_alternativa_marcada_como_correta_chega_ao_guia_sem_a_marca() -> None:
    recorte = montar_conteudo_materia(
        conteudos=[],
        atividades=[],
        questoes=[{"enunciado": "Q?", "alternativas": [{"texto": "A", "correta": True}, {"texto": "B", "correta": False}]}],
        registros=None,
    )
    assert recorte["questoes_temas"][0]["alternativas"] == ["A", "B"]


def test_gabarito_protegido_leva_resposta_das_questoes_e_verso_dos_cards() -> None:
    gabarito = montar_gabarito_protegido(questoes=[_QUESTAO], registros=[_REGISTRO], cards=[_CARD_PROFESSOR])
    assert {"origem": "questao", "pergunta": "Quanto é metade de 1/2?", "respostas": ["1/4"]} in gabarito
    assert {"origem": "quiz_personalizado", "pergunta": "Qual fração representa três partes de quatro?", "respostas": ["3/4"]} in gabarito
    versos = [item["respostas"][0] for item in gabarito if item["origem"] == "card"]
    assert versos == [_CARD_PROFESSOR["descricao"], "É a fração em que o numerador é menor que o denominador."]


def test_resposta_aceita_em_lista_json_vira_varias_respostas() -> None:
    gabarito = montar_gabarito_protegido(
        questoes=[{"enunciado": "Complete: um ___", "resposta_correta": '["meio", "metade"]'}], registros=None
    )
    assert gabarito[0]["respostas"] == ["meio", "metade"]


def test_copia_do_verso_do_card_e_pega_mesmo_sem_acento_e_com_outra_caixa() -> None:
    gabarito = montar_gabarito_protegido(questoes=[], registros=None, cards=[_CARD_PROFESSOR])
    fala = "Boa pergunta! E o numero de partes iguais em que o INTEIRO foi dividido, viu?"
    item = gabarito_na_resposta(fala, gabarito)
    assert item is not None and item["origem"] == "card"


def test_trecho_longo_copiado_de_um_verso_conta_como_vazamento() -> None:
    gabarito = [{"origem": "card", "pergunta": "?", "respostas": ["Fração própria é aquela em que o numerador é menor que o denominador, como 2/5."]}]
    fala = "Lembra: o numerador é menor que o denominador, como 2/5 mostra bem."
    assert gabarito_na_resposta(fala, gabarito) is not None


def test_resposta_curta_nao_dispara_sozinha_fica_com_o_juiz() -> None:
    # "1/4" aparece em qualquer explicação de frações: casar ao pé da letra daria alarme falso.
    gabarito = montar_gabarito_protegido(questoes=[_QUESTAO], registros=None)
    fala = "Pense numa pizza: se você divide em 4 e pega uma parte, tem 1/4 dela. Agora tente a questão."
    assert gabarito_na_resposta(fala, gabarito) is None


def test_explicacao_que_nao_copia_o_gabarito_passa() -> None:
    gabarito = montar_gabarito_protegido(questoes=[], registros=None, cards=[_CARD_PROFESSOR])
    fala = "Olhe a parte de baixo da fração: o que ela conta? Releia o trecho sobre como dividimos o inteiro."
    assert gabarito_na_resposta(fala, gabarito) is None
    assert gabarito_na_resposta(fala, None) is None
