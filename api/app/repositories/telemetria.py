import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from asyncpg.exceptions import QueryCanceledError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.services.r2_storage import enviar_para_r2, ler_config_r2

logger = logging.getLogger(__name__)


class TelemetriaRepository:
    _STATEMENT_TIMEOUT_MS = 15000

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _coerce_datetime(value: datetime | str | None) -> datetime | None:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        raise TypeError(f"Unsupported datetime value: {type(value)!r}")

    @staticmethod
    def _coerce_float(value: Any, default: float = 0.0) -> float:
        try:
            if value is None:
                return default
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _coerce_int(value: Any, default: int = 0) -> int:
        try:
            if value is None:
                return default
            return int(value)
        except (TypeError, ValueError):
            return default

    async def _set_statement_timeout(self) -> None:
        bind = getattr(self.session, "bind", None)
        dialect = getattr(bind, "dialect", None)
        dialect_name = getattr(dialect, "name", None)
        if dialect_name != "postgresql":
            return
        # SET/SET LOCAL nao aceita bind parameters ($1) via protocolo estendido do
        # Postgres ("syntax error at or near $1") - o valor precisa ir literal na
        # string. Seguro aqui pois _STATEMENT_TIMEOUT_MS e uma constante interna,
        # nunca input do usuario.
        await self.session.execute(
            text(f"SET LOCAL statement_timeout = {int(self._STATEMENT_TIMEOUT_MS)}")
        )

    async def upsert_sessao(
        self,
        *,
        sessao_id: str,
        aluno_id: str,
        classe_id: int,
        topico_inicial_id: int | None,
        camera_opt_in: bool,
        started_at: datetime | str,
        ended_at: datetime | str | None,
    ) -> dict[str, Any]:
        started_at_value = self._coerce_datetime(started_at)
        ended_at_value = self._coerce_datetime(ended_at)
        await self._set_statement_timeout()
        try:
            result = await self.session.execute(
                text(
                    """
                    INSERT INTO telemetria_sessoes (
                      id,
                      aluno_id,
                      classe_id,
                      topico_inicial_id,
                      camera_opt_in,
                      started_at,
                      ended_at
                    )
                    VALUES (
                      :sessao_id,
                      :aluno_id,
                      :classe_id,
                      :topico_inicial_id,
                      :camera_opt_in,
                      :started_at,
                      :ended_at
                    )
                    ON CONFLICT (id) DO UPDATE
                    SET
                      classe_id = EXCLUDED.classe_id,
                      topico_inicial_id = COALESCE(telemetria_sessoes.topico_inicial_id, EXCLUDED.topico_inicial_id),
                      camera_opt_in = EXCLUDED.camera_opt_in,
                      started_at = LEAST(telemetria_sessoes.started_at, EXCLUDED.started_at),
                      ended_at = CASE
                        WHEN EXCLUDED.ended_at IS NULL THEN telemetria_sessoes.ended_at
                        ELSE EXCLUDED.ended_at
                      END,
                      updated_at = NOW()
                    RETURNING id, aluno_id, classe_id, topico_inicial_id, camera_opt_in, started_at, ended_at
                    """
                ),
                {
                    "sessao_id": sessao_id,
                    "aluno_id": aluno_id,
                    "classe_id": classe_id,
                    "topico_inicial_id": topico_inicial_id,
                    "camera_opt_in": camera_opt_in,
                    "started_at": started_at_value,
                    "ended_at": ended_at_value,
                },
            )
        except DBAPIError as exc:
            if isinstance(getattr(exc, "orig", None), QueryCanceledError):
                await asyncio.sleep(0.05)
                await self._set_statement_timeout()
                result = await self.session.execute(
                    text(
                        """
                        INSERT INTO telemetria_sessoes (
                          id,
                          aluno_id,
                          classe_id,
                          topico_inicial_id,
                          camera_opt_in,
                          started_at,
                          ended_at
                        )
                        VALUES (
                          :sessao_id,
                          :aluno_id,
                          :classe_id,
                          :topico_inicial_id,
                          :camera_opt_in,
                          :started_at,
                          :ended_at
                        )
                        ON CONFLICT (id) DO UPDATE
                        SET
                          classe_id = EXCLUDED.classe_id,
                          topico_inicial_id = COALESCE(telemetria_sessoes.topico_inicial_id, EXCLUDED.topico_inicial_id),
                          camera_opt_in = EXCLUDED.camera_opt_in,
                          started_at = LEAST(telemetria_sessoes.started_at, EXCLUDED.started_at),
                          ended_at = CASE
                            WHEN EXCLUDED.ended_at IS NULL THEN telemetria_sessoes.ended_at
                            ELSE EXCLUDED.ended_at
                          END,
                          updated_at = NOW()
                        RETURNING id, aluno_id, classe_id, topico_inicial_id, camera_opt_in, started_at, ended_at
                        """
                    ),
                    {
                        "sessao_id": sessao_id,
                        "aluno_id": aluno_id,
                        "classe_id": classe_id,
                        "topico_inicial_id": topico_inicial_id,
                        "camera_opt_in": camera_opt_in,
                        "started_at": started_at_value,
                        "ended_at": ended_at_value,
                    },
                )
            else:
                raise
        row = result.mappings().first()
        return dict(row) if row else {"id": sessao_id}

    async def insert_or_get_lote(
        self,
        *,
        sessao_id: str,
        aluno_id: str,
        classe_id: int,
        topico_id: int | None,
        atividade_id: int | None,
        conteudo_id: int | None,
        screen_name: str,
        route_name: str,
        flush_reason: str,
        captured_at: datetime | str,
        study_elapsed_sec: float,
        screen_dwell_sec: float,
        active_sec: float,
        idle_sec: float,
        touch_count: int,
        scroll_distance_px: float,
        max_depth_px: float,
        frame_sent: bool,
        payload: dict[str, Any],
    ) -> tuple[dict[str, Any], bool]:
        batch_id = str(uuid4())
        captured_at_value = self._coerce_datetime(captured_at)
        await self._set_statement_timeout()
        result = await self.session.execute(
            text(
                """
                INSERT INTO telemetria_lotes (
                  id,
                  sessao_id,
                  aluno_id,
                  classe_id,
                  topico_id,
                  atividade_id,
                  conteudo_id,
                  screen_name,
                  route_name,
                  flush_reason,
                  captured_at,
                  study_elapsed_sec,
                  screen_dwell_sec,
                  active_sec,
                  idle_sec,
                  touch_count,
                  scroll_distance_px,
                  max_depth_px,
                  frame_sent,
                  payload
                )
                VALUES (
                  :id,
                  :sessao_id,
                  :aluno_id,
                  :classe_id,
                  :topico_id,
                  :atividade_id,
                  :conteudo_id,
                  :screen_name,
                  :route_name,
                  :flush_reason,
                  :captured_at,
                  :study_elapsed_sec,
                  :screen_dwell_sec,
                  :active_sec,
                  :idle_sec,
                  :touch_count,
                  :scroll_distance_px,
                  :max_depth_px,
                  :frame_sent,
                  CAST(:payload AS JSONB)
                )
                ON CONFLICT (sessao_id, captured_at, flush_reason) DO NOTHING
                RETURNING id, sessao_id, analysis_ciclo_id
                """
            ),
            {
                "id": batch_id,
                "sessao_id": sessao_id,
                "aluno_id": aluno_id,
                "classe_id": classe_id,
                "topico_id": topico_id,
                "atividade_id": atividade_id,
                "conteudo_id": conteudo_id,
                "screen_name": screen_name,
                "route_name": route_name,
                "flush_reason": flush_reason,
                "captured_at": captured_at_value,
                "study_elapsed_sec": study_elapsed_sec,
                "screen_dwell_sec": screen_dwell_sec,
                "active_sec": active_sec,
                "idle_sec": idle_sec,
                "touch_count": touch_count,
                "scroll_distance_px": scroll_distance_px,
                "max_depth_px": max_depth_px,
                "frame_sent": frame_sent,
                "payload": json.dumps(
                    await self._payload_para_gravar(batch_id, payload),
                    ensure_ascii=False,
                    default=str,
                ),
            },
        )
        inserted = result.mappings().first()
        if inserted:
            return dict(inserted), True

        existing = await self.session.execute(
            text(
                """
                SELECT id, sessao_id, analysis_ciclo_id
                FROM telemetria_lotes
                WHERE sessao_id = :sessao_id
                  AND captured_at = :captured_at
                  AND flush_reason = :flush_reason
                """
            ),
            {
                "sessao_id": sessao_id,
                "captured_at": captured_at_value,
                "flush_reason": flush_reason,
            },
        )
        row = existing.mappings().first()
        if row:
            return dict(row), False
        return {"id": batch_id, "sessao_id": sessao_id, "analysis_ciclo_id": None}, False

    async def _payload_para_gravar(
        self, batch_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Manda o payload bruto para o R2 e devolve so um ponteiro.

        O bruto e ~96% do tamanho da linha e **nada o le de volta**: o unico
        SELECT sobre `telemetria_lotes` pega `id, sessao_id, analysis_ciclo_id`,
        e nao ha view nem funcao que use a tabela. As outras 20 colunas ja
        carregam o que as consultas usam - por isso da para tirar o payload sem
        migracao e sem perder nenhuma consulta.

        Falha no R2 NAO derruba o lote: perder o arquivo bruto e melhor que
        recusar a requisicao e perder tambem as metricas estruturadas, que sao o
        que alimenta o pipeline de analise. Nesse caso grava o payload inteiro,
        como antes - o comportamento degrada, nao quebra.

        Sem R2 configurado, o comportamento e identico ao anterior.
        """
        cfg = ler_config_r2(get_settings())
        if cfg is None:
            return payload

        caminho = f"telemetria/lotes/{datetime.now(UTC):%Y/%m/%d}/{batch_id}.json"
        try:
            await enviar_para_r2(
                cfg,
                caminho,
                json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"),
                "application/json; charset=utf-8",
            )
        except Exception as exc:  # noqa: BLE001 - degradar e melhor que recusar o lote
            logger.warning("[telemetria] payload nao foi para o R2 (%s): %s", caminho, exc)
            return payload

        return {"_r2": caminho, "_bucket": cfg.bucket}

    async def update_lote_analysis(self, *, batch_id: str, analysis_ciclo_id: str | None) -> None:
        await self.session.execute(
            text(
                """
                UPDATE telemetria_lotes
                SET analysis_ciclo_id = :analysis_ciclo_id
                WHERE id = :batch_id
                """
            ),
            {
                "batch_id": batch_id,
                "analysis_ciclo_id": analysis_ciclo_id,
            },
        )

    async def insert_eventos_app(
        self,
        *,
        sessao_id: str,
        aluno_id: str,
        classe_id: int,
        screen_name: str,
        route_name: str,
        eventos: list[dict[str, Any]],
    ) -> None:
        for evento in eventos:
            await self.session.execute(
                text(
                    """
                    INSERT INTO telemetria_eventos_app (
                      id,
                      client_event_id,
                      sessao_id,
                      aluno_id,
                      classe_id,
                      topico_id,
                      conteudo_id,
                      atividade_id,
                      questao_id,
                      item_key,
                      screen_name,
                      route_name,
                      event_group,
                      event_name,
                      event_source,
                      occurred_at,
                      time_since_prev_sec,
                      attempt_number,
                      is_correct,
                      chat_role,
                      trigger_context,
                      payload
                    )
                    VALUES (
                      gen_random_uuid(),
                      :client_event_id,
                      :sessao_id,
                      :aluno_id,
                      :classe_id,
                      :topico_id,
                      :conteudo_id,
                      :atividade_id,
                      :questao_id,
                      :item_key,
                      :screen_name,
                      :route_name,
                      :event_group,
                      :event_name,
                      :event_source,
                      :occurred_at,
                      :time_since_prev_sec,
                      :attempt_number,
                      :is_correct,
                      :chat_role,
                      :trigger_context,
                      CAST(:payload AS JSONB)
                    )
                    ON CONFLICT (sessao_id, client_event_id) DO NOTHING
                    """
                ),
                {
                    "client_event_id": str(evento.get("client_event_id") or uuid4()),
                    "sessao_id": sessao_id,
                    "aluno_id": aluno_id,
                    "classe_id": classe_id,
                    "topico_id": evento.get("topico_id"),
                    "conteudo_id": evento.get("conteudo_id"),
                    "atividade_id": evento.get("atividade_id"),
                    "questao_id": evento.get("questao_id"),
                    "item_key": evento.get("item_key"),
                    "screen_name": evento.get("screen_name") or screen_name,
                    "route_name": evento.get("route_name") or route_name,
                    "event_group": str(evento.get("event_group") or "interaction"),
                    "event_name": str(evento.get("event_name") or "unknown"),
                    "event_source": str(evento.get("event_source") or "mobile_app"),
                    "occurred_at": self._coerce_datetime(evento.get("occurred_at")),
                    "time_since_prev_sec": evento.get("time_since_prev_sec"),
                    "attempt_number": evento.get("attempt_number"),
                    "is_correct": evento.get("is_correct"),
                    "chat_role": evento.get("chat_role"),
                    "trigger_context": evento.get("trigger_context"),
                    "payload": json.dumps(evento.get("payload") or {}, ensure_ascii=False, default=str),
                },
            )

    async def insert_time_metric_entries(
        self,
        *,
        lote_id: str,
        sessao_id: str,
        aluno_id: str,
        classe_id: int,
        captured_at: datetime | str,
        topico_id: int | None,
        conteudo_id: int | None,
        atividade_id: int | None,
        time_metrics: dict[str, Any] | None,
    ) -> None:
        if not isinstance(time_metrics, dict):
            return

        captured_at_value = self._coerce_datetime(captured_at)
        if captured_at_value is None:
            return

        scope_map: tuple[tuple[str, Any], ...] = (
            ("topic", time_metrics.get("topics")),
            ("content", time_metrics.get("contents")),
            ("activity", time_metrics.get("activities")),
            ("material", time_metrics.get("materials")),
        )

        for scope, entries in scope_map:
            if not isinstance(entries, list):
                continue

            for entry in entries:
                if not isinstance(entry, dict):
                    continue

                resolved_topico_id = entry.get("topico_id") if entry.get("topico_id") is not None else topico_id
                resolved_conteudo_id = entry.get("conteudo_id") if entry.get("conteudo_id") is not None else conteudo_id
                resolved_atividade_id = entry.get("atividade_id") if entry.get("atividade_id") is not None else atividade_id

                if scope == "topic" and resolved_topico_id is None:
                    continue
                if scope == "content" and resolved_conteudo_id is None:
                    continue
                if scope == "activity" and resolved_atividade_id is None:
                    continue
                if scope == "material" and not (entry.get("material_key") or entry.get("item_key") or entry.get("key")):
                    continue

                await self.session.execute(
                    text(
                        """
                        INSERT INTO telemetria_time_metric_entries (
                          lote_id,
                          sessao_id,
                          aluno_id,
                          classe_id,
                          topico_id,
                          conteudo_id,
                          atividade_id,
                          item_key,
                          material_key,
                          material_tipo,
                          scope,
                          visits,
                          dwell_sec,
                          active_sec,
                          idle_sec,
                          touch_count,
                          scroll_distance_px,
                          max_depth_px,
                          captured_at
                        )
                        VALUES (
                          :lote_id,
                          :sessao_id,
                          :aluno_id,
                          :classe_id,
                          :topico_id,
                          :conteudo_id,
                          :atividade_id,
                          :item_key,
                          :material_key,
                          :material_tipo,
                          :scope,
                          :visits,
                          :dwell_sec,
                          :active_sec,
                          :idle_sec,
                          :touch_count,
                          :scroll_distance_px,
                          :max_depth_px,
                          :captured_at
                        )
                        """
                    ),
                    {
                        "lote_id": lote_id,
                        "sessao_id": sessao_id,
                        "aluno_id": aluno_id,
                        "classe_id": classe_id,
                        "topico_id": resolved_topico_id,
                        "conteudo_id": resolved_conteudo_id,
                        "atividade_id": resolved_atividade_id,
                        "item_key": entry.get("item_key") or entry.get("key"),
                        "material_key": entry.get("material_key"),
                        "material_tipo": entry.get("material_tipo"),
                        "scope": scope,
                        "visits": max(0, self._coerce_int(entry.get("visits"), 0)),
                        "dwell_sec": max(0.0, self._coerce_float(entry.get("dwell_sec"), 0.0)),
                        "active_sec": max(0.0, self._coerce_float(entry.get("active_sec"), 0.0)),
                        "idle_sec": max(0.0, self._coerce_float(entry.get("idle_sec"), 0.0)),
                        "touch_count": max(0, self._coerce_int(entry.get("touch_count"), 0)),
                        "scroll_distance_px": max(0.0, self._coerce_float(entry.get("scroll_distance_px"), 0.0)),
                        "max_depth_px": max(0.0, self._coerce_float(entry.get("max_depth_px"), 0.0)),
                        "captured_at": captured_at_value,
                    },
                )
