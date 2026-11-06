"""Evento de material personalizado não derruba o lote de telemetria."""

from app.repositories.telemetria import _id_do_professor


def test_id_negativo_de_material_personalizado_vira_null():
    assert _id_do_professor(-206) is None


def test_ausente_ou_zero_vira_null():
    assert _id_do_professor(None) is None
    assert _id_do_professor(0) is None


def test_id_de_verdade_passa():
    assert _id_do_professor(282) == 282
