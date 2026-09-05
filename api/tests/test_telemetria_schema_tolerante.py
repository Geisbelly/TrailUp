"""Uma entrada de metrica ruim nao pode custar o lote inteiro.

Achado A9 da revisao de telemetria de ponta a ponta. `key` era obrigatoria e sem
default: uma entrada sem ela levantava 422 e levava embora o lote TODO -- eventos,
sinais e as outras metricas, todos corretos.

E o efeito pratico era o oposto do pretendido: o cliente trata 422 como erro
nao-rede e cai no fallback direto, que nao valida nada e grava. A validacao
rigorosa nao protegia o banco, so desviava o lote para o caminho menos
supervisionado.
"""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.telemetria import (
    TelemetriaLotePayload,
    TelemetriaTimeMetricsPayload,
)


def _lote(**over):
    agora = datetime.now(UTC)
    base = {
        "sessao_id": "11111111-1111-4111-8111-111111111111",
        "classe_id": 1,
        "screen_name": "trilha_topico",
        "route_name": "/(tabs)/trilha/[id]",
        "flush_reason": "interval",
        "captured_at": agora,
        "session_started_at": agora,
        "study_elapsed_sec": 60,
        "screen_dwell_sec": 60,
        "active_sec": 55,
        "idle_sec": 5,
        "touch_count": 3,
        "scroll_distance_px": 100,
        "max_depth_px": 200,
    }
    base.update(over)
    return base


def test_entrada_sem_key_e_aceita():
    # Ninguem depende de `key` estar preenchida: o repositorio le
    # `item_key or key`, e `entry_key` e derivada pelo trigger no banco.
    metrics = TelemetriaTimeMetricsPayload.model_validate(
        {"topics": [{"topico_id": 7, "dwell_sec": 12}]}
    )

    assert len(metrics.topics) == 1
    assert metrics.topics[0].key == ""
    assert metrics.topics[0].topico_id == 7
    assert metrics.topics[0].dwell_sec == 12


def test_entrada_invalida_e_descartada_e_o_resto_sobrevive():
    metrics = TelemetriaTimeMetricsPayload.model_validate(
        {
            "topics": [
                {"key": "topic:1", "dwell_sec": 10},
                {"key": "topic:2", "dwell_sec": "nao-e-numero"},
                {"key": "topic:3", "dwell_sec": 30},
            ]
        }
    )

    chaves = [entrada.key for entrada in metrics.topics]
    assert chaves == ["topic:1", "topic:3"], "so a ruim sai"


def test_o_descarte_vale_para_os_quatro_escopos():
    ruim = {"dwell_sec": {"nao": "e numero"}}
    metrics = TelemetriaTimeMetricsPayload.model_validate(
        {
            "topics": [ruim, {"key": "topic:1"}],
            "contents": [ruim, {"key": "content:1"}],
            "activities": [ruim, {"key": "activity:1"}],
            "materials": [ruim, {"key": "material:1"}],
        }
    )

    assert len(metrics.topics) == 1
    assert len(metrics.contents) == 1
    assert len(metrics.activities) == 1
    assert len(metrics.materials) == 1


def test_o_lote_inteiro_sobrevive_a_uma_metrica_ruim():
    """O teste que fecha A9: eventos e sinais nao podem ir embora com ela."""
    payload = TelemetriaLotePayload.model_validate(
        _lote(
            time_metrics={
                "general": {},
                "topics": [{"key": "topic:1", "dwell_sec": "quebrado"}],
            },
            signals=[{"type": "topic_open", "timestamp": 1}],
            eventos_app=[
                {
                    "client_event_id": "evt-1",
                    "event_group": "navigation",
                    "event_name": "topic_open",
                    "occurred_at": datetime.now(UTC),
                }
            ],
        )
    )

    assert payload.time_metrics.topics == [], "a metrica ruim saiu"
    assert len(payload.signals) == 1, "o sinal correto tinha de ficar"
    assert len(payload.eventos_app) == 1, "o evento correto tinha de ficar"
    assert payload.study_elapsed_sec == 60


def test_o_que_e_estrutural_continua_recusado():
    # Tolerar entrada de metrica nao e aceitar qualquer coisa: sem `classe_id`
    # nao ha onde ancorar o lote, e isso segue sendo 422.
    with pytest.raises(ValidationError):
        TelemetriaLotePayload.model_validate(
            {k: v for k, v in _lote().items() if k != "classe_id"}
        )

    # `flush_reason` fora do Literal tambem: ele decide se a sessao fecha.
    with pytest.raises(ValidationError):
        TelemetriaLotePayload.model_validate(_lote(flush_reason="motivo_inventado"))


def test_lista_ausente_ou_nula_nao_quebra():
    metrics = TelemetriaTimeMetricsPayload.model_validate({"general": {}})
    assert metrics.topics == []

    # Valor que nao e lista segue o caminho normal de validacao do Pydantic.
    with pytest.raises(ValidationError):
        TelemetriaTimeMetricsPayload.model_validate({"topics": "nao-e-lista"})
