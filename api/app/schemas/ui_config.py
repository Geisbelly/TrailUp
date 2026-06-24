from typing import Literal

from pydantic import BaseModel, Field


class UIConfig(BaseModel):
    tema: Literal["dark", "light", "focus", "energetic"] = "light"
    ritmo_conteudo: Literal["lento", "normal", "acelerado"] = "normal"
    complexidade_visual: Literal["minima", "normal", "rica"] = "normal"
    elementos_gamificacao: Literal["ocultos", "sutis", "destacados"] = "sutis"
    tom_feedbacks: Literal["suporte", "neutro", "desafiador"] = "neutro"
    precisa_texto: bool = False
    tipo_modal: Literal["suporte", "conquista", "dica", "desafio"] | None = None
    contexto_texto: dict = Field(default_factory=dict)

