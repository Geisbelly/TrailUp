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


class FakeJobsRepoComTargets(FakeJobsRepo):
    def __init__(self, targets):
        super().__init__()
        self._targets = targets
        self.inseridos_fase_b = []

    async def get_targets(self, job_id):
        return self._targets

    async def inserir_targets_media_generation(self, *, job_id, targets):
        self.inseridos_fase_b.extend(targets)
        self._targets.extend(targets)


def test_fase_b_nao_e_criada_com_bloco_de_capitulo_ainda_pendente():
    targets = [
        {"id": 1, "media_kind": "capitulo", "block_id": "bloco-01", "status": "completed"},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-02", "status": "pending"},
    ]
    assert media_generation_jobs.fase_a_completa(targets) is False


def test_fase_b_e_criada_quando_todos_os_capitulos_completam():
    targets = [
        {"id": 1, "media_kind": "capitulo", "block_id": "bloco-01", "status": "completed"},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-02", "status": "completed"},
        {"id": 3, "media_kind": "enriquecimento", "block_id": "bloco-01", "status": "completed"},
    ]
    assert media_generation_jobs.fase_a_completa(targets) is True


@pytest.mark.asyncio
async def test_criar_targets_fase_b_um_audio_e_uma_apresentacao_por_parte():
    repo = FakeJobsRepoComTargets(targets=[])

    await media_generation_jobs.criar_targets_fase_b(
        jobs_repo=repo,
        job_id="job-1",
        aluno_id="aluno-1",
        topico_id=100,
        conteudo_id=None,
        brainhex_profile_key="mastermind",
        total_partes=2,
    )

    keys = {(t["media_kind"], t["part_ordem"]) for t in repo.inseridos_fase_b}
    assert keys == {("audio", 1), ("apresentacao", 1), ("audio", 2), ("apresentacao", 2)}


@pytest.mark.asyncio
async def test_processar_target_audio_persiste_url_na_parte():
    partes_persistidas = []

    async def fake_persistir_parte(*, media_kind, ordem, url, storage_path):
        partes_persistidas.append((media_kind, ordem, url))

    async def fake_gerar_audio_fn(*, settings, audio_script, profile, bucket, storage_path):
        return {"url": "https://fake/audio.mp3", "storagePath": storage_path, "mimeType": "audio/mpeg"}

    target = {"id": 10, "media_kind": "audio", "part_ordem": 1}

    ok = await media_generation_jobs.processar_target_audio(
        target=target,
        audio_script_by_ordem={1: "roteiro da parte 1"},
        profile="mastermind",
        bucket="conteudo_aluno",
        storage_path_prefix="brainhex/mastermind/topico-1",
        ref_id="job-1",
        settings=object(),
        gerar_audio_fn=fake_gerar_audio_fn,
        persistir_parte_fn=fake_persistir_parte,
    )

    assert ok is True
    assert partes_persistidas == [("audio", 1, "https://fake/audio.mp3")]


class FakeJobsRepoCompleto:
    def __init__(self, targets, job):
        self.targets = targets
        self.job = job
        self.status_updates = []
        self.finalized = None

    async def get_targets(self, job_id):
        return self.targets

    async def update_target_status(self, *, target_id, status, attempts=None, last_error=None, personalizacao_id=None):
        self.status_updates.append((target_id, status))
        for t in self.targets:
            if t["id"] == target_id:
                t["status"] = status

    async def inserir_targets_media_generation(self, *, job_id, targets):
        next_id = max((t["id"] for t in self.targets), default=0) + 1
        for t in targets:
            t["id"] = next_id
            next_id += 1
        self.targets.extend(targets)

    async def finalize_job(self, *, job_id, status, last_error=None):
        self.finalized = status
        return {**self.job, "status": status}


