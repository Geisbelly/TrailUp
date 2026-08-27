import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.notificacao import NotificacaoPayload
from app.schemas.texto_gerado import TextoGerado


class NotificacaoRepository:
    """A API grava a SUGESTAO da IA. So isso.

    Fila, rotina, entrega e push vivem no banco (funcoes SQL + o trigger
    `trg_notificacoes_ia_promover`), pela regra de fronteira do projeto: a API e
    para IA, o resto e via banco (ver CLAUDE.md e
    docs/superpowers/specs/2026-08-26-notificacoes-via-banco-design.md).

    Antes, este metodo gravava o MESMO conteudo em `notificacoes_pendentes` e em
    `notificacoes_ia`, e nada no monorepo lia qualquer uma das duas. Continuar
    escrevendo nas duas agora seria pior que inutil: o trigger ja cria a
    pendente a partir da sugestao, entao o INSERT manual duplicaria a
    notificacao que chega ao aluno.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def enfileirar(
        self,
        aluno_id: str,
        payload: NotificacaoPayload,
        texto: TextoGerado | None = None,
    ) -> int | None:
        """Registra a sugestao da IA. Devolve o id, ou `None` se ja existia.

        O `ON CONFLICT` repete o predicado do indice (`WHERE resposta_hash IS
        NOT NULL`) porque ele e PARCIAL: sem o predicado o Postgres nao
        consegue casar o indice e levanta "no unique or exclusion constraint
        matching". O dedupe que `resposta_hash` sempre prometeu so passou a
        existir de fato na migracao 20260826_03.
        """

        contexto = payload.contexto | ({"texto": texto.model_dump()} if texto else {})

        return (
            await self.session.execute(
                text(
                    """
                    INSERT INTO notificacoes_ia (
                      aluno_id, tipo, contexto, titulo, corpo,
                      resposta_hash, status, origem, prioridade
                    )
                    VALUES (
                      :aluno_id, :tipo, CAST(:contexto AS JSONB), :titulo, :corpo,
                      :resposta_hash, 'sugerida', 'ciclo', :prioridade
                    )
                    ON CONFLICT (resposta_hash) WHERE resposta_hash IS NOT NULL
                    DO NOTHING
                    RETURNING id
                    """
                ),
                {
                    "aluno_id": aluno_id,
                    "tipo": payload.tipo,
                    "contexto": json.dumps(contexto, default=str),
                    "titulo": payload.titulo,
                    "corpo": payload.corpo,
                    "prioridade": payload.prioridade,
                    "resposta_hash": f"{aluno_id}:{payload.tipo}:{payload.horario.isoformat()}",
                },
            )
        ).scalar()
