from datetime import UTC, date, datetime, timedelta
from io import StringIO
from unittest.mock import AsyncMock

import pytest

from app.api.deps import get_session, require_professor
from app.api.v1 import insights as insights_api
from app.db import migrations
from app.schemas.insights import InsightGerado, InsightsTurmaSaida
from app.services import insights_turma
from app.services.insights_turma import (
    InsightsIndisponiveis,
    InsightsTurmaService,
    montar_payload,
    validar_insights,
)
from app.services.llm import StructuredOutputError
from tests.conftest import FakeSession
from tests.test_migrations import _offline_alembic_config


def _item(**campos) -> InsightGerado:
    base = {
        "natureza": "sugestao",
        "escopo": "turma",
        "aluno_ref": None,
        "tipo": "pedagogica",
        "texto": "Revise Frações com a turma",
        "base": "38% de acertos em Frações",
    }
    return InsightGerado(**{**base, **campos})


# ---------------------------------------------------------------- payload


def test_payload_troca_uuid_por_ref_e_mantem_ausencia_como_none() -> None:
    alunos = [
        {"aluno_id": "u-b", "perfil": "seeker", "percentual_concluido": 40},
        {"aluno_id": "u-a", "perfil": "seeker", "percentual_concluido": None},
    ]
    payload, refs = montar_payload(
        alunos,
        nomes={"u-a": "Ana Clara Souza", "u-b": None},
        abandono={"u-a": 12.5},
        ultima_sessao={"u-a": date(2026, 9, 20)},
        respostas={"u-a": {"respostas": 8, "acertos_pct": 62.5}},
        topicos=[],
        descartados=[],
        hoje=date(2026, 9, 29),
    )

    assert refs == {"A1": "u-a", "A2": "u-b"}
    a1, a2 = payload["alunos"]
    assert a1 == {
        "ref": "A1",
        "nome": "Ana",
        "perfil": "seeker",
        "conclusao_pct": None,
        "respostas_30d": 8,
        "acertos_30d_pct": 62.5,
        "abandono_material_pct": 12.5,
        "dias_sem_sessao": 9,
    }
    # Sem dado continua sem dado: nada vira zero no caminho ate o modelo.
    assert a2["acertos_30d_pct"] is None
    assert a2["abandono_material_pct"] is None
    assert a2["dias_sem_sessao"] is None
    assert payload["turma"] == {"total_alunos": 2, "perfis": {"seeker": 2}}
    assert "u-a" not in str(payload)


# ---------------------------------------------------------------- validacao


def test_validar_descarta_aluno_fora_da_turma_e_repetidos() -> None:
    refs = {"A1": "u-a"}
    saida = InsightsTurmaSaida(
        insights=[
            _item(),
            _item(texto="  revise   frações com a turma "),  # repetido, com outro espaçamento
            _item(escopo="aluno", aluno_ref="A9", texto="Fale com o aluno"),  # ref inventada
            _item(escopo="aluno", aluno_ref="a1", texto="Ana não entra há 9 dias", tipo="engajamento"),
            _item(texto="   "),
        ]
    )

    itens = validar_insights(saida, refs)

    assert [i["texto"] for i in itens] == ["Revise Frações com a turma", "Ana não entra há 9 dias"]
    assert itens[0]["aluno_id"] is None
    assert itens[1]["aluno_id"] == "u-a"


def test_validar_corta_no_maximo_e_limita_o_texto() -> None:
    saida = InsightsTurmaSaida(insights=[_item(texto=f"Item {i} " + "x" * 400) for i in range(9)])

    itens = validar_insights(saida, {})

    assert len(itens) == insights_turma.MAX_INSIGHTS
    assert all(len(i["texto"]) <= insights_turma.MAX_TEXTO for i in itens)


# ---------------------------------------------------------------- gerar


