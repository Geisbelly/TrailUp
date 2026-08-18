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
