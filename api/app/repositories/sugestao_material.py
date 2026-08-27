"""Persistência da sugestão de material por aluno + log append-only.

Duas tabelas, criadas em ``20260825_01`` (ver
``docs/superpowers/specs/2026-08-25-sugestao-de-material-por-aluno-design.md``):
``personalizacao_sugestao`` guarda o estado ATUAL e
``personalizacao_sugestao_log`` guarda o histórico, sem UPDATE por cima.

O repositório **nunca derruba o ciclo de geração**. Se a migração ainda não foi
aplicada no ambiente, cada operação vira no-op e devolve ``None``/``[]`` — a
sugestão é uma camada de consumo, e a ausência dela não pode impedir o material
de ser gerado. É o mesmo cuidado que ``PersonalizacaoProgressoRepository`` já
toma com a tabela de progresso.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_TABELA_SUGESTAO = "personalizacao_sugestao"
_TABELA_LOG = "personalizacao_sugestao_log"


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else [], ensure_ascii=False, default=str)


def _carregar_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return value


class SugestaoMaterialRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._tabelas_existem: bool | None = None

    async def _disponivel(self) -> bool:
        """As duas tabelas existem? Sem AMBAS, não há como manter o contrato.

        Gravar a sugestão sem poder gravar o log deixaria o histórico furado
        justamente onde a métrica de efetividade vai olhar — melhor não gravar
        nada do que gravar meia verdade.
        """
        if self._tabelas_existem is not None:
            return self._tabelas_existem

        result = await self.session.execute(
            text(
                """
                SELECT COUNT(*) AS encontradas
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN (:sugestao, :log)
                """
            ),
            {"sugestao": _TABELA_SUGESTAO, "log": _TABELA_LOG},
        )
        self._tabelas_existem = int(result.scalar() or 0) == 2
        return self._tabelas_existem

    async def buscar(
        self,
        *,
        aluno_id: str,
        topico_id: int,
        conteudo_id: int | None = None,
    ) -> dict[str, Any] | None:
        if not await self._disponivel():
            return None

        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, classe_id, topico_id, conteudo_id,
                       formato_inicial, ordem, versao, origem, evidencia,
                       criado_em, atualizado_em
                FROM {_TABELA_SUGESTAO}
                WHERE aluno_id = :aluno_id
                  AND topico_id = :topico_id
                  AND COALESCE(conteudo_id, -1) = COALESCE(:conteudo_id, -1)
                """
            ),
            {"aluno_id": aluno_id, "topico_id": topico_id, "conteudo_id": conteudo_id},
        )
        row = result.mappings().first()
        if not row:
            return None

        registro = dict(row)
        registro["ordem"] = _carregar_json(registro.get("ordem")) or []
        registro["evidencia"] = _carregar_json(registro.get("evidencia")) or {}
        return registro

    async def salvar(
        self,
        *,
        aluno_id: str,
        topico_id: int,
        conteudo_id: int | None,
        classe_id: int | None,
        formato_inicial: str | None,
        ordem: list[dict[str, Any]],
        origem: str,
        evidencia: dict[str, Any] | None = None,
        versao: int | None = None,
    ) -> dict[str, Any] | None:
        """Cria ou atualiza a sugestão atual. Devolve a linha resultante.

        A versão é incrementada no próprio UPDATE (``versao + 1``) em vez de ser
        calculada aqui e enviada: dois ciclos concorrentes no mesmo alvo
        chegariam com o mesmo número e um sobrescreveria o outro em silêncio.
        """
        if not await self._disponivel():
            return None

        result = await self.session.execute(
            text(
                f"""
                INSERT INTO {_TABELA_SUGESTAO} (
                  aluno_id, classe_id, topico_id, conteudo_id,
                  formato_inicial, ordem, versao, origem, evidencia
                ) VALUES (
                  :aluno_id, :classe_id, :topico_id, :conteudo_id,
                  :formato_inicial, CAST(:ordem AS jsonb), :versao, :origem,
                  CAST(:evidencia AS jsonb)
                )
                ON CONFLICT (aluno_id, topico_id, COALESCE(conteudo_id, -1)) DO UPDATE
                SET formato_inicial = EXCLUDED.formato_inicial,
                    ordem = EXCLUDED.ordem,
                    origem = EXCLUDED.origem,
                    evidencia = EXCLUDED.evidencia,
                    classe_id = COALESCE(EXCLUDED.classe_id, {_TABELA_SUGESTAO}.classe_id),
                    versao = {_TABELA_SUGESTAO}.versao + 1,
                    atualizado_em = now()
                RETURNING id, versao
                """
            ),
            {
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "formato_inicial": formato_inicial,
                "ordem": _json(ordem),
                "versao": versao or 1,
                "origem": origem,
                "evidencia": _json(evidencia or {}),
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def registrar_log(
        self,
        *,
        sugestao_id: int | None,
        aluno_id: str,
        classe_id: int | None,
        topico_id: int,
        conteudo_id: int | None,
        versao: int,
        acao: str,
        ordem_antes: list[dict[str, Any]] | None,
        ordem_depois: list[dict[str, Any]] | None,
        motivos: list[str] | None,
        evidencia: dict[str, Any] | None,
    ) -> int | None:
        """Grava UMA decisão no histórico. Nunca atualiza linha existente.

        Registra as três ações, incluindo ``mantida``: sem isso não há como
        distinguir um motor estável de um motor que nunca rodou.
        """
        if not await self._disponivel():
            return None

        result = await self.session.execute(
            text(
                f"""
                INSERT INTO {_TABELA_LOG} (
                  sugestao_id, aluno_id, classe_id, topico_id, conteudo_id,
                  versao, acao, ordem_antes, ordem_depois, motivos, evidencia
                ) VALUES (
                  :sugestao_id, :aluno_id, :classe_id, :topico_id, :conteudo_id,
                  :versao, :acao,
                  CAST(:ordem_antes AS jsonb), CAST(:ordem_depois AS jsonb),
                  CAST(:motivos AS jsonb), CAST(:evidencia AS jsonb)
                )
                RETURNING id
                """
            ),
            {
                "sugestao_id": sugestao_id,
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "versao": versao,
                "acao": acao,
                "ordem_antes": _json(ordem_antes) if ordem_antes is not None else None,
                "ordem_depois": _json(ordem_depois) if ordem_depois is not None else None,
                "motivos": _json(motivos or []),
                "evidencia": _json(evidencia or {}),
            },
        )
        return result.scalar()

    async def listar_log(
        self,
        *,
        aluno_id: str | None = None,
        classe_id: int | None = None,
        topico_id: int | None = None,
        limite: int = 200,
    ) -> list[dict[str, Any]]:
        """Histórico para a métrica de efetividade e para o console."""
        if not await self._disponivel():
            return []

        filtros = ["1 = 1"]
        params: dict[str, Any] = {"limite": max(1, min(int(limite), 1000))}
        if aluno_id:
            filtros.append("aluno_id = :aluno_id")
            params["aluno_id"] = aluno_id
        if classe_id is not None:
            filtros.append("classe_id = :classe_id")
            params["classe_id"] = classe_id
        if topico_id is not None:
            filtros.append("topico_id = :topico_id")
            params["topico_id"] = topico_id

        result = await self.session.execute(
            text(
                f"""
                SELECT id, sugestao_id, aluno_id, classe_id, topico_id,
                       conteudo_id, versao, acao, ordem_antes, ordem_depois,
                       motivos, evidencia, criado_em
                FROM {_TABELA_LOG}
                WHERE {" AND ".join(filtros)}
                ORDER BY criado_em DESC, id DESC
                LIMIT :limite
                """
            ),
            params,
        )

        registros: list[dict[str, Any]] = []
        for row in result.mappings():
            registro = dict(row)
            for campo in ("ordem_antes", "ordem_depois", "motivos", "evidencia"):
                registro[campo] = _carregar_json(registro.get(campo))
            registros.append(registro)
        return registros
