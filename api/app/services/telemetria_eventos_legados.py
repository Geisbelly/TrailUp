"""Eventos legados (`eventos_aluno`) derivados dos sinais de um lote de telemetria.

Saiu de `app/api/v1/telemetria.py` sem mudar o comportamento: o worker da fila de análise
(`app/services/analise_fila.py`) passa a mesma lista ao pipeline (`eventos_novos`) que o endpoint passa.
Quem grava esses eventos em `eventos_aluno` continua sendo só o endpoint (P5 da F3).
"""

from app.schemas.common import Evento
from app.schemas.telemetria import TelemetriaLotePayload, TelemetriaSignalPayload

SIGNAL_TO_LEGACY_EVENT = {
    "topic_open": "topico_aberto",
    "content_open": "conteudo_aberto",
    "content_complete": "conteudo_concluido",
    "activity_start": "atividade_iniciada",
    "activity_correct": "atividade_acertada",
    "activity_wrong": "atividade_errada",
    "wrong_streak": "erro_recorrente",
    "activity_complete": "atividade_concluida",
}


def _sanitize_reference(reference: str | None) -> str | None:
    if reference is None:
        return None
    normalized = reference.strip()
    if not normalized:
        return None

    numeric_match = normalized.rsplit(":", 1)
    if len(numeric_match) == 2 and numeric_match[1].isdigit():
        return numeric_match[1]
    if normalized.isdigit():
        return normalized
    return None


def _prefixed_reference(prefix: str, value: str | int | None) -> str | None:
    normalized = _sanitize_reference(str(value) if value is not None else None)
    if not normalized:
        return None
    return f"{prefix}:{normalized}"


def _reference_from_signal(signal: TelemetriaSignalPayload) -> str | None:
    if signal.atividade_id is not None:
        return _prefixed_reference("atividade", signal.atividade_id)
    if signal.conteudo_id is not None:
        return _prefixed_reference("conteudo", signal.conteudo_id)
    if signal.topico_id is not None:
        return _prefixed_reference("topico", signal.topico_id)
    if signal.item_key:
        normalized = signal.item_key.strip()
        if ":" in normalized:
            return normalized
        return _sanitize_reference(normalized)
    return None


def _is_activity_signal(signal: TelemetriaSignalPayload) -> bool:
    return bool(signal.item_key and signal.item_key.startswith("activity:")) or signal.atividade_id is not None


def normalizar_eventos_legados(payload: TelemetriaLotePayload) -> list[Evento]:
    eventos: list[Evento] = []
    ordered_signals = sorted(payload.signals, key=lambda signal: signal.timestamp)

    for signal in ordered_signals:
        mapped = SIGNAL_TO_LEGACY_EVENT.get(signal.type)
        if mapped is None:
            continue
        eventos.append(
            Evento(
                tipo=mapped,
                referencia=_reference_from_signal(signal),
            )
        )

    if any(signal.type == "idle_detected" for signal in ordered_signals) or payload.idle_sec >= 60:
        eventos.append(
            Evento(
                tipo="inatividade",
                referencia=(
                    str(payload.topico_id)
                    if payload.topico_id is not None
                    else _sanitize_reference(payload.item_key)
                ),
                valor=float(payload.idle_sec),
            )
        )

    for index, signal in enumerate(ordered_signals):
        if signal.type != "timer_timeout" or not _is_activity_signal(signal):
            continue
        completed_after_timeout = any(
            candidate.type == "activity_complete"
            and (
                (candidate.item_key and signal.item_key and candidate.item_key == signal.item_key)
                or (
                    candidate.atividade_id is not None
                    and signal.atividade_id is not None
                    and candidate.atividade_id == signal.atividade_id
                )
            )
            for candidate in ordered_signals[index + 1 :]
        )
        if not completed_after_timeout:
            eventos.append(
                Evento(
                    tipo="abandono_atividade",
                    referencia=_reference_from_signal(signal),
                )
            )
            break

    return eventos
