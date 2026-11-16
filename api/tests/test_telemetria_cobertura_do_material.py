"""Cobertura do material na gravação pela API (`20261116_01`).

As seis medidas só valem no escopo `material`, e medida ruim vira nula: nunca zero (que diria
"percorreu nada") e nunca erro (que custaria o lote).
"""

from __future__ import annotations

from app.repositories.telemetria import COLUNAS_DE_COBERTURA, TelemetriaRepository
from app.schemas.telemetria import TelemetriaTimeMetricEntryPayload

R = TelemetriaRepository


def test_so_o_escopo_material_leva_as_medidas() -> None:
    entrada = {"midia_duracao_seg": 200, "midia_posicao_max_seg": 50.5, "slides_total": 4}
    assert R._cobertura_da_entrada("material", entrada) == {
        "conteudo_altura_px": None,
        "janela_altura_px": None,
        "midia_duracao_seg": 200.0,
        "midia_posicao_max_seg": 50.5,
        "slides_vistos": None,
        "slides_total": 4,
    }
    for escopo in ("topic", "content", "activity"):
        assert set(R._cobertura_da_entrada(escopo, entrada).values()) == {None}


def test_medida_ruim_vira_nula() -> None:
    for ruim in (None, -1, "abc", float("nan"), float("inf"), True, [], {}):
        assert R._medida_opcional(ruim) is None, ruim
    assert R._medida_opcional("12.5") == 12.5
    assert R._medida_opcional(3.6, inteiro=True) == 4


def test_payload_antigo_continua_valido_e_o_novo_passa_os_campos() -> None:
    antigo = TelemetriaTimeMetricEntryPayload.model_validate({"key": "m", "active_sec": 3})
    assert all(getattr(antigo, nome) is None for nome, _ in COLUNAS_DE_COBERTURA)

    novo = TelemetriaTimeMetricEntryPayload.model_validate(
        {"key": "m", "conteudo_altura_px": 3000, "janela_altura_px": 800, "slides_vistos": 2}
    ).model_dump()
    assert (novo["conteudo_altura_px"], novo["janela_altura_px"], novo["slides_vistos"]) == (3000, 800, 2)


def test_o_insert_grava_as_seis_colunas() -> None:
    import inspect

    fonte = inspect.getsource(TelemetriaRepository.insert_time_metric_entries)
    for nome, _ in COLUNAS_DE_COBERTURA:
        assert nome in fonte.split("VALUES")[0], nome
        assert f":{nome} AS" in fonte, nome
