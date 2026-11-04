"""#195: a IA do TrailUp e so para maiores de 18. Menor (ou sem data de
nascimento) -> nenhuma chamada sai, nem Gemini nem OpenAI. Adulto confirmado ->
provedor atual."""

from __future__ import annotations

import asyncio
import inspect
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from pydantic import BaseModel

from app.core.settings import Settings
from app.services import llm as llm_module
from app.services import roteamento_ia
from app.services.llm import JsonLLMService, MenorSemOpenAIError, StructuredOutputError
from app.services.roteamento_ia import (
    MENSAGEM_IA_INDISPONIVEL,
    IAIndisponivelParaMenor,
    decidir_rota,
    rota_atual,
    rota_de_menor_ativa,
    rota_ia_para_alunos,
    rota_ia_para_turma,
    rota_ia_se_tiver_aluno,
    usar_rota,
)

pytestmark = pytest.mark.idade_real

ADULTO = "11111111-1111-4111-8111-111111111111"
MENOR = "22222222-2222-4222-8222-222222222222"


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = dict(supabase_jwt_secret="test-secret", admin_panel_password="secret-admin")
    base.update(overrides)
    return Settings(**base)


class _Result:
    def __init__(self, row: dict[str, Any] | None) -> None:
        self._row = row

    def mappings(self) -> "_Result":
        return self

    def first(self) -> dict[str, Any] | None:
        return self._row


class _IdadeSession:
    """Simula public.aluno_eh_menor: ids em `menores` -> true, em `sem_data`
    -> NULL, o resto -> false (adulto)."""

    def __init__(self, menores: set[str] = frozenset(), sem_data: set[str] = frozenset(), erro: bool = False) -> None:
        self.menores = set(menores)
        self.sem_data = set(sem_data)
        self.erro = erro
        self.executed: list[tuple[str, dict[str, Any]]] = []
        self.rollbacks = 0

    async def execute(self, stmt: Any, params: dict[str, Any] | None = None) -> _Result:
        self.executed.append((str(stmt), dict(params or {})))
        if self.erro:
            raise RuntimeError("banco fora")
        ids = list((params or {}).get("ids") or [])
        nao_adultos = sum(1 for i in ids if i in self.menores or i in self.sem_data)
        return _Result({"nao_adultos": nao_adultos, "total": len(ids)})

    async def rollback(self) -> None:
        self.rollbacks += 1


# ---------------------------------------------------------------- decidir_rota


@pytest.mark.asyncio
async def test_adulto_confirmado_segue_provedor_atual() -> None:
    session = _IdadeSession()
    assert await decidir_rota(session, [ADULTO]) == "padrao"
    sql, params = session.executed[0]
    assert "aluno_eh_menor" in sql and "IS DISTINCT FROM false" in sql
    assert params == {"ids": [ADULTO]}


@pytest.mark.asyncio
async def test_menor_vai_para_rota_de_menor() -> None:
    assert await decidir_rota(_IdadeSession(menores={MENOR}), [MENOR]) == "menor"


@pytest.mark.asyncio
async def test_sem_data_de_nascimento_e_tratado_como_menor() -> None:
    assert await decidir_rota(_IdadeSession(sem_data={MENOR}), [MENOR]) == "menor"


@pytest.mark.asyncio
async def test_erro_no_banco_e_fail_closed() -> None:
    session = _IdadeSession(erro=True)
    assert await decidir_rota(session, [ADULTO]) == "menor"
    assert session.rollbacks == 1


@pytest.mark.asyncio
async def test_erro_com_savepoint_nao_derruba_a_transacao_do_chamador() -> None:
    class _ComSavepoint(_IdadeSession):
        def __init__(self) -> None:
            super().__init__(erro=True)
            self.savepoints = 0

        def begin_nested(self):
            sessao = self

            class _Ctx:
                async def __aenter__(self_inner):
                    sessao.savepoints += 1

                async def __aexit__(self_inner, *exc):
                    return False

            return _Ctx()

    session = _ComSavepoint()
    assert await decidir_rota(session, [ADULTO]) == "menor"
    assert session.savepoints == 1
    assert session.rollbacks == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("ids", [[], [None], [""], ["None"], [ADULTO, None]])
async def test_id_vazio_ou_ausente_e_menor(ids: list[Any]) -> None:
    session = _IdadeSession()
    assert await decidir_rota(session, ids) == "menor"
    assert session.executed == []


