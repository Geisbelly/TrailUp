from __future__ import annotations

import asyncio
import logging
import socket
from typing import Any

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.fontes_personalizacao import FontesPersonalizacaoRepository
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository
from app.repositories.personalizacao_progresso import PersonalizacaoProgressoRepository
from app.services.classe_mapa_tema import gerar_classe_mapa_tema
from app.services.personalizacao import (
    build_personalizacao_steps,
    fetch_personalizacao_context,
    gerar_cards_direto,
)
from app.services.media_agents import disparar_brainhex_async
from app.services.storage import BUCKET

logger = logging.getLogger(__name__)

JOB_KIND_ENROLLMENT = "student_enrollment"
JOB_KIND_CLEANUP = "student_cleanup"
JOB_KIND_CLASS_DELTA = "class_delta_sync"
JOB_KIND_FULL_SYNC = "full_class_sync"
JOB_KIND_MANUAL_RETRY = "manual_retry"
JOB_KIND_CLASS_THEME = "class_theme_sync"
_JOB_KIND_MEDIA_RENDER = "media_render"
_JOB_KIND_MEDIA_RENDER_LEGACY = "personalizacao_media_render"
_MEDIA_RENDER_KINDS = {_JOB_KIND_MEDIA_RENDER, _JOB_KIND_MEDIA_RENDER_LEGACY}
_BRAINHEX_PROFILE_KEYS = (
    "seeker",
    "survivor",
    "daredevil",
    "mastermind",
    "conqueror",
    "socializer",
    "achiever",
)

TARGET_DONE_STATES = {"completed", "failed", "skipped"}
_MEDIA_FORMATOS = {"audio", "apresentacao", "markdown"}
MAX_DB_FAILURE_BACKOFF_SEC = 60
DB_FAILURE_BACKOFF_FACTOR = 2
DB_FAILURE_LOG_INTERVAL_SEC = 30


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


def _target_profile_map_key(
    *,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None,
) -> str:
    return f"{aluno_id}:{int(topico_id)}:{int(conteudo_id) if conteudo_id is not None else 0}"


def _profile_key_to_label(profile_key: str) -> str:
    key = _normalize_profile_key(profile_key)
    labels = {
        "seeker": "Seeker",
        "survivor": "Survivor",
        "daredevil": "Daredevil",
        "mastermind": "Mastermind",
        "conqueror": "Conqueror",
        "socializer": "Socialiser",
        "achiever": "Achiever",
    }
    return labels.get(key, "Mastermind")


def _iter_exception_chain(exc: BaseException | None) -> list[BaseException]:
    seen: set[int] = set()
    chain: list[BaseException] = []
    current = exc
    while current is not None and id(current) not in seen:
        chain.append(current)
        seen.add(id(current))
        current = current.__cause__ or current.__context__
    return chain


def _is_transient_db_connection_error(exc: BaseException) -> bool:
    transient_tokens = (
        "connection reset",
        "connection refused",
        "connection aborted",
        "could not connect",
        "could not translate host name",
        "getaddrinfo failed",
        "server closed the connection unexpectedly",
        "temporary failure in name resolution",
        "connection timed out",
        "ssl",
    )
    for error in _iter_exception_chain(exc):
        if isinstance(
            error,
            (
                socket.gaierror,
                ConnectionError,
                ConnectionResetError,
                TimeoutError,
            ),
        ):
            return True
        if isinstance(error, (OperationalError, InterfaceError)):
            return True
        if isinstance(error, DBAPIError) and bool(getattr(error, "connection_invalidated", False)):
            return True
        message = str(error).lower()
        if any(token in message for token in transient_tokens):
            return True
    return False


def _compute_failure_backoff_sec(
    *,
    poll_sec: int,
    failure_streak: int,
    max_backoff_sec: int = MAX_DB_FAILURE_BACKOFF_SEC,
) -> int:
    if failure_streak <= 0:
        return poll_sec
    backoff = poll_sec * (DB_FAILURE_BACKOFF_FACTOR ** (failure_streak - 1))
    return min(max_backoff_sec, max(poll_sec, backoff))