@pytest.mark.asyncio
async def test_processar_job_media_generation_once_completa_fase_a_e_cria_fase_b():
    job = {"id": "job-1", "payload": {"ciclo_id": "c1", "source_hash": "h1", "brainhex_profile_key": "mastermind"}}
    targets = [
        {"id": 1, "media_kind": "enriquecimento", "block_id": "bloco-01", "status": "pending", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-01", "status": "pending", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
    ]
    repo = FakeJobsRepoCompleto(targets, job)
    blocos_repo = FakeBlocosRepo()
    base_blocks_by_id = {"bloco-01": {"id": "bloco-01", "conteudo_base": "base"}}

    async def fake_enrich(*, base_blocks, topic, source_hash, settings):
        return [{**b, "conteudo_aprofundado": "aprofundado"} for b in base_blocks], {}

    async def fake_gerar_capitulo(*, settings, content_blocks, profile, presentation_theme=None, guidance_prompt=None, error_sink=None):
        return {"chapters": [{"blockId": "bloco-01", "markdown": "## Bloco\n\nTexto", "audioScript": "Narração", "slides": []}]}

    result = await media_generation_jobs.processar_job_media_generation_once(
        jobs_repo=repo,
        blocos_repo=blocos_repo,
        job=job,
        base_blocks_by_id=base_blocks_by_id,
        topic={"titulo": "T"},
        profile="mastermind",
        settings=object(),
        max_retries=3,
        total_partes_calculator=lambda blocos_repo_rows: 1,
        enrich_base_blocks_fn=fake_enrich,
        gerar_capitulo_fn=fake_gerar_capitulo,
        gerar_audio_fn=None,
        gerar_apresentacao_fn=None,
        bucket="conteudo_aluno",
        storage_path_prefix="brainhex/mastermind/topico-100",
    )

    assert result["fase_b_criada"] is True
    assert any(t["media_kind"] == "audio" for t in repo.targets)
    assert any(t["media_kind"] == "apresentacao" for t in repo.targets)
    assert targets[0]["status"] == "completed"
    assert targets[1]["status"] == "completed"


@pytest.mark.asyncio
async def test_retentativa_apos_falha_so_na_apresentacao_nao_rechama_enriquecimento_nem_capitulo():
    job = {"id": "job-1", "payload": {"ciclo_id": "c1", "source_hash": "h1", "brainhex_profile_key": "mastermind"}}
    targets = [
        {"id": 1, "media_kind": "enriquecimento", "block_id": "bloco-01", "status": "completed", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 2, "media_kind": "capitulo", "block_id": "bloco-01", "status": "completed", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 3, "media_kind": "audio", "block_id": None, "part_ordem": 1, "status": "completed", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
        {"id": 4, "media_kind": "apresentacao", "block_id": None, "part_ordem": 1, "status": "pending", "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None},
    ]
    repo = FakeJobsRepoCompleto(targets, job)
    blocos_repo = FakeBlocosRepo()
    blocos_repo.rows["bloco-01"] = {
        "block_id": "bloco-01", "enriched_payload": {"id": "bloco-01"},
        "markdown": "## Bloco\n\nTexto", "audio_script": "Narração", "slides": [],
    }

    chamadas_enrich = []
    chamadas_capitulo = []
    chamadas_apresentacao = []

    async def fake_enrich(*, base_blocks, topic, source_hash, settings):
        chamadas_enrich.append(base_blocks)
        raise AssertionError("nao deveria ser chamado - bloco ja enriquecido")

    async def fake_gerar_capitulo(*, settings, content_blocks, profile, presentation_theme=None, guidance_prompt=None, error_sink=None):
        chamadas_capitulo.append(content_blocks)
        raise AssertionError("nao deveria ser chamado - capitulo ja gerado")

    async def fake_gerar_apresentacao(*, settings, markdown, topic, profile, bucket, storage_path):
        chamadas_apresentacao.append(markdown)
        return {"url": "https://fake/apresentacao.html"}

    persistido = []

    async def fake_persistir_parte(*, media_kind, ordem, url, storage_path):
        persistido.append((media_kind, ordem, url))

    await media_generation_jobs.processar_job_media_generation_once(
        jobs_repo=repo,
        blocos_repo=blocos_repo,
        job=job,
        base_blocks_by_id={"bloco-01": {"id": "bloco-01", "conteudo_base": "base"}},
        topic={"titulo": "T"},
        profile="mastermind",
        settings=object(),
        max_retries=3,
        total_partes_calculator=lambda targets: 1,
        enrich_base_blocks_fn=fake_enrich,
        gerar_capitulo_fn=fake_gerar_capitulo,
        gerar_audio_fn=None,
        gerar_apresentacao_fn=fake_gerar_apresentacao,
        bucket="conteudo_aluno",
        storage_path_prefix="brainhex/mastermind/topico-100",
        markdown_by_ordem={1: "## Bloco\n\nTexto"},
        titulo_by_ordem={1: "Bloco"},
        persistir_parte_fn=fake_persistir_parte,
    )

    assert chamadas_enrich == []
    assert chamadas_capitulo == []
    assert chamadas_apresentacao == ["## Bloco\n\nTexto"]
    assert persistido == [("apresentacao", 1, "https://fake/apresentacao.html")]
    assert targets[3]["status"] == "completed"


class FakeConteudoPersonalizadoRepo:
    def __init__(self, record):
        self.record = record
        self.updates = []

    async def buscar_por_id(self, record_id):
        return self.record if self.record and self.record["id"] == record_id else None

    async def atualizar_materiais_e_status(self, *, record_id, materiais, status=None, formatos_gerados=None):
        self.updates.append({"record_id": record_id, "materiais": materiais, "status": status, "formatos_gerados": formatos_gerados})
        self.record = {**self.record, "materiais": materiais}
        if status is not None:
            self.record["status"] = status
        return self.record


@pytest.mark.asyncio
async def test_persistir_parte_em_materiais_grava_url_e_status_completed():
    record = {"id": 7, "materiais": {}}
    repo = FakeConteudoPersonalizadoRepo(record)

    await media_generation_jobs.persistir_parte_em_materiais(
        conteudo_repo=repo,
        record_id=7,
        media_kind="audio",
        url="https://fake/audio.mp3",
        storage_path="brainhex/mastermind/topico-1/audio/material-1.mp3",
        bucket="conteudo_aluno",
        generation_key="ciclo-1:hash-1",
    )

    materiais = repo.updates[0]["materiais"]
    assert materiais["audio"]["arquivo_url"] == "https://fake/audio.mp3"
    assert materiais["audio"]["metadata"]["status"] == "completed"
    assert materiais["audio"]["metadata"]["generation_key"] == "ciclo-1:hash-1"
    assert repo.updates[0]["status"] is None


@pytest.mark.asyncio
async def test_persistir_parte_em_materiais_preserva_outros_media_kinds_ja_gravados():
    record = {"id": 7, "materiais": {"audio": {"arquivo_url": "https://fake/audio.mp3", "metadata": {"status": "completed"}}}}
    repo = FakeConteudoPersonalizadoRepo(record)

    await media_generation_jobs.persistir_parte_em_materiais(
        conteudo_repo=repo,
        record_id=7,
        media_kind="apresentacao",
        url="https://fake/apresentacao.html",
        storage_path=None,
        bucket="conteudo_aluno",
        generation_key="ciclo-1:hash-1",
    )

    materiais = repo.updates[0]["materiais"]
    assert materiais["audio"]["arquivo_url"] == "https://fake/audio.mp3"
    assert materiais["apresentacao"]["arquivo_url"] == "https://fake/apresentacao.html"


@pytest.mark.asyncio
async def test_persistir_parte_em_materiais_marca_pronto_quando_audio_e_apresentacao_completam():
    record = {"id": 7, "materiais": {"audio": {"arquivo_url": "https://fake/audio.mp3", "metadata": {"status": "completed", "generation_key": "ciclo-1:hash-1"}}}}
    repo = FakeConteudoPersonalizadoRepo(record)

    await media_generation_jobs.persistir_parte_em_materiais(
        conteudo_repo=repo,
        record_id=7,
        media_kind="apresentacao",
        url="https://fake/apresentacao.html",
        storage_path=None,
        bucket="conteudo_aluno",
        generation_key="ciclo-1:hash-1",
    )

    assert repo.updates[0]["status"] == "pronto"
    assert set(repo.updates[0]["formatos_gerados"]) == {"audio", "apresentacao"}


def test_consolidar_partes_a_partir_dos_blocos_junta_markdown_e_audio_em_ordem():
    blocos = [
        {"block_id": "bloco-02", "markdown": "## Segundo\n\nTexto 2.", "audio_script": "Narração 2."},
        {"block_id": "bloco-01", "markdown": "## Primeiro\n\nTexto 1.", "audio_script": "Narração 1."},
    ]

    markdown_by_ordem, audio_script_by_ordem, titulo_by_ordem = (
        media_generation_jobs.consolidar_partes_a_partir_dos_blocos(blocos, tema_fallback="Aula")
    )

    assert markdown_by_ordem[1].index("Primeiro") < markdown_by_ordem[1].index("Segundo")
    assert audio_script_by_ordem[1].index("Narração 1") < audio_script_by_ordem[1].index("Narração 2")
    assert titulo_by_ordem[1] == "Primeiro"


def test_consolidar_partes_a_partir_dos_blocos_usa_fallback_sem_headings():
    blocos = [{"block_id": "bloco-01", "markdown": "Texto sem heading.", "audio_script": "Narração."}]

    markdown_by_ordem, _audio, titulo_by_ordem = (
        media_generation_jobs.consolidar_partes_a_partir_dos_blocos(blocos, tema_fallback="Aula de Teste")
    )

    assert markdown_by_ordem[1] == "Texto sem heading."
    assert titulo_by_ordem[1] == "Aula de Teste"


def test_consolidar_partes_ignora_blocos_sem_capitulo_ainda_gerado():
    blocos = [
        {"block_id": "bloco-01", "markdown": "## Pronto\n\nTexto.", "audio_script": "Narração."},
        {"block_id": "bloco-02", "markdown": None, "audio_script": None},
    ]

    markdown_by_ordem, _audio, _titulo = media_generation_jobs.consolidar_partes_a_partir_dos_blocos(
        blocos, tema_fallback="Aula"
    )

    assert "Pronto" in markdown_by_ordem[1]
    assert markdown_by_ordem[1].count("##") == 1


# ---------------------------------------------------------------------------
# `formatos_gerados` e o indice que o app consulta: uma midia que falha nao pode
# esconder as que tiveram sucesso
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_formatos_gerados_registra_a_midia_que_completou_mesmo_sem_a_outra():
    """Medido em producao: 26 de 27 registros com `formatos_gerados = {cards}`
    enquanto markdown (27/27), audio (21) e apresentacao (23) tinham
    `arquivo_url` valida e servivel.

    A causa: `formatos_gerados` so era atualizado quando a Fase B fechava
    INTEIRA. Uma midia que falha deixava o indice congelado no valor da Fase A,
    e o app -- que usa `formatos_gerados[0]` em `inferHeroFormat` e leva a lista
    para o no da trilha em `PersonalizedNodeHint` -- nao sabia que o material
    existia.
    """
    # Fase A gravou os cards; audio acabou de completar; apresentacao NAO veio.
    record = {"id": 9, "formatos_gerados": ["cards"], "materiais": {}}
    repo = FakeConteudoPersonalizadoRepo(record)

    await media_generation_jobs.persistir_parte_em_materiais(
        conteudo_repo=repo,
        record_id=9,
        media_kind="audio",
        url="https://fake/audio.mp3",
        storage_path=None,
        bucket="conteudo_aluno",
        generation_key="ciclo-1:hash-1",
    )

    update = repo.updates[0]
    assert update["formatos_gerados"] is not None, (
        "com uma midia completa, o indice tem de ser atualizado"
    )
    assert "audio" in update["formatos_gerados"], "o audio completou e precisa aparecer"
    # `cards` veio da Fase A e nao esta em `materiais`: substituir em vez de unir
    # apagaria o unico formato que o app conseguia enxergar.
    assert "cards" in update["formatos_gerados"], "a uniao preserva o que a Fase A gerou"
    # A apresentacao nao completou, entao nao entra.
    assert "apresentacao" not in update["formatos_gerados"]
    # E o status segue reservado ao ciclo completo.
    assert update["status"] is None, "parcial nao e 'pronto'"


@pytest.mark.asyncio
async def test_formatos_gerados_nao_duplica_nem_perde_ao_completar_a_segunda():
    record = {
        "id": 11,
        "formatos_gerados": ["cards", "audio"],
        "materiais": {
            "audio": {
                "arquivo_url": "https://fake/audio.mp3",
                "metadata": {"status": "completed", "generation_key": "ciclo-1:hash-1"},
            }
        },
    }
    repo = FakeConteudoPersonalizadoRepo(record)

    await media_generation_jobs.persistir_parte_em_materiais(
        conteudo_repo=repo,
        record_id=11,
        media_kind="apresentacao",
        url="https://fake/apresentacao.html",
        storage_path=None,
        bucket="conteudo_aluno",
        generation_key="ciclo-1:hash-1",
    )

    update = repo.updates[0]
    assert sorted(update["formatos_gerados"]) == ["apresentacao", "audio", "cards"]
    assert update["status"] == "pronto", "agora a Fase B fechou"
