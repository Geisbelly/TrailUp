from __future__ import annotations

import asyncio
import copy
import logging
import socket
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.fontes_personalizacao import FontesPersonalizacaoRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository
from app.repositories.personalizacao_progresso import PersonalizacaoProgressoRepository
from app.services.classe_mapa_tema import gerar_classe_mapa_tema
from app.services.content_enrichment import enrich_content_blocks
from app.services.media_agents import brainhex_contract_ready, disparar_brainhex_async
from app.services.media_contract import (
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_ENGINE_VERSION,
)
from app.services.personalizacao import (
    _build_profile_editorial_context,
    _materialize_and_upload_media_assets,
    build_personalizacao_steps,
    fetch_personalizacao_context,
    gerar_cards_direto,
)
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
_REQUIRED_BRAINHEX_MEDIA = ("audio", "markdown", "apresentacao")
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
        "socializer": "Socializer",
        "achiever": "Achiever",
    }
    return labels.get(key, "Mastermind")


def _effective_stale_processing_min(settings: Any) -> int:
    configured = max(
        1,
        int(getattr(settings, "personalizacao_job_stale_processing_min", 40) or 40),
    )
    wait_timeout_sec = max(
        30,
        int(getattr(settings, "brainhex_api_wait_timeout_sec", 1980) or 1980),
    )
    enrichment_timeout_sec = min(900, max(60, wait_timeout_sec))
    # O target primeiro aprofunda o conteúdo e depois aguarda a geração de
    # mídia. Só pode ser reclamado após as duas janelas, mais cinco minutos de
    # margem operacional.
    total_external_timeout_sec = enrichment_timeout_sec + wait_timeout_sec
    return max(configured, ((total_external_timeout_sec + 59) // 60) + 5)


def _build_generation_key(*, ciclo_id: Any, source_hash: Any) -> str:
    cycle = str(ciclo_id or "").strip()
    source = str(source_hash or "").strip()
    if not cycle or not source:
        raise RuntimeError("Personalizacao sem ciclo_id/source_hash para proteger a geracao.")
    return f"{cycle}:{source}"


def _assert_brainhex_media_completed(
    record: dict[str, Any],
    *,
    ciclo_id: str,
    source_hash: str,
    generation_key: str,
) -> None:
    record_cycle_id = str(record.get("ciclo_id") or "")
    record_source_hash = str(record.get("source_hash") or "")
    if record_cycle_id != ciclo_id:
        raise RuntimeError("Resultado descartado: o ciclo da personalizacao mudou durante a geracao.")
    if record_source_hash != source_hash:
        raise RuntimeError("Resultado descartado: a fonte da personalizacao mudou durante a geracao.")
    incomplete = _incomplete_brainhex_media_for_generation(
        record,
        generation_key=generation_key,
    )
    if str(record.get("status") or "").strip().lower() != "pronto" or incomplete:
        missing = ", ".join(incomplete) if incomplete else "status pronto"
        raise RuntimeError(
            f"Microservico respondeu sem persistir todas as midias obrigatorias: {missing}."
        )


def _incomplete_brainhex_media_for_generation(
    record: dict[str, Any],
    *,
    generation_key: str,
) -> list[str]:
    materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
    incomplete: list[str] = []
    for media_kind in _REQUIRED_BRAINHEX_MEDIA:
        material = materiais.get(media_kind)
        metadata = material.get("metadata") if isinstance(material, dict) else {}
        if (
            not isinstance(metadata, dict)
            or metadata.get("status") != "completed"
            or metadata.get("generation_key") != generation_key
            or (
                media_kind == "apresentacao"
                and (
                    metadata.get("engine") != PRESENTATION_ENGINE_VERSION
                    or metadata.get("media_pipeline_version") != MEDIA_PIPELINE_VERSION
                )
            )
        ):
            incomplete.append(media_kind)
    return incomplete


def _has_completed_current_generation(
    record: dict[str, Any],
    *,
    ciclo_id: str,
    source_hash: str,
    generation_key: str,
) -> bool:
    return (
        str(record.get("ciclo_id") or "") == ciclo_id
        and str(record.get("source_hash") or "") == source_hash
        and not _incomplete_brainhex_media_for_generation(
            record,
            generation_key=generation_key,
        )
    )


async def _normalize_completed_generation_status(
    *,
    repo: ConteudoPersonalizadoRepository,
    record: dict[str, Any],
    ciclo_id: str,
    source_hash: str,
    generation_key: str,
) -> dict[str, Any] | None:
    if not _has_completed_current_generation(
        record,
        ciclo_id=ciclo_id,
        source_hash=source_hash,
        generation_key=generation_key,
    ):
        return None
    if str(record.get("status") or "").strip().lower() == "pronto":
        return record

    normalized = await repo.atualizar_status(
        record_id=int(record["id"]),
        status="pronto",
        ciclo_id=ciclo_id,
        source_hash=source_hash,
    )
    if not normalized:
        return None
    current = await repo.buscar_por_id(int(record["id"]))
    if (
        current
        and str(current.get("status") or "").strip().lower() == "pronto"
        and _has_completed_current_generation(
            current,
            ciclo_id=ciclo_id,
            source_hash=source_hash,
            generation_key=generation_key,
        )
    ):
        return current
    return None


async def _mark_failed_unless_generation_completed(
    *,
    repo: ConteudoPersonalizadoRepository,
    record_id: int,
    ciclo_id: str,
    source_hash: str,
    generation_key: str,
) -> dict[str, Any] | None:
    marked = await repo.atualizar_status(
        record_id=record_id,
        status="failed",
        ciclo_id=ciclo_id,
        source_hash=source_hash,
        preserve_completed_generation_key=generation_key,
    )
    if marked:
        return None

    current = await repo.buscar_por_id(record_id)
    if not current:
        return None
    return await _normalize_completed_generation_status(
        repo=repo,
        record=current,
        ciclo_id=ciclo_id,
        source_hash=source_hash,
        generation_key=generation_key,
    )


async def _get_runtime_cached_dict(
    *,
    job: dict[str, Any],
    cache_name: str,
    locks_name: str,
    key: str,
    factory: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    cache = job.setdefault(cache_name, {})
    errors = job.setdefault(f"{cache_name}_errors", {})
    cached = cache.get(key)
    if isinstance(cached, dict):
        return cached
    cached_error = errors.get(key)
    if isinstance(cached_error, Exception):
        raise cached_error

    locks = job.setdefault(locks_name, {})
    lock = locks.setdefault(key, asyncio.Lock())
    async with lock:
        cached = cache.get(key)
        if isinstance(cached, dict):
            return cached
        cached_error = errors.get(key)
        if isinstance(cached_error, Exception):
            raise cached_error
        try:
            generated = await factory()
        except Exception as exc:
            # Os sete perfis compartilham o mesmo enriquecimento-base. Se a
            # chamada falhar, todos recebem a mesma falha nesta tentativa do
            # job, em vez de bombardear o provedor sete vezes em sequência.
            errors[key] = exc
            raise
        if not isinstance(generated, dict):
            raise RuntimeError(f"Cache runtime {cache_name} recebeu valor invalido.")
        errors.pop(key, None)
        cache[key] = generated
        return generated


def _content_enrichment_cache_key(
    *,
    topico_id: int,
    conteudo_id: int | None,
    source_hash: Any,
) -> str:
    # O enriquecimento descreve o currículo-base e é deliberadamente
    # independente do aluno/perfil. A adaptação BrainHex acontece depois.
    return f"{topico_id}:{conteudo_id or 0}:{str(source_hash or '').strip()}"


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


def _pending_media_formats(materiais: dict[str, Any]) -> list[str]:
    return [k for k, v in materiais.items() if (v.get("metadata") or {}).get("status") == "pending"]


def _mark_pending_media_failed(materiais: dict[str, Any], *, error: str) -> dict[str, Any]:
    result = {}
    for fmt, entry in materiais.items():
        meta = dict((entry.get("metadata") or {}))
        if meta.get("status") == "pending":
            meta["status"] = "failed"
            meta["error"] = error
        result[fmt] = {**entry, "metadata": meta}
    return result


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
    has_explicit_conteudos = bool(conteudo_ids)
    if has_explicit_conteudos:
        normalized_conteudo_ids = sorted(
            {int(item) for item in conteudo_ids if item is not None}
        )
        conteudos_por_topico = await classe_repo.mapear_conteudos_por_topico(
            normalized_conteudo_ids,
            classe_id=classe_id,
        )
        # Quando o caller informa conteúdos, esse é o escopo exato. Não
        # convertemos IDs inválidos em uma geração agregada do tópico.
        resolved_topicos = sorted(conteudos_por_topico)
        if not resolved_topicos:
            return [], [], {}

    alunos_da_classe = await classe_repo.listar_alunos_classe_com_perfil_dominante(classe_id)
    alunos = [item["aluno_id"] for item in alunos_da_classe]
    profile_by_aluno = {
        str(item["aluno_id"]): _normalize_profile_key(item.get("perfil_dominante"))
        for item in alunos_da_classe
    }

    if not resolved_topicos:
        resolved_topicos = [int(item["id"]) for item in await classe_repo.listar_topicos_classe(classe_id)]
    if not has_explicit_conteudos:
        conteudos_por_topico = await classe_repo.mapear_todos_conteudos_por_topicos(
            resolved_topicos,
            classe_id=classe_id,
        )

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
            "brainhex_profile_key": _normalize_profile_key(profile_key),
            "is_profile_template": (
                profile_by_aluno.get(owner_aluno_id) != _normalize_profile_key(profile_key)
            ),
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

    if kind == JOB_KIND_CLEANUP:
        selected_aluno_id = str(aluno_id) if aluno_id else None
        if not selected_aluno_id:
            return [], resolved_topicos, {}
        selected_profile = profile_by_aluno.get(selected_aluno_id, "mastermind")
        for current_topico_id in resolved_topicos:
            _append_target(
                owner_aluno_id=selected_aluno_id,
                topico_id=current_topico_id,
                conteudo_id=None,
                profile_key=selected_profile,
            )
        return targets, resolved_topicos, target_profile_map

    if kind in {
        JOB_KIND_ENROLLMENT,
        JOB_KIND_CLASS_DELTA,
        JOB_KIND_FULL_SYNC,
        JOB_KIND_MANUAL_RETRY,
    }:
        if not alunos:
            return [], resolved_topicos, {}

        representative_by_profile: dict[str, str] = {}

        for profile_key in _BRAINHEX_PROFILE_KEYS:
            candidate = next(
                (
                    aluno
                    for aluno in alunos
                    if profile_by_aluno.get(aluno) == profile_key
                ),
                None,
            )
            if candidate is None:
                candidate = str(aluno_id) if aluno_id and str(aluno_id) in alunos else alunos[0]
            representative_by_profile[profile_key] = candidate

        for current_topico_id in resolved_topicos:
            scoped_conteudo_ids: list[int | None] = list(
                conteudos_por_topico.get(current_topico_id) or [None]
            )
            for current_conteudo_id in scoped_conteudo_ids:
                for profile_key in _BRAINHEX_PROFILE_KEYS:
                    owner_aluno_id = representative_by_profile.get(profile_key)
                    if not owner_aluno_id:
                        continue
                    _append_target(
                        owner_aluno_id=owner_aluno_id,
                        topico_id=current_topico_id,
                        conteudo_id=current_conteudo_id,
                        profile_key=profile_key,
                    )
        return targets, resolved_topicos, target_profile_map

    for current_aluno_id in alunos:
        current_profile = profile_by_aluno.get(current_aluno_id, "mastermind")
        for current_topico_id in resolved_topicos:
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
    job = await repo.criar_job_com_targets(
        kind=kind,
        classe_id=classe_id,
        trigger_source=trigger_source,
        targets=targets,
        payload=job_payload,
        aluno_id=aluno_id if kind in {JOB_KIND_ENROLLMENT, JOB_KIND_CLEANUP} else None,
        topico_id=resolved_topicos[0] if len(resolved_topicos) == 1 else None,
        conteudo_id=conteudo_ids[0] if conteudo_ids and len(conteudo_ids) == 1 else None,
    )
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



async def _process_media_render_target(
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
        target.get("brainhex_profile_key")
        or target_profile_map.get(
            _target_profile_map_key(aluno_id=aluno_id, topico_id=topico_id, conteudo_id=conteudo_id)
        )
        or job_payload.get("brainhex_profile_key")
        or "mastermind"
    )
    target_profile_label = _profile_key_to_label(target_profile_key)

    if job.get("kind") == JOB_KIND_CLEANUP:
        return await _cleanup_target(
            session=session,
            classe_id=classe_id,
            aluno_id=aluno_id,
            topico_id=topico_id,
        )

    # Jobs media_render são legados — BrainHex é responsável por gerar as mídias.
    # Redireciona disparando BrainHex para o personalizacao_id já existente.
    if not await brainhex_contract_ready(settings=app.state.settings):
        return {
            "deferred": True,
            "reason": "microservice_midia_incompativel_ou_indisponivel",
        }

    if job.get("kind") in _MEDIA_RENDER_KINDS:
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
                    page_size=int(
                        getattr(
                            app.state.settings,
                            "personalizacao_source_page_size",
                            100,
                        )
                        or 100
                    ),
                    max_items=int(
                        getattr(
                            app.state.settings,
                            "personalizacao_max_context_sources",
                            400,
                        )
                        or 400
                    ),
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
                record_plan = record.get("plano") if isinstance(record.get("plano"), dict) else {}
                stored_enrichment = (
                    record_plan.get("content_enrichment")
                    if isinstance(record_plan.get("content_enrichment"), dict)
                    else {}
                )
                record_cycle_id = str(record.get("ciclo_id") or "")
                record_source_hash = str(record.get("source_hash") or "")
                generation_key = _build_generation_key(
                    ciclo_id=record_cycle_id,
                    source_hash=record_source_hash,
                )
                # Nao manter transacao/conexao PostgreSQL aberta durante uma
                # geracao que pode levar dezenas de minutos.
                await session.commit()
                dispatched = await disparar_brainhex_async(
                    settings=app.state.settings,
                    perfil=perfil,
                    fontes=fontes,
                    content_blocks=stored_enrichment.get("blocos") or [],
                    personalizacao_id=int(personalizacao_id),
                    aluno_id=aluno_id,
                    classe_id=classe_id,
                    topico_id=topico_id,
                    conteudo_id=conteudo_id,
                    ciclo_id=record_cycle_id,
                    source_hash=record_source_hash,
                    generation_key=generation_key,
                    wait_for_completion=True,
                )
                if not dispatched:
                    recovered = await _mark_failed_unless_generation_completed(
                        repo=repo_cp,
                        record_id=int(personalizacao_id),
                        ciclo_id=record_cycle_id,
                        source_hash=record_source_hash,
                        generation_key=generation_key,
                    )
                    if recovered:
                        return {"record": recovered}
                    raise RuntimeError("Microservico BrainHex nao concluiu a geracao.")
                completed_record = await repo_cp.buscar_por_id(int(personalizacao_id))
                if not completed_record:
                    raise RuntimeError("Personalizacao desapareceu apos a geracao BrainHex.")
                try:
                    _assert_brainhex_media_completed(
                        completed_record,
                        ciclo_id=record_cycle_id,
                        source_hash=record_source_hash,
                        generation_key=generation_key,
                    )
                except RuntimeError:
                    recovered = await _mark_failed_unless_generation_completed(
                        repo=repo_cp,
                        record_id=int(personalizacao_id),
                        ciclo_id=record_cycle_id,
                        source_hash=record_source_hash,
                        generation_key=generation_key,
                    )
                    if recovered:
                        return {"record": recovered}
                    raise
                return {"record": completed_record}
        return {"skipped": True}

    # Legacy path: jobs with media_snapshot + personalizacao_id → direct media materialization
    media_snapshot = job.get("media_snapshot") if isinstance(job.get("media_snapshot"), dict) else {}
    if target.get("personalizacao_id") is not None and media_snapshot is not None:
        personalizacao_id = int(target["personalizacao_id"])
        repo_cp = ConteudoPersonalizadoRepository(session)
        record = await repo_cp.buscar_por_id(personalizacao_id)
        if not record:
            return {"skipped": True}

        pending_formats = _pending_media_formats(record.get("materiais") or {})
        if not pending_formats:
            updated = await repo_cp.atualizar_materiais_e_status(
                record_id=personalizacao_id,
                materiais=record.get("materiais") or {},
                status="failed",
            )
            return {"record": updated}

        shared_rendered = media_snapshot.get("shared_rendered_media") or {}
        slow_payload = media_snapshot.get("slow_payload") or {}
        new_materiais = dict(record.get("materiais") or {})
        to_materialize: dict[str, Any] = {}
        for fmt in pending_formats:
            if fmt in shared_rendered:
                new_materiais[fmt] = shared_rendered[fmt]
            elif fmt in slow_payload:
                to_materialize[fmt] = slow_payload[fmt]

        if to_materialize:
            materialized, _errors = await _materialize_and_upload_media_assets(
                state={},
                settings=app.state.settings,
                media_materiais=to_materialize,
            )
            new_materiais.update(materialized)

        materiais_repo = MateriaisRepository(session)
        existing_rows = await materiais_repo.listar_por_personalizacao(personalizacao_id=personalizacao_id)
        existing_ids: dict[str, int] = {
            str(row.get("tipo")): int(row["id"])
            for row in existing_rows
            if row.get("tipo") and row.get("id") is not None
        }
        if not existing_ids:
            resolved = await materiais_repo.resolver_ids_por_tipo_recente(
                aluno_id=aluno_id,
                conteudo_id=conteudo_id,
                tipos=list(new_materiais.keys()),
                ciclo_id=str(record.get("ciclo_id") or ""),
            )
            existing_ids.update(resolved)

        jobs_repo = PersonalizacaoJobsRepository(session)
        for fmt, mat in new_materiais.items():
            if not isinstance(mat, dict):
                continue
            mat_id = existing_ids.get(fmt)
            if mat_id:
                await materiais_repo.patch_materiais_media(
                    material_id=int(mat_id),
                    arquivo_url=mat.get("arquivo_url"),
                    storage_path=mat.get("storage_path"),
                    metadata_patch=mat.get("metadata") if isinstance(mat.get("metadata"), dict) else None,
                )
        await jobs_repo.update_job_media_snapshot(
            job_id=str(job["id"]),
            media_snapshot={},
        )
        updated = await repo_cp.atualizar_materiais_e_status(
            record_id=personalizacao_id,
            materiais=new_materiais,
            status="pronto",
        )
        return {"record": updated}

    context_cache_key = f"{aluno_id}:{topico_id}:{conteudo_id or 0}"

    async def _fetch_context() -> dict[str, Any]:
        return await fetch_personalizacao_context(
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            settings=app.state.settings,
            session=session,
            include_student_sources=False,
        )

    cached_context = await _get_runtime_cached_dict(
        job=job,
        cache_name="_runtime_personalizacao_context",
        locks_name="_runtime_personalizacao_context_locks",
        key=context_cache_key,
        factory=_fetch_context,
    )
    ctx = copy.deepcopy(cached_context)

    ctx["perfil_dominante"] = target_profile_label
    ctx["perfil_brainhex"] = [{"perfil": target_profile_label, "afinidade": 1.0}]

    repo = ConteudoPersonalizadoRepository(session)
    existing = await repo.buscar_mais_recente_por_perfil(
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        brainhex_profile_key=target_profile_key,
        source_hash=str(ctx["source_hash"] or ""),
    )
    if existing:
        existing_status = str(existing.get("status") or "").strip().lower()
        retry_failed = existing_status in {"failed", "falha"}
        existing_cycle_id = str(existing.get("ciclo_id") or "")
        existing_source_hash = str(existing.get("source_hash") or ctx.get("source_hash") or "")
        generation_key = _build_generation_key(
            ciclo_id=existing_cycle_id,
            source_hash=existing_source_hash,
        )
        completed_existing = await _normalize_completed_generation_status(
            repo=repo,
            record=existing,
            ciclo_id=existing_cycle_id,
            source_hash=existing_source_hash,
            generation_key=generation_key,
        )
        if completed_existing:
            return {"skipped": True, "record": completed_existing}

        stale_min = _effective_stale_processing_min(app.state.settings)
        claimed = await repo.claim_retry_incomplete_generation(
            record_id=int(existing["id"]),
            ciclo_id=existing_cycle_id,
            source_hash=existing_source_hash,
            generation_key=generation_key,
            stale_processing_min=stale_min,
        )
        retry_stuck = existing_status == "processando_midias" and claimed is not None
        if claimed is None:
            current = await repo.buscar_por_id(int(existing["id"]))
            completed_current = (
                await _normalize_completed_generation_status(
                    repo=repo,
                    record=current,
                    ciclo_id=existing_cycle_id,
                    source_hash=existing_source_hash,
                    generation_key=generation_key,
                )
                if current
                else None
            )
            if completed_current:
                return {"skipped": True, "record": completed_current}
            # Outro worker ainda esta processando esta mesma geracao, ou a
            # geracao mudou entre a leitura e o CAS. O target permanece
            # pendente sem consumir uma tentativa nem virar terminal.
            return {
                "deferred": True,
                "record": current or existing,
                "reason": "geracao_atual_em_processamento",
            }
        existing = claimed
        completed_claimed = await _normalize_completed_generation_status(
            repo=repo,
            record=existing,
            ciclo_id=existing_cycle_id,
            source_hash=existing_source_hash,
            generation_key=generation_key,
        )
        if completed_claimed:
            return {"skipped": True, "record": completed_claimed}

        if retry_failed:
            logger.info(
                "retry de personalizacao preservou materiais parciais via CAS: "
                "personalizacao_id=%s ciclo_id=%s",
                existing["id"],
                existing_cycle_id,
            )

        # Enriquecimento e geracao sao chamadas externas longas. Libera a
        # transacao iniciada pelas leituras acima antes de aguarda-las.
        await session.commit()
        cache_key = _content_enrichment_cache_key(
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            source_hash=ctx.get("source_hash"),
        )

        async def _enrich_existing() -> dict[str, Any]:
            return await enrich_content_blocks(
                context=ctx,
                settings=app.state.settings,
            )

        content_enrichment = await _get_runtime_cached_dict(
            job=job,
            cache_name="_runtime_content_enrichment",
            locks_name="_runtime_content_enrichment_locks",
            key=cache_key,
            factory=_enrich_existing,
        )

        logger.warning(
            "personalizacao incompleta detectada, redisparando geracao: "
            "personalizacao_id=%s topico=%s aluno=%s status=%s",
            existing["id"],
            topico_id,
            aluno_id,
            existing_status,
        )
        dispatched = await disparar_brainhex_async(
            settings=app.state.settings,
            perfil=ctx["perfil_dominante"],
            fontes=ctx["fontes"],
            content_blocks=content_enrichment.get("blocos") or [],
            personalizacao_id=int(existing["id"]),
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            ciclo_id=existing_cycle_id,
            source_hash=existing_source_hash,
            generation_key=generation_key,
            wait_for_completion=True,
        )
        if not dispatched:
            recovered = await _mark_failed_unless_generation_completed(
                repo=repo,
                record_id=int(existing["id"]),
                ciclo_id=existing_cycle_id,
                source_hash=existing_source_hash,
                generation_key=generation_key,
            )
            if recovered:
                return {
                    "record": recovered,
                    "retried_stuck": retry_stuck,
                    "retried_failed": retry_failed,
                }
            raise RuntimeError("Microservico BrainHex nao concluiu a geracao.")

        completed_record = await repo.buscar_por_id(int(existing["id"]))
        if not completed_record:
            raise RuntimeError("Personalizacao desapareceu apos a geracao BrainHex.")
        try:
            _assert_brainhex_media_completed(
                completed_record,
                ciclo_id=existing_cycle_id,
                source_hash=existing_source_hash,
                generation_key=generation_key,
            )
        except RuntimeError:
            recovered = await _mark_failed_unless_generation_completed(
                repo=repo,
                record_id=int(existing["id"]),
                ciclo_id=existing_cycle_id,
                source_hash=existing_source_hash,
                generation_key=generation_key,
            )
            if recovered:
                return {
                    "record": recovered,
                    "retried_stuck": retry_stuck,
                    "retried_failed": retry_failed,
                }
            raise
        return {
            "record": completed_record,
            "retried_stuck": retry_stuck,
            "retried_failed": retry_failed,
        }

    # fetch_personalizacao_context e a busca de registro iniciam transacao.
    # Enriquecimento/cards chamam provedores externos e nao devem reter a
    # conexao do pool enquanto aguardam.
    await session.commit()
    cache_key = _content_enrichment_cache_key(
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        source_hash=ctx.get("source_hash"),
    )

    async def _enrich_fresh() -> dict[str, Any]:
        return await enrich_content_blocks(
            context=ctx,
            settings=app.state.settings,
        )

    content_enrichment = await _get_runtime_cached_dict(
        job=job,
        cache_name="_runtime_content_enrichment",
        locks_name="_runtime_content_enrichment_locks",
        key=cache_key,
        factory=_enrich_fresh,
    )

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
        conteudo_id=conteudo_id,
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

    perfil_editorial = _build_profile_editorial_context(
        ctx["perfil_dominante"], ctx["perfil_brainhex"]
    )

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
            # Tom/estilo vem da assinatura editorial real do perfil (sem LLM) —
            # essa geracao e a base compartilhada por perfil (sem plano do
            # planejador_conteudo.txt, que so roda no fluxo por aluno).
            "tom": perfil_editorial.get("tom_voz") or "neutro",
            "estilo": perfil_editorial.get("progressao_narrativa") or "direto",
            "nivel": "equilibrado",
            "editorial_metadata": {"perfil_editorial": perfil_editorial},
            "content_enrichment": content_enrichment,
            "profile_template": bool(target.get("is_profile_template")),
        },
        materiais={},
        ai_patch=None,
        status="processando_midias",
        source_hash=ctx["source_hash"],
        formato_prioritario="cards",
        formatos_gerados=["cards"],
        brainhex_profile_key=target_profile_key,
    )

    record = await repo.buscar_por_id(int(record_id)) or {}
    if not record:
        raise RuntimeError("Personalizacao nao retornou registro persistido apos salvar.")
    if not bool(target.get("is_profile_template")):
        await _seed_progress(session=session, record=record)

    record_cycle_id = str(record.get("ciclo_id") or ctx["ciclo_id"])
    record_source_hash = str(record.get("source_hash") or ctx["source_hash"] or "")
    generation_key = _build_generation_key(
        ciclo_id=record_cycle_id,
        source_hash=record_source_hash,
    )
    await session.commit()
    dispatched = await disparar_brainhex_async(
        settings=app.state.settings,
        perfil=ctx["perfil_dominante"],
        fontes=ctx["fontes"],
        content_blocks=content_enrichment.get("blocos") or [],
        personalizacao_id=int(record_id),
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        ciclo_id=record_cycle_id,
        source_hash=record_source_hash,
        generation_key=generation_key,
        wait_for_completion=True,
    )
    if not dispatched:
        recovered = await _mark_failed_unless_generation_completed(
            repo=repo,
            record_id=int(record_id),
            ciclo_id=record_cycle_id,
            source_hash=record_source_hash,
            generation_key=generation_key,
        )
        if recovered:
            return {"record": recovered}
        raise RuntimeError("Microservico BrainHex nao concluiu a geracao.")

    completed_record = await repo.buscar_por_id(int(record_id))
    if not completed_record:
        raise RuntimeError("Personalizacao desapareceu apos a geracao BrainHex.")
    try:
        _assert_brainhex_media_completed(
            completed_record,
            ciclo_id=record_cycle_id,
            source_hash=record_source_hash,
            generation_key=generation_key,
        )
    except RuntimeError:
        recovered = await _mark_failed_unless_generation_completed(
            repo=repo,
            record_id=int(record_id),
            ciclo_id=record_cycle_id,
            source_hash=record_source_hash,
            generation_key=generation_key,
        )
        if recovered:
            return {"record": recovered}
        raise
    return {"record": completed_record}


async def process_personalizacao_job_once(app: FastAPI) -> bool:
    session_factory = app.state.session_factory
    stale_min = _effective_stale_processing_min(app.state.settings)
    partial_retry_delay_sec = max(
        1,
        int(
            getattr(
                app.state.settings,
                "personalizacao_job_partial_retry_delay_sec",
                15,
            )
            or 15
        ),
    )
    async with session_factory() as session:
        repo = PersonalizacaoJobsRepository(session)
        job = await repo.claim_next_job(
            stale_processing_min=stale_min,
            partial_retry_delay_sec=partial_retry_delay_sec,
        )
    if not job:
        return False

    if job["kind"] == JOB_KIND_CLASS_THEME:
        async with session_factory() as session:
            repo = PersonalizacaoJobsRepository(session)
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

    async with session_factory() as session:
        repo = PersonalizacaoJobsRepository(session)
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
    target_concurrency = max(
        1,
        int(getattr(app.state.settings, "personalizacao_media_render_concurrency", 2) or 2),
    )
    target_semaphore = asyncio.Semaphore(target_concurrency)

    async def _process_target(target: dict[str, Any]) -> int:
        if target.get("status") in TARGET_DONE_STATES:
            return 0
        async with target_semaphore, session_factory() as target_session:
            target_repo = PersonalizacaoJobsRepository(target_session)
            attempts = int(target.get("attempts") or 0) + 1
            try:
                await target_repo.update_target_status(
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
                await target_session.rollback()
                return 1

            try:
                outcome = await _process_media_render_target(
                    app=app,
                    session=target_session,
                    job=job,
                    target=target,
                )
                record = outcome.get("record") if isinstance(outcome, dict) else None
                if outcome.get("deferred"):
                    await target_repo.update_target_status(
                        target_id=int(target["id"]),
                        status="pending",
                        attempts=int(target.get("attempts") or 0),
                        last_error=str(
                            outcome.get("reason") or "geracao atual ainda em processamento"
                        ),
                        personalizacao_id=(
                            record.get("id") if isinstance(record, dict) else None
                        ),
                    )
                    return 0
                target_status = "skipped" if outcome.get("skipped") else "completed"
                target_error: str | None = None
                await target_repo.update_target_status(
                    target_id=int(target["id"]),
                    status=target_status,
                    attempts=attempts,
                    last_error=target_error,
                    personalizacao_id=record.get("id") if isinstance(record, dict) else None,
                )
                return 0
            except Exception as exc:
                await target_session.rollback()
                failed_status = "pending" if attempts < max_retries else "failed"
                try:
                    await target_repo.update_target_status(
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
                    await target_session.rollback()
                logger.exception(
                    "Falha ao processar target de personalizacao",
                    extra={
                        "job_id": str(job["id"]),
                        "target_id": target.get("id"),
                        "aluno_id": target.get("aluno_id"),
                        "topico_id": target.get("topico_id"),
                    },
                )
                return 1

    pending_targets = [
        target for target in targets if target.get("status") not in TARGET_DONE_STATES
    ]
    errors = (
        sum(await asyncio.gather(*(_process_target(target) for target in pending_targets)))
        if pending_targets
        else 0
    )

    async with session_factory() as session:
        repo = PersonalizacaoJobsRepository(session)
        try:
            refreshed = await repo.refresh_job_counters(str(job["id"]))
            targets = await repo.get_targets(str(job["id"]))
            has_failed = any(target.get("status") == "failed" for target in targets)
            has_pending = any(target.get("status") not in TARGET_DONE_STATES for target in targets)
            final_status = "completed"
            if has_failed and refreshed and int(refreshed.get("processed_targets") or 0) > 0:
                final_status = "partial"
            if (
                has_failed
                and refreshed
                and int(refreshed.get("processed_targets") or 0)
                == int(refreshed.get("error_count") or 0)
            ):
                final_status = "failed"
            if has_pending:
                final_status = "partial"

            await repo.finalize_job(
                job_id=str(job["id"]),
                status=final_status,
                last_error=f"{errors} target(s) com falha" if errors else None,
            )
        except Exception:
            logger.exception(
                "Falha ao finalizar job de personalizacao",
                extra={"job_id": str(job["id"])},
            )
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