def _compact_exception_text(exc: BaseException) -> str:
    raw = str(exc or "").strip()
    if not raw:
        return type(exc).__name__
    first_line = raw.splitlines()[0].strip()
    return first_line or type(exc).__name__


def _exception_signature(exc: BaseException) -> str:
    return f"{type(exc).__name__}:{_compact_exception_text(exc).lower()}"


async def _build_targets(
    *,
    session: AsyncSession,
    kind: str,
    classe_id: int,
    aluno_id: str | None = None,
    topico_ids: list[int] | None = None,
    conteudo_ids: list[int] | None = None,
) -> tuple[list[dict[str, Any]], list[int], dict[str, str]]:
    if kind == JOB_KIND_CLASS_THEME:
        return [], [], {}

    classe_repo = ConteudoClasseRepository(session)
    resolved_topicos = sorted({int(item) for item in (topico_ids or []) if item is not None})
    conteudos_por_topico: dict[int, list[int]] = {}
    if conteudo_ids:
        conteudos_por_topico = await classe_repo.mapear_conteudos_por_topico(
            [int(item) for item in conteudo_ids]
        )
        resolved_topicos = sorted(
            {
                *resolved_topicos,
                *await classe_repo.resolve_topico_ids_por_conteudos([int(item) for item in conteudo_ids]),
            }
        )

    alunos_da_classe = await classe_repo.listar_alunos_classe_com_perfil_dominante(classe_id)
    alunos = [item["aluno_id"] for item in alunos_da_classe]
    profile_by_aluno = {
        str(item["aluno_id"]): _normalize_profile_key(item.get("perfil_dominante"))
        for item in alunos_da_classe
    }

    if not resolved_topicos:
        resolved_topicos = [int(item["id"]) for item in await classe_repo.listar_topicos_classe(classe_id)]

    targets: list[dict[str, Any]] = []
    target_profile_map: dict[str, str] = {}

    def _append_target(
        *,
        owner_aluno_id: str,
        topico_id: int,
        conteudo_id: int | None,
        profile_key: str,
    ) -> None:
        target = {
            "aluno_id": owner_aluno_id,
            "topico_id": topico_id,
            "conteudo_id": conteudo_id,
            "status": "pending",
        }
        targets.append(target)
        target_profile_map[
            _target_profile_map_key(
                aluno_id=owner_aluno_id,
                topico_id=topico_id,
                conteudo_id=conteudo_id,
            )
        ] = _normalize_profile_key(profile_key)

    if kind in {JOB_KIND_ENROLLMENT, JOB_KIND_CLEANUP}:
        selected_aluno_id = str(aluno_id) if aluno_id else None
        if not selected_aluno_id:
            return [], resolved_topicos, {}
        selected_profile = profile_by_aluno.get(selected_aluno_id, "mastermind")
        for current_topico_id in resolved_topicos:
            conteudos_topico = conteudos_por_topico.get(current_topico_id, [])
            if conteudos_topico:
                for conteudo_id in conteudos_topico:
                    _append_target(
                        owner_aluno_id=selected_aluno_id,
                        topico_id=current_topico_id,
                        conteudo_id=conteudo_id,
                        profile_key=selected_profile,
                    )
                continue
            _append_target(
                owner_aluno_id=selected_aluno_id,
                topico_id=current_topico_id,
                conteudo_id=None,
                profile_key=selected_profile,
            )
        return targets, resolved_topicos, target_profile_map

    if kind in {JOB_KIND_CLASS_DELTA, JOB_KIND_FULL_SYNC, JOB_KIND_MANUAL_RETRY}:
        if not alunos:
            return [], resolved_topicos, {}

        representative_by_profile: dict[str, str] = {}
        used_alunos: set[str] = set()

        for profile_key in _BRAINHEX_PROFILE_KEYS:
            candidate = next(
                (
                    aluno
                    for aluno in alunos
                    if profile_by_aluno.get(aluno) == profile_key and aluno not in used_alunos
                ),
                None,
            )
            if candidate is None:
                candidate = next((aluno for aluno in alunos if aluno not in used_alunos), None)
            if candidate is None:
                continue
            representative_by_profile[profile_key] = candidate
            used_alunos.add(candidate)

        for current_topico_id in resolved_topicos:
            conteudos_topico = conteudos_por_topico.get(current_topico_id, [])
            for profile_key in _BRAINHEX_PROFILE_KEYS:
                owner_aluno_id = representative_by_profile.get(profile_key)
                if not owner_aluno_id:
                    continue
                if conteudos_topico:
                    for conteudo_id in conteudos_topico:
                        _append_target(
                            owner_aluno_id=owner_aluno_id,
                            topico_id=current_topico_id,
                            conteudo_id=conteudo_id,
                            profile_key=profile_key,
                        )
                    continue
                _append_target(
                    owner_aluno_id=owner_aluno_id,
                    topico_id=current_topico_id,
                    conteudo_id=None,
                    profile_key=profile_key,
                )
        return targets, resolved_topicos, target_profile_map

    for current_aluno_id in alunos:
        current_profile = profile_by_aluno.get(current_aluno_id, "mastermind")
        for current_topico_id in resolved_topicos:
            conteudos_topico = conteudos_por_topico.get(current_topico_id, [])
            if conteudos_topico:
                for conteudo_id in conteudos_topico:
                    _append_target(
                        owner_aluno_id=current_aluno_id,
                        topico_id=current_topico_id,
                        conteudo_id=conteudo_id,
                        profile_key=current_profile,
                    )
                continue
            _append_target(
                owner_aluno_id=current_aluno_id,
                topico_id=current_topico_id,
                conteudo_id=None,
                profile_key=current_profile,
            )
    return targets, resolved_topicos, target_profile_map


