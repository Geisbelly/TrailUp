import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.notificacao import NotificacaoPayload
from app.schemas.texto_gerado import TextoGerado


class NotificacaoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def enfileirar(
        self,
        aluno_id: str,
        payload: NotificacaoPayload,
        texto: TextoGerado | None = None,
    ) -> None:
        contexto = payload.contexto | ({"texto": texto.model_dump()} if texto else {})

        await self.session.execute(
            text(
                """
                INSERT INTO notificacoes_pendentes (
                  aluno_id, tipo, contexto, titulo, corpo, horario, status, prioridade
                )
                VALUES (
                  :aluno_id, :tipo, CAST(:contexto AS JSONB), :titulo, :corpo, :horario, 'pendente', :prioridade
                )
                """
            ),
            {
                "aluno_id": aluno_id,
                "tipo": payload.tipo,
                "contexto": json.dumps(contexto, default=str),
                "titulo": payload.titulo,
                "corpo": payload.corpo,
                "horario": payload.horario,
                "prioridade": payload.prioridade,
            },
        )

        await self.session.execute(
            text(
                """
                INSERT INTO notificacoes_ia (
                  aluno_id, tipo, contexto, titulo, corpo, resposta_hash
                )
                VALUES (
                  :aluno_id, :tipo, CAST(:contexto AS JSONB), :titulo, :corpo, :resposta_hash
                )
                """
            ),
            {
                "aluno_id": aluno_id,
                "tipo": payload.tipo,
                "contexto": json.dumps(contexto, default=str),
                "titulo": payload.titulo,
                "corpo": payload.corpo,
                "resposta_hash": f"{aluno_id}:{payload.tipo}:{payload.horario.isoformat()}",
            },
        )

