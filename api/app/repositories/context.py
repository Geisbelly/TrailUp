import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.common import DesempenhoSummary, Evento
from app.schemas.perfil import PerfilScore


DEFAULT_PROFILES = [
    "Seeker",
    "Conqueror",
    "Daredevil",
    "Mastermind",
    "Socialiser",
    "Achiever",
    "Survivor",
]


class ContextRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._modo_operacao_relation: str | None = None
        self._modo_operacao_relation_resolved = False
        self._classe_aluno_uses_camel_case: bool | None = None
        self._ia_descricao_relation: str | None = None
        self._ia_descricao_relation_resolved = False

    async def fetch_aluno_context(self, aluno_id: str, classe_id: int) -> dict[str, Any]:
        aluno = await self._fetch_aluno(aluno_id)
        perfis = await self._fetch_perfis(aluno_id)
        eventos = await self._fetch_eventos(aluno_id)
        progresso = await self._fetch_progresso(aluno_id, classe_id)
        desempenho = await self._fetch_desempenho(aluno_id, classe_id)
        trilha = await self._fetch_trilha(aluno_id, classe_id)
        ia_descricao = await self._fetch_ia_descricao(aluno_id)

        return {
            "aluno": aluno,
            "perfil_brainhex": perfis or [PerfilScore(perfil=nome, afinidade=0).model_dump() for nome in DEFAULT_PROFILES],
            "historico_eventos": [evento.model_dump(mode="json") for evento in eventos],
            "progresso_trilha": progresso,
            "desempenho_recente": desempenho.model_dump(mode="json"),
            "trilha_atual": trilha,
            "ia_descricao_atual": ia_descricao,
        }

    async def resolve_conteudo_foco_id(
        self,
        *,
        topico_id: int | None,
        atividade_id: int | None,
        fallback_topico_id: int | None,
    ) -> int | None:
        if atividade_id is not None:
            atividade_result = await self.session.execute(
                text(
                    """
                    SELECT ac.conteudo_id
                    FROM atividade_conteudos ac
                    WHERE ac.atividade_id = :atividade_id
                    ORDER BY ac.conteudo_id
                    LIMIT 1
                    """
                ),
                {"atividade_id": atividade_id},
            )
            conteudo_id = atividade_result.scalar()
            if conteudo_id is not None:
                return int(conteudo_id)

        selected_topico_id = topico_id or fallback_topico_id
        if selected_topico_id is None:
            return None

        topico_result = await self.session.execute(
            text(
                """
                SELECT id
                FROM conteudos
                WHERE topico_id = :topico_id
                ORDER BY ordem NULLS LAST, id
                LIMIT 1
                """
            ),
            {"topico_id": selected_topico_id},
        )
        conteudo_id = topico_result.scalar()
        return int(conteudo_id) if conteudo_id is not None else None

    async def _resolve_modo_operacao_relation(self) -> str | None:
        if self._modo_operacao_relation_resolved:
            return self._modo_operacao_relation

        result = await self.session.execute(
            text(
                """
                SELECT
                  to_regclass('public.modooperacao') AS lower_name,
                  to_regclass('public."modoOperacao"') AS camel_name
                """
            )
        )
        row = result.mappings().one()
        if row.get("lower_name"):
            self._modo_operacao_relation = "modooperacao"
        elif row.get("camel_name"):
            self._modo_operacao_relation = '"modoOperacao"'
        else:
            self._modo_operacao_relation = None

        self._modo_operacao_relation_resolved = True
        return self._modo_operacao_relation

    async def _fetch_aluno(self, aluno_id: str) -> dict[str, Any]:
        modo_operacao_relation = await self._resolve_modo_operacao_relation()
        if modo_operacao_relation is not None:
            query = f"""
                SELECT
                  a.id,
                  a.nome,
                  a.email,
                  a.apelido,
                  a.descricao,
                  a.modo_resposta,
                  mo.nome AS modo_operacao
                FROM alunos a
                LEFT JOIN {modo_operacao_relation} mo ON mo.id = a.modooperacao_id
                WHERE a.id = :aluno_id
                """
        else:
            query = """
                SELECT
                  a.id,
                  a.nome,
                  a.email,
                  a.apelido,
                  a.descricao,
                  a.modo_resposta,
                  NULL::text AS modo_operacao
                FROM alunos a
                WHERE a.id = :aluno_id
                """

        result = await self.session.execute(text(query), {"aluno_id": aluno_id})
        row = result.mappings().first()
        if row is None:
            raise ValueError(f"Aluno {aluno_id} nao encontrado.")
        return dict(row)

    async def _fetch_perfis(self, aluno_id: str) -> list[dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT p.nome, ap.afinidade
                FROM aluno_perfil ap
                JOIN perfil p ON p.id = ap.perfil_id
                WHERE ap.aluno_id = :aluno_id
                ORDER BY ap.afinidade DESC, p.nome ASC
                """
            ),
            {"aluno_id": aluno_id},
        )
        return [
            PerfilScore(perfil=row.nome, afinidade=float(row.afinidade or 0)).model_dump()
            for row in result
        ]

    async def _fetch_eventos(self, aluno_id: str) -> list[Evento]:
        result = await self.session.execute(
            text(
                """
                SELECT tipo, referencia, valor, criado_em
                FROM eventos_aluno
                WHERE aluno_id = :aluno_id
                ORDER BY criado_em DESC
                LIMIT 20
                """
            ),
            {"aluno_id": aluno_id},
        )
        return [Evento.model_validate(dict(row._mapping)) for row in result]

    async def _resolve_classe_aluno_casing(self) -> bool:
        if self._classe_aluno_uses_camel_case is not None:
            return self._classe_aluno_uses_camel_case

        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'classe_aluno'
                    AND column_name = 'notaMedia'
                ) AS uses_camel_case
                """
            )
        )
        self._classe_aluno_uses_camel_case = bool(result.scalar())
        return self._classe_aluno_uses_camel_case
    async def _fetch_progresso(self, aluno_id: str, classe_id: int) -> dict[str, Any]:
        result = await self.session.execute(
            text(
                """
                SELECT
                  ta.topico_id,
                  ta.status,
                  ta.percentual_concluido,
                  ta.ultima_atividade
                FROM topico_aluno ta
                JOIN topicos t ON t.id = ta.topico_id
                WHERE ta.aluno_id = :aluno_id
                  AND t.classe_id = :classe_id
                ORDER BY ta.topico_id ASC
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        progresso: dict[str, Any] = {}
        for row in result.mappings():
            progresso[str(row["topico_id"])] = {
                "status": row["status"],
                "percentual_concluido": float(row["percentual_concluido"] or 0),
                "ultima_atividade": row["ultima_atividade"],
            }
        return progresso

    async def _fetch_desempenho(self, aluno_id: str, classe_id: int) -> DesempenhoSummary:
        metrics_result = await self.session.execute(
            text(
                """
                SELECT
                  COALESCE(AVG(acertos_percentual), 0) AS media_acertos,
                  COALESCE(AVG(percentual_concluido), 0) AS percentual_concluido,
                  COALESCE(AVG(tempo_gasto_min), 0) AS tempo_medio_min,
                  MAX(CASE WHEN percentual_concluido >= 100 THEN 1 ELSE 0 END) AS topico_concluido,
                  MAX(atividade_id) AS atividade_recente_id
                FROM atividade_aluno
                WHERE aluno_id = :aluno_id
                """
            ),
            {"aluno_id": aluno_id},
        )
        metrics = metrics_result.mappings().one()

        topico_result = await self.session.execute(
            text(
                """
                SELECT a.topico_id
                FROM atividade_aluno aa
                JOIN atividades a ON a.id = aa.atividade_id
                JOIN topicos t ON t.id = a.topico_id
                WHERE aa.aluno_id = :aluno_id
                  AND t.classe_id = :classe_id
                ORDER BY aa.updated_at DESC NULLS LAST
                LIMIT 1
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        topico_recente_id = topico_result.scalar()

        classe_snapshot_uses_camel_case = await self._resolve_classe_aluno_casing()
        classe_snapshot_query = (
            """
            SELECT
              "notaMedia" AS notamedia,
              "acertosPercentual" AS acertospercentual,
              "porcentagemConcluida" AS porcentagemconcluida,
              "ultimaAtividade" AS ultimatividade,
              "tempoGastoMin" AS tempogastomin,
              "isComplete" AS iscomplete,
              "atividadesConcluidas" AS atividadesconcluidas
            FROM classe_aluno
            WHERE aluno_id = :aluno_id
              AND classe_id = :classe_id
            ORDER BY id DESC
            LIMIT 1
            """
            if classe_snapshot_uses_camel_case
            else """
            SELECT
              notamedia,
              acertospercentual,
              porcentagemconcluida,
              ultimatividade,
              tempogastomin,
              iscomplete,
              atividadesconcluidas
            FROM classe_aluno
            WHERE aluno_id = :aluno_id
              AND classe_id = :classe_id
            ORDER BY id DESC
            LIMIT 1
            """
        )
        classe_result = await self.session.execute(
            text(classe_snapshot_query),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        classe_snapshot = classe_result.mappings().first()

        return DesempenhoSummary(
            media_acertos=float(metrics["media_acertos"] or 0),
            percentual_concluido=float(metrics["percentual_concluido"] or 0),
            tempo_medio_min=float(metrics["tempo_medio_min"] or 0),
            topico_concluido=bool(metrics["topico_concluido"]),
            atividade_recente_id=metrics["atividade_recente_id"],
            topico_recente_id=topico_recente_id,
            classe_snapshot=dict(classe_snapshot) if classe_snapshot else {},
        )

    async def _resolve_ia_descricao_relation(self) -> str | None:
        if self._ia_descricao_relation_resolved:
            return self._ia_descricao_relation

        result = await self.session.execute(
            text(
                """
                SELECT
                  to_regclass('public.iadescricao') AS lower_name,
                  to_regclass('public."iaDescricao"') AS camel_name
                """
            )
        )
        row = result.mappings().one()
        if row.get("lower_name"):
            self._ia_descricao_relation = "iadescricao"
        elif row.get("camel_name"):
            self._ia_descricao_relation = '"iaDescricao"'
        else:
            self._ia_descricao_relation = None

        self._ia_descricao_relation_resolved = True
        return self._ia_descricao_relation
    async def _fetch_trilha(self, aluno_id: str, classe_id: int) -> dict[str, Any] | None:
        result = await self.session.execute(
            text(
                """
                SELECT id, trilha_modelo_id, configuracao, status
                FROM trilha_aluno
                WHERE aluno_id = :aluno_id
                  AND classe_id = :classe_id
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        row = result.mappings().first()
        if row is None:
            return None
        config = row["configuracao"]
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                config = {"raw": config}
        return {
            "id": str(row["id"]),
            "trilha_modelo_id": row["trilha_modelo_id"],
            "configuracao": config or {},
            "status": row["status"],
        }

    async def _fetch_ia_descricao(self, aluno_id: str) -> dict[str, Any] | None:
        ia_descricao_relation = await self._resolve_ia_descricao_relation()
        if ia_descricao_relation is None:
            return None

        query = (
            """
            SELECT id, recomendacaotrilha, modooperacao, insights, perfisdetectados
            FROM iadescricao
            WHERE aluno_id = :aluno_id
            ORDER BY created_at DESC
            LIMIT 1
            """
            if ia_descricao_relation == "iadescricao"
            else """
            SELECT
              id,
              "recomendacaoTrilha" AS recomendacaotrilha,
              "modoOperacao" AS modooperacao,
              insights,
              "perfisDetectados" AS perfisdetectados
            FROM "iaDescricao"
            WHERE aluno_id = :aluno_id
            ORDER BY created_at DESC
            LIMIT 1
            """
        )

        result = await self.session.execute(text(query), {"aluno_id": aluno_id})
        row = result.mappings().first()
        if row is None:
            return None
        return dict(row)