@pytest.mark.asyncio
async def test_gerar_grava_lote_com_mesmo_geracao_id(monkeypatch) -> None:
    session = FakeSession()
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = InsightsTurmaSaida(
        insights=[_item(), _item(escopo="aluno", aluno_ref="A1", texto="Ana sumiu", tipo="engajamento")]
    )
    service = InsightsTurmaService(session, llm)
    monkeypatch.setattr(
        service,
        "coletar_contexto",
        AsyncMock(return_value=({"alunos": [{"ref": "A1"}]}, {"A1": "u-a"})),
    )

    resultado = await service.gerar(7)

    assert resultado == ("concluido", 2)
    assert llm.ainvoke_structured.await_args.kwargs["prompt_name"] == "insights_turma.txt"
    inserts = [params for stmt, params in session.executed if "INSERT INTO intervencoes" in str(stmt)]
    assert len(inserts) == 2
    assert {p["geracao_id"] for p in inserts} == {inserts[0]["geracao_id"]}
    assert [p["aluno_id"] for p in inserts] == [None, "u-a"]
    assert all(p["classe_id"] == 7 for p in inserts)
    assert session.commits == 1


@pytest.mark.asyncio
async def test_gerar_sem_modelo_nao_inventa_insight(monkeypatch) -> None:
    session = FakeSession()
    llm = AsyncMock()
    llm.ainvoke_structured.side_effect = StructuredOutputError("sem provedor")
    service = InsightsTurmaService(session, llm)
    monkeypatch.setattr(service, "coletar_contexto", AsyncMock(return_value=({}, {"A1": "u-a"})))

    assert await service.gerar(7) == ("falhou", 0)
    assert session.executed == []


@pytest.mark.asyncio
async def test_gerar_turma_sem_alunos_nem_chama_o_modelo(monkeypatch) -> None:
    llm = AsyncMock()
    service = InsightsTurmaService(FakeSession(), llm)
    monkeypatch.setattr(service, "coletar_contexto", AsyncMock(return_value=({}, {})))

    assert await service.gerar(7) == ("sem_dados", 0)
    llm.ainvoke_structured.assert_not_awaited()


# ---------------------------------------------------------------- endpoint


@pytest.fixture
def api_professor(app, professor_user, monkeypatch):
    app.dependency_overrides[require_professor] = lambda: professor_user
    async def sessao_falsa():
        yield FakeSession()

    app.dependency_overrides[get_session] = sessao_falsa
    dono = AsyncMock(return_value=True)
    monkeypatch.setattr(insights_api.AccessRepository, "professor_owns_classe", dono)
    monkeypatch.setattr(InsightsTurmaService, "ultima_geracao_em", AsyncMock(return_value=None))
    yield dono
    app.dependency_overrides.clear()


def test_endpoint_dispara_em_segundo_plano_e_status_acompanha(client, api_professor, monkeypatch) -> None:
    gerar = AsyncMock(return_value=("concluido", 3))
    monkeypatch.setattr(InsightsTurmaService, "gerar", gerar)

    assert client.get("/api/v1/insights/turma/7/status").json()["status"] == "ocioso"

    resposta = client.post("/api/v1/insights/turma/7/gerar")

    assert resposta.status_code == 202
    assert resposta.json()["status"] == "gerando"
    # O TestClient roda a tarefa de fundo antes de devolver a resposta.
    gerar.assert_awaited_once_with(7)
    assert client.get("/api/v1/insights/turma/7/status").json() == {
        "status": "concluido",
        "itens": 3,
        "ultima_geracao_em": None,
    }


def test_endpoint_nao_regera_lote_recente(client, api_professor, monkeypatch) -> None:
    gerar = AsyncMock(return_value=("concluido", 1))
    monkeypatch.setattr(InsightsTurmaService, "gerar", gerar)
    monkeypatch.setattr(
        InsightsTurmaService,
        "ultima_geracao_em",
        AsyncMock(return_value=datetime.now(UTC) - timedelta(minutes=1)),
    )

    resposta = client.post("/api/v1/insights/turma/7/gerar")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "recente"
    gerar.assert_not_awaited()


