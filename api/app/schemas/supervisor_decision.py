from pydantic import BaseModel, Field


class SupervisorDecision(BaseModel):
    next: list[str] = Field(default_factory=list)
    justificativa: str = ""
