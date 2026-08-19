from app.services.memoria_aluno import _detectar_recorrencia


def test_detectar_recorrencia_marca_3_de_5_mesmo_kind_negativo() -> None:
    registros = [
        {"kind": "frustrated"},
        {"kind": "focused"},
        {"kind": "frustrated"},
        {"kind": "frustrated"},
        {"kind": "neutral"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is True
    assert resultado.kind == "frustrated"
    assert resultado.ocorrencias == 3


def test_detectar_recorrencia_nao_marca_kinds_mistos_sem_maioria() -> None:
    registros = [
        {"kind": "frustrated"},
        {"kind": "anxious"},
        {"kind": "tired"},
        {"kind": "neutral"},
        {"kind": "focused"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False
    assert resultado.kind is None
    assert resultado.ocorrencias == 0


def test_detectar_recorrencia_ignora_kinds_positivos() -> None:
    registros = [{"kind": "motivated"}] * 5

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False


def test_detectar_recorrencia_ignora_registros_alem_da_janela_de_5() -> None:
    # 3 ocorrencias de 'frustrated', mas fora da janela dos 5 mais recentes.
    registros = [
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "frustrated"},
        {"kind": "frustrated"},
        {"kind": "frustrated"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False


def test_detectar_recorrencia_com_lista_vazia() -> None:
    assert _detectar_recorrencia([]).recorrente is False
