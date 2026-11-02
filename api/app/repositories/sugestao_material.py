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

# Por que o banco marcou a sugestão para revisão (`20261102_07`). O CHECK da coluna tem a mesma
# lista; `test_migration_recomendacao_conteudo_x_aluno.py` confere a paridade.
MOTIVOS_REVISAO = ("atividade_concluida", "demanda_do_conteudo")


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
        self._colunas_revisao: bool | None = None

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

    async def _tem_colunas_revisao(self) -> bool:
        """``revisao_pendente`` existe? Sem a ``20261102_07``, a sugestão segue sem a marca."""
        if self._colunas_revisao is not None:
            return self._colunas_revisao
        if not await self._disponivel():
            self._colunas_revisao = False
            return False
        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = :tabela
                    AND column_name = 'revisao_pendente'
                )
                """
            ),
            {"tabela": _TABELA_SUGESTAO},
        )
        self._colunas_revisao = bool(result.scalar())
        return self._colunas_revisao

    def _colunas_de_revisao_sql(self, tem: bool) -> str:
        if tem:
            return "revisao_pendente, revisao_motivo, revisao_pendente_em"
        return (
            "false AS revisao_pendente, CAST(NULL AS text) AS revisao_motivo, "
            "CAST(NULL AS timestamptz) AS revisao_pendente_em"
        )

    async def buscar(
        self,
        *,
        aluno_id: str,
        topico_id: int,
        conteudo_id: int | None = None,
    ) -> dict[str, Any] | None:
        if not await self._disponivel():
            return None

        revisao = self._colunas_de_revisao_sql(await self._tem_colunas_revisao())
        result = await self.session.execute(
            text(
                f"""
                SELECT id, aluno_id, classe_id, topico_id, conteudo_id,
                       formato_inicial, ordem, versao, origem, evidencia,
                       criado_em, atualizado_em, {revisao}
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

    async def criar(
        self,
        *,
        aluno_id: str,
        topico_id: int,
        conteudo_id: int | None,
        classe_id: int | None,
        formato_inicial: str | None,
        ordem: list[dict[str, Any]],
        evidencia: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Cria a sugestão inicial, só se ainda não existir. ``None`` se outra chegou antes.

        Não é ``salvar``: o upsert de ``salvar`` transforma a segunda criação
        concorrente numa "revisão" (``versao`` 2, ``origem`` ainda ``inicial``) e as
        duas chamadas gravam ``criada`` no log. Foi o que a medição de produção
        achou (2026-11-01): dois GET simultâneos, uma sugestão, dois ``criada``.
        Com ``DO NOTHING`` quem perde a corrida fica sem linha e não loga nada.
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
                  :formato_inicial, CAST(:ordem AS jsonb), 1, 'inicial',
                  CAST(:evidencia AS jsonb)
                )
                ON CONFLICT (aluno_id, topico_id, COALESCE(conteudo_id, -1)) DO NOTHING
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
                "evidencia": _json(evidencia or {}),
            },
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def topicos_com_revisao_pendente(
        self, *, aluno_id: str, classe_id: int | None = None
    ) -> list[int]:
        """Tópicos do aluno cuja sugestão o banco marcou para revisão (mais antiga primeiro)."""
        if not await self._tem_colunas_revisao():
            return []
        result = await self.session.execute(
            text(
                f"""
                SELECT topico_id
                FROM {_TABELA_SUGESTAO}
                WHERE aluno_id = CAST(:aluno_id AS uuid)
                  AND revisao_pendente
                  AND conteudo_id IS NULL
                  AND (CAST(:classe_id AS bigint) IS NULL OR classe_id = CAST(:classe_id AS bigint))
                ORDER BY revisao_pendente_em NULLS FIRST, topico_id
                LIMIT 20
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        return [int(row.topico_id) for row in result]

    async def limpar_revisao_pendente(self, *, sugestao_id: int, marcada_em: Any) -> None:
        """Tira a marca que esta revisão atendeu, e só ela.

        ``marcada_em`` é o ``revisao_pendente_em`` lido antes de decidir. Uma marca que o banco
        gravou durante a revisão (outra atividade concluída) tem outra hora e fica: a próxima
        leitura revisa de novo, em vez de a decisão de agora engolir o evento novo.
        """
        if not await self._tem_colunas_revisao():
            return
        await self.session.execute(
            text(
                f"""
                UPDATE {_TABELA_SUGESTAO}
                SET revisao_pendente = false,
                    revisao_motivo = NULL,
                    revisao_pendente_em = NULL
                WHERE id = :id
                  AND revisao_pendente
                  AND revisao_pendente_em IS NOT DISTINCT FROM CAST(:marcada_em AS timestamptz)
                """
            ),
            {"id": sugestao_id, "marcada_em": marcada_em},
        )

    async def desempenho_no_topico(
        self, *, aluno_id: str, topico_id: int
    ) -> dict[str, Any] | None:
        """Acerto médio do aluno nas atividades CONCLUÍDAS do tópico.

        É o sinal de dificuldade da regra de reexposição (DAT-21). Só atividade
        concluída entra: ``acertos_percentual`` nasce 0 por default, e atividade
        não feita contaria como erro. Nunca levanta — falha de leitura vira
        "sem sinal", que é o que o motor já sabe tratar.
        """
        try:
            async with self.session.begin_nested():
                result = await self.session.execute(
                    text(
                        """
                        SELECT AVG(aa.acertos_percentual)::float AS media_acertos,
                               COUNT(*)::int AS itens
                        FROM atividade_aluno aa
                        JOIN atividades a ON a.id = aa.atividade_id
                        WHERE aa.aluno_id = CAST(:aluno_id AS uuid)
                          AND a.topico_id = :topico_id
                          AND aa.status::text = 'concluido'
                          AND aa.acertos_percentual IS NOT NULL
                        """
                    ),
                    {"aluno_id": aluno_id, "topico_id": topico_id},
                )
                row = result.mappings().first()
        except Exception:  # noqa: BLE001 - sinal opcional, não pode derrubar o ciclo
            return None
        if not row or not row["itens"]:
            return None
        return {
            "media_acertos": round(float(row["media_acertos"]), 2),
            "itens": int(row["itens"]),
        }

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
