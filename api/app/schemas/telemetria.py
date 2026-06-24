from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


TelemetryFlushReason = Literal[
    "interval",
    "screen_blur",
    "app_background",
    "activity_complete",
    "topic_complete",
    "session_end",
]

TelemetryTouchTarget = Literal["content", "activity", "modal", "screen"]
TelemetryEventGroup = Literal["session", "navigation", "interaction", "performance", "chat"]
TelemetryChatRole = Literal["user", "assistant"]
TelemetryTriggerContext = Literal[
    "before_error",
    "after_error",
    "after_timeout",
    "after_completion",
    "on_demand",
    "unknown",
]


class TelemetriaSignalPayload(BaseModel):
    type: str
    timestamp: int
    topico_id: int | None = None
    atividade_id: int | None = None
    conteudo_id: int | None = None
    item_key: str | None = None
    meta: dict[str, Any] | None = None


class TelemetriaTouchSamplePayload(BaseModel):
    t_offset_ms: int
    x_pct: float
    y_pct: float
    target: TelemetryTouchTarget


class TelemetriaTimeMetricEntryPayload(BaseModel):
    key: str
    topico_id: int | None = None
    atividade_id: int | None = None
    conteudo_id: int | None = None
    item_key: str | None = None
    material_key: str | None = None
    material_tipo: str | None = None
    visits: int = 0
    dwell_sec: float = 0
    active_sec: float = 0
    idle_sec: float = 0
    touch_count: int = 0
    scroll_distance_px: float = 0
    max_depth_px: float = 0


class TelemetriaTimeMetricsPayload(BaseModel):
    general: dict[str, float | int] = Field(default_factory=dict)
    topics: list[TelemetriaTimeMetricEntryPayload] = Field(default_factory=list)
    contents: list[TelemetriaTimeMetricEntryPayload] = Field(default_factory=list)
    activities: list[TelemetriaTimeMetricEntryPayload] = Field(default_factory=list)
    materials: list[TelemetriaTimeMetricEntryPayload] = Field(default_factory=list)


class TelemetriaCameraFramePayload(BaseModel):
    captured_at: datetime
    frame_mime: str
    frame_b64: str


class TelemetriaCameraPayload(BaseModel):
    enabled: bool = False
    frame_mime: str | None = None
    frame_b64: str | None = None
    frames: list[TelemetriaCameraFramePayload] = Field(default_factory=list)


class TelemetriaAppEventPayload(BaseModel):
    client_event_id: str
    topico_id: int | None = None
    conteudo_id: int | None = None
    atividade_id: int | None = None
    questao_id: int | None = None
    item_key: str | None = None
    screen_name: str | None = None
    route_name: str | None = None
    event_group: TelemetryEventGroup
    event_name: str
    event_source: str = "mobile_app"
    occurred_at: datetime
    time_since_prev_sec: float | None = None
    attempt_number: int | None = None
    is_correct: bool | None = None
    chat_role: TelemetryChatRole | None = None
    trigger_context: TelemetryTriggerContext | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TelemetriaLotePayload(BaseModel):
    sessao_id: str
    classe_id: int
    topico_id: int | None = None
    atividade_id: int | None = None
    conteudo_id: int | None = None
    item_key: str | None = None
    screen_name: str
    route_name: str
    flush_reason: TelemetryFlushReason
    captured_at: datetime
    session_started_at: datetime
    study_elapsed_sec: float
    screen_dwell_sec: float
    active_sec: float
    idle_sec: float
    touch_count: int
    scroll_distance_px: float
    max_depth_px: float
    time_metrics: TelemetriaTimeMetricsPayload = Field(default_factory=TelemetriaTimeMetricsPayload)
    signals: list[TelemetriaSignalPayload] = Field(default_factory=list)
    eventos_app: list[TelemetriaAppEventPayload] = Field(default_factory=list)
    touch_samples: list[TelemetriaTouchSamplePayload] = Field(default_factory=list)
    camera: TelemetriaCameraPayload = Field(default_factory=TelemetriaCameraPayload)


class TelemetriaAnalysisResponse(BaseModel):
    ciclo_id: str | None = None
    emocao_atual: dict[str, Any] | None = None
    ui_config: dict[str, Any] | None = None
    acoes_aplicadas: list[str] = Field(default_factory=list)
    erros: list[str] = Field(default_factory=list)


class TelemetriaLoteResponse(BaseModel):
    batch_id: str
    sessao_id: str
    persisted: bool
    normalized_events: list[str] = Field(default_factory=list)
    analysis: TelemetriaAnalysisResponse

