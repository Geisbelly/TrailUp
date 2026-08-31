from datetime import datetime
from types import SimpleNamespace

import pytest

from app.repositories.access import AccessRepository
from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository
from app.repositories.artefatos_personalizados import ArtefatosPersonalizadosRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.context import ContextRepository
from app.repositories.evento import EventoRepository
from app.repositories.fontes_personalizacao import (
    FontesContextLimitExceeded,
    FontesPersonalizacaoRepository,
)
from app.repositories.ia_descricao import IADescricaoRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.notificacao import NotificacaoRepository
from app.repositories.perfil import PerfilRepository
from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository
from app.repositories.telemetria import TelemetriaRepository
from app.repositories.trilha import TrilhaRepository
from app.schemas.notificacao import NotificacaoPayload
from app.schemas.perfil import PerfilScore, PerfilUpdate
from app.schemas.texto_gerado import TextoGerado
from app.schemas.trilha_config import TrilhaConfig
from app.services.media_contract import (
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    PRESENTATION_ENGINE_VERSION,
)


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar(self):
        return self.value

    def scalar_one(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value


class DummyResult:
    def scalar(self):
        return None

    def mappings(self):
        return MappingRows([])

    def __iter__(self):
        return iter([])


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

    def __iter__(self):
        return iter(self.rows)


class FakeRow:
    def __init__(self, mapping):
        self._mapping = mapping


class RecordingSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        if self.responses:
            response = self.responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response
        return DummyResult()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


def _job_row(job_id: str = "11111111-1111-1111-1111-111111111111"):
    return {
        "id": job_id,
        "payload": {},
        "media_snapshot": {},
    }


def _job_target():
    return {
        "aluno_id": "22222222-2222-2222-2222-222222222222",
        "topico_id": 117,
        "conteudo_id": None,
        "brainhex_profile_key": "seeker",
        "is_profile_template": False,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("conteudo_id", "expected_conflict", "expected_predicate"),
    [
        (
            125,
            "ON CONFLICT (aluno_id, topico_id, conteudo_id, brainhex_profile_key)",
            "topico_id IS NOT NULL AND conteudo_id IS NOT NULL",
        ),
        (
            None,
            "ON CONFLICT (aluno_id, topico_id, brainhex_profile_key)",
            "topico_id IS NOT NULL AND conteudo_id IS NULL",
        ),
    ],
)
async def test_personalizacao_upsert_is_scoped_by_content(
    conteudo_id,
    expected_conflict,
    expected_predicate,
) -> None:
    session = RecordingSession([ScalarResult(901)])
    repo = ConteudoPersonalizadoRepository(session)
    repo._column_cache = {
        "__loaded__": True,
        **{column: True for column in repo._known_columns},
    }

    record_id = await repo.salvar(
        aluno_id="22222222-2222-2222-2222-222222222222",
        classe_id=32,
        conteudo_id=conteudo_id,
        topico_id=121,
        ciclo_id="cycle-1",
        plano={"brainhex_profile_key": "seeker"},
        materiais={},
        ai_patch=None,
        status="processando_midias",
        source_hash="hash-1",
        formato_prioritario="cards",
        formatos_gerados=["cards"],
        brainhex_profile_key="seeker",
    )

    assert record_id == 901
    sql, params = session.calls[0]
    assert expected_conflict in sql
    assert expected_predicate in sql
    assert params["conteudo_id"] == conteudo_id
    assert session.commits == 1


@pytest.mark.asyncio
async def test_personalizacao_upsert_without_profile_column_skips_broken_conflict_target() -> None:
    # A unicidade em (aluno_id, topico_id) sem perfil foi removida das migrations
    # (20260727_01/20260728_02); se brainhex_profile_key nao for detectada nessa
    # tabela, nenhum ON CONFLICT (aluno_id, topico_id) tem constraint para casar
    # e o INSERT falharia com InvalidColumnReferenceError. O salvar() deve gravar
    # sem ON CONFLICT nesse caso, em vez de montar uma clausula garantidamente quebrada.
    session = RecordingSession([ScalarResult(902)])
    repo = ConteudoPersonalizadoRepository(session)
    repo._column_cache = {
        "__loaded__": True,
        **{column: True for column in repo._known_columns},
        "brainhex_profile_key": False,
    }

    record_id = await repo.salvar(
        aluno_id="22222222-2222-2222-2222-222222222222",
        classe_id=32,
        conteudo_id=122,
        topico_id=150,
        ciclo_id="cycle-1",
        plano={},
        materiais={},
        ai_patch=None,
        status="processando_midias",
        source_hash="hash-1",
        formato_prioritario="documento",
        formatos_gerados=["documento"],
    )

    assert record_id == 902
    sql, _params = session.calls[0]
    assert "ON CONFLICT" not in sql
    assert session.commits == 1


@pytest.mark.asyncio
async def test_personalizacao_job_and_targets_commit_atomically() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            MappingResult([_job_row()]),
            ScalarResult(True),
            SimpleNamespace(rowcount=0),
        ]
    )
    repo = PersonalizacaoJobsRepository(session)

    job = await repo.criar_job_com_targets(
        kind="full_class_sync",
        classe_id=32,
        trigger_source="test",
        targets=[_job_target()],
    )

    assert str(job["id"]) == "11111111-1111-1111-1111-111111111111"
    assert session.commits == 1
    assert session.rollbacks == 0
    assert any("INSERT INTO personalizacao_jobs" in sql for sql, _ in session.calls)
    assert any("INSERT INTO personalizacao_job_targets" in sql for sql, _ in session.calls)


@pytest.mark.asyncio
async def test_personalizacao_job_rolls_back_when_target_insert_fails() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            MappingResult([_job_row()]),
            ScalarResult(True),
            SimpleNamespace(rowcount=0),
            RuntimeError("target insert failed"),
        ]
    )
    repo = PersonalizacaoJobsRepository(session)

    with pytest.raises(RuntimeError, match="target insert failed"):
        await repo.criar_job_com_targets(
            kind="full_class_sync",
            classe_id=32,
            trigger_source="test",
            targets=[_job_target()],
        )

    assert session.commits == 0
    assert session.rollbacks == 1


@pytest.mark.asyncio
async def test_personalizacao_job_without_targets_is_still_committed() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            MappingResult([_job_row()]),
        ]
    )
    repo = PersonalizacaoJobsRepository(session)

    await repo.criar_job_com_targets(
        kind="full_class_sync",
        classe_id=32,
        trigger_source="test",
        targets=[],
    )

    assert session.commits == 1
    assert session.rollbacks == 0
    assert not any("INSERT INTO personalizacao_job_targets" in sql for sql, _ in session.calls)