@pytest.mark.asyncio
async def test_sem_sessao_e_menor() -> None:
    assert await decidir_rota(None, [ADULTO]) == "menor"


@pytest.mark.asyncio
async def test_contagem_divergente_ou_linha_ausente_e_menor() -> None:
    class _Divergente(_IdadeSession):
        async def execute(self, stmt, params=None):
            return _Result({"nao_adultos": 0, "total": 0})

    class _SemLinha(_IdadeSession):
        async def execute(self, stmt, params=None):
            return _Result(None)

    assert await decidir_rota(_Divergente(), [ADULTO]) == "menor"
    assert await decidir_rota(_SemLinha(), [ADULTO]) == "menor"


@pytest.mark.asyncio
async def test_turma_com_um_menor_fica_inteira_sem_ia() -> None:
    session = _IdadeSession(menores={MENOR})
    async with rota_ia_para_turma(session, [ADULTO, MENOR]) as rota:
        assert rota == "menor" and rota_de_menor_ativa()
    async with rota_ia_para_turma(session, [ADULTO]) as rota:
        assert rota == "padrao" and not rota_de_menor_ativa()
    async with rota_ia_para_turma(session, []) as rota:
        assert rota == "padrao"
    assert rota_atual() == "padrao"


@pytest.mark.asyncio
async def test_material_base_sem_dono_segue_padrao_e_com_dono_decide() -> None:
    session = _IdadeSession(menores={MENOR})
    async with rota_ia_se_tiver_aluno(session, None) as rota:
        assert rota == "padrao"
    async with rota_ia_se_tiver_aluno(session, MENOR) as rota:
        assert rota == "menor"


def test_rota_de_menor_nunca_e_rebaixada() -> None:
    with usar_rota("menor"):
        with usar_rota("padrao") as interna:
            assert interna == "menor"
            assert rota_de_menor_ativa()
    assert not rota_de_menor_ativa()


@pytest.mark.asyncio
async def test_rota_propaga_para_tasks_asyncio() -> None:
    async def _ver() -> bool:
        await asyncio.sleep(0)
        return rota_de_menor_ativa()

    async with rota_ia_para_alunos(_IdadeSession(menores={MENOR}), [MENOR]):
        assert await asyncio.create_task(_ver()) is True
    assert await asyncio.create_task(_ver()) is False


def test_bloqueio_direto_do_gemini_na_rota_de_menor() -> None:
    roteamento_ia.bloquear_gemini_na_rota_de_menor("teste")  # padrao: nada acontece
    with usar_rota("menor"):
        with pytest.raises(IAIndisponivelParaMenor) as exc:
            roteamento_ia.bloquear_gemini_na_rota_de_menor("teste")
        assert exc.value.mensagem == MENSAGEM_IA_INDISPONIVEL
    assert not hasattr(roteamento_ia, "provedor_efetivo")


def test_mensagem_diz_que_a_ia_e_so_para_maiores() -> None:
    assert "maiores de 18" in MENSAGEM_IA_INDISPONIVEL
    assert "data de nascimento" in MENSAGEM_IA_INDISPONIVEL


# ---------------------------------------------------------------- JsonLLMService


class _Saida(BaseModel):
    ok: bool


class _ClienteProibido:
    """Nenhum cliente de modelo pode nascer na rota de menor."""

    instancias = 0

    def __init__(self, **_kwargs: Any) -> None:
        _ClienteProibido.instancias += 1
        raise AssertionError("cliente de modelo criado na rota de menor")


@pytest.fixture
def fakes_llm(monkeypatch):
    _ClienteProibido.instancias = 0
    monkeypatch.setattr(llm_module, "ChatOpenAI", _ClienteProibido)
    monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", _ClienteProibido)
    llm_module.reset_gemini_llm_circuit()
    yield
    llm_module.reset_gemini_llm_circuit()


@pytest.mark.asyncio
async def test_menor_structured_nao_chama_modelo_nenhum(fakes_llm, monkeypatch) -> None:
    """Com as duas chaves configuradas, nada sai: nem Gemini, nem OpenAI."""
    service = JsonLLMService(_settings(gemini_api_key="g-key", openai_api_key="o-key", llm_provider="gemini"))
    gemini = AsyncMock(side_effect=AssertionError("gemini chamado"))
    monkeypatch.setattr(service, "_ainvoke_gemini_with_rotation", gemini)
    with usar_rota("menor"):
        with pytest.raises(MenorSemOpenAIError) as exc:
            await service.ainvoke_structured(
                prompt_name="insights_turma.txt", payload={}, schema=_Saida, provider="openai"
            )
    # Quem ja trata StructuredOutputError cai no fallback local; quem nao trata vira 503 amigavel.
    assert isinstance(exc.value, StructuredOutputError)
    assert isinstance(exc.value, IAIndisponivelParaMenor)
    assert exc.value.mensagem == MENSAGEM_IA_INDISPONIVEL
    gemini.assert_not_awaited()
    assert _ClienteProibido.instancias == 0