def test_endpoint_nao_dispara_segunda_geracao_simultanea(client, app, api_professor, monkeypatch) -> None:
    gerar = AsyncMock(return_value=("concluido", 1))
    monkeypatch.setattr(InsightsTurmaService, "gerar", gerar)
    insights_api._geracoes(app)[7] = {"status": "gerando", "itens": None}

    resposta = client.post("/api/v1/insights/turma/7/gerar")

    assert resposta.json()["status"] == "gerando"
    gerar.assert_not_awaited()


def test_endpoint_falha_do_servico_vira_status_falhou(client, api_professor, monkeypatch) -> None:
    monkeypatch.setattr(InsightsTurmaService, "gerar", AsyncMock(side_effect=RuntimeError("banco caiu")))

    client.post("/api/v1/insights/turma/7/gerar")

    assert client.get("/api/v1/insights/turma/7/status").json()["status"] == "falhou"


def test_endpoint_sem_migracao_responde_503_sem_disparar(client, api_professor, monkeypatch) -> None:
    gerar = AsyncMock(return_value=("concluido", 1))
    monkeypatch.setattr(InsightsTurmaService, "gerar", gerar)
    monkeypatch.setattr(
        InsightsTurmaService,
        "ultima_geracao_em",
        AsyncMock(side_effect=InsightsIndisponiveis('column "classe_id" does not exist')),
    )

    resposta = client.post("/api/v1/insights/turma/7/gerar")

    assert resposta.status_code == 503
    assert resposta.json()["detail"]["code"] == "insights_indisponiveis"
    gerar.assert_not_awaited()


def test_endpoint_recusa_classe_de_outro_professor(client, api_professor) -> None:
    api_professor.return_value = False

    assert client.post("/api/v1/insights/turma/7/gerar").status_code == 403
    assert client.get("/api/v1/insights/turma/7/status").status_code == 403


# ---------------------------------------------------------------- migration


def test_migration_insights_renderiza_colunas_e_rls_do_professor() -> None:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20260922_06:20260929_01", sql=True)
    rendered = output.getvalue()

    for coluna in ("classe_id", "escopo", "natureza", "texto", "base", "motivo_descarte", "geracao_id"):
        assert f"ADD COLUMN IF NOT EXISTS {coluna}" in rendered
    assert "ALTER COLUMN aluno_id DROP NOT NULL" in rendered
    assert "CHECK ((escopo <> 'aluno' OR aluno_id IS NOT NULL) AND (escopo <> 'turma' OR classe_id IS NOT NULL))" in rendered
    assert "'ja_resolvido', 'nao_se_aplica', 'revisar_depois'" in rendered

    # O aluno deixa de ler: a policy antiga (aluno_id = auth.uid()) cai.
    assert "DROP POLICY IF EXISTS intervencoes_sel ON public.intervencoes" in rendered
    assert "auth.uid()" not in rendered
    assert "CREATE POLICY intervencoes_professor_sel" in rendered
    assert "CREATE POLICY intervencoes_professor_upd" in rendered
    assert rendered.count("public.app_classes_do_professor()") == 3
    assert "status IN ('applied', 'dismissed')" in rendered

    # O professor so mexe na decisao, nunca no que a IA escreveu.
    assert rendered.index("REVOKE UPDATE ON public.intervencoes FROM anon, authenticated") < rendered.index(
        "GRANT UPDATE (status, motivo_descarte, resolved_at) ON public.intervencoes TO authenticated"
    )
    assert "UPDATE alembic_version SET version_num='20260929_01'" in rendered


def test_migration_insights_downgrade_devolve_policy_do_aluno() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20260929_01:20260922_06", sql=True)
    rendered = output.getvalue()

    assert rendered.index("DELETE FROM public.intervencoes WHERE aluno_id IS NULL") < rendered.index(
        "ALTER COLUMN aluno_id SET NOT NULL"
    )
    assert "CREATE POLICY intervencoes_sel ON public.intervencoes" in rendered
    assert "DROP POLICY IF EXISTS intervencoes_professor_upd" in rendered