async def enqueue_personalizacao_job(
    *,
    session: AsyncSession,
    kind: str,
    classe_id: int,
    trigger_source: str,
    aluno_id: str | None = None,
    topico_ids: list[int] | None = None,
    conteudo_ids: list[int] | None = None,
    reason: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    repo = PersonalizacaoJobsRepository(session)
    targets, resolved_topicos, target_profile_map = await _build_targets(
        session=session,
        kind=kind,
        classe_id=classe_id,
        aluno_id=aluno_id,
        topico_ids=topico_ids,
        conteudo_ids=conteudo_ids,
    )
    job_payload = {
        **(payload or {}),
        "reason": reason,
        "topico_ids": resolved_topicos,
        "conteudo_ids": [int(item) for item in (conteudo_ids or [])],
        "target_profile_map": target_profile_map,
    }
    job = await repo.criar_job(
        kind=kind,
        classe_id=classe_id,
        trigger_source=trigger_source,
        payload=job_payload,
        aluno_id=aluno_id if kind in {JOB_KIND_ENROLLMENT, JOB_KIND_CLEANUP} else None,
        topico_id=resolved_topicos[0] if len(resolved_topicos) == 1 else None,
        conteudo_id=conteudo_ids[0] if conteudo_ids and len(conteudo_ids) == 1 else None,
        total_targets=len(targets),
    )
    await repo.inserir_targets(job_id=str(job["id"]), targets=targets)
    detail = await get_job_detail(session=session, job_id=str(job["id"]))
    return detail or {"job": job, "targets": targets}


async def get_job_detail(*, session: AsyncSession, job_id: str) -> dict[str, Any] | None:
    repo = PersonalizacaoJobsRepository(session)
    job = await repo.get_job(job_id)
    if not job:
        return None
    targets = await repo.get_targets(job_id)
    return {"job": job, "targets": targets}


async def _seed_progress(
    *,
    session: AsyncSession,
    record: dict[str, Any],
) -> None:
    progress_repo = PersonalizacaoProgressoRepository(session)
    for step in build_personalizacao_steps(record):
        await progress_repo.upsert(
            personalizacao_id=int(record["id"]),
            aluno_id=str(record["aluno_id"]),
            classe_id=int(record.get("classe_id") or 0),
            topico_id=int(record.get("topico_id") or 0),
            item_key=str(step.get("key") or step.get("item_key") or f"item:{step.get('index', 0)}"),
            item_kind=str(step.get("kind") or step.get("item_kind") or "conteudo"),
            item_title=str(step.get("title") or step.get("item_title") or "Item personalizado"),
            status="em_andamento",
            percentual_concluido=0,
            acertos_percentual=None,
            tempo_gasto_min=0,
            pontuacao_obtida=None,
            pontuacao_maxima=float(step.get("pontuacao_maxima") or 0) or None,
            metadata={"seeded_by_job": True},
        )


async def _cleanup_target(
    *,
    session: AsyncSession,
    classe_id: int,
    aluno_id: str,
    topico_id: int,
) -> dict[str, Any]:
    progress_repo = PersonalizacaoProgressoRepository(session)
    # Conteudos/cards personalizados são compartilhados por perfil.
    # Cleanup remove apenas dados estritamente do aluno removido.
    await progress_repo.remover_por_aluno_classe(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
    )
    await session.execute(
        text(
            """
            DELETE FROM materiais_gerados
            WHERE aluno_id = CAST(:aluno_id AS UUID)
              AND conteudo_id IN (
                SELECT id
                FROM conteudos
                WHERE topico_id = :topico_id
              )
            """
        ),
        {"aluno_id": aluno_id, "topico_id": topico_id},
    )
    await session.commit()
    return {"cleanup": True}



async def _process_target(
    *,
    app: FastAPI,
    session: AsyncSession,
    job: dict[str, Any],
    target: dict[str, Any],
) -> dict[str, Any]:
    aluno_id = str(target["aluno_id"])
    topico_id = int(target["topico_id"])
    conteudo_id = int(target["conteudo_id"]) if target.get("conteudo_id") is not None else None
    classe_id = int(job["classe_id"])
    job_payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}
    target_profile_map = (
        job_payload.get("target_profile_map")
        if isinstance(job_payload.get("target_profile_map"), dict)
        else {}
    )
    target_profile_key = _normalize_profile_key(
        target_profile_map.get(
            _target_profile_map_key(aluno_id=aluno_id, topico_id=topico_id, conteudo_id=conteudo_id)
        )
        or job_payload.get("brainhex_profile_key")
        or "mastermind"
    )
    target_profile_label = _profile_key_to_label(target_profile_key)

    if job["kind"] == JOB_KIND_CLEANUP:
        return await _cleanup_target(
            session=session,
            classe_id=classe_id,
            aluno_id=aluno_id,
            topico_id=topico_id,
        )

    # Jobs media_render são legados — BrainHex é responsável por gerar as mídias.
    # Redireciona disparando BrainHex para o personalizacao_id já existente.
    if job["kind"] in _MEDIA_RENDER_KINDS:
        personalizacao_id = target.get("personalizacao_id")
        if personalizacao_id is not None:
            repo_cp = ConteudoPersonalizadoRepository(session)
            record = await repo_cp.buscar_por_id(int(personalizacao_id))
            if record:
                from app.services.storage import build_public_storage_url
                fontes_repo = FontesPersonalizacaoRepository(session)
                fontes_raw = await fontes_repo.listar_para_contexto(
                    classe_id=classe_id,
                    topico_id=topico_id,
                    conteudo_id=conteudo_id,
                    aluno_id=aluno_id,
                )
                supabase_base = str(getattr(app.state.settings, "supabase_url", "") or "").strip()
                fontes = []
                for f in fontes_raw:
                    public_url = str(f.get("arquivo_url") or f.get("url") or "").strip()
                    if not public_url:
                        storage_path = str(f.get("storage_path") or "").strip()
                        bucket = str(f.get("bucket") or BUCKET).strip()
                        if storage_path and supabase_base:
                            public_url = build_public_storage_url(supabase_base, bucket, storage_path) or ""
                    if public_url:
                        fontes.append({"url": public_url, "mime_type": str(f.get("mime_type") or ""), "tipo": str(f.get("tipo") or "documento")})
                perfil = target_profile_key
                asyncio.create_task(
                    disparar_brainhex_async(
                        settings=app.state.settings,
                        perfil=perfil,
                        fontes=fontes,
                        personalizacao_id=int(personalizacao_id),
                        aluno_id=aluno_id,
                        classe_id=classe_id,
                        topico_id=topico_id,
                    )
                )
                return {"record": record}
        return {"skipped": True}

    ctx = await fetch_personalizacao_context(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        settings=app.state.settings,
        session=session,
    )

    ctx["perfil_dominante"] = target_profile_label
    ctx["perfil_brainhex"] = [{"perfil": target_profile_label, "afinidade": 1.0}]

    repo = ConteudoPersonalizadoRepository(session)
    existing = await repo.buscar_mais_recente_por_perfil(
        classe_id=classe_id,
        topico_id=topico_id,
        brainhex_profile_key=target_profile_key,
        source_hash=str(ctx["source_hash"] or ""),
    )
    if existing:
        return {"skipped": True, "record": existing}

    cards_payload = await gerar_cards_direto(
        perfil=ctx["perfil_dominante"],
        conteudo_classe=ctx["conteudo_classe"],
        contexto_aluno=ctx["contexto_aluno"],
        perfil_brainhex=ctx["perfil_brainhex"],
        settings=app.state.settings,
    )

    repo_artefatos = ArtefatosPersonalizadosRepository(session)
    await repo_artefatos.marcar_ciclos_anteriores_obsoletos(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        ciclo_id=ctx["ciclo_id"],
        brainhex_profile_key=target_profile_key,
    )
    cards_list = (
        cards_payload if isinstance(cards_payload, list)
        else (cards_payload.get("cards") if isinstance(cards_payload, dict) else [])
    )
    saved_cards = await repo_artefatos.salvar_cards(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        ciclo_id=ctx["ciclo_id"],
        brainhex_profile_key=target_profile_key,
        source_hash=str(ctx.get("source_hash") or ""),
        cards=cards_list if isinstance(cards_list, list) else [],
    )
    cards_ids = [c["id"] for c in saved_cards if isinstance(c, dict) and c.get("id")]

    record_id = await repo.salvar(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        ciclo_id=ctx["ciclo_id"],
        plano={
            "perfil_dominante": target_profile_label,
            "brainhex_profile_key": target_profile_key,
            "justificativa": "Conteudo compartilhado por perfil BrainHex.",
            "formatos": ["cards", "audio", "apresentacao", "markdown"],
            "refresh_policy": {"mode": "once", "trigger_actions": []},
            "cards_personalizados_ids": cards_ids,
        },
        materiais={},
        ai_patch=None,
        status="processando_midias",
        source_hash=ctx["source_hash"],
        formato_prioritario="cards",
        formatos_gerados=["cards"],
    )

    record = await repo.buscar_por_id(int(record_id)) or {}
    if not record:
        raise RuntimeError("Personalizacao nao retornou registro persistido apos salvar.")
    await _seed_progress(session=session, record=record)

    asyncio.create_task(
        disparar_brainhex_async(
            settings=app.state.settings,
            perfil=ctx["perfil_dominante"],
            fontes=ctx["fontes"],
            personalizacao_id=int(record_id),
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            ciclo_id=ctx["ciclo_id"],
        )
    )

    return {"record": record}