@pytest.mark.asyncio
async def test_menor_json_cai_no_fallback_local_sem_chamar_modelo(fakes_llm, monkeypatch) -> None:
    service = JsonLLMService(_settings(gemini_api_key="g-key", openai_api_key="o-key"))
    gemini = AsyncMock(side_effect=AssertionError("gemini chamado"))
    monkeypatch.setattr(service, "_ainvoke_gemini_with_rotation", gemini)
    with usar_rota("menor"):
        out = await service.ainvoke_json(
            prompt_name="insights_turma.txt", payload={}, fallback_factory=lambda: {"fb": 1}, provider="openai"
        )
    assert out == {"fb": 1}
    gemini.assert_not_awaited()
    assert _ClienteProibido.instancias == 0


@pytest.mark.asyncio
async def test_menor_com_rag_nao_faz_a_busca(fakes_llm, monkeypatch) -> None:
    """A busca do RAG tambem e chamada a modelo e leva a pergunta do aluno."""
    from app.services import openai_rag

    rag = AsyncMock(side_effect=AssertionError("RAG chamado na rota de menor"))
    monkeypatch.setattr(openai_rag.OpenAIRagService, "invoke_structured", rag)
    service = JsonLLMService(_settings(gemini_api_key="g-key", openai_api_key="o-key"))
    with usar_rota("menor"):
        with pytest.raises(MenorSemOpenAIError):
            await service.ainvoke_structured(
                prompt_name="mentor_personalizacao_chat.txt", payload={}, schema=_Saida, use_rag=True
            )
    rag.assert_not_awaited()


@pytest.mark.asyncio
async def test_adulto_continua_no_gemini(fakes_llm, monkeypatch) -> None:
    service = JsonLLMService(_settings(gemini_api_key="g-key", openai_api_key="o-key", llm_provider="gemini"))
    gemini = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(service, "_ainvoke_gemini_with_rotation", gemini)
    with usar_rota("padrao"):
        saida = await service.ainvoke_structured(prompt_name="insights_turma.txt", payload={}, schema=_Saida)
    assert saida.ok is True
    gemini.assert_awaited_once()
    assert _ClienteProibido.instancias == 0


# ---------------------------------------------------------------- fluxos


@pytest.mark.asyncio
async def test_run_analysis_abre_a_rota_pela_idade_do_aluno(monkeypatch) -> None:
    from app.services import analysis_runner

    vistas: list[bool] = []

    async def _fake(**kwargs):
        vistas.append(rota_de_menor_ativa())
        return "ok"

    monkeypatch.setattr(analysis_runner, "_run_analysis_na_rota", _fake)
    session = _IdadeSession(menores={MENOR})
    assert await analysis_runner.run_analysis(request=None, session=session, aluno_id=MENOR) == "ok"
    assert await analysis_runner.run_analysis(request=None, session=session, aluno_id=ADULTO) == "ok"
    assert vistas == [True, False]


@pytest.mark.asyncio
async def test_insights_turma_com_menor_abre_a_rota_sem_ia(monkeypatch) -> None:
    from app.services.insights_turma import InsightsTurmaService

    vistas: list[bool] = []
    llm = AsyncMock()

    async def _llm(**_kwargs):
        vistas.append(rota_de_menor_ativa())
        raise StructuredOutputError("parar aqui")

    llm.ainvoke_structured.side_effect = _llm
    session = _IdadeSession(menores={MENOR})
    service = InsightsTurmaService(session, llm)
    monkeypatch.setattr(service, "coletar_contexto", AsyncMock(return_value=({}, {"A1": ADULTO, "A2": MENOR}, {"A1": None, "A2": None})))
    assert await service.gerar(7) == ("falhou", 0)
    monkeypatch.setattr(service, "coletar_contexto", AsyncMock(return_value=({}, {"A1": ADULTO}, {"A1": None})))
    assert await service.gerar(7) == ("falhou", 0)
    assert vistas == [True, False]


