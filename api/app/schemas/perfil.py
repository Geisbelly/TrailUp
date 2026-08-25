from pydantic import BaseModel, Field


class PerfilScore(BaseModel):
    perfil: str
    afinidade: float = Field(default=0, ge=0, le=100)


class PerfilUpdate(BaseModel):
    perfis: list[PerfilScore] = Field(default_factory=list)
    modo_operacao_sugerido: str | None = None
    modo_resposta: str | None = None
    justificativa: str | None = None

