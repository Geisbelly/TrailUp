from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.api.deps import get_session, require_professor
from app.schemas.escriba import EscribaSaida, PerguntaEscriba, RespostaEscriba
from app.services.escriba import EscribaIndisponivel, EscribaService, TurmaNaoPermitida, _linha
from app.services.llm import StructuredOutputError
from tests.conftest import FakeSession

TURMAS = [{"id": 54, "descricao": "SPD - 3N"}, {"id": 56, "descricao": "Redes"}]


def _servico(monkeypatch, llm=None) -> tuple[EscribaService, AsyncMock]:
    llm = llm or AsyncMock()
    service = EscribaService(FakeSession(), llm)
    monkeypatch.setattr(service, "turmas_do_professor", AsyncMock(return_value=TURMAS))
    contexto = AsyncMock(side_effect=lambda turma, agora: {"turma": turma["descricao"], "alunos": []})
    monkeypatch.setattr(service, "contexto_da_turma", contexto)
    return service, contexto


# ---------------------------------------------------------------- serviço


@pytest.mark.asyncio
async def test_turma_de_outro_professor_e_recusada_antes_de_ler_qualquer_dado(monkeypatch) -> None:
    service, contexto = _servico(monkeypatch)

    with pytest.raises(TurmaNaoPermitida):
        await service.perguntar("prof-1", PerguntaEscriba(pergunta="Quem precisa de atenção?", classe_id=999))

    contexto.assert_not_awaited()
    service.llm.ainvoke_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_turma_propria_so_manda_ela_ao_modelo(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="  Ana precisa de atenção.  ")
    service, contexto = _servico(monkeypatch, llm)

    r = await service.perguntar(
        "prof-1",
        PerguntaEscriba(pergunta="Quem precisa de atenção?", classe_id=56, historico=[{"papel": "professor", "texto": "oi"}]),
    )

    assert r.resposta == "Ana precisa de atenção."
    assert r.turmas == [56]
    payload = llm.ainvoke_structured.await_args.kwargs["payload"]
    assert [t["turma"] for t in payload["turmas"]] == ["Redes"]
    assert payload["historico"] == [{"papel": "professor", "texto": "oi"}]
    assert llm.ainvoke_structured.await_args.kwargs["prompt_name"] == "escriba.txt"


@pytest.mark.asyncio
async def test_sem_turma_escolhida_le_so_as_turmas_do_professor(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.return_value = EscribaSaida(resposta="ok")
    service, _ = _servico(monkeypatch, llm)

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="Como estão as turmas?"))

    assert r.turmas == [54, 56]
    service.turmas_do_professor.assert_awaited_once_with("prof-1")


@pytest.mark.asyncio
async def test_professor_sem_turma_nao_chama_o_modelo(monkeypatch) -> None:
    service, _ = _servico(monkeypatch)
    service.turmas_do_professor.return_value = []

    r = await service.perguntar("prof-1", PerguntaEscriba(pergunta="Oi"))

    assert r.turmas == []
    service.llm.ainvoke_structured.assert_not_awaited()


@pytest.mark.asyncio
async def test_modelo_fora_do_ar_nao_inventa_resposta(monkeypatch) -> None:
    llm = AsyncMock()
    llm.ainvoke_structured.side_effect = StructuredOutputError("sem provedor")
    service, _ = _servico(monkeypatch, llm)

    with pytest.raises(EscribaIndisponivel):
        await service.perguntar("prof-1", PerguntaEscriba(pergunta="Oi", classe_id=54))


@pytest.mark.asyncio
async def test_turmas_do_professor_filtra_pelo_professor_autenticado() -> None:
    session = FakeSession()

    class Resultado:
        def mappings(self):
            return []

    async def executar(stmt, params=None):
        session.executed.append((stmt, params))
        return Resultado()

    session.execute = executar  # type: ignore[method-assign]
    await EscribaService(session, AsyncMock()).turmas_do_professor("prof-1")

    stmt, params = session.executed[0]
    assert "WHERE professor_id = CAST(:professor_id AS uuid)" in str(stmt)
    assert params == {"professor_id": "prof-1"}


# ---------------------------------------------------------------- endpoint


@pytest.fixture
def api_professor(app, professor_user):
    async def sessao_falsa():
        yield FakeSession()

    app.dependency_overrides[require_professor] = lambda: professor_user
    app.dependency_overrides[get_session] = sessao_falsa
    yield
    app.dependency_overrides.clear()


def test_endpoint_recusa_turma_de_outro_professor(client, api_professor, monkeypatch) -> None:
    monkeypatch.setattr(EscribaService, "turmas_do_professor", AsyncMock(return_value=TURMAS))
    llm = AsyncMock()
    monkeypatch.setattr("app.services.llm.JsonLLMService.ainvoke_structured", llm)

    resposta = client.post("/api/v1/escriba/perguntar", json={"pergunta": "Como está a turma?", "classe_id": 999})

    assert resposta.status_code == 403
    llm.assert_not_awaited()


def test_endpoint_responde_sobre_turma_propria(client, api_professor, monkeypatch) -> None:
    perguntar = AsyncMock(
        return_value=RespostaEscriba(resposta="Tudo certo.", turmas=[54], gerado_em=datetime(2026, 9, 29, tzinfo=UTC))
    )
    monkeypatch.setattr(EscribaService, "perguntar", perguntar)

    resposta = client.post("/api/v1/escriba/perguntar", json={"pergunta": "Como está a turma?", "classe_id": 54})

    assert resposta.status_code == 200
    assert resposta.json()["resposta"] == "Tudo certo."
    assert perguntar.await_args.args[0] == "prof-1"


def test_endpoint_modelo_indisponivel_vira_503(client, api_professor, monkeypatch) -> None:
    monkeypatch.setattr(EscribaService, "perguntar", AsyncMock(side_effect=EscribaIndisponivel("x")))

    resposta = client.post("/api/v1/escriba/perguntar", json={"pergunta": "Oi"})

    assert resposta.status_code == 503
    assert resposta.json()["detail"]["code"] == "escriba_indisponivel"


def test_endpoint_valida_a_pergunta(client, api_professor) -> None:
    assert client.post("/api/v1/escriba/perguntar", json={"pergunta": ""}).status_code == 422
    assert client.post("/api/v1/escriba/perguntar", json={"pergunta": "x" * 501}).status_code == 422


def test_endpoint_exige_professor(client, app, aluno_user) -> None:
    from app.api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: aluno_user
    try:
        assert client.post("/api/v1/escriba/perguntar", json={"pergunta": "Oi"}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_nota_zero_das_views_vira_sem_dado() -> None:
    linha = _linha({"perfil_nome": "seeker", "media_nota": 0, "taxa_acertos_pct": "12.3188", "total_alunos_segmento": 1})
    assert linha == {"perfil_nome": "seeker", "media_nota": None, "taxa_acertos_pct": 12.3, "total_alunos_segmento": 1.0}
    assert _linha({"media_nota_turma": "7.25"})["media_nota_turma"] == 7.2