@pytest.mark.asyncio
async def test_claim_partial_job_requires_non_terminal_target() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            MappingResult([_job_row()]),
        ]
    )
    repo = PersonalizacaoJobsRepository(session)

    await repo.claim_next_job(stale_processing_min=15)

    claim_sql = next(sql for sql, _ in session.calls if "WITH next_job AS" in sql)
    assert "candidate.status = 'partial'" in claim_sql
    assert "make_interval(secs => :partial_retry_delay_sec)" in claim_sql
    assert "FROM personalizacao_job_targets target" in claim_sql
    assert "target.status NOT IN ('completed', 'failed', 'skipped')" in claim_sql


@pytest.mark.asyncio
async def test_claim_processing_job_with_pending_targets_uses_fast_partial_window() -> None:
    # Um restart/crash no meio do ciclo mata o worker ANTES do finalize_job
    # rebaixar o status de 'processing' para 'partial'. Sem esta clausula, um
    # job com targets claramente pendentes ficava travado ate os 40min de
    # stale_processing_min em vez dos 15s normais de partial_retry_delay_sec.
    session = RecordingSession(
        [
            ScalarResult(True),
            MappingResult([_job_row()]),
        ]
    )
    repo = PersonalizacaoJobsRepository(session)

    await repo.claim_next_job(stale_processing_min=40, partial_retry_delay_sec=15)

    claim_sql = next(sql for sql, _ in session.calls if "WITH next_job AS" in sql)
    assert "candidate.status = 'processing'" in claim_sql
    processing_clause = claim_sql.split("candidate.status = 'processing'", 1)[1]
    assert "make_interval(secs => :partial_retry_delay_sec)" in processing_clause
    assert "target.status NOT IN ('completed', 'failed', 'skipped')" in processing_clause
    assert "make_interval(mins => :stale_processing_min)" in processing_clause


@pytest.mark.asyncio
async def test_latest_personalization_targets_are_scoped_exactly_by_content() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(True),
            MappingResult(
                [
                    {
                        "id": 701,
                        "job_id": "11111111-1111-1111-1111-111111111111",
                        "brainhex_profile_key": "Seeker",
                        "status": "processing",
                    },
                    {
                        "id": 702,
                        "job_id": "11111111-1111-1111-1111-111111111111",
                        "brainhex_profile_key": "mastermind",
                        "status": "pending",
                    },
                ]
            ),
        ]
    )
    repo = PersonalizacaoJobsRepository(session)

    latest = await repo.buscar_targets_mais_recentes_por_perfil(
        classe_id=32,
        topico_id=121,
        conteudo_id=125,
    )

    assert set(latest) == {"seeker", "mastermind"}
    assert latest["seeker"]["id"] == 701
    query, params = session.calls[-1]
    assert "DISTINCT ON (LOWER(BTRIM(brainhex_profile_key)))" in query
    assert "IS NOT DISTINCT FROM CAST(:conteudo_id AS BIGINT)" in query
    assert "job_created_at DESC" in query
    assert "job.kind = 'media_generation'" in query
    assert params == {
        "classe_id": 32,
        "topico_id": 121,
        "conteudo_id": 125,
    }


@pytest.mark.asyncio
async def test_latest_personalization_targets_aggregates_media_generation_at_job_level() -> None:
    """job kind=media_generation nao tem 1 target por perfil - tem N targets
    granulares (bloco/parte) no mesmo job. O bug real: a query so olhava os
    outros 4 kinds no WHERE job.kind IN (...), entao toda geracao criada via
    personalizar() (que so cria media_generation) ficava invisivel pro
    console - sem status, sem progresso, sem erro, sem retry possivel."""
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(True),
            MappingResult(
                [
                    {
                        "id": None,
                        "job_id": "22222222-2222-2222-2222-222222222222",
                        "brainhex_profile_key": "achiever",
                        "status": "processing",
                        "job_status": "processing",
                    }
                ]
            ),
        ]
    )
    repo = PersonalizacaoJobsRepository(session)

    latest = await repo.buscar_targets_mais_recentes_por_perfil(
        classe_id=32,
        topico_id=121,
        conteudo_id=125,
    )

    assert set(latest) == {"achiever"}
    assert latest["achiever"]["status"] == "processing"
    query, _params = session.calls[-1]
    assert "job.payload->>'brainhex_profile_key'" in query
    assert "UNION ALL" in query


def test_content_hydration_prefers_persisted_brainhex_profile_column() -> None:
    repo = ConteudoPersonalizadoRepository(RecordingSession([]))

    hydrated = repo._hydrate_record(
        {
            "brainhex_profile_key": "survivor",
            "plano": {"perfil_dominante": "Seeker"},
            "materiais": {},
            "ai_patch": None,
        }
    )

    assert hydrated["brainhex_profile_key"] == "survivor"


@pytest.mark.asyncio
async def test_content_status_update_preserves_materials() -> None:
    session = RecordingSession([ScalarResult(True), ScalarResult(249)])
    repo = ConteudoPersonalizadoRepository(session)

    updated = await repo.atualizar_status(
        record_id=249,
        status="failed",
        ciclo_id="ciclo-249",
        source_hash="hash-249",
        preserve_completed_generation_key="ciclo-249:hash-249",
    )

    assert updated is True
    assert session.commits == 1
    update_sql, params = next(
        (sql, params) for sql, params in session.calls if "UPDATE conteudo_personalizado" in sql
    )
    assert "SET status = :status" in update_sql
    assert "materiais" not in update_sql.split("WHERE", maxsplit=1)[0]
    assert "ciclo_id::text = :ciclo_id" in update_sql
    assert "COALESCE(source_hash, '') = :source_hash" in update_sql
    assert "materiais -> 'audio'" in update_sql
    assert "materiais -> 'apresentacao' -> 'metadata' ->> 'engine'" in update_sql
    assert "materiais -> 'apresentacao' -> 'metadata' ->> 'design_system'" in update_sql
    assert "media_pipeline_version" in update_sql
    assert params == {
        "id": 249,
        "status": "failed",
        "ciclo_id": "ciclo-249",
        "source_hash": "hash-249",
        "completed_generation_key": "ciclo-249:hash-249",
        "completed_presentation_engine": PRESENTATION_ENGINE_VERSION,
        "completed_media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "completed_presentation_design": PRESENTATION_DESIGN_VERSION,
    }


