from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

JOB_KIND_MEDIA_GENERATION = "media_generation"

_BLOCK_MEDIA_KINDS = ("enriquecimento", "capitulo")
_PART_MEDIA_KINDS = ("audio", "apresentacao")


async def criar_ciclo_media_generation(
    *,
    jobs_repo: Any,
    classe_id: int,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None,
    brainhex_profile_key: str,
    ciclo_id: str,
    source_hash: str,
    base_blocks: list[dict[str, Any]],
    trigger_source: str,
) -> dict[str, Any]:
    """Busca um job media_generation aberto (status != completed) para o
    mesmo (classe, topico, conteudo, aluno, perfil, source_hash) e reaproveita
    - inclusive reabrindo um job failed. So cria um job novo (e os targets de
    Fase A, um enriquecimento + um capitulo por bloco) quando nao existe
    nenhum aberto ainda."""
    existing = await jobs_repo.find_open_job_by_payload(
        kind=JOB_KIND_MEDIA_GENERATION,
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        source_hash=source_hash,
        brainhex_profile_key=brainhex_profile_key,
    )
    if existing:
        logger.info(
            "media_generation: reaproveitando job aberto %s (status=%s)",
            existing["id"],
            existing.get("status"),
        )
        return existing

    job = await jobs_repo.criar_job(
        kind=JOB_KIND_MEDIA_GENERATION,
        classe_id=classe_id,
        trigger_source=trigger_source,
        payload={
            "ciclo_id": ciclo_id,
            "source_hash": source_hash,
            "brainhex_profile_key": brainhex_profile_key,
        },
        aluno_id=aluno_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        total_targets=len(base_blocks) * 2,
        commit=False,
    )

    targets = []
    for block in base_blocks:
        block_id = str(block["id"])
        for media_kind in _BLOCK_MEDIA_KINDS:
            targets.append({
                "aluno_id": aluno_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "brainhex_profile_key": brainhex_profile_key,
                "media_kind": media_kind,
                "block_id": block_id,
                "part_ordem": None,
                "status": "pending",
            })
    await jobs_repo.inserir_targets_media_generation(job_id=str(job["id"]), targets=targets)
    return job
