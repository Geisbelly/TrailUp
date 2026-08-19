from pydantic import BaseModel, Field


class MentorChatLLMResult(BaseModel):
    reply: str
    should_close: bool = False
    hinted_actions: list[str] = Field(default_factory=list)


class GroundingJudgment(BaseModel):
    viola: bool
    motivo: str = ""