@pytest.mark.asyncio
async def test_claim_incomplete_generation_retry_is_atomic_and_clears_stale_errors() -> None:
    partial_materials = {
        "audio": {
            "metadata": {
                "status": "completed",
                "generation_key": "ciclo-249:hash-249",
            }
        }
    }
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(249),
            MappingResult(
                [
                    {
                        "id": 249,
                        "aluno_id": "aluno-1",
                        "classe_id": 32,
                        "conteudo_id": 125,
                        "topico_id": 121,
                        "ciclo_id": "ciclo-249",
                        "brainhex_profile_key": "seeker",
                        "plano": {},
                        "materiais": partial_materials,
                        "ai_patch": None,
                        "status": "processando_midias",
                        "source_hash": "hash-249",
                        "formato_prioritario": "cards",
                        "formatos_gerados": ["cards"],
                        "gerado_em": datetime.now(),
                        "updated_at": datetime.now(),
                    }
                ]
            ),
        ]
    )
    repo = ConteudoPersonalizadoRepository(session)

    claimed = await repo.claim_retry_incomplete_generation(
        record_id=249,
        ciclo_id="ciclo-249",
        source_hash="hash-249",
        generation_key="ciclo-249:hash-249",
        stale_processing_min=38,
    )

    assert claimed is not None
    assert claimed["materiais"]["audio"]["metadata"] == partial_materials["audio"]["metadata"]
    assert session.commits == 1
    update_sql, params = next(
        (sql, params) for sql, params in session.calls if "UPDATE conteudo_personalizado" in sql
    )
    assert "SET status = 'processando_midias'" in update_sql
    update_set_sql = update_sql.split("WHERE id = :id", maxsplit=1)[0]
    assert "jsonb_object_agg" in update_set_sql
    assert "item.key IN ('audio', 'markdown', 'apresentacao')" in update_set_sql
    assert "item.key NOT IN ('erro', 'error')" in update_set_sql
    assert "'failure_reason'" in update_set_sql
    assert "'status'," in update_set_sql
    assert "'pending'" in update_set_sql
    assert "item.value -> 'metadata' ->> 'generation_key'" in update_set_sql
    assert "ciclo_id::text = :ciclo_id" in update_sql
    assert "COALESCE(source_hash, '') = :source_hash" in update_sql
    assert "status IN ('failed', 'falha', 'failed_quality', 'partial', 'pronto')" in update_sql
    assert "status = 'processando_midias'" in update_sql
    assert "make_interval(mins => :stale_processing_min)" in update_sql
    assert "= '{}'::jsonb" not in update_sql
    assert "materiais -> 'apresentacao'" in update_sql
    assert "materiais -> 'apresentacao' -> 'metadata' ->> 'engine'" in update_sql
    assert "materiais -> 'apresentacao' -> 'metadata' ->> 'design_system'" in update_sql
    assert "media_pipeline_version" in update_sql
    assert params == {
        "id": 249,
        "ciclo_id": "ciclo-249",
        "source_hash": "hash-249",
        "generation_key": "ciclo-249:hash-249",
        "presentation_engine": PRESENTATION_ENGINE_VERSION,
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_design": PRESENTATION_DESIGN_VERSION,
        "stale_processing_min": 38,
    }


@pytest.mark.asyncio
async def test_claim_incomplete_generation_retry_loses_cas_without_overwriting() -> None:
    session = RecordingSession([ScalarResult(True), ScalarResult(None)])
    repo = ConteudoPersonalizadoRepository(session)

    claimed = await repo.claim_retry_incomplete_generation(
        record_id=249,
        ciclo_id="ciclo-249",
        source_hash="hash-249",
        generation_key="ciclo-249:hash-249",
        stale_processing_min=38,
    )

    assert claimed is None
    assert session.commits == 0
    assert session.rollbacks == 1


@pytest.mark.asyncio
async def test_claim_new_generation_succeeds_when_target_does_not_exist_yet() -> None:
    session = RecordingSession([ScalarResult(True), MappingResult([{"id": 501}])])
    repo = ConteudoPersonalizadoRepository(session)

    claimed = await repo.claim_new_generation(
        aluno_id="aluno-1",
        classe_id=32,
        topico_id=121,
        conteudo_id=125,
        brainhex_profile_key="seeker",
        ciclo_id="ciclo-501",
        source_hash="hash-501",
    )

    assert claimed is True
    assert session.commits == 1
    insert_sql, params = session.calls[-1]
    assert "ON CONFLICT (aluno_id, topico_id, conteudo_id, brainhex_profile_key)" in insert_sql
    assert "DO UPDATE" in insert_sql
    assert params["ciclo_id"] == "ciclo-501"
    assert params["brainhex_profile_key"] == "seeker"


@pytest.mark.asyncio
async def test_claim_new_generation_loses_race_when_another_worker_already_claimed() -> None:
    """Conflito com uma linha do MESMO source_hash e uma corrida real (outro
    worker ja reservou esta MESMA geracao) - deve continuar deferindo."""
    session = RecordingSession([ScalarResult(True), MappingResult([])])
    repo = ConteudoPersonalizadoRepository(session)

    claimed = await repo.claim_new_generation(
        aluno_id="aluno-1",
        classe_id=32,
        topico_id=121,
        conteudo_id=125,
        brainhex_profile_key="seeker",
        ciclo_id="ciclo-501",
        source_hash="hash-501",
    )

    assert claimed is False
    assert session.commits == 1


@pytest.mark.asyncio
async def test_claim_new_generation_reclaims_row_with_stale_source_hash() -> None:
    """Conflito com uma linha de source_hash DIFERENTE nao e uma corrida real
    - e uma geracao antiga (obsoleta, de antes do conteudo mudar) que nunca
    completou. Sem reclamar essa linha, o slot (aluno,topico,conteudo,perfil)
    fica bloqueado para sempre por ON CONFLICT DO NOTHING, mesmo quando o
    conteudo mudou de verdade e precisa gerar de novo."""
    session = RecordingSession([ScalarResult(True), MappingResult([{"id": 501}])])
    repo = ConteudoPersonalizadoRepository(session)

    claimed = await repo.claim_new_generation(
        aluno_id="aluno-1",
        classe_id=32,
        topico_id=121,
        conteudo_id=125,
        brainhex_profile_key="seeker",
        ciclo_id="ciclo-novo",
        source_hash="hash-novo",
    )

    assert claimed is True
    insert_sql, _params = session.calls[-1]
    assert "IS DISTINCT FROM EXCLUDED.source_hash" in insert_sql


