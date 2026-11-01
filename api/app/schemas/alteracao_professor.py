from typing import Literal

from pydantic import BaseModel, Field


class DecisaoDoAluno(BaseModel):
    """Decisão para um aluno. `aluno_ref` é a referência curta (A1, A2...) que o payload deu a cada
    aluno: o modelo nunca vê nem devolve o uuid, então não há como ele inventar um aluno."""

    aluno_ref: str
    revisar: bool
    motivo: str


class AlteracaoProfessorSaida(BaseModel):
    classificacao: Literal["cosmetica", "relevante"]
    resumo: str = ""
    motivo: str = ""
    alunos: list[DecisaoDoAluno] = Field(default_factory=list)