async def process_personalizacao_job_once(app: FastAPI) -> bool:
    session_factory = app.state.session_factory
    async with session_factory() as session:
        repo = PersonalizacaoJobsRepository(session)
        job = await repo.claim_next_job()
    if not job:
        return False

    async with session_factory() as session:
        repo = PersonalizacaoJobsRepository(session)
        if job["kind"] == JOB_KIND_CLASS_THEME:
            try:
                await gerar_classe_mapa_tema(
                    session=session,
                    settings=app.state.settings,
                    classe_id=int(job["classe_id"]),
                    trigger_source=str(job.get("trigger_source") or "job_worker"),
                )
                await repo.finalize_job(
                    job_id=str(job["id"]),
                    status="completed",
                    last_error=None,
                )
            except Exception as exc:
                logger.exception(
                    "Falha ao processar job de mapa de tema da classe",
                    extra={"job_id": str(job.get("id")), "classe_id": job.get("classe_id")},
                )
                await session.rollback()
                await repo.finalize_job(
                    job_id=str(job["id"]),
                    status="failed",
                    last_error=str(exc),
                )
            return True

        try:
            targets = await repo.get_targets(str(job["id"]))
        except Exception:
            logger.exception("Falha ao carregar targets do job de personalizacao", extra={"job_id": str(job["id"])})
            await session.rollback()
            await repo.finalize_job(
                job_id=str(job["id"]),
                status="failed",
                last_error="falha ao carregar targets",
            )
            return True

        max_retries = int(app.state.settings.personalizacao_job_max_retries)
        errors = 0

        for target in targets:
            if target.get("status") in TARGET_DONE_STATES:
                continue

            attempts = int(target.get("attempts") or 0) + 1
            try:
                await repo.update_target_status(
                    target_id=int(target["id"]),
                    status="processing",
                    attempts=attempts,
                    last_error=None,
                )
            except Exception:
                logger.exception(
                    "Falha ao marcar target como processing",
                    extra={"job_id": str(job["id"]), "target_id": target.get("id")},
                )
                await session.rollback()
                continue

            try:
                outcome = await _process_target(app=app, session=session, job=job, target=target)
                record = outcome.get("record") if isinstance(outcome, dict) else None
                target_status = "skipped" if outcome.get("skipped") else "completed"
                target_error: str | None = None
                await repo.update_target_status(
                    target_id=int(target["id"]),
                    status=target_status,
                    attempts=attempts,
                    last_error=target_error,
                    personalizacao_id=record.get("id") if isinstance(record, dict) else None,
                )
            except Exception as exc:
                errors += 1
                await session.rollback()
                failed_status = "pending" if attempts < max_retries else "failed"
                try:
                    await repo.update_target_status(
                        target_id=int(target["id"]),
                        status=failed_status,
                        attempts=attempts,
                        last_error=str(exc),
                    )
                except Exception:
                    logger.exception(
                        "Falha ao atualizar status apos erro do target",
                        extra={"job_id": str(job["id"]), "target_id": target.get("id")},
                    )
                    await session.rollback()
                logger.exception(
                    "Falha ao processar target de personalizacao",
                    extra={
                        "job_id": str(job["id"]),
                        "target_id": target.get("id"),
                        "aluno_id": target.get("aluno_id"),
                        "topico_id": target.get("topico_id"),
                    },
                )

        try:
            refreshed = await repo.refresh_job_counters(str(job["id"]))
            targets = await repo.get_targets(str(job["id"]))
            has_failed = any(target.get("status") == "failed" for target in targets)
            has_pending = any(target.get("status") not in TARGET_DONE_STATES for target in targets)
            final_status = "completed"
            if has_failed and refreshed and int(refreshed.get("processed_targets") or 0) > 0:
                final_status = "partial"
            if has_failed and refreshed and int(refreshed.get("processed_targets") or 0) == int(refreshed.get("error_count") or 0):
                final_status = "failed"
            if has_pending:
                final_status = "partial"

            await repo.finalize_job(
                job_id=str(job["id"]),
                status=final_status,
                last_error=f"{errors} target(s) com falha" if errors else None,
            )
        except Exception:
            logger.exception("Falha ao finalizar job de personalizacao", extra={"job_id": str(job["id"])})
            await session.rollback()
    return True