@pytest.mark.asyncio
async def test_claim_new_generation_returns_none_when_schema_lacks_profile_key_column() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {"column_name": "ai_patch"},
                    {"column_name": "classe_id"},
                    {"column_name": "status"},
                    {"column_name": "source_hash"},
                ]
            ),
        ]
    )
    repo = ConteudoPersonalizadoRepository(session)

    claimed = await repo.claim_new_generation(
        aluno_id="aluno-1",
        classe_id=32,
        topico_id=121,
        conteudo_id=125,
        brainhex_profile_key="seeker",
        ciclo_id="ciclo-501",
        source_hash="hash-501",
    )

    assert claimed is None
    # Nenhuma tentativa de INSERT deve ter sido feita — so a query do cache de colunas.
    assert len(session.calls) == 1


@pytest.mark.asyncio
async def test_context_repository_builds_initial_state_context() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "lower_name": "modooperacao",
                        "camel_name": None,
                    }
                ]
            ),
            MappingResult(
                [
                    {
                        "id": "aluno-1",
                        "nome": "Aluno",
                        "email": "aluno@example.com",
                        "apelido": None,
                        "descricao": None,
                        "modo_resposta": "imediato",
                        "modo_operacao": "imediato",
                    }
                ]
            ),
            [SimpleNamespace(nome="Achiever", afinidade=80)],
            [FakeRow({"tipo": "atividade_concluida", "referencia": "1", "valor": 1, "criado_em": None})],
            MappingResult([{"topico_id": 1, "status": "em andamento", "percentual_concluido": 40, "ultima_atividade": 2}]),
            MappingResult(
                [
                    {
                        "media_acertos": 0.8,
                        "percentual_concluido": 40,
                        "tempo_medio_min": 12,
                        "topico_concluido": 0,
                        "atividade_recente_id": 2,
                    }
                ]
            ),
            ScalarResult(1),
            ScalarResult(True),
            MappingResult(
                [
                    {
                        "notamedia": 8.5,
                        "acertospercentual": 80,
                        "porcentagemconcluida": 40,
                        "ultimatividade": 2,
                        "tempogastomin": 12,
                        "iscomplete": False,
                        "atividadesconcluidas": None,
                    }
                ]
            ),
            MappingResult([{"id": "trilha-1", "trilha_modelo_id": 1, "configuracao": {"foo": "bar"}, "status": "ativa"}]),
            MappingResult([
                {
                    "lower_name": None,
                    "camel_name": '"iaDescricao"',
                }
            ]),
            MappingResult([{"id": 10, "recomendacaotrilha": "seguir", "modooperacao": "imediato", "insights": {}, "perfisdetectados": []}]),
        ]
    )

    context = await ContextRepository(session).fetch_aluno_context("aluno-1", 1)

    assert context["aluno"]["nome"] == "Aluno"
    assert context["perfil_brainhex"][0]["perfil"] == "Achiever"
    assert context["progresso_trilha"]["1"]["percentual_concluido"] == 40


@pytest.mark.asyncio
async def test_perfil_repository_emits_upserts_and_mode_update() -> None:
    session = RecordingSession(
        [
            [SimpleNamespace(id=1, nome="Achiever"), SimpleNamespace(id=2, nome="Mastermind")],
            ScalarResult(None),
            MappingResult(
                [
                    {
                        "lower_name": "modooperacao",
                        "camel_name": None,
                    }
                ]
            ),
            ScalarResult(9),
            ScalarResult(None),
        ]
    )
    perfil_update = PerfilUpdate(
        perfis=[PerfilScore(perfil="Achiever", afinidade=88)],
        modo_operacao_sugerido="imediato",
    )

    await PerfilRepository(session).atualizar_afinidades("aluno-1", perfil_update)

    assert any("INSERT INTO aluno_perfil" in sql for sql, _ in session.calls)
    assert any("UPDATE alunos" in sql for sql, _ in session.calls)


@pytest.mark.asyncio
async def test_trilha_notificacao_ia_and_evento_repositories_persist_expected_targets() -> None:
    session = RecordingSession(
        [
            ScalarResult(99),
            ScalarResult(None),
            ScalarResult(None),
            MappingResult([
                {
                    "lower_name": None,
                    "camel_name": '"iaDescricao"',
                }
            ]),
            ScalarResult(55),
            ScalarResult(None),
            ScalarResult(None),
        ]
    )

    await TrilhaRepository(session).aplicar_config(
        "aluno-1",
        TrilhaConfig(classe_id=1, topico_foco=10, proximos_topicos=[10, 11], ajustes=["reforcar"], justificativa="ok"),
    )
    await NotificacaoRepository(session).enfileirar(
        "aluno-1",
        NotificacaoPayload(
            tipo="suporte",
            titulo="Oi",
            corpo="Corpo",
            horario="2026-04-05T12:00:00Z",
            prioridade=2,
        ),
        TextoGerado(titulo="T", corpo="B"),
    )
    await IADescricaoRepository(session).upsert_cycle_summary(
        aluno_id="aluno-1",
        perfil_update=PerfilUpdate(perfis=[PerfilScore(perfil="Achiever", afinidade=80)], modo_operacao_sugerido="imediato"),
        recomendacao_trilha="seguir",
        insights={"ciclo_id": "1"},
    )
    await EventoRepository(session).log("aluno-1", "ciclo_executado", "1", 3)

    sql_statements = " ".join(sql for sql, _ in session.calls)
    insert_params = next(params for sql, params in session.calls if "INSERT INTO eventos_aluno" in sql)
    assert "UPDATE trilha_aluno" in sql_statements
    # A API grava a SUGESTAO da IA e so isso. A fila (`notificacoes_pendentes`)
    # e abastecida pelo trigger `trg_notificacoes_ia_promover`, no banco —
    # escrever nela aqui duplicaria a notificacao que chega ao aluno.
    assert "INSERT INTO notificacoes_ia" in sql_statements
    assert "INSERT INTO notificacoes_pendentes" not in sql_statements
    assert "UPDATE \"iaDescricao\"" in sql_statements or "UPDATE iadescricao" in sql_statements
    assert "INSERT INTO eventos_aluno" in sql_statements
    assert insert_params["referencia"] == "1"


