from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Evento(BaseModel):
    tipo: str
    referencia: str | None = None
    valor: float | None = None
    criado_em: datetime | None = None

    @field_validator("referencia", mode="before")
    @classmethod
    def coerce_referencia(cls, value: Any) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class DesempenhoSummary(BaseModel):
    media_acertos: float = 0.0
    percentual_concluido: float = 0.0
    tempo_medio_min: float = 0.0
    topico_concluido: bool = False
    atividade_recente_id: int | None = None
    topico_recente_id: int | None = None
    classe_snapshot: dict[str, Any] = Field(default_factory=dict)
