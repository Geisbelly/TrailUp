import pytest

from app.repositories.personalizacao_blocos import PersonalizacaoBlocosRepository


class MappingRows:
    def __init__(self, rows):
        self.rows = rows

    def first(self):
        return self.rows[0] if self.rows else None

    def one(self):
        return self.rows[0]

    def __iter__(self):
        return iter(self.rows)


class MappingResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return MappingRows(self.rows)


class RecordingSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.commits = 0

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        if self.responses:
            return self.responses.pop(0)
        return MappingResult([])

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


JOB_ID = "11111111-1111-1111-1111-111111111111"


@pytest.mark.asyncio
async def test_upsert_enriquecimento_grava_enriched_payload():
    row = {
        "id": 1,
        "job_id": JOB_ID,
        "block_id": "bloco-01",
        "enriched_payload": {"id": "bloco-01", "tema": "Redes"},
        "markdown": None,
        "audio_script": None,
        "slides": None,
    }
    session = RecordingSession([MappingResult([row])])
    repo = PersonalizacaoBlocosRepository(session)

    result = await repo.upsert_enriquecimento(
        job_id=JOB_ID,
        block_id="bloco-01",
        enriched_payload={"id": "bloco-01", "tema": "Redes"},
    )

    assert result["block_id"] == "bloco-01"
    assert result["enriched_payload"]["tema"] == "Redes"
    assert session.commits == 1
    sql, params = session.calls[0]
    assert "ON CONFLICT (job_id, block_id)" in sql
    assert params["job_id"] == JOB_ID
    assert params["block_id"] == "bloco-01"


@pytest.mark.asyncio
async def test_upsert_capitulo_grava_markdown_audio_slides():
    row = {
        "id": 1,
        "job_id": JOB_ID,
        "block_id": "bloco-01",
        "enriched_payload": {"id": "bloco-01"},
        "markdown": "## Bloco 1\n\nConteúdo.",
        "audio_script": "Narração do bloco 1.",
        "slides": [{"title": "Slide 1"}],
    }
    session = RecordingSession([MappingResult([row])])
    repo = PersonalizacaoBlocosRepository(session)

    result = await repo.upsert_capitulo(
        job_id=JOB_ID,
        block_id="bloco-01",
        markdown="## Bloco 1\n\nConteúdo.",
        audio_script="Narração do bloco 1.",
        slides=[{"title": "Slide 1"}],
    )

    assert result["markdown"].startswith("## Bloco 1")
    assert result["slides"] == [{"title": "Slide 1"}]


@pytest.mark.asyncio
async def test_listar_por_job_retorna_todos_os_blocos():
    rows = [
        {"id": 1, "job_id": JOB_ID, "block_id": "bloco-01", "enriched_payload": {}, "markdown": "md1", "audio_script": "a1", "slides": []},
        {"id": 2, "job_id": JOB_ID, "block_id": "bloco-02", "enriched_payload": {}, "markdown": None, "audio_script": None, "slides": None},
    ]
    session = RecordingSession([MappingResult(rows)])
    repo = PersonalizacaoBlocosRepository(session)

    result = await repo.listar_por_job(job_id=JOB_ID)

    assert len(result) == 2
    assert result[0]["block_id"] == "bloco-01"
    assert result[1]["markdown"] is None