@pytest.mark.asyncio
async def test_materiais_repository_saves_and_reads_materials() -> None:
    session = RecordingSession(
        [
            ScalarResult(None),
            ScalarResult(None),
            MappingResult(
                [
                    {
                        "tipo": "pdf",
                        "payload": {"titulo": "Resumo"},
                        "arquivo_url": None,
                    },
                    {
                        "tipo": "quiz",
                        "payload": [{"pergunta": "Q1"}],
                        "arquivo_url": None,
                    },
                ]
            ),
            MappingResult(
                [
                    {
                        "id": 1,
                        "aluno_id": "aluno-1",
                        "conteudo_id": 10,
                        "tipo": "pdf",
                        "payload": {"titulo": "Resumo"},
                        "arquivo_url": None,
                        "criado_em": "2026-04-05T12:00:00Z",
                    }
                ]
            ),
        ]
    )
    repo = MateriaisRepository(session)

    await repo.salvar(
        aluno_id="aluno-1",
        conteudo_id=10,
        materiais={
            "pdf": {"payload": {"titulo": "Resumo"}, "arquivo_url": None},
            "quiz": {"payload": [{"pergunta": "Q1"}], "arquivo_url": None},
        },
    )
    cached = await repo.buscar_por_conteudo("aluno-1", 10)
    listed = await repo.listar_por_aluno("aluno-1")

    assert any("INSERT INTO materiais_gerados" in sql for sql, _ in session.calls)
    assert any(
        "ON CONFLICT (personalizacao_id, tipo, generation_key)" in sql
        for sql, _ in session.calls
    )
    assert cached is not None
    assert "pdf" in cached
    assert listed[0]["tipo"] == "pdf"


@pytest.mark.asyncio
async def test_resolver_ids_por_tipo_recente_ignora_linhas_ja_vinculadas_a_outra_personalizacao() -> None:
    # Regressao real de producao: o loop por perfil BrainHex (7 personalizacoes
    # por topico) usa este resolver como fallback quando ainda nao existe linha
    # vinculada ao personalizacao_id do perfil atual. Sem filtrar por
    # personalizacao_id, o resolver podia "roubar" o id de uma linha JA
    # vinculada a OUTRO perfil (mesmo aluno/conteudo/tipo=audio) - o patch
    # subsequente entao recalculava a coluna gerada generation_key (derivada de
    # metadata->>'generation_key', que e por ciclo/topico, nao por perfil) e
    # colidia com "uq_materiais_gerados_personalizacao_tipo_generation" da
    # linha do outro perfil. O resolver so pode devolver linhas orfas
    # (personalizacao_id IS NULL) - nunca uma ja vinculada a outra personalizacao.
    session = RecordingSession([MappingResult([])])
    repo = MateriaisRepository(session)

    await repo.resolver_ids_por_tipo_recente(
        aluno_id="22222222-2222-2222-2222-222222222222",
        conteudo_id=170,
        tipos=["audio"],
        ciclo_id="cycle-1",
    )

    sql, _params = session.calls[-1]
    assert "personalizacao_id IS NULL" in sql


@pytest.mark.asyncio
async def test_materiais_repository_builds_public_url_from_storage_path() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "tipo": "pdf",
                        "payload": {"titulo": "Resumo"},
                        "arquivo_url": None,
                        "storage_path": "aluno-1/10/resumo-final.pdf",
                        "metadata": {"bucket": "conteudos"},
                        "personalizacao_id": 99,
                    }
                ]
            )
        ]
    )
    repo = MateriaisRepository(session)
    repo._public_base_url = "https://xrebtkmdewolzmpsdwgh.supabase.co"

    cached = await repo.buscar_por_conteudo("aluno-1", 10)

    assert cached is not None
    assert (
        cached["pdf"]["arquivo_url"]
        == "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/conteudos/aluno-1/10/resumo-final.pdf"
    )
    assert cached["pdf"]["storage_path"] == "aluno-1/10/resumo-final.pdf"


def test_conteudo_personalizado_repository_hydrates_materials_public_urls() -> None:
    repo = ConteudoPersonalizadoRepository(RecordingSession([]))
    repo._public_base_url = "https://xrebtkmdewolzmpsdwgh.supabase.co"

    record = repo._hydrate_record(
        {
            "id": 1,
            "plano": {},
            "materiais": {
                "apresentacao": {
                    "payload": {"titulo": "Slides"},
                    "arquivo_url": None,
                    "storage_path": "aluno-1/114/aula-01.pptx",
                    "metadata": {"bucket": "conteudos"},
                }
            },
            "ai_patch": None,
        }
    )

    assert (
        record["materiais"]["apresentacao"]["arquivo_url"]
        == "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/conteudos/aluno-1/114/aula-01.pptx"
    )
    assert record["materiais"]["apresentacao"]["storage_path"] == "aluno-1/114/aula-01.pptx"


@pytest.mark.asyncio
async def test_access_repository_admin_queries_and_updates() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "professor_id": "prof-1",
                        "nome": "Professor 1",
                        "descricao": None,
                        "instituicao": "TrailUp",
                        "disciplina": "Matematica",
                        "liberado": True,
                    }
                ]
            ),
            MappingResult(
                [
                    {
                        "aluno_id": "aluno-1",
                        "nome": "Aluno 1",
                        "email": "aluno1@example.com",
                    }
                ]
            ),
            MappingResult(
                [
                    {
                        "professor_id": "prof-1",
                        "aluno_id": "aluno-1",
                        "nome": "Aluno 1",
                        "email": "aluno1@example.com",
                    }
                ]
            ),
            ScalarResult(True),
            ScalarResult(True),
            ScalarResult(None),
            ScalarResult(None),
        ]
    )
    repo = AccessRepository(session)

    professores = await repo.list_admin_professors()
    alunos = await repo.list_admin_students()
    atribuicoes = await repo.list_direct_professor_assignments()
    professor_ok = await repo.professor_exists("prof-1")
    aluno_ok = await repo.aluno_exists("aluno-1")
    await repo.set_professor_liberado("prof-1", False)
    await repo.set_professor_student_access("prof-1", "aluno-1", True)

    sql_statements = " ".join(sql for sql, _ in session.calls)
    assert professores[0]["professor_id"] == "prof-1"
    assert alunos[0]["aluno_id"] == "aluno-1"
    assert atribuicoes[0]["aluno_id"] == "aluno-1"
    assert professor_ok is True
    assert aluno_ok is True
    assert "UPDATE professor" in sql_statements
    assert "INSERT INTO professor_aluno" in sql_statements


