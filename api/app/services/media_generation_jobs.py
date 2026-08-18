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


class MediaGenerationTargetError(RuntimeError):
    """Erro definitivo ao processar um target de bloco/parte - o worker
    decide status (pending pra retry, ou failed se esgotou tentativas) a
    partir disto, igual ja faz para os outros kinds de job."""


async def processar_target_enriquecimento(
    *,
    blocos_repo: Any,
    job_id: str,
    target: dict[str, Any],
    base_blocks_by_id: dict[str, dict[str, Any]],
    topic: dict[str, Any],
    source_hash: str,
    settings: Any,
    enrich_base_blocks_fn: Any,
) -> bool:
    """Aprofunda SO o bloco deste target (mesmo function que enriquecimento
    em lote usa, chamada com um subconjunto de 1 bloco - retomada de outros
    blocos ja completos fica a cargo de quem monta a lista de targets
    pendentes antes de chegar aqui, nao desta funcao)."""
    block_id = str(target["block_id"])
    base_block = base_blocks_by_id.get(block_id)
    if base_block is None:
        raise MediaGenerationTargetError(
            f"bloco {block_id} nao encontrado nos blocos-base derivados do contexto atual"
        )
    blocks, _metadata = await enrich_base_blocks_fn(
        base_blocks=[base_block],
        topic=topic,
        source_hash=source_hash,
        settings=settings,
    )
    if not blocks:
        raise MediaGenerationTargetError(f"enriquecimento nao retornou resultado para {block_id}")
    await blocos_repo.upsert_enriquecimento(
        job_id=job_id,
        block_id=block_id,
        enriched_payload=blocks[0],
    )
    return True


async def processar_target_capitulo(
    *,
    blocos_repo: Any,
    job_id: str,
    target: dict[str, Any],
    profile: str,
    settings: Any,
    gerar_capitulo_fn: Any,
) -> bool:
    """Gera o capitulo (markdown+audioScript+slides) do bloco deste target -
    exige que o enriquecimento daquele bloco ja esteja persistido (Fase A
    processa enriquecimento antes de capitulo, por bloco - ver orquestracao
    em processar_job_media_generation_once)."""
    block_id = str(target["block_id"])
    rows = await blocos_repo.listar_por_job(job_id=job_id)
    cached = next((r for r in rows if r["block_id"] == block_id), None)
    if not cached or not cached.get("enriched_payload"):
        raise MediaGenerationTargetError(
            f"bloco {block_id} ainda nao tem enriquecimento persistido - target de capitulo nao pode rodar antes"
        )
    result = await gerar_capitulo_fn(
        settings=settings,
        content_blocks=[cached["enriched_payload"]],
        profile=profile,
    )
    chapters = (result or {}).get("chapters") or []
    chapter = next((c for c in chapters if c.get("blockId") == block_id), None)
    if not chapter:
        raise MediaGenerationTargetError(f"geracao de capitulo nao retornou resultado para {block_id}")
    await blocos_repo.upsert_capitulo(
        job_id=job_id,
        block_id=block_id,
        markdown=str(chapter.get("markdown") or ""),
        audio_script=str(chapter.get("audioScript") or ""),
        slides=chapter.get("slides") or [],
    )
    return True


def fase_a_completa(targets: list[dict[str, Any]]) -> bool:
    """True quando TODOS os targets de capitulo (a etapa mais tardia da Fase
    A - cada capitulo so roda depois do enriquecimento do mesmo bloco) estao
    completed. Fase B (por parte) so pode ser criada nesse momento, porque
    splitProcessedContentIntoParts opera sobre o markdown CONSOLIDADO de
    todos os blocos."""
    capitulo_targets = [t for t in targets if t.get("media_kind") == "capitulo"]
    if not capitulo_targets:
        return False
    return all(t.get("status") == "completed" for t in capitulo_targets)


async def criar_targets_fase_b(
    *,
    jobs_repo: Any,
    job_id: str,
    aluno_id: str,
    topico_id: int,
    conteudo_id: int | None,
    brainhex_profile_key: str,
    total_partes: int,
) -> None:
    targets = []
    for ordem in range(1, total_partes + 1):
        for media_kind in _PART_MEDIA_KINDS:
            targets.append({
                "aluno_id": aluno_id,
                "topico_id": topico_id,
                "conteudo_id": conteudo_id,
                "brainhex_profile_key": brainhex_profile_key,
                "media_kind": media_kind,
                "block_id": None,
                "part_ordem": ordem,
                "status": "pending",
            })
    await jobs_repo.inserir_targets_media_generation(job_id=job_id, targets=targets)


async def processar_target_audio(
    *,
    target: dict[str, Any],
    audio_script_by_ordem: dict[int, str],
    profile: str,
    bucket: str,
    storage_path_prefix: str,
    settings: Any,
    gerar_audio_fn: Any,
    persistir_parte_fn: Any,
) -> bool:
    ordem = int(target["part_ordem"])
    audio_script = audio_script_by_ordem.get(ordem)
    if not audio_script:
        raise MediaGenerationTargetError(f"parte {ordem} sem audioScript disponivel para gerar audio")
    suffix = f"-parte-{ordem:02d}" if len(audio_script_by_ordem) > 1 else ""
    result = await gerar_audio_fn(
        settings=settings,
        audio_script=audio_script,
        profile=profile,
        bucket=bucket,
        storage_path=f"{storage_path_prefix}{suffix}",
    )
    if not result or not result.get("url"):
        raise MediaGenerationTargetError(f"geracao de audio nao retornou url para a parte {ordem}")
    await persistir_parte_fn(
        media_kind="audio",
        ordem=ordem,
        url=result["url"],
        storage_path=result.get("storagePath"),
    )
    return True


async def processar_target_apresentacao(
    *,
    target: dict[str, Any],
    markdown_by_ordem: dict[int, str],
    titulo_by_ordem: dict[int, str],
    profile: str,
    bucket: str,
    storage_path_prefix: str,
    settings: Any,
    gerar_apresentacao_fn: Any,
    persistir_parte_fn: Any,
) -> bool:
    ordem = int(target["part_ordem"])
    markdown = markdown_by_ordem.get(ordem)
    if not markdown:
        raise MediaGenerationTargetError(f"parte {ordem} sem markdown disponivel para gerar apresentacao")
    suffix = f"-parte-{ordem:02d}" if len(markdown_by_ordem) > 1 else ""
    result = await gerar_apresentacao_fn(
        settings=settings,
        markdown=markdown,
        topic=titulo_by_ordem.get(ordem, "Aula"),
        profile=profile,
        bucket=bucket,
        storage_path=f"{storage_path_prefix}{suffix}.html",
    )
    if not result or not result.get("url"):
        raise MediaGenerationTargetError(f"geracao de apresentacao nao retornou url para a parte {ordem}")
    await persistir_parte_fn(
        media_kind="apresentacao",
        ordem=ordem,
        url=result["url"],
        storage_path=None,
    )
    return True
