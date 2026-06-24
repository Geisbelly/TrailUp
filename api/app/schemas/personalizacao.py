from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field

from app.schemas.ia_patch import IAPersonalizationPatch


# ── TrailUp Design Tokens ─────────────────────────────────────────────────────
# Paleta extraída do app mobile (src/constants/GlobalStyle.ts e screenshots)
class DesignTokensCores(BaseModel):
    background: str = "#09111d"
    surface: str = "#152039"
    surface_elevated: str = "#0f182d"
    primary: str = "#707c88"
    primary_glow: str = "rgba(112, 124, 136, 0.18)"
    border: str = "rgba(112, 124, 136, 0.24)"
    text_primary: str = "#f2f7fa"
    text_muted: str = "rgba(242, 247, 250, 0.72)"
    success: str = "#707c88"
    locked: str = "#455154"


class DesignTokensTipografia(BaseModel):
    titulo: str = "Poppins-ExtraBold"
    corpo: str = "Inter-Medium"
    destaque: str = "Inika-Bold"
    tamanho_titulo: int = 22
    tamanho_corpo: int = 15
    tamanho_label: int = 11


class DesignTokens(BaseModel):
    cores: DesignTokensCores = Field(default_factory=DesignTokensCores)
    tipografia: DesignTokensTipografia = Field(default_factory=DesignTokensTipografia)
    border_radius: int = 10
    sombra: str = "2px 2px 9px rgba(0, 0, 0, 0.27)"
    sombra_primary: str = "0 0 18px rgba(112, 124, 136, 0.18)"


class PerfilBrainHexPayload(BaseModel):
    nome: str
    afinidade: float | None = None


# ── Request ───────────────────────────────────────────────────────────────────
class PersonalizarPayload(BaseModel):
    classe_id: int
    topico_id: int | None = None
    conteudo_id: int | None = None
    conteudo_foco_id: int | None = None
    perfis: list[PerfilBrainHexPayload] = Field(default_factory=list)
    topico_snapshot: dict[str, Any] | None = None
    materiais_origem_cliente: list[dict[str, Any]] = Field(default_factory=list)


class PersonalizacaoStep(BaseModel):
    item_key: str
    ordem: int
    kind: Literal["content", "activity"]
    title: str
    description: str | None = None
    required: bool = True
    pontuacao_maxima: float | None = None
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    activity: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PersonalizacaoItemProgressoPayload(BaseModel):
    personalizacao_id: int
    classe_id: int
    topico_id: int
    item_key: str
    item_kind: Literal["content", "activity", "cards"]
    item_title: str
    status: Literal["nao_iniciado", "em_andamento", "concluido"] = "em_andamento"
    percentual_concluido: float = 0
    acertos_percentual: float | None = None
    tempo_gasto_min: float | None = None
    pontuacao_obtida: float | None = None
    pontuacao_maxima: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PersonalizacaoItemProgressoResponse(BaseModel):
    id: int
    personalizacao_id: int
    aluno_id: str
    classe_id: int
    topico_id: int
    item_key: str
    item_kind: str
    item_title: str
    status: str
    percentual_concluido: float
    acertos_percentual: float | None = None
    tempo_gasto_min: float
    pontuacao_obtida: float | None = None
    pontuacao_maxima: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    completed_at: datetime | None = None
    updated_at: datetime


class MentorChatMessagePayload(BaseModel):
    role: Literal["assistant", "user"]
    content: str


class MentorChatPayload(BaseModel):
    classe_id: int
    topico_id: int | None = None
    conteudo_id: int | None = None
    escopo: Literal["modulo", "trilha_home"] = "modulo"
    mensagem: str
    historico: list[MentorChatMessagePayload] = Field(default_factory=list)


class MentorChatResponse(BaseModel):
    reply: str
    scope: Literal["modulo", "trilha_home"]
    should_close: bool = False
    hinted_actions: list[str] = Field(default_factory=list)


# ── Sub-schemas de artefatos ──────────────────────────────────────────────────
class CardItem(BaseModel):
    frente: str
    verso: str
    icone: str = "★"
    dificuldade: str = "medio"  # "facil" | "medio" | "dificil"
    xp: int = 5


class MarkdownMaterial(BaseModel):
    arquivo_url: str | None = None
    storage_path: str | None = None
    perfil: str | None = None
    guia_nome: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Response ──────────────────────────────────────────────────────────────────