@pytest.mark.asyncio
async def test_conteudo_personalizado_repository_persists_ai_patch() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(77),
            MappingResult(
                [
                    {
                        "id": 77,
                        "aluno_id": "aluno-1",
                        "conteudo_id": 10,
                        "topico_id": 5,
                        "ciclo_id": "ciclo-1",
                        "plano": {"nivel": "equilibrado"},
                        "materiais": {"cards": {"payload": []}},
                        "ai_patch": {"mentalState": {"kind": "neutral"}},
                        "formato_prioritario": "cards",
                        "formatos_gerados": ["cards"],
                        "gerado_em": "2026-04-06T12:00:00Z",
                    }
                ]
            ),
        ]
    )
    repo = ConteudoPersonalizadoRepository(session)

    record_id = await repo.salvar(
        aluno_id="aluno-1",
        conteudo_id=10,
        topico_id=5,
        ciclo_id="ciclo-1",
        plano={"nivel": "equilibrado"},
        materiais={"cards": {"payload": []}},
        ai_patch={"mentalState": {"kind": "neutral"}},
        formato_prioritario="cards",
        formatos_gerados=["cards"],
    )
    record = await repo.buscar_por_id(record_id)

    assert record_id == 77
    assert record is not None
    assert record["ai_patch"]["mentalState"]["kind"] == "neutral"
    assert any("INSERT INTO conteudo_personalizado" in sql for sql, _ in session.calls)


@pytest.mark.asyncio
async def test_telemetria_repository_upserts_sessions_and_batches() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b",
                        "aluno_id": "aluno-1",
                        "classe_id": 1,
                        "topico_inicial_id": 10,
                        "camera_opt_in": True,
                        "started_at": "2026-04-06T15:00:00Z",
                        "ended_at": None,
                    }
                ]
            ),
            MappingResult([{"id": "batch-1", "sessao_id": "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b", "analysis_ciclo_id": None}]),
            ScalarResult(None),
        ]
    )
    repo = TelemetriaRepository(session)

    sessao = await repo.upsert_sessao(
        sessao_id="7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b",
        aluno_id="aluno-1",
        classe_id=1,
        topico_inicial_id=10,
        camera_opt_in=True,
        started_at="2026-04-06T15:00:00Z",
        ended_at=None,
    )
    lote, created = await repo.insert_or_get_lote(
        sessao_id="7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b",
        aluno_id="aluno-1",
        classe_id=1,
        topico_id=10,
        atividade_id=20,
        conteudo_id=33,
        screen_name="trilha_topico",
        route_name="/(tabs)/trilha/[id]",
        flush_reason="interval",
        captured_at="2026-04-06T15:03:00Z",
        study_elapsed_sec=180,
        screen_dwell_sec=180,
        active_sec=160,
        idle_sec=20,
        touch_count=12,
        scroll_distance_px=820,
        max_depth_px=1280,
        frame_sent=True,
        payload={"camera": {"enabled": True}},
    )
    await repo.update_lote_analysis(batch_id="batch-1", analysis_ciclo_id="ciclo-1")

    sql_statements = " ".join(sql for sql, _ in session.calls)
    assert sessao["id"] == "7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b"
    assert lote["id"] == "batch-1"
    assert created is True
    assert isinstance(session.calls[0][1]["started_at"], datetime)
    assert isinstance(session.calls[1][1]["captured_at"], datetime)
    assert "INSERT INTO telemetria_sessoes" in sql_statements
    assert "INSERT INTO telemetria_lotes" in sql_statements
    assert "UPDATE telemetria_lotes" in sql_statements


@pytest.mark.asyncio
async def test_telemetria_repository_reuses_existing_batch_on_conflict() -> None:
    session = RecordingSession(
        [
            MappingResult([]),
            MappingResult([{"id": "batch-existente", "sessao_id": "sessao-1", "analysis_ciclo_id": "ciclo-1"}]),
        ]
    )
    repo = TelemetriaRepository(session)

    lote, created = await repo.insert_or_get_lote(
        sessao_id="sessao-1",
        aluno_id="aluno-1",
        classe_id=1,
        topico_id=10,
        atividade_id=None,
        conteudo_id=33,
        screen_name="trilha_topico",
        route_name="/(tabs)/trilha/[id]",
        flush_reason="interval",
        captured_at="2026-04-06T15:03:00Z",
        study_elapsed_sec=180,
        screen_dwell_sec=180,
        active_sec=160,
        idle_sec=20,
        touch_count=12,
        scroll_distance_px=820,
        max_depth_px=1280,
        frame_sent=False,
        payload={"camera": {"enabled": False}},
    )

    assert created is False
    assert lote["id"] == "batch-existente"


@pytest.mark.asyncio
async def test_telemetria_repository_persists_app_events_with_conflict_guard() -> None:
    session = RecordingSession([ScalarResult(None), ScalarResult(None)])
    repo = TelemetriaRepository(session)

    await repo.insert_eventos_app(
        sessao_id="7bd1dfbe-58cf-4ab2-b8fd-4f3e63f8d33b",
        aluno_id="aluno-1",
        classe_id=1,
        screen_name="trilha_topico",
        route_name="/(tabs)/trilha/[id]",
        eventos=[
            {
                "client_event_id": "evt-1",
                "event_group": "session",
                "event_name": "session_start",
                "occurred_at": "2026-04-06T15:00:00Z",
                "topico_id": 10,
                "payload": {"screen_name": "trilha_topico"},
            },
            {
                "client_event_id": "evt-2",
                "event_group": "chat",
                "event_name": "chat_message",
                "occurred_at": "2026-04-06T15:02:00Z",
                "chat_role": "user",
                "trigger_context": "on_demand",
                "payload": {"message_length": 24},
            },
        ],
    )

    sql_statements = " ".join(sql for sql, _ in session.calls)
    assert "INSERT INTO telemetria_eventos_app" in sql_statements
    assert "ON CONFLICT (sessao_id, client_event_id) DO NOTHING" in sql_statements

    # UM `execute` para os dois eventos, com a lista de parametros (executemany),
    # e nao um por evento. O custo deixa de crescer com o tamanho do lote: num
    # lote de sessao real o endpoint fazia 53 round-trips e passou a fazer 6.
    assert len(session.calls) == 1, "os eventos vao num execute so"
    linhas = session.calls[0][1]
    assert isinstance(linhas, list), "executemany recebe lista de dicts"
    assert len(linhas) == 2

    # O conteudo por evento continua correto, cada um na sua linha.
    assert linhas[0]["screen_name"] == "trilha_topico"
    assert linhas[0]["client_event_id"] == "evt-1"
    assert linhas[1]["chat_role"] == "user"
    assert linhas[1]["client_event_id"] == "evt-2"

    # Toda linha tem o mesmo conjunto de chaves: com executemany, uma linha com
    # chave faltando quebraria o bind do statement inteiro, nao so a dela.
    assert {frozenset(linha) for linha in linhas} == {frozenset(linhas[0])}


