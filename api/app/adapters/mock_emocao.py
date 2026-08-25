from collections.abc import Sequence

from app.adapters.base_emocao import EmocaoAdapter
from app.schemas.common import Evento
from app.schemas.emocao_result import EmocaoResult


class MockEmocaoAdapter(EmocaoAdapter):
    async def analisar_frame(self, frame_b64: str, metadados: dict) -> EmocaoResult:
        if len(frame_b64 or "") % 5 == 0:
            return EmocaoResult(
                emocao_primaria="concentrado",
                valencia=0.25,
                confianca=0.78,
                origem="mock_frame",
            )
        return EmocaoResult(
            emocao_primaria="ansioso",
            valencia=-0.35,
            confianca=0.66,
            origem="mock_frame",
        )

    async def analisar_comportamento(self, eventos: Sequence[Evento]) -> EmocaoResult:
        tipos = {evento.tipo.lower() for evento in eventos}
        if {"inatividade", "erro_recorrente", "abandono_atividade"} & tipos:
            return EmocaoResult(
                emocao_primaria="frustrado",
                valencia=-0.72,
                confianca=0.83,
                origem="mock_evento",
            )
        if {"atividade_concluida", "streak_mantida", "quiz_gabaritado"} & tipos:
            return EmocaoResult(
                emocao_primaria="animado",
                valencia=0.72,
                confianca=0.81,
                origem="mock_evento",
            )
        return EmocaoResult(
            emocao_primaria="concentrado",
            valencia=0.1,
            confianca=0.61,
            origem="mock_evento",
        )