@pytest.mark.asyncio
async def test_escriba_com_menor_responde_ao_professor_e_ids_nao_vao_no_prompt(monkeypatch) -> None:
    """Decisao de 04/11/2026: a regra da #195 vale para o aluno usar a IA, nao
    para a Lumi do professor. Turma com menor nao abre a rota sem IA."""
    from app.schemas.escriba import PerguntaEscriba
    from app.services.escriba import EscribaService

    capturado: dict[str, Any] = {}
    llm = AsyncMock()

    async def _llm(**kwargs):
        capturado["menor"] = rota_de_menor_ativa()
        capturado["payload"] = kwargs["payload"]
        return SimpleNamespace(resposta="ok")

    llm.ainvoke_structured.side_effect = _llm
    service = EscribaService(_IdadeSession(menores={MENOR}), llm)
    monkeypatch.setattr(service, "turmas_do_professor", AsyncMock(return_value=[{"id": 7, "descricao": "T"}]))
    monkeypatch.setattr(
        service,
        "contexto_da_turma",
        AsyncMock(return_value={"turma": "T", "alunos": [], "_aluno_ids": [ADULTO, MENOR]}),
    )
    resposta = await service.perguntar("prof", PerguntaEscriba(pergunta="como vai a turma?"))
    assert resposta.resposta == "ok"
    assert capturado["menor"] is False
    assert "_aluno_ids" not in capturado["payload"]["turmas"][0]


# ---------------------------------------------------------------- guardas Gemini/microservice


class _HttpProibido:
    def __init__(self, *a, **k) -> None:
        raise AssertionError("nenhuma chamada HTTP na rota de menor")


@pytest.mark.asyncio
async def test_microservice_e_imagem_gemini_bloqueados_para_menor(monkeypatch) -> None:
    from app.services import media_agents

    monkeypatch.setattr(media_agents.httpx, "AsyncClient", _HttpProibido)
    settings = _settings(gemini_api_key="g-key", brainhex_api_url="http://brainhex.local")
    erros: list[str] = []
    with usar_rota("menor"):
        assert (
            await media_agents.disparar_brainhex_async(
                settings=settings, perfil="seeker", fontes=[], personalizacao_id=1, error_sink=erros
            )
            is False
        )
        assert await media_agents.gerar_imagem_slide(settings=settings, prompt="um gato") is None
    assert erros == [media_agents.MENSAGEM_MICROSERVICE_MENOR]


@pytest.mark.asyncio
async def test_tts_de_menor_fica_sem_audio_e_sem_chamada(monkeypatch) -> None:
    """Nem Gemini TTS, nem gTTS, nem OpenAI: menor fica sem audio gerado."""
    from app.services import audio, gemini_http, media_agents

    def _gtts_proibido(**_kwargs: Any) -> bytes:
        raise AssertionError("gTTS chamado")

    monkeypatch.setattr(media_agents, "gerar_mp3_gtts", _gtts_proibido)
    monkeypatch.setattr(media_agents.httpx, "AsyncClient", _HttpProibido)
    monkeypatch.setattr(gemini_http.httpx, "AsyncClient", _HttpProibido)
    settings = _settings(gemini_api_key="g-key", openai_api_key="o-key")
    with usar_rota("menor"):
        assert await media_agents.gerar_audio_gemini_tts(settings=settings, texto="ola", voz="Kore") is None
        assert await audio.gerar_mp3_gemini_tts(settings=settings, texto="ola") is None
    assert not hasattr(audio, "gerar_mp3_openai_tts")


@pytest.mark.asyncio
async def test_enriquecimento_de_menor_nao_chama_modelo_nenhum(monkeypatch) -> None:
    from app.services import content_enrichment

    gemini = AsyncMock(side_effect=AssertionError("gemini chamado"))
    openai = AsyncMock(side_effect=AssertionError("openai chamada"))
    monkeypatch.setattr(content_enrichment, "_enrich_base_blocks_with_gemini", gemini)
    monkeypatch.setattr(content_enrichment, "_enrich_base_blocks_with_openai", openai)
    with usar_rota("menor"):
        with pytest.raises(content_enrichment.ContentEnrichmentError, match="maiores de 18"):
            await content_enrichment.enrich_base_blocks(
                base_blocks=[{"texto": "x"}],
                topic={},
                source_hash="h",
                settings=_settings(gemini_api_key="g-key", openai_api_key="o-key"),
            )
    gemini.assert_not_awaited()
    openai.assert_not_awaited()