@pytest.mark.asyncio
async def test_context_repository_fetches_student_without_modo_operacao_table() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "lower_name": None,
                        "camel_name": None,
                    }
                ]
            ),
            MappingResult(
                [
                    {
                        "id": "aluno-1",
                        "nome": "Aluno",
                        "email": "aluno@example.com",
                        "apelido": None,
                        "descricao": None,
                        "modo_resposta": "imediato",
                        "modo_operacao": None,
                    }
                ]
            ),
        ]
    )

    aluno = await ContextRepository(session)._fetch_aluno("aluno-1")

    assert aluno["modo_operacao"] is None
    assert any("NULL::text AS modo_operacao" in sql for sql, _ in session.calls)




@pytest.mark.asyncio
async def test_context_repository_returns_none_when_ia_descricao_relation_is_missing() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "lower_name": None,
                        "camel_name": None,
                    }
                ]
            )
        ]
    )

    result = await ContextRepository(session)._fetch_ia_descricao("aluno-1")

    assert result is None


@pytest.mark.asyncio
async def test_fontes_personalizacao_repository_casts_optional_context_filters() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(False),
            MappingResult([]),
        ]
    )

    await FontesPersonalizacaoRepository(session).listar_para_contexto(
        classe_id=10,
        topico_id=20,
        conteudo_id=47,
        aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        limit=40,
    )

    query_calls = [call for call in session.calls if "FROM fontes_personalizacao fp" in call[0]]
    assert query_calls
    sql, params = query_calls[-1]

    assert "CAST(:conteudo_id AS BIGINT)" in sql
    assert "CAST(:topico_id AS BIGINT)" in sql
    assert "CAST(:aluno_id AS UUID)" in sql
    assert "FROM fontes_personalizacao fp" in sql
    assert "fp.classe_id = params.classe_id" in sql
    assert "LOWER(COALESCE(NULLIF(BTRIM(c.tipo), ''), '')) = 'arquivo'" in sql
    assert "NULLIF(BTRIM(c.conteudo), '')" in sql
    assert "NULLIF(BTRIM(fp.descricao), '') ~ '[/\\\\]'" in sql
    assert params["conteudo_id"] == 47
    assert params["topico_id"] == 20


@pytest.mark.asyncio
async def test_fontes_personalizacao_repository_aggregates_content_sources_for_topic_scope() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(False),
            MappingResult([]),
        ]
    )

    await FontesPersonalizacaoRepository(session).listar_para_contexto(
        classe_id=10,
        topico_id=20,
        conteudo_id=None,
        aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        limit=40,
    )

    query_calls = [call for call in session.calls if "FROM fontes_personalizacao fp" in call[0]]
    assert query_calls
    sql, params = query_calls[-1]

    assert "params.conteudo_id IS NULL" in sql
    assert "fp.topico_id = params.topico_id" in sql
    assert "c.topico_id = params.topico_id" in sql
    assert params["conteudo_id"] is None
    assert params["topico_id"] == 20


@pytest.mark.asyncio
async def test_fontes_personalizacao_repository_paginates_complete_context() -> None:
    rows = [
        {
            "id": index,
            "metadata": {},
            "_total_count": 120,
        }
        for index in range(1, 121)
    ]
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(False),
            MappingResult(rows[:50]),
            MappingResult(rows[50:100]),
            MappingResult(rows[100:]),
        ]
    )

    result = await FontesPersonalizacaoRepository(session).listar_para_contexto(
        classe_id=10,
        topico_id=20,
        conteudo_id=None,
        aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        page_size=50,
        max_items=200,
    )

    assert len(result) == 120
    assert [item["id"] for item in result] == list(range(1, 121))
    query_calls = [
        call for call in session.calls if "FROM fontes_personalizacao fp" in call[0]
    ]
    assert [call[1]["offset"] for call in query_calls] == [0, 50, 100]
    assert all(call[1]["limit"] == 50 for call in query_calls[:2])


@pytest.mark.asyncio
async def test_fontes_personalizacao_repository_fails_explicitly_above_safety_cap() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(False),
            MappingResult(
                [
                    {
                        "id": 1,
                        "metadata": {},
                        "_total_count": 401,
                    }
                ]
            ),
        ]
    )

    with pytest.raises(FontesContextLimitExceeded, match=r"limite explicito de 400"):
        await FontesPersonalizacaoRepository(session).listar_para_contexto(
            classe_id=10,
            topico_id=20,
            conteudo_id=None,
            aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754",
            page_size=100,
            max_items=400,
        )


@pytest.mark.asyncio
async def test_fontes_personalizacao_seed_uses_conteudo_path_when_url_missing() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(False),
            SimpleNamespace(rowcount=2),
            SimpleNamespace(rowcount=0),
        ]
    )
    repo = FontesPersonalizacaoRepository(session)

    result = await repo.seed_from_class_content(classe_id=30, topico_ids=[114])

    insert_calls = [call for call in session.calls if "INSERT INTO fontes_personalizacao" in call[0]]
    assert insert_calls
    sql_conteudos = insert_calls[0][0]

    assert "LOWER(COALESCE(NULLIF(BTRIM(c.tipo), ''), '')) = 'arquivo'" in sql_conteudos
    assert "NULLIF(BTRIM(c.conteudo), '')" in sql_conteudos
    assert "AS asset_ref" in sql_conteudos
    assert "CASE WHEN c.asset_ref ~* '^https?://'" in sql_conteudos
    assert result == {"conteudos": 2, "midias": 0, "total": 2}


@pytest.mark.asyncio
async def test_fontes_personalizacao_atualizar_enriquecimento_updates_fields_and_metadata() -> None:
    session = RecordingSession(
        [
            ScalarResult(True),
            ScalarResult(16),
        ]
    )
    repo = FontesPersonalizacaoRepository(session)

    updated = await repo.atualizar_enriquecimento(
        fonte_id=16,
        descricao="Texto extraido do arquivo base com contexto suficiente para personalizacao.",
        arquivo_url=(
            "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/"
            "conteudos/b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
        ),
        storage_path="b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
        mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        nome_arquivo="1776024640723_SPD-Aula-01-introducao.pptx",
        tamanho_bytes=3210,
        metadata_patch={"bucket": "conteudos"},
    )

    assert updated is True
    assert session.commits == 1
    update_calls = [call for call in session.calls if "UPDATE fontes_personalizacao" in call[0]]
    assert update_calls
    sql, params = update_calls[-1]
    assert "descricao = COALESCE(CAST(:descricao AS TEXT), descricao)" in sql
    assert "metadata = CASE" in sql
    assert params["fonte_id"] == 16
    assert params["metadata_patch"]["bucket"] == "conteudos"


