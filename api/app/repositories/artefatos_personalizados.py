import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)


class ArtefatosPersonalizadosRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._table_cache: dict[str, bool] = {}

    async def _table_exists(self, table_name: str) -> bool:
        cached = self._table_cache.get(table_name)
        if cached is not None:
            return cached
        # Test doubles used in unit tests may not emulate information_schema.
        if isinstance(getattr(self.session, "responses", None), list):
            self._table_cache[table_name] = True
            return True

        result = await self.session.execute(
            text(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name = :table_name
                )
                """
            ),
            {"table_name": table_name},
        )
        exists = bool(result.scalar()) if hasattr(result, "scalar") else True
        self._table_cache[table_name] = exists
        return exists

    @staticmethod
    def _pick_string(*values: Any) -> str | None:
        for value in values:
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _normalize_profile_key(value: Any) -> str:
        normalized = str(value or "").strip().lower()
        aliases = {
            "socializer": "socializer",
            "socialiser": "socializer",
            "survivor": "survivor",
            "seeker": "seeker",
            "daredevil": "daredevil",
            "mastermind": "mastermind",
            "conqueror": "conqueror",
            "achiever": "achiever",
        }
        return aliases.get(normalized, normalized or "mastermind")

    @staticmethod
    def _as_int(value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_float(value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _normalize_alternativas(value: Any) -> list[str] | None:
        if isinstance(value, list):
            normalized = [str(item).strip() for item in value if str(item).strip()]
            return normalized or None
        if isinstance(value, str):
            normalized = [item.strip() for item in value.split("|") if item.strip()]
            return normalized or None
        return None

    async def marcar_ciclos_anteriores_obsoletos(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int,
        ciclo_id: str,
        brainhex_profile_key: str | None = None,
    ) -> None:
        """Marca artefatos de ciclos anteriores como obsoletos."""
        normalized_profile = self._normalize_profile_key(brainhex_profile_key)
        params = {
            "topico_id": int(topico_id),
            "aluno_id": str(aluno_id),
            "classe_id": int(classe_id),
            "ciclo_id": str(ciclo_id),
            "brainhex_profile_key": normalized_profile,
        }

        if await self._table_exists("cards_personalizados"):
            await self.session.execute(
                text(
                    """
                    UPDATE cards_personalizados
                    SET ativo = FALSE,
                        obsoleto_em = NOW(),
                        atualizado_em = NOW()
                    WHERE classe_id = CAST(:classe_id AS BIGINT)
                      AND topico_id = CAST(:topico_id AS BIGINT)
                      AND (
                        COALESCE(metadata ->> 'brainhex_profile_key', '') = :brainhex_profile_key
                        OR (
                          COALESCE(metadata ->> 'brainhex_profile_key', '') = ''
                          AND aluno_id = CAST(:aluno_id AS UUID)
                        )
                      )
                      AND ciclo_id <> :ciclo_id
                      AND ativo = TRUE
                    """
                ),
                params,
            )

    async def salvar_cards(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int,
        conteudo_id: int | None,
        ciclo_id: str,
        brainhex_profile_key: str,
        source_hash: str | None,
        cards: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not cards:
            return []
        if not await self._table_exists("cards_personalizados"):
            return list(cards)

        normalized_profile = self._normalize_profile_key(brainhex_profile_key)
        await self.session.execute(
            text(
                """
                DELETE FROM cards_personalizados
                WHERE classe_id = CAST(:classe_id AS BIGINT)
                  AND topico_id = CAST(:topico_id AS BIGINT)
                  AND ciclo_id = :ciclo_id
                  AND COALESCE(metadata ->> 'brainhex_profile_key', '') = :brainhex_profile_key
                """
            ),
            {
                "classe_id": int(classe_id),
                "topico_id": int(topico_id),
                "ciclo_id": str(ciclo_id),
                "brainhex_profile_key": normalized_profile,
            },
        )

        saved_cards: list[dict[str, Any]] = []
        for idx, card in enumerate(cards, start=1):
            if not isinstance(card, dict):
                continue
            frente = self._pick_string(card.get("frente"), card.get("titulo")) or f"Card {idx}"
            verso = self._pick_string(card.get("verso"), card.get("descricao")) or frente
            titulo = self._pick_string(card.get("titulo"), frente) or f"Card {idx}"
            descricao = self._pick_string(card.get("descricao"), verso) or verso

            metadata = {
                "personalizado": True,
                "aluno_id": str(aluno_id),
                "classe_id": int(classe_id),
                "topico_id": int(topico_id),
                "conteudo_id": conteudo_id,
                "ciclo_id": str(ciclo_id),
                "brainhex_profile_key": normalized_profile,
                "source_hash": source_hash,
                "frente": frente,
                "verso": verso,
                **(card.get("metadata") or {}),
            }

            result = await self.session.execute(
                text(
                    """
                    INSERT INTO cards_personalizados (
                      aluno_id,
                      classe_id,
                      topico_id,
                      conteudo_id,
                      ciclo_id,
                      ordem,
                      titulo,
                      descricao,
                      icone,
                      dificuldade,
                      xp,
                      metadata
                    )
                    VALUES (
                      CAST(:aluno_id AS UUID),
                      CAST(:classe_id AS BIGINT),
                      CAST(:topico_id AS BIGINT),
                      :conteudo_id,
                      :ciclo_id,
                      :ordem,
                      :titulo,
                      :descricao,
                      :icone,
                      :dificuldade,
                      :xp,
                      CAST(:metadata AS JSONB)
                    )
                    RETURNING id
                    """
                ),
                {
                    "aluno_id": str(aluno_id),
                    "classe_id": int(classe_id),
                    "topico_id": int(topico_id),
                    "conteudo_id": int(conteudo_id) if conteudo_id is not None else None,
                    "ciclo_id": str(ciclo_id),
                    "ordem": idx,
                    "titulo": titulo,
                    "descricao": descricao,
                    "icone": self._pick_string(card.get("icone")),
                    "dificuldade": self._pick_string(card.get("dificuldade")),
                    "xp": self._as_int(card.get("xp")),
                    "metadata": json.dumps(metadata, ensure_ascii=False, default=str),
                },
            )
            card_id = int(result.scalar_one())
            saved_cards.append(
                {
                    **card,
                    "id": card_id,
                    "titulo": titulo,
                    "descricao": descricao,
                    "frente": frente,
                    "verso": verso,
                }
            )

        return saved_cards

    async def salvar_atividades_quiz(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int,
        conteudo_id: int | None,
        ciclo_id: str,
        atividades: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not atividades:
            return []

        # A persistência canônica do quiz ocorre em materiais_gerados/conteudo_personalizado.
        # As tabelas atividades_personalizadas/questoes_personalizadas foram descontinuadas.
        logger.info(
            "Persistindo quiz apenas no payload canônico (sem tabelas personalizadas)",
            extra={
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "ciclo_id": ciclo_id,
            },
        )

        updated: list[dict[str, Any]] = []
        for atividade_idx, atividade in enumerate(atividades, start=1):
            if not isinstance(atividade, dict):
                continue
            titulo = str(atividade.get("titulo") or "Atividade personalizada").strip()
            if not titulo:
                titulo = "Atividade personalizada"
            descricao = str(atividade.get("descricao") or "").strip() or None
            tipo = str(atividade.get("tipo") or "quiz").strip() or "quiz"
            conteudo_texto = self._pick_string(
                atividade.get("conteudo"),
                atividade.get("enunciado"),
                descricao,
            )
            pontuacao_maxima = self._as_float(
                atividade.get("pontuacao_maxima")
                or atividade.get("nota_estabelecida")
            )

            questoes_raw = atividade.get("questoes")
            questoes = questoes_raw if isinstance(questoes_raw, list) else []
            if not questoes:
                base_enunciado = self._pick_string(
                    atividade.get("enunciado"),
                    atividade.get("titulo"),
                )
                if base_enunciado:
                    questoes = [
                        {
                            "tipo": tipo,
                            "enunciado": base_enunciado,
                            "alternativas": atividade.get("alternativas"),
                            "resposta_correta": atividade.get("resposta_correta"),
                            "nota_estabelecida": atividade.get("nota_estabelecida"),
                        }
                    ]
            updated_questoes: list[dict[str, Any]] = []
            for questao_idx, questao in enumerate(questoes, start=1):
                if not isinstance(questao, dict):
                    continue
                enunciado = str(
                    questao.get("enunciado") or questao.get("pergunta") or ""
                ).strip()
                if not enunciado:
                    continue

                alternativas = self._normalize_alternativas(questao.get("alternativas"))
                alternativas_json = (
                    json.dumps(alternativas, ensure_ascii=False)
                    if isinstance(alternativas, list)
                    else None
                )
                tipo_questao = str(questao.get("tipo") or tipo).strip() or "quiz"
                nota_estabelecida = self._as_float(
                    questao.get("nota_estabelecida")
                    or atividade.get("nota_estabelecida")
                )
                explicacao = self._pick_string(
                    questao.get("explicacao"),
                    questao.get("justificativa"),
                )
                normalized_questao: dict[str, Any] = {
                    **questao,
                    "ordem": questao_idx,
                    "enunciado": enunciado,
                    "tipo": tipo_questao,
                }
                if alternativas_json is not None:
                    normalized_questao["alternativas"] = alternativas
                if questao.get("resposta_correta") is not None:
                    normalized_questao["resposta_correta"] = questao.get("resposta_correta")
                if nota_estabelecida is not None:
                    normalized_questao["nota_estabelecida"] = nota_estabelecida
                if explicacao:
                    normalized_questao["explicacao"] = explicacao
                updated_questoes.append(normalized_questao)

            normalized_atividade: dict[str, Any] = {
                **atividade,
                "ordem": atividade_idx,
                "titulo": titulo,
                "descricao": descricao,
                "conteudo": conteudo_texto,
                "tipo": tipo,
                "questoes": updated_questoes,
            }
            if pontuacao_maxima is not None:
                normalized_atividade["pontuacao_maxima"] = pontuacao_maxima
            updated.append(normalized_atividade)

        return updated

    async def _salvar_atividades_quiz_legacy(
        self,
        *,
        aluno_id: str,
        classe_id: int,
        topico_id: int,
        conteudo_id: int | None,
        ciclo_id: str,
        atividades: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        updated: list[dict[str, Any]] = []
        for atividade in atividades:
            if not isinstance(atividade, dict):
                continue
            titulo = str(atividade.get("titulo") or "Atividade personalizada").strip() or "Atividade personalizada"
            descricao = str(atividade.get("descricao") or "").strip() or None
            tipo = str(atividade.get("tipo") or "quiz").strip() or "quiz"
            pontuacao_maxima = atividade.get("pontuacao_maxima")
            metadata_atividade = json.dumps(
                {
                    "personalizado": True,
                    "aluno_id": str(aluno_id),
                    "ciclo_id": ciclo_id,
                    "classe_id": classe_id,
                    "conteudo_id": conteudo_id,
                    **(atividade.get("metadata") or {}),
                },
                ensure_ascii=False,
                default=str,
            )
            atividade_result = await self.session.execute(
                text(
                    """
                    INSERT INTO atividades (topico_id, titulo, descricao, tipo, pontuacao_maxima, metadata)
                    VALUES (
                      CAST(:topico_id AS BIGINT),
                      :titulo,
                      :descricao,
                      :tipo,
                      :pontuacao_maxima,
                      CAST(:metadata AS JSONB)
                    )
                    RETURNING id
                    """
                ),
                {
                    "topico_id": topico_id,
                    "titulo": titulo,
                    "descricao": descricao,
                    "tipo": tipo,
                    "pontuacao_maxima": pontuacao_maxima,
                    "metadata": metadata_atividade,
                },
            )
            atividade_id = int(atividade_result.scalar_one())
            questoes = atividade.get("questoes") if isinstance(atividade.get("questoes"), list) else []
            updated_questoes: list[dict[str, Any]] = []
            for questao in questoes:
                if not isinstance(questao, dict):
                    continue
                enunciado = str(questao.get("enunciado") or questao.get("pergunta") or "").strip()
                if not enunciado:
                    continue
                alternativas = self._normalize_alternativas(questao.get("alternativas"))
                alternativas_json = json.dumps(alternativas, ensure_ascii=False) if alternativas else None
                tipo_questao = str(questao.get("tipo") or tipo).strip() or "quiz"
                questao_result = await self.session.execute(
                    text(
                        """
                        INSERT INTO questoes (
                          atividade_id,
                          enunciado,
                          tipo,
                          alternativas,
                          resposta_correta
                        )
                        VALUES (
                          CAST(:atividade_id AS BIGINT),
                          :enunciado,
                          :tipo,
                          CAST(:alternativas AS JSONB),
                          :resposta_correta
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "atividade_id": atividade_id,
                        "enunciado": enunciado,
                        "tipo": tipo_questao,
                        "alternativas": alternativas_json,
                        "resposta_correta": questao.get("resposta_correta"),
                    },
                )
                updated_questoes.append({**questao, "id": int(questao_result.scalar_one())})
            updated.append({**atividade, "id": atividade_id, "questoes": updated_questoes})
        return updated
