"""`chat_guia_registros` (`20261118_01`): gravar o que a pergunta era e ler de volta para o Guia.

Nenhum método levanta. O chat não pode falhar por causa da memória: leitura que falha volta vazia
(o Guia responde como numa primeira conversa) e gravação que falha fica no log. O mesmo princípio de
`memoria_aluno.ler_memoria`, com o mesmo efeito colateral: tabela indisponível é indistinguível de
"aluno sem histórico". Ao investigar memória que não aparece, procure `chat_guia.` no log.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.mascaramento_chat import MIN_ALUNOS_TURMA, VERSAO_REGISTRO, RegistroDoChat

logger = logging.getLogger(__name__)

# Memória do aluno: as últimas perguntas desta janela, mais recente primeiro.
JANELA_DIAS = 60
LIMITE_MEMORIA = 40


def _linhas(result: Any) -> list[dict[str, Any]]:
    if result is None:
        return []
    return [dict(linha) for linha in result.mappings().all()]


class ChatGuiaRegistrosRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def nomes_da_turma(self, classe_id: int) -> list[dict[str, Any]]:
        """Nome e apelido de quem está matriculado: o que o mascarador tira do registro."""
        try:
            result = await self.session.execute(
                text(
                    """
                    SELECT a.nome, a.apelido
                      FROM classe_aluno ca
                      JOIN alunos a ON a.id = ca.aluno_id
                     WHERE ca.classe_id = :classe_id
                    """
                ),
                {"classe_id": int(classe_id)},
            )
            return _linhas(result)
        except Exception as exc:
            await self._rollback()
            logger.warning("chat_guia.nomes_da_turma_falhou: %s", type(exc).__name__)
            return []

    async def recentes_do_aluno(self, *, aluno_id: Any, classe_id: int) -> list[dict[str, Any]]:
        try:
            result = await self.session.execute(
                text(
                    """
                    SELECT topico_id, intencao, assunto, conceitos, dificuldade, criado_em
                      FROM chat_guia_registros
                     WHERE aluno_id = CAST(:aluno_id AS uuid)
                       AND classe_id = :classe_id
                       AND criado_em > now() - make_interval(days => :dias)
                     ORDER BY criado_em DESC
                     LIMIT :limite
                    """
                ),
                {
                    "aluno_id": str(aluno_id),
                    "classe_id": int(classe_id),
                    "dias": JANELA_DIAS,
                    "limite": LIMITE_MEMORIA,
                },
            )
            return _linhas(result)
        except Exception as exc:
            await self._rollback()
            logger.warning("chat_guia.memoria_falhou: %s", type(exc).__name__)
            return []

    async def dificuldades_da_turma(self, *, classe_id: int, topico_id: int | None) -> list[dict[str, Any]]:
        """Conceitos com dificuldade no tópico, por número de alunos. Só os de `MIN_ALUNOS_TURMA`
        alunos ou mais saem daqui: o resto apontaria uma pessoa."""
        if topico_id is None:
            return []
        try:
            result = await self.session.execute(
                text(
                    """
                    SELECT lower(c.conceito) AS conceito, count(DISTINCT r.aluno_id) AS alunos
                      FROM chat_guia_registros r
                     CROSS JOIN LATERAL unnest(r.conceitos) AS c(conceito)
                     WHERE r.classe_id = :classe_id
                       AND r.topico_id = :topico_id
                       AND r.dificuldade <> 'nenhuma'
                       AND r.criado_em > now() - make_interval(days => :dias)
                     GROUP BY lower(c.conceito)
                    HAVING count(DISTINCT r.aluno_id) >= :minimo
                     ORDER BY alunos DESC, conceito ASC
                     LIMIT 5
                    """
                ),
                {
                    "classe_id": int(classe_id),
                    "topico_id": int(topico_id),
                    "dias": JANELA_DIAS,
                    "minimo": MIN_ALUNOS_TURMA,
                },
            )
            return _linhas(result)
        except Exception as exc:
            await self._rollback()
            logger.warning("chat_guia.turma_falhou: %s", type(exc).__name__)
            return []

    async def gravar(
        self,
        registro: RegistroDoChat,
        *,
        aluno_id: Any,
        classe_id: int,
        topico_id: int | None,
        conteudo_id: int | None,
        escopo: str,
        origem: str,
        guardrail: bool,
    ) -> None:
        """Sem commit: vai na mesma transação do `ia_decision_logs` da rota."""
        await self.session.execute(
            text(
                """
                INSERT INTO chat_guia_registros (
                  aluno_id, classe_id, topico_id, conteudo_id, escopo,
                  intencao, assunto, conceitos, dificuldade, origem, guardrail, versao
                ) VALUES (
                  CAST(:aluno_id AS uuid), :classe_id, :topico_id, :conteudo_id, :escopo,
                  :intencao, :assunto, CAST(:conceitos AS text[]), :dificuldade, :origem, :guardrail, :versao
                )
                """
            ),
            {
                "aluno_id": str(aluno_id),
                "classe_id": int(classe_id),
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "escopo": escopo,
                "intencao": registro.intencao,
                "assunto": registro.assunto,
                "conceitos": list(registro.conceitos),
                "dificuldade": registro.dificuldade,
                "origem": origem,
                "guardrail": bool(guardrail),
                "versao": VERSAO_REGISTRO,
            },
        )

    async def _rollback(self) -> None:
        try:
            await self.session.rollback()
        except Exception:  # pragma: no cover - sessão já quebrada
            pass
