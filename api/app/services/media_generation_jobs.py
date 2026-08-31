from __future__ import annotations

import logging
from datetime import datetime, timezone
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
    ref_id: str,
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
        storage_path=f"{storage_path_prefix}/audio/material-{ref_id}{suffix}",
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
    ref_id: str,
    settings: Any,
    gerar_apresentacao_fn: Any,
    persistir_parte_fn: Any,
) -> bool:
    ordem = int(target["part_ordem"])
    markdown = markdown_by_ordem.get(ordem)
    if not markdown:
        raise MediaGenerationTargetError(f"parte {ordem} sem markdown disponivel para gerar apresentacao")
    suffix = f"-parte-{ordem:02d}" if len(markdown_by_ordem) > 1 else ""
    storage_path = f"{storage_path_prefix}/apresentacao/material-{ref_id}{suffix}.html"
    result = await gerar_apresentacao_fn(
        settings=settings,
        markdown=markdown,
        topic=titulo_by_ordem.get(ordem, "Aula"),
        profile=profile,
        bucket=bucket,
        storage_path=storage_path,
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


async def processar_job_media_generation_once(
    *,
    jobs_repo: Any,
    blocos_repo: Any,
    job: dict[str, Any],
    base_blocks_by_id: dict[str, dict[str, Any]],
    topic: dict[str, Any],
    profile: str,
    settings: Any,
    max_retries: int,
    total_partes_calculator: Any,
    enrich_base_blocks_fn: Any,
    gerar_capitulo_fn: Any,
    gerar_audio_fn: Any,
    gerar_apresentacao_fn: Any,
    bucket: str,
    storage_path_prefix: str,
    audio_script_by_ordem: dict[int, str] | None = None,
    markdown_by_ordem: dict[int, str] | None = None,
    titulo_by_ordem: dict[int, str] | None = None,
    persistir_parte_fn: Any = None,
) -> dict[str, Any]:
    """Processa todos os targets PENDENTES do job (Fase A e, se ja aplicavel,
    Fase B), cria a Fase B quando a Fase A acabou de completar, e devolve um
    resumo (sem finalizar o job - quem chama decide o status agregado, igual
    ja acontece pros outros kinds em process_personalizacao_job_once)."""
    job_id = str(job["id"])
    payload = job.get("payload") or {}
    source_hash = str(payload.get("source_hash") or "")
    targets = await jobs_repo.get_targets(job_id)
    errors = 0
    fase_b_criada = False

    pendentes = [t for t in targets if t.get("status") not in ("completed", "skipped", "failed")]
    for target in pendentes:
        attempts = int(target.get("attempts") or 0) + 1
        try:
            if target["media_kind"] == "enriquecimento":
                await processar_target_enriquecimento(
                    blocos_repo=blocos_repo,
                    job_id=job_id,
                    target=target,
                    base_blocks_by_id=base_blocks_by_id,
                    topic=topic,
                    source_hash=source_hash,
                    settings=settings,
                    enrich_base_blocks_fn=enrich_base_blocks_fn,
                )
            elif target["media_kind"] == "capitulo":
                await processar_target_capitulo(
                    blocos_repo=blocos_repo,
                    job_id=job_id,
                    target=target,
                    profile=profile,
                    settings=settings,
                    gerar_capitulo_fn=gerar_capitulo_fn,
                )
            elif target["media_kind"] == "audio":
                # audio_script_by_ordem/markdown_by_ordem/titulo_by_ordem sao
                # resolvidos pelo chamador (personalizacao_jobs.py) antes de
                # invocar este orquestrador, a partir do markdown consolidado
                # da Fase A - ver wiring em process_personalizacao_job_once.
                await processar_target_audio(
                    target=target,
                    audio_script_by_ordem=audio_script_by_ordem or {},
                    profile=profile,
                    bucket=bucket,
                    storage_path_prefix=storage_path_prefix,
                    ref_id=job_id,
                    settings=settings,
                    gerar_audio_fn=gerar_audio_fn,
                    persistir_parte_fn=persistir_parte_fn,
                )
            elif target["media_kind"] == "apresentacao":
                await processar_target_apresentacao(
                    target=target,
                    markdown_by_ordem=markdown_by_ordem or {},
                    titulo_by_ordem=titulo_by_ordem or {},
                    profile=profile,
                    bucket=bucket,
                    storage_path_prefix=storage_path_prefix,
                    ref_id=job_id,
                    settings=settings,
                    gerar_apresentacao_fn=gerar_apresentacao_fn,
                    persistir_parte_fn=persistir_parte_fn,
                )
            await jobs_repo.update_target_status(target_id=int(target["id"]), status="completed", attempts=attempts)
        except MediaGenerationTargetError as exc:
            status = "pending" if attempts < max_retries else "failed"
            await jobs_repo.update_target_status(target_id=int(target["id"]), status=status, attempts=attempts, last_error=str(exc))
            if status == "failed":
                errors += 1

    refreshed_targets = await jobs_repo.get_targets(job_id)
    ja_tem_fase_b = any(t.get("media_kind") in _PART_MEDIA_KINDS for t in refreshed_targets)
    if not ja_tem_fase_b and fase_a_completa(refreshed_targets):
        total_partes = total_partes_calculator(refreshed_targets)
        await criar_targets_fase_b(
            jobs_repo=jobs_repo,
            job_id=job_id,
            aluno_id=str(refreshed_targets[0]["aluno_id"]),
            topico_id=int(refreshed_targets[0]["topico_id"]),
            conteudo_id=refreshed_targets[0].get("conteudo_id"),
            brainhex_profile_key=str(payload.get("brainhex_profile_key") or "mastermind"),
            total_partes=total_partes,
        )
        fase_b_criada = True

    return {"errors": errors, "fase_b_criada": fase_b_criada}


_FASE_B_REQUIRED_MEDIA_KINDS = frozenset(_PART_MEDIA_KINDS)


async def persistir_parte_em_materiais(
    *,
    conteudo_repo: Any,
    record_id: int,
    media_kind: str,
    url: str,
    storage_path: str | None,
    bucket: str,
    generation_key: str,
) -> None:
    """Merge (read-modify-write) do resultado de UM target de parte (audio
    ou apresentacao) em conteudo_personalizado.materiais - preserva
    qualquer outro media_kind ja gravado (inclusive de uma tentativa
    anterior). Quando os dois media_kinds da Fase B (audio + apresentacao)
    ja estao completed com o MESMO generation_key deste ciclo, marca o
    registro como "pronto" - so entao o mobile considera a personalizacao
    disponivel."""
    record = await conteudo_repo.buscar_por_id(record_id)
    materiais = dict((record or {}).get("materiais") or {})

    materiais[media_kind] = {
        "payload": {},
        "metadata": {
            "status": "completed",
            "media_kind": media_kind,
            "generation_key": generation_key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        "arquivo_url": url,
        "storage_path": storage_path,
        "bucket": bucket,
    }

    completed_kinds = {
        kind
        for kind in _FASE_B_REQUIRED_MEDIA_KINDS
        if (materiais.get(kind) or {}).get("metadata", {}).get("status") == "completed"
        and (materiais.get(kind) or {}).get("metadata", {}).get("generation_key") == generation_key
    }
    fase_b_completa = completed_kinds == _FASE_B_REQUIRED_MEDIA_KINDS

    # `formatos_gerados` NAO e um espelho do status: e o INDICE que o app usa
    # para saber o que existe. `inferHeroFormat` le o primeiro item para eleger o
    # formato principal, e `PersonalizedNodeHint.formatos` leva a lista para o no
    # da trilha.
    #
    # Atualizar so quando a Fase B fechava inteira deixava esse indice congelado
    # no valor da Fase A -- `{cards}` -- sempre que UMA midia falhava. Medido em
    # producao: 26 de 27 registros com `formatos_gerados = {cards}` enquanto
    # markdown (27/27), audio (21) e apresentacao (23) tinham `arquivo_url`
    # valida e servivel. O material estava no Storage, publico e acessivel, e o
    # app nao sabia que existia: mostrava so os cards.
    #
    # Uma midia que falha nao pode esconder as que tiveram sucesso. Cada uma
    # entra no indice assim que completa.
    #
    # UNIAO, nao substituicao: `cards` vem da Fase A e nao esta em `materiais`,
    # entao sobrescrever apagaria justamente o formato que o app ainda
    # conseguia enxergar.
    formatos_anteriores = {
        str(formato).strip().lower()
        for formato in ((record or {}).get("formatos_gerados") or [])
        if str(formato).strip()
    }
    formatos_atualizados = sorted(formatos_anteriores | completed_kinds)

    await conteudo_repo.atualizar_materiais_e_status(
        record_id=record_id,
        materiais=materiais,
        # `status` continua reservado ao ciclo COMPLETO -- e o sinal de "a
        # personalizacao esta inteira", e afrouxar isso e outra decisao.
        status="pronto" if fase_b_completa else None,
        formatos_gerados=formatos_atualizados or None,
    )


def consolidar_partes_a_partir_dos_blocos(
    blocos: list[dict[str, Any]],
    *,
    tema_fallback: str,
) -> tuple[dict[int, str], dict[int, str], dict[int, str]]:
    """Junta os capitulos ja gerados (markdown/audioScript por bloco, na
    ordem dos block_id — "bloco-01", "bloco-02", ... ordena lexicografica-
    mente igual a ordem pedagogica) numa unica parte de entrega (ordem=1).
    Blocos sem capitulo ainda gerado (markdown/audio_script None — nao
    deveria acontecer quando chamado apos fase_a_completa, mas defensivo
    contra chamada precoce) sao ignorados. Granularidade de PARTE continua
    fixa em 1 (ver total_partes_calculator) — nao reimplementa aqui o
    resplitamento por tamanho de caractere que o microservice ja faz
    (splitProcessedContentIntoParts); documentos muito grandes que
    precisariam de mais de uma parte ficam como follow-up."""
    prontos = sorted(
        (b for b in blocos if b.get("markdown") and b.get("audio_script")),
        key=lambda b: str(b["block_id"]),
    )
    markdown_consolidado = "\n\n---\n\n".join(str(b["markdown"]) for b in prontos)
    audio_consolidado = "\n\n".join(str(b["audio_script"]) for b in prontos)

    titulo = tema_fallback
    if prontos:
        primeira_linha = next(
            (linha for linha in str(prontos[0]["markdown"]).split("\n") if linha.strip()),
            "",
        )
        if primeira_linha.strip().startswith("#"):
            titulo = primeira_linha.lstrip("#").strip() or tema_fallback

    return (
        {1: markdown_consolidado},
        {1: audio_consolidado},
        {1: titulo},
    )
