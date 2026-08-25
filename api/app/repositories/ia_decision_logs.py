import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class IADecisionLogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def log(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        source: str,
        stage: str,
        ciclo_id: str | None = None,
        batch_id: str | None = None,
        sessao_id: str | None = None,
        topico_id: int | None = None,
        conteudo_id: int | None = None,
        atividade_id: int | None = None,
        provider: str | None = None,
        model_name: str | None = None,
        trigger_event: str | None = None,
        input_summary: dict[str, Any] | None = None,
        prompt_text: str | None = None,
        raw_response: str | None = None,
        parsed_response: dict[str, Any] | None = None,
        decision_summary: str | None = None,
        actions: list[Any] | None = None,
    ) -> None:
        await self.session.execute(
            text(
                """
                INSERT INTO ia_decision_logs (
                  ciclo_id,
                  batch_id,
                  sessao_id,
                  aluno_id,
                  classe_id,
                  topico_id,
                  conteudo_id,
                  atividade_id,
                  source,
                  stage,
                  provider,
                  model_name,
                  trigger_event,
                  input_summary,
                  prompt_text,
                  raw_response,
                  parsed_response,
                  decision_summary,
                  actions
                )
                VALUES (
                  :ciclo_id,
                  CAST(:batch_id AS UUID),
                  CAST(:sessao_id AS UUID),
                  CAST(:aluno_id AS UUID),
                  :classe_id,
                  :topico_id,
                  :conteudo_id,
                  :atividade_id,
                  :source,
                  :stage,
                  :provider,
                  :model_name,
                  :trigger_event,
                  CAST(:input_summary AS JSONB),
                  :prompt_text,
                  :raw_response,
                  CAST(:parsed_response AS JSONB),
                  :decision_summary,
                  CAST(:actions AS JSONB)
                )
                """
            ),
            {
                "ciclo_id": ciclo_id,
                "batch_id": batch_id,
                "sessao_id": sessao_id,
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "atividade_id": atividade_id,
                "source": source,
                "stage": stage,
                "provider": provider,
                "model_name": model_name,
                "trigger_event": trigger_event,
                "input_summary": json.dumps(input_summary or {}, ensure_ascii=False, default=str),
                "prompt_text": prompt_text,
                "raw_response": raw_response,
                "parsed_response": json.dumps(parsed_response or {}, ensure_ascii=False, default=str),
                "decision_summary": decision_summary,
                "actions": json.dumps(actions or [], ensure_ascii=False, default=str),
            },
        )