# ---------------------------------------------------------------- wiring


def test_erro_de_ia_para_menor_vira_503_amigavel() -> None:
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app(_settings())

    @app.get("/__teste_menor")
    async def _boom():
        raise MenorSemOpenAIError("ia so para maiores")

    resposta = TestClient(app).get("/__teste_menor")
    assert resposta.status_code == 503
    assert resposta.json() == {"detail": {"codigo": "ia_indisponivel", "mensagem": MENSAGEM_IA_INDISPONIVEL}}


def test_fluxos_de_aluno_abrem_a_rota() -> None:
    """Endpoints/jobs que mandam dado de aluno para a IA abrem a rota."""
    from app.api.v1 import emocoes, personalizacao
    from app.services import media_generation_jobs, personalizacao_jobs

    fonte_pers = inspect.getsource(personalizacao)
    assert "async with rota_ia_para_alunos(session, [aluno_id]):" in fonte_pers
    assert fonte_pers.count('rota_ia_se_tiver_aluno(session, record.get("aluno_id"))') >= 2
    assert "with usar_rota(rota):" in inspect.getsource(emocoes)
    assert "rota_ia_se_tiver_aluno(session, target.get(\"aluno_id\"))" in inspect.getsource(
        personalizacao_jobs._process_media_render_target_na_rota_de_ia
    )
    assert "rota_ia_para_alunos(" in inspect.getsource(media_generation_jobs)


@pytest.mark.asyncio
async def test_escriba_com_menor_mantem_nome_fora_do_prompt(monkeypatch) -> None:
    """#618 continua valendo com menor na turma: o nome nao vai ao modelo. A rota
    sem IA da #195 nao se aplica a Lumi do professor (decisao de 04/11/2026)."""
    import json

    from app.schemas.escriba import PerguntaEscriba
    from app.services.escriba import EscribaService

    capturado: dict[str, Any] = {}
    llm = AsyncMock()

    async def _llm(**kwargs):
        capturado["menor"] = rota_de_menor_ativa()
        capturado["payload"] = json.dumps(kwargs["payload"], ensure_ascii=False)
        return SimpleNamespace(resposta="A1 precisa de apoio")

    llm.ainvoke_structured.side_effect = _llm
    service = EscribaService(_IdadeSession(menores={MENOR}), llm)
    monkeypatch.setattr(service, "turmas_do_professor", AsyncMock(return_value=[{"id": 7, "descricao": "T"}]))
    monkeypatch.setattr(
        service,
        "contexto_da_turma",
        AsyncMock(
            return_value={
                "turma": "T",
                "alunos": [{"ref": "A1", "nome": "Ana Souza", "email": "ana@x.invalid"}],
                "_nomes_por_ref": {"A1": "Ana Souza"},
                "_aluno_ids": [MENOR],
            }
        ),
    )
    resposta = await service.perguntar("prof", PerguntaEscriba(pergunta="Como está a Ana Souza?"))
    assert capturado["menor"] is False
    for proibido in ("Ana", "Souza", "ana@x.invalid", MENOR, "_aluno_ids", "_nomes_por_ref"):
        assert proibido not in capturado["payload"]
    # A ref volta como nome (primeiro nome, regra do #618) so na resposta ao professor.
    assert resposta.resposta.startswith("Ana") and "A1" not in resposta.resposta


@pytest.mark.asyncio
async def test_regra_vale_sempre_sem_variavel_de_ambiente(monkeypatch: pytest.MonkeyPatch) -> None:
    """A #886 tinha desligado a rota por padrao (`IA_ROTA_DE_MENOR_ATIVA`), o que
    levava menor ao Gemini. A variavel saiu: mesmo definida como false no
    ambiente, ela e ignorada e menor continua na rota de menor."""
    monkeypatch.setenv("IA_ROTA_DE_MENOR_ATIVA", "false")
    settings = Settings(supabase_jwt_secret="x")
    assert not hasattr(settings, "ia_rota_de_menor_ativa")
    assert not hasattr(roteamento_ia, "rota_de_menor_ligada")
    session = _IdadeSession(menores={MENOR})
    assert await decidir_rota(session, [MENOR]) == "menor"
    assert await decidir_rota(session, [None]) == "menor"
    assert await decidir_rota(None, [MENOR]) == "menor"
    assert await decidir_rota(session, [ADULTO]) == "padrao"
