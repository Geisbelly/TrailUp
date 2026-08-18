import pytest

from app.services import media_generation_jobs


class FakeJobsRepo:
    def __init__(self):
        self.jobs = {}
        self.targets = []
        self.created_job = None

    async def find_open_job_by_payload(self, **kwargs):
        for job in self.jobs.values():
            if job["status"] != "completed":
                return job
        return None

    async def criar_job(self, *, kind, classe_id, trigger_source, payload, aluno_id, topico_id, conteudo_id, total_targets, commit=True):
        job_id = "job-1"
        job = {
            "id": job_id, "kind": kind, "status": "pending", "classe_id": classe_id,
            "aluno_id": aluno_id, "topico_id": topico_id, "conteudo_id": conteudo_id,
            "payload": payload, "total_targets": total_targets,
        }
        self.jobs[job_id] = job
        self.created_job = job
        return job

    async def inserir_targets_media_generation(self, *, job_id, targets):
        self.targets.extend(targets)


@pytest.mark.asyncio
async def test_criar_ciclo_media_generation_cria_um_target_de_enriquecimento_e_capitulo_por_bloco():
    repo = FakeJobsRepo()
    base_blocks = [{"id": "bloco-01"}, {"id": "bloco-02"}]

    job = await media_generation_jobs.criar_ciclo_media_generation(
        jobs_repo=repo,
        classe_id=10,
        aluno_id="aluno-1",
        topico_id=100,
        conteudo_id=None,
        brainhex_profile_key="mastermind",
        ciclo_id="ciclo-abc",
        source_hash="hash-1",
        base_blocks=base_blocks,
        trigger_source="student_request",
    )

    assert job["kind"] == media_generation_jobs.JOB_KIND_MEDIA_GENERATION
    assert job["payload"]["ciclo_id"] == "ciclo-abc"
    assert job["payload"]["source_hash"] == "hash-1"
    assert job["payload"]["brainhex_profile_key"] == "mastermind"

    target_keys = {(t["media_kind"], t["block_id"]) for t in repo.targets}
    assert target_keys == {
        ("enriquecimento", "bloco-01"),
        ("capitulo", "bloco-01"),
        ("enriquecimento", "bloco-02"),
        ("capitulo", "bloco-02"),
    }


@pytest.mark.asyncio
async def test_criar_ciclo_media_generation_reaproveita_job_aberto_existente():
    repo = FakeJobsRepo()
    repo.jobs["job-existente"] = {
        "id": "job-existente", "kind": media_generation_jobs.JOB_KIND_MEDIA_GENERATION,
        "status": "partial", "payload": {"ciclo_id": "ciclo-antigo", "source_hash": "hash-1", "brainhex_profile_key": "mastermind"},
    }

    job = await media_generation_jobs.criar_ciclo_media_generation(
        jobs_repo=repo,
        classe_id=10,
        aluno_id="aluno-1",
        topico_id=100,
        conteudo_id=None,
        brainhex_profile_key="mastermind",
        ciclo_id="ciclo-novo-ignorado",
        source_hash="hash-1",
        base_blocks=[{"id": "bloco-01"}],
        trigger_source="student_request",
    )

    assert job["id"] == "job-existente"
    assert repo.created_job is None  # nao criou um job novo
    assert repo.targets == []  # nao recriou targets (ja existem)


class FakeBlocosRepo:
    def __init__(self):
        self.rows = {}

    async def upsert_enriquecimento(self, *, job_id, block_id, enriched_payload):
        row = self.rows.setdefault(block_id, {"block_id": block_id, "enriched_payload": None, "markdown": None, "audio_script": None, "slides": None})
        row["enriched_payload"] = enriched_payload
        return row

    async def upsert_capitulo(self, *, job_id, block_id, markdown, audio_script, slides):
        row = self.rows.setdefault(block_id, {"block_id": block_id, "enriched_payload": None, "markdown": None, "audio_script": None, "slides": None})
        row["markdown"] = markdown
        row["audio_script"] = audio_script
        row["slides"] = slides
        return row

    async def listar_por_job(self, *, job_id):
        return list(self.rows.values())


@pytest.mark.asyncio
async def test_processar_target_enriquecimento_persiste_e_nao_rechama_llm_se_ja_completo():
    blocos_repo = FakeBlocosRepo()
    chamadas = []

    async def fake_enrich_base_blocks(*, base_blocks, topic, source_hash, settings):
        chamadas.append([b["id"] for b in base_blocks])
        return [{**b, "conteudo_aprofundado": "aprofundado"} for b in base_blocks], {"model": "fake"}

    target = {"id": 1, "block_id": "bloco-01", "media_kind": "enriquecimento"}
    base_blocks_by_id = {"bloco-01": {"id": "bloco-01", "conteudo_base": "base"}}

    ok = await media_generation_jobs.processar_target_enriquecimento(
        blocos_repo=blocos_repo,
        job_id="job-1",
        target=target,
        base_blocks_by_id=base_blocks_by_id,
        topic={"titulo": "T"},
        source_hash="hash-1",
        settings=object(),
        enrich_base_blocks_fn=fake_enrich_base_blocks,
    )

    assert ok is True
    assert blocos_repo.rows["bloco-01"]["enriched_payload"]["conteudo_aprofundado"] == "aprofundado"
    assert chamadas == [["bloco-01"]]


@pytest.mark.asyncio
async def test_processar_target_capitulo_persiste_markdown_audio_slides():
    blocos_repo = FakeBlocosRepo()
    blocos_repo.rows["bloco-01"] = {
        "block_id": "bloco-01",
        "enriched_payload": {"id": "bloco-01", "tema": "Redes"},
        "markdown": None, "audio_script": None, "slides": None,
    }

    async def fake_gerar_capitulo_bloco_brainhex(*, settings, content_blocks, profile, presentation_theme=None, guidance_prompt=None, error_sink=None):
        return {"chapters": [{"blockId": "bloco-01", "markdown": "## Bloco\n\nTexto", "audioScript": "Narração", "slides": [{"title": "S1"}]}]}

    target = {"id": 2, "block_id": "bloco-01", "media_kind": "capitulo"}

    ok = await media_generation_jobs.processar_target_capitulo(
        blocos_repo=blocos_repo,
        job_id="job-1",
        target=target,
        profile="mastermind",
        settings=object(),
        gerar_capitulo_fn=fake_gerar_capitulo_bloco_brainhex,
    )

    assert ok is True
    assert blocos_repo.rows["bloco-01"]["markdown"] == "## Bloco\n\nTexto"
    assert blocos_repo.rows["bloco-01"]["slides"] == [{"title": "S1"}]


@pytest.mark.asyncio
async def test_processar_target_capitulo_falha_quando_bloco_nao_enriquecido():
    blocos_repo = FakeBlocosRepo()
    target = {"id": 2, "block_id": "bloco-nunca-enriquecido", "media_kind": "capitulo"}

    with pytest.raises(media_generation_jobs.MediaGenerationTargetError):
        await media_generation_jobs.processar_target_capitulo(
            blocos_repo=blocos_repo,
            job_id="job-1",
            target=target,
            profile="mastermind",
            settings=object(),
            gerar_capitulo_fn=None,
        )
