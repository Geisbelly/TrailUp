"""Leitura das tentativas e escrita do cronometro pela IA (#136, fase 4).

As tabelas sao da `20261101_13`. A API escreve como dona do banco: `aluno_definir_cronometro` e
do aluno (confere `auth.uid()`), e o cliente nao tem GRANT de escrita em `aluno_cronometro`.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.tentativas_atividade import resumir_tentativas

_TENTATIVAS = """
    SELECT t.aluno_id, t.atividade_id, t.numero, t.respondida_em, t.cronometrada, t.no_tempo,
           t.acertos_percentual, a.tentativas_max
      FROM atividade_tentativas t
      JOIN atividades a ON a.id = t.atividade_id
     WHERE t.classe_id = CAST(:classe_id AS bigint)
       AND t.respondida_em IS NOT NULL
"""

# `fn_cronometro_ligado` e a mesma conta que `atividade_iniciar_tentativa` faz (escolha > perfil).
_CRONOMETRO = """
    SELECT public.fn_cronometro_ligado(CAST(:aluno_id AS uuid)) AS ligado,
           COALESCE((SELECT c.origem FROM aluno_cronometro c WHERE c.aluno_id = CAST(:aluno_id AS uuid)),
                    'perfil') AS origem
"""


class TentativasRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def disponivel(self) -> bool:
        """Banco sem a `20261101_13` (local antigo): sem tentativas, em vez de erro.

        Conferir antes, e nao capturar a falha depois: a sessao e de quem chama (o contexto do aluno
        roda dentro do worker da fila), e um erro no meio abortaria a transacao dele."""
        resultado = await self.session.execute(
            text(
                "SELECT to_regclass('public.atividade_tentativas') IS NOT NULL"
                " AND to_regprocedure('public.fn_cronometro_ligado(uuid)') IS NOT NULL"
            )
        )
        return bool(resultado.scalar())

    async def resumo_do_aluno(self, aluno_id: str, classe_id: int) -> dict[str, Any]:
        """`{}` quando o banco nao tem as tentativas; senao, `resumir_tentativas`."""
        if not await self.disponivel():
            return {}
        linhas = await self.session.execute(
            text(_TENTATIVAS + " AND t.aluno_id = CAST(:aluno_id AS uuid)"),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        cronometro = (
            await self.session.execute(text(_CRONOMETRO), {"aluno_id": aluno_id})
        ).mappings().first()
        return resumir_tentativas(
            [dict(r) for r in linhas.mappings()],
            {"ligado": bool(cronometro["ligado"]), "origem": cronometro["origem"]} if cronometro else None,
        )

    async def resumos_da_turma(self, classe_id: int, desde: Any) -> dict[str, dict[str, Any]]:
        """Por aluno, so as tentativas entregues desde `desde` (a janela dos insights)."""
        if not await self.disponivel():
            return {}
        linhas = await self.session.execute(
            text(_TENTATIVAS + " AND t.respondida_em >= CAST(:desde AS timestamptz)"),
            {"classe_id": classe_id, "desde": desde},
        )
        por_aluno: dict[str, list[dict[str, Any]]] = {}
        for r in linhas.mappings():
            por_aluno.setdefault(str(r["aluno_id"]), []).append(dict(r))
        return {aluno: resumir_tentativas(lista) for aluno, lista in por_aluno.items()}

    async def desligar_cronometro_pela_ia(self, aluno_id: str, motivo: str) -> bool:
        """Grava o desligamento, salvo se o aluno escolheu (a escolha dele vence a da IA).

        A condicao vai no proprio UPSERT, nao numa leitura antes: o aluno pode ter mexido no
        interruptor entre o contexto lido e este ciclo. `False` = nada mudou."""
        resultado = await self.session.execute(
            text(
                """
                INSERT INTO aluno_cronometro AS c (aluno_id, ligado, origem, motivo, atualizado_em)
                VALUES (CAST(:aluno_id AS uuid), false, 'ia', CAST(:motivo AS text), now())
                ON CONFLICT (aluno_id) DO UPDATE
                   SET ligado = false, origem = 'ia', motivo = EXCLUDED.motivo, atualizado_em = now()
                 WHERE c.origem <> 'aluno' AND c.ligado
                RETURNING c.aluno_id
                """
            ),
            {"aluno_id": aluno_id, "motivo": motivo},
        )
        return resultado.scalar() is not None
