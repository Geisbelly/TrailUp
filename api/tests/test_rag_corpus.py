from pathlib import Path

import pytest

from app.services import rag_corpus as c
from app.services.openai_rag import _validate_attributes

_DOCS = Path(__file__).resolve().parents[2] / "docs" / "rag"


@pytest.fixture(scope="module")
def regras():
    return c.parse_regras_derivadas((_DOCS / "regras-derivadas.md").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def perguntas():
    return c.parse_golden_set((_DOCS / "golden-set-documentos-v1.md").read_text(encoding="utf-8"))


def test_as_doze_regras_saem_do_arquivo_com_fonte_e_limite(regras):
    assert [r.id for r in regras] == [f"RD-{n:02d}" for n in range(1, 13)]
    for r in regras:
        assert r.fontes and r.regra and r.limite and r.populacao
        assert r.tipo == "derivado"


def test_documento_indexado_leva_o_limite_junto_da_regra(regras):
    for r in regras:
        texto = c.documento(r)
        assert r.regra in texto and r.limite in texto and r.populacao in texto


def test_atributos_cabem_no_vector_store_e_nao_mapeiam_perfil(regras):
    for r in regras:
        attrs = c.atributos(r)
        _validate_attributes(attrs)
        assert attrs["scope"] == "publico"
        assert attrs["rd"] == r.id
        assert "perfil_brainhex" not in attrs


def test_hash_e_deterministico_e_muda_com_o_texto(regras):
    r = regras[0]
    assert c.hash_do_conteudo(r) == c.hash_do_conteudo(r)
    from dataclasses import replace

    assert c.hash_do_conteudo(replace(r, limite=r.limite + " Nova ressalva.")) != c.hash_do_conteudo(r)


def test_golden_set_tem_30_perguntas_e_tres_nao_respondiveis(perguntas):
    assert len(perguntas) == 30
    assert sorted(p.id for p in perguntas if not p.respondivel) == ["GS-18", "GS-19", "GS-28"]


def test_toda_pergunta_tem_ao_menos_uma_regra_relevante(regras, perguntas):
    # Sem isso a pergunta não mede nada: o recall dela não está definido.
    for p in perguntas:
        assert c.regras_relevantes(p, regras), p.id


def test_parser_recusa_regra_sem_limite():
    md = (
        "## Regras\n\n### RD-01 — X\n\n- `construto`: a\n- `populacao`: b\n- `tipo_estudo`: c\n"
        "- `confianca`: d\n- `tipo`: derivado\n- `fonte`: DAT-01, Fulano\n- **Regra:** faça\n"
    )
    with pytest.raises(c.CorpusInvalido, match="limite"):
        c.parse_regras_derivadas(md)


def test_metricas():
    rel = {"RD-03", "RD-04"}
    assert c.recall_em_k(["RD-03", "RD-01", "RD-04"], rel, 2) == 0.5
    assert c.recall_em_k(["RD-03", "RD-01", "RD-04"], rel, 3) == 1.0
    assert c.acerto_em_k(["RD-01", "RD-03"], rel, 1) is False
    assert c.posto_reciproco(["RD-01", "RD-04"], rel) == 0.5
    assert c.posto_reciproco(["RD-01"], rel) == 0.0
    assert c.sem_repeticao(["RD-03", "RD-03", "RD-01"]) == ["RD-03", "RD-01"]
    with pytest.raises(ValueError):
        c.recall_em_k(["RD-01"], set(), 1)


def test_plano_envia_o_novo_mantem_o_igual_e_remove_o_resto(regras):
    a, b = regras[0], regras[1]
    ha, hb = c.hash_do_conteudo(a), c.hash_do_conteudo(b)
    catalogo = [
        {"id": "1", "source_hash": ha, "status": "completed"},
        {"id": "2", "source_hash": ha, "status": "completed"},  # cópia repetida
        {"id": "3", "source_hash": "versao-antiga", "status": "completed"},
        {"id": "4", "source_hash": hb, "status": "failed"},
    ]
    plano = c.planejar_indexacao([a, b], catalogo)
    assert [r.id for r in plano.enviar] == [b.id]
    assert plano.manter == (a.id,)
    assert plano.remover == ("2", "3", "4")


def test_plano_com_catalogo_vazio_envia_tudo(regras):
    plano = c.planejar_indexacao(regras, [])
    assert len(plano.enviar) == 12 and not plano.manter and not plano.remover