async def personalizacao_jobs_loop(app: FastAPI) -> None:
    concurrency = max(1, int(app.state.settings.personalizacao_job_concurrency))
    poll_sec = max(1, int(app.state.settings.personalizacao_job_poll_sec))
    max_backoff_sec = max(
        poll_sec,
        int(getattr(app.state.settings, "personalizacao_job_db_failure_max_backoff_sec", MAX_DB_FAILURE_BACKOFF_SEC) or MAX_DB_FAILURE_BACKOFF_SEC),
    )
    transient_log_interval_sec = max(
        5,
        int(getattr(app.state.settings, "personalizacao_job_db_failure_log_interval_sec", DB_FAILURE_LOG_INTERVAL_SEC) or DB_FAILURE_LOG_INTERVAL_SEC),
    )
    semaphore = asyncio.Semaphore(concurrency)
    failure_streak = 0
    last_transient_signature = ""
    last_transient_log_at = 0.0
    suppressed_transient_logs = 0

    async def _run_once() -> tuple[bool, Exception | None]:
        async with semaphore:
            try:
                return await process_personalizacao_job_once(app), None
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                return False, exc

    while True:
        processed_any = False
        loop_error: Exception | None = None
        for _ in range(concurrency):
            processed, current_error = await _run_once()
            processed_any = processed_any or processed
            if current_error is not None:
                loop_error = current_error
                break
            if not processed:
                break
        if loop_error is not None:
            if _is_transient_db_connection_error(loop_error):
                app.state.personalizacao_jobs_db_unavailable = True
                app.state.personalizacao_jobs_last_db_error = _compact_exception_text(loop_error)
                failure_streak += 1
                backoff_sec = _compute_failure_backoff_sec(
                    poll_sec=poll_sec,
                    failure_streak=failure_streak,
                    max_backoff_sec=max_backoff_sec,
                )
                signature = _exception_signature(loop_error)
                now = asyncio.get_running_loop().time()
                should_log = (
                    failure_streak == 1
                    or signature != last_transient_signature
                    or (now - last_transient_log_at) >= transient_log_interval_sec
                )
                if should_log:
                    logger.warning(
                        "Loop de personalizacao_jobs em modo de reconexao com banco (streak=%s, espera=%ss, erro=%s, suprimidos=%s)",
                        failure_streak,
                        backoff_sec,
                        _compact_exception_text(loop_error),
                        suppressed_transient_logs,
                    )
                    logger.debug("Detalhes do erro transiente de banco", exc_info=True)
                    last_transient_signature = signature
                    last_transient_log_at = now
                    suppressed_transient_logs = 0
                else:
                    suppressed_transient_logs += 1

                await asyncio.sleep(backoff_sec)
                continue

            app.state.personalizacao_jobs_db_unavailable = False
            app.state.personalizacao_jobs_last_db_error = None
            logger.exception("Loop de personalizacao_jobs falhou durante execucao")
            await asyncio.sleep(poll_sec)
            continue

        app.state.personalizacao_jobs_db_unavailable = False
        app.state.personalizacao_jobs_last_db_error = None
        if failure_streak > 0:
            logger.info(
                "Loop de personalizacao_jobs recuperou conexao com banco apos %s falha(s) transiente(s)",
                failure_streak,
            )
        failure_streak = 0
        last_transient_signature = ""
        suppressed_transient_logs = 0

        if not processed_any:
            await asyncio.sleep(poll_sec)
            continue

        await asyncio.sleep(0)
