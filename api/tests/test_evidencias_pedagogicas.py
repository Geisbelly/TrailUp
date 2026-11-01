"""Catálogo de regras do motor de sugestão (#66)."""

import re

import pytest

from app.services import evidencias_pedagogicas as cat


def test_toda_regra_tem_enunciado_fonte_e_confianca_valida():
    for regra in cat.catalogo():
        assert regra["enunciado"].strip(), regra["regra"]
        assert regra["confianca"] in cat.CONFIANCAS, regra["regra"]
        for fonte in regra["fontes"]:
            assert re.fullmatch(r"DAT-\d{2}", fonte), fonte
        # Só o dado do próprio aluno pode vir sem fonte bibliográfica.
        if regra["confianca"] != "dado_do_aluno":
            assert regra["fontes"], regra["regra"]


def test_fontes_existem_na_avaliacao_do_corpus():
    from pathlib import Path

    avaliacao = (
        Path(__file__).resolve().parents[2] / "docs" / "rag" / "avaliacao-documentos.md"
    ).read_text(encoding="utf-8")
    for regra in cat.catalogo():
        for fonte in regra["fontes"]:
            assert fonte in avaliacao, f"{regra['regra']} cita {fonte}, ausente da avaliação"


def test_perfil_e_hipotese_e_reexposicao_e_forte():
    assert cat.regra("perfil_formato")["confianca"] == "hipotese"
    assert cat.regra("reexposicao_quiz")["confianca"] == "forte"
    assert "DAT-21" in cat.regra("reexposicao_quiz")["fontes"]


def test_nenhuma_regra_liga_emocao_a_formato():
    # DAT-45: telemetria mede engajamento, não emoção.
    for regra in cat.catalogo():
        assert "emo" not in regra["construto"].lower(), regra["regra"]


def test_regra_desconhecida_levanta():
    with pytest.raises(KeyError):
        cat.evidencia("nao_existe")


def test_evidencia_descarta_dado_nulo_e_copia_fontes():
    ev = cat.evidencia("desempenho_do_aluno", acertos=80.0, percentual=None)
    assert ev["dados"] == {"acertos": 80.0}
    ev["fontes"].append("DAT-99")
    assert "DAT-99" not in cat.regra("desempenho_do_aluno")["fontes"]


def test_versao_do_catalogo_e_data():
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", cat.CATALOGO_VERSAO)