class PlanoPersonalizacao(BaseModel):
    formato_prioritario: str
    formatos: list[str]
    nivel: str
    tom: str
    estilo: str = ""
    justificativa: str = ""


class PersonalizacaoResponse(BaseModel):
    id: int
    aluno_id: str
    classe_id: int | None = None
    conteudo_id: int | None = None
    topico_id: int | None = None
    ciclo_id: str
    status: str = "pronto"
    media_status: Literal["ready", "pending", "partial", "failed"] = "ready"
    media_job_id: str | None = None
    source_hash: str | None = None
    formato_prioritario: str
    formatos_gerados: list[str] = Field(default_factory=list)
    plano: dict[str, Any] | None = None
    materiais: dict[str, Any] | None = None
    ai_patch: IAPersonalizationPatch | None = Field(
        default=None,
        validation_alias=AliasChoices("ai_patch", "aiPatch"),
        serialization_alias="aiPatch",
    )
    design_tokens: DesignTokens = Field(default_factory=DesignTokens)
    steps: list[PersonalizacaoStep] = Field(default_factory=list)
    gerado_em: datetime
    updated_at: datetime | None = None


class PersonalizacaoMediaItemStatusResponse(BaseModel):
    id: int | None = None
    tipo: str
    status: Literal["ready", "pending", "partial", "failed"]
    arquivo_url: str | None = None
    storage_path: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PersonalizacaoMediaStatusResponse(BaseModel):
    personalizacao_id: int
    status: Literal["ready", "pending", "partial", "failed"]
    job_id: str | None = None
    materiais: list[PersonalizacaoMediaItemStatusResponse] = Field(default_factory=list)


class PersonalizacaoListResponse(BaseModel):
    aluno_id: str
    total: int
    itens: list[PersonalizacaoResponse] = Field(default_factory=list)


class PersonalizacaoContextoDocenteResponse(BaseModel):
    aluno_id: str
    classe_id: int
    topico_id: int | None = None
    contexto_aluno: dict[str, Any] = Field(default_factory=dict)
    personalizacoes: list[PersonalizacaoResponse] = Field(default_factory=list)
    progresso_itens: list[PersonalizacaoItemProgressoResponse] = Field(default_factory=list)


class PersonalizacaoJobPayload(BaseModel):
    classe_id: int
    aluno_id: str | None = None
    topico_ids: list[int] = Field(default_factory=list)
    conteudo_ids: list[int] = Field(default_factory=list)
    reason: str | None = None
    trigger_source: str = "api"


class PersonalizacaoJobTargetResponse(BaseModel):
    id: int
    job_id: str
    aluno_id: str
    topico_id: int
    conteudo_id: int | None = None
    status: str
    attempts: int
    last_error: str | None = None
    personalizacao_id: int | None = None
    created_at: datetime
    updated_at: datetime


class PersonalizacaoJobResponse(BaseModel):
    id: str
    kind: str
    status: str
    classe_id: int
    aluno_id: str | None = None
    topico_id: int | None = None
    conteudo_id: int | None = None
    trigger_source: str
    payload: dict[str, Any] = Field(default_factory=dict)
    total_targets: int = 0
    processed_targets: int = 0
    error_count: int = 0
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class PersonalizacaoJobDetailResponse(PersonalizacaoJobResponse):
    targets: list[PersonalizacaoJobTargetResponse] = Field(default_factory=list)


class PersonalizacaoJobListResponse(BaseModel):
    total: int
    itens: list[PersonalizacaoJobResponse] = Field(default_factory=list)


class FontePersonalizacaoResponse(BaseModel):
    id: int
    classe_id: int
    topico_id: int | None = None
    conteudo_id: int | None = None
    aluno_id: str | None = None
    professor_id: str | None = None
    visibilidade: str
    tipo: str
    titulo: str | None = None
    descricao: str | None = None
    arquivo_url: str | None = None
    storage_path: str | None = None
    mime_type: str | None = None
    nome_arquivo: str | None = None
    tamanho_bytes: int | None = None
    origem: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    criado_em: datetime


class FontesPersonalizacaoUploadResponse(BaseModel):
    classe_id: int
    topico_id: int | None = None
    conteudo_id: int | None = None
    total: int
    itens: list[FontePersonalizacaoResponse] = Field(default_factory=list)
