from app.services.material_revisao import incrementar_revisao, revisao_atual


def test_material_sem_campo_conta_como_revisao_1():
    # Todo material gerado antes desta mudanca nao tem `revisao`. Tratar
    # ausencia como 0 faria a primeira regeracao gravar 1, que e' igual ao
    # que o mobile ja teria em cache -- e o aluno continuaria preso.
    assert revisao_atual({"payload": {"markdown": "x"}}) == 1


def test_incremento_preserva_o_resto_do_material():
    material = {
        "payload": {"markdown": "antigo"},
        "metadata": {"status": "pronto"},
        "arquivo_url": "https://exemplo/a.md",
    }

    novo = incrementar_revisao(material)

    assert novo["revisao"] == 2
    assert novo["payload"] == {"markdown": "antigo"}
    assert novo["metadata"] == {"status": "pronto"}
    assert novo["arquivo_url"] == "https://exemplo/a.md"


def test_incremento_nao_muta_o_original():
    # A regeracao usa copy.deepcopy dos materiais antes de mexer; esta funcao
    # nao pode depender disso para estar correta.
    material = {"revisao": 3}
    novo = incrementar_revisao(material)
    assert material["revisao"] == 3
    assert novo["revisao"] == 4


def test_valor_invalido_nao_derruba_a_regeracao():
    # `revisao` e' escrito por nos, mas materiais sao JSONB e ja acumularam
    # formatos de varias versoes do pipeline. Um valor sujo nao pode
    # impedir o professor de regerar.
    for sujo in ("abc", None, [], {}, -5):
        assert incrementar_revisao({"revisao": sujo})["revisao"] == 2


def test_material_ausente_vira_material_novo():
    assert incrementar_revisao(None) == {"revisao": 2}


def test_endpoint_de_documento_incrementa_a_revisao_do_markdown() -> None:
    import inspect

    from app.api.v1 import personalizacao

    fonte = inspect.getsource(personalizacao.regenerar_documento_personalizacao)
    assert "incrementar_revisao(markdown_material)" in fonte
    # A revisao e' do markdown; o audio tem a dele (Task 3).
    assert 'materiais_atualizados["markdown"] = incrementar_revisao' in fonte
