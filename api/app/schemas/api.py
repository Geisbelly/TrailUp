from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import Evento
from app.schemas.conteudo_adaptado import ConteudoAdaptado
from app.schemas.emocao_result import EmocaoResult
from app.schemas.notificacao import NotificacaoPayload
from app.schemas.texto_gerado import TextoGerado
from app.schemas.trilha_config import TrilhaConfig
from app.schemas.ui_config import UIConfig


class EmocaoIndisponivel(BaseModel):
    estado_sinal: Literal["indisponivel"]



class AnalisarPayload(BaseModel):
    classe_id: int
    modo: str | None = None
    frame_b64: str | None = None
    eventos_novos: list[Evento] = Field(default_factory=list)
    topico_id: int | None = None
    atividade_id: int | None = None


class AnalisarResponse(BaseModel):
    ciclo_id: str
    ui_config: UIConfig | None = None
    conteudo_adaptado: ConteudoAdaptado | None = None
    materiais_gerados: dict[str, Any] | None = None
    textos_gerados: list[TextoGerado] = Field(default_factory=list)
    notificacao_payload: NotificacaoPayload | None = None
    trilha_config: TrilhaConfig | None = None
    emocao_atual: EmocaoResult | EmocaoIndisponivel | None = None
    acoes_aplicadas: list[str] = Field(default_factory=list)
    erros: list[str] = Field(default_factory=list)


class MaterialGeradoResponse(BaseModel):
    id: int
    aluno_id: str
    conteudo_id: int | None = None
    tipo: str
    payload: Any = None
    arquivo_url: str | None = None
    criado_em: datetime


class MateriaisAlunoResponse(BaseModel):
    aluno_id: str
    total: int
    materiais: list[MaterialGeradoResponse] = Field(default_factory=list)


class AdminPersonalizacaoMediaBackfillRequest(BaseModel):
    classe_id: int | None = None
    aluno_id: str | None = None
    personalizacao_id: int | None = None
    limit: int = Field(default=200, ge=1, le=1000)
    dry_run: bool = True


class AdminPersonalizacaoMediaBackfillResponse(BaseModel):
    scanned: int = 0
    eligible: int = 0
    enqueued: int = 0
    already_open_job: int = 0
    linked_materials: int = 0
    errors: int = 0
    dry_run: bool = True


class HealthResponse(BaseModel):
    status: str
    environment: str
    database: str
    checkpointer: str
    details: dict[str, Any] = Field(default_factory=dict)
    checked_at: datetime
