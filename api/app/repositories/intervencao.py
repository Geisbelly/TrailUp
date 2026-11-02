import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.intervencao import IntervencaoPayload

# A recorrencia (3 dos ultimos 5) continua verdadeira por varios ciclos seguidos.
# Sem esta janela, cada ciclo gravaria a mesma intervencao de novo.
JANELA_DEDUP_DIAS = 7

_PENDENTE_IGUAL = """
    aluno_id = CAST(:aluno_id AS uuid)
    AND classe_id = CAST(:classe_id AS bigint)
    AND escopo = 'aluno'
    AND status = 'pending'
    AND contexto->>'origem' = 'agente_intervencao'
    AND contexto->>'kind' = CAST(:motivo AS text)
    AND created_at > now() - make_interval(days => CAST(:janela_dias AS integer))
"""


class IntervencaoRepository:
    """Grava a intervencao por aluno sugerida pelo `agente_intervencao` (#64).

    `classe_id` e obrigatorio na pratica: a RLS do professor
    (`intervencoes_professor_sel`, `20260929_01`) filtra por ele, entao uma
    linha sem turma ficaria invisivel para todo mundo.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def existe_pendente(self, *, aluno_id: str, classe_id: int, kind: str) -> bool:
        resultado = await self.session.execute(
            text(f"SELECT EXISTS (SELECT 1 FROM intervencoes WHERE {_PENDENTE_IGUAL})"),
            {"aluno_id": aluno_id, "classe_id": classe_id, "motivo": kind, "janela_dias": JANELA_DEDUP_DIAS},
        )
        return bool(resultado.scalar())

    async def registrar_do_aluno(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        intervencao: IntervencaoPayload,
        ciclo_id: str | None,
    ) -> str | None:
        """Devolve o id, ou `None` se ja existe uma pendente igual na janela."""
        contexto = {
            "origem": "agente_intervencao",
            "kind": intervencao.kind,
            "ocorrencias": intervencao.ocorrencias,
            "janela": intervencao.janela,
            "acao": intervencao.acao,
            "redacao": intervencao.origem,
            "ciclo_id": ciclo_id,
            "fontes_rag": intervencao.fontes_rag,
        }
        resultado = await self.session.execute(
            text(
                """
                INSERT INTO intervencoes (
                  aluno_id, classe_id, escopo, natureza, tipo, motivo, texto, base,
                  acao, contexto, status
                )
                SELECT CAST(:aluno_id AS uuid), CAST(:classe_id AS bigint), 'aluno', 'sugestao',
                       CAST(:tipo AS text), CAST(:motivo AS text), CAST(:texto AS text),
                       CAST(:base AS text), CAST(:acao AS text), CAST(:contexto AS jsonb), 'pending'
                 WHERE NOT EXISTS (SELECT 1 FROM intervencoes WHERE """
                + _PENDENTE_IGUAL
                + """)
                RETURNING id
                """
            ),
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "tipo": intervencao.tipo,
                "motivo": intervencao.kind,
                "texto": intervencao.texto,
                "base": intervencao.base,
                "acao": intervencao.acao,
                "contexto": json.dumps(contexto),
                "janela_dias": JANELA_DEDUP_DIAS,
            },
        )
        novo = resultado.scalar()
        return str(novo) if novo is not None else None