@pytest.mark.asyncio
async def test_incrementar_falha_streak_casts_generation_key_for_asyncpg() -> None:
    """generation_key so aparece dentro de jsonb_build_object (contexto
    polimorfico "any") antes de qualquer uso em contexto text - o asyncpg
    nao consegue inferir o tipo do parametro e falha com
    AmbiguousParameterError em producao (confirmado ao vivo). Precisa de
    CAST(:generation_key AS TEXT) para fixar o tipo."""
    session = RecordingSession([ScalarResult("1")])
    repo = ConteudoPersonalizadoRepository(session)

    await repo.incrementar_falha_streak(
        record_id=3127,
        ciclo_id="ciclo-1",
        source_hash="hash-1",
        generation_key="ciclo-1:hash-1",
    )

    sql, _params = session.calls[-1]
    assert "CAST(:generation_key AS TEXT)" in sql


@pytest.mark.asyncio
async def test_resetar_falha_streak_zera_contador_mantendo_generation_key() -> None:
    """Usado pelo retry manual do professor - zera o streak (mesmo
    generation_key) pra destravar uma geracao cujo circuit breaker
    automatico ja parou de redisparar sozinho."""
    session = RecordingSession([ScalarResult(None)])
    repo = ConteudoPersonalizadoRepository(session)

    await repo.resetar_falha_streak(
        record_id=249,
        ciclo_id="ciclo-249",
        source_hash="hash-249",
        generation_key="ciclo-249:hash-249",
    )

    sql, params = session.calls[-1]
    assert "'streak', 0" in sql
    assert "CAST(:generation_key AS TEXT)" in sql
    assert params["id"] == 249
    assert params["generation_key"] == "ciclo-249:hash-249"


@pytest.mark.asyncio
async def test_buscar_cards_ativos_ignora_perfil_e_filtra_por_ativo() -> None:
    """Cards nao variam por perfil BrainHex - a busca deve trazer o conjunto
    ativo do aluno/topico/conteudo sem filtrar por brainhex_profile_key, para
    que todos os perfis do mesmo aluno reaproveitem o mesmo lote em vez de
    regerar (o que muda o "id" a cada vez e quebra o source_hash)."""
    session = RecordingSession(
        [
            MappingResult(
                [
                    {"id": 2054, "ordem": 1, "titulo": "Card 1", "descricao": "Frente/verso",
                     "icone": None, "dificuldade": None, "xp": None, "metadata": {}},
                ]
            ),
        ]
    )
    repo = ArtefatosPersonalizadosRepository(session)

    cards = await repo.buscar_cards_ativos(
        aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        topico_id=122,
        conteudo_id=150,
    )

    assert [c["id"] for c in cards] == [2054]
    sql, params = session.calls[-1]
    assert "brainhex_profile_key" not in sql
    assert "ativo = TRUE" in sql
    assert params["aluno_id"] == "b49f2e21-a6f9-4c8d-9533-5a32bb219754"
    assert params["topico_id"] == 122
    assert params["conteudo_id"] == 150


@pytest.mark.asyncio
async def test_inserir_targets_media_generation_grava_media_kind_block_id_part_ordem():
    session = RecordingSession([ScalarResult(True), DummyResult(), DummyResult()])
    repo = PersonalizacaoJobsRepository(session)

    await repo.inserir_targets_media_generation(
        job_id="job-1",
        targets=[
            {
                "aluno_id": "aluno-1", "topico_id": 100, "conteudo_id": None,
                "brainhex_profile_key": "mastermind", "media_kind": "enriquecimento",
                "block_id": "bloco-01", "part_ordem": None, "status": "pending",
            },
        ],
    )

    sql, params = session.calls[1]
    assert "INSERT INTO personalizacao_job_targets" in sql
    assert "media_kind" in sql
    assert "block_id" in sql
    assert "part_ordem" in sql
    assert params["media_kind"] == "enriquecimento"
    assert params["block_id"] == "bloco-01"
    assert params["part_ordem"] is None


@pytest.mark.asyncio
async def test_get_targets_inclui_colunas_granulares():
    row = {
        "id": 1, "job_id": "job-1", "aluno_id": "aluno-1", "topico_id": 100,
        "conteudo_id": None, "brainhex_profile_key": "mastermind", "is_profile_template": False,
        "status": "completed", "attempts": 1, "last_error": None, "personalizacao_id": None,
        "created_at": None, "updated_at": None, "media_kind": "capitulo", "block_id": "bloco-01", "part_ordem": None,
    }
    session = RecordingSession([ScalarResult(True), MappingResult([row])])
    repo = PersonalizacaoJobsRepository(session)

    targets = await repo.get_targets("job-1")

    assert targets[0]["media_kind"] == "capitulo"
    assert targets[0]["block_id"] == "bloco-01"
    sql, _params = session.calls[1]
    assert "media_kind" in sql


@pytest.mark.asyncio
async def test_aluno_topico_dominio_buscar_por_classe_maps_rows() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "topico_id": 10,
                        "dominio_estimado": 0.72,
                        "tendencia": "ascendente",
                        "confianca": 0.66,
                        "atualizado_em": datetime(2026, 8, 19),
                    }
                ]
            )
        ]
    )
    repo = AlunoTopicoDominioRepository(session)

    registros = await repo.buscar_por_classe(aluno_id="aluno-1", classe_id=32)

    assert set(registros) == {"10"}
    assert registros["10"]["dominio_estimado"] == 0.72
    assert registros["10"]["tendencia"] == "ascendente"


@pytest.mark.asyncio
async def test_aluno_topico_dominio_upsert_sends_on_conflict_update() -> None:
    session = RecordingSession([ScalarResult(True)])
    repo = AlunoTopicoDominioRepository(session)

    await repo.upsert(
        aluno_id="aluno-1",
        topico_id=10,
        dominio_estimado=0.8,
        tendencia="ascendente",
        confianca=0.7,
    )

    sql, params = session.calls[0]
    assert "INSERT INTO aluno_topico_dominio" in sql
    assert "ON CONFLICT (aluno_id, topico_id) DO UPDATE" in sql
    assert params["dominio_estimado"] == 0.8
