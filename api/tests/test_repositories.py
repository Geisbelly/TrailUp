from types import SimpleNamespace
from datetime import datetime

import pytest

from app.repositories.context import ContextRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.repositories.evento import EventoRepository
from app.repositories.ia_descricao import IADescricaoRepository
from app.repositories.access import AccessRepository
from app.repositories.materiais import MateriaisRepository
from app.repositories.notificacao import NotificacaoRepository
from app.repositories.perfil import PerfilRepository
from app.repositories.fontes_personalizacao import FontesPersonalizacaoRepository
from app.repositories.telemetria import TelemetriaRepository
from app.repositories.trilha import TrilhaRepository
from app.schemas.notificacao import NotificacaoPayload
from app.schemas.perfil import PerfilScore, PerfilUpdate
from app.schemas.texto_gerado import TextoGerado
from app.schemas.trilha_config import TrilhaConfig


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar(self):
        return self.value

    def scalar_one(self):
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

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        if self.responses:
            return self.responses.pop(0)
        return DummyResult()

    async def commit(self):
        self.commits += 1


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
    assert "INSERT INTO notificacoes_pendentes" in sql_statements
    assert "INSERT INTO notificacoes_ia" in sql_statements
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
    assert cached is not None
    assert "pdf" in cached
    assert listed[0]["tipo"] == "pdf"


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
    assert session.calls[0][1]["screen_name"] == "trilha_topico"
    assert session.calls[1][1]["chat_role"] == "user"


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
