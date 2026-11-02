"""Arco narrativo da turma na geração (#145): hash, contexto, disparo e prompts."""

from __future__ import annotations

import inspect
import re
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agent.graph.state import TrailUpState
from app.core.settings import Settings
from app.services import personalizacao as personalizacao_service
from app.services import personalizacao_jobs as jobs_module
from app.services import state_builder
from app.services.media_agents import disparar_brainhex_async, gerar_capitulo_bloco_brainhex
from app.services.media_contract import (
    CONTENT_ENRICHMENT_PROVIDER,
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    PRESENTATION_ENGINE_VERSION,
)

ARCO = "A turma é a tripulação da nave Aurora, que precisa religar os sistemas da estação Vega."
PROMPTS = Path(personalizacao_service.__file__).resolve().parents[1] / "agent" / "prompts"
BASE_DO_HASH: dict[str, Any] = {
    "classe_id": 32,
    "topico_id": 117,
    "conteudo_id": None,
    "materiais_origem": [{"source_id": "fonte:1", "texto_base": "Redes"}],
}


# --------------------------------------------------------------------------- source_hash


def test_sem_arco_o_hash_e_o_mesmo_de_antes() -> None:
    # Turma sem arco não pode ter o material invalidado pelo deploy desta mudança.
    antes = personalizacao_service._build_source_hash(**BASE_DO_HASH)
    for vazio in (None, "", "   \n"):
        assert personalizacao_service._build_source_hash(**BASE_DO_HASH, arco_narrativo=vazio) == antes


def test_editar_o_arco_muda_o_hash() -> None:
    sem = personalizacao_service._build_source_hash(**BASE_DO_HASH)
    com = personalizacao_service._build_source_hash(**BASE_DO_HASH, arco_narrativo=ARCO)
    outro = personalizacao_service._build_source_hash(**BASE_DO_HASH, arco_narrativo=ARCO + " Agora em Marte.")
    assert len({sem, com, outro}) == 3
    # Espaço nas pontas não é edição (o gatilho do banco também não enfileira por isso).
    assert personalizacao_service._build_source_hash(**BASE_DO_HASH, arco_narrativo=f"  {ARCO}\n") == com


def test_normalizar_corta_no_teto_do_banco() -> None:
    teto = personalizacao_service.ARCO_NARRATIVO_MAX_CHARS
    assert teto == 3000
    assert personalizacao_service.normalizar_arco_narrativo("x" * (teto + 10)) == "x" * teto
    assert personalizacao_service.normalizar_arco_narrativo("  ") is None


# --------------------------------------------------------------------------- contexto


@pytest.mark.asyncio
async def test_contexto_le_o_arco_e_o_poe_no_hash(monkeypatch) -> None:
    repo = "app.repositories.conteudo_classe.ConteudoClasseRepository"
    monkeypatch.setattr("app.repositories.context.ContextRepository.fetch_aluno_context", AsyncMock())
    monkeypatch.setattr(
        "app.repositories.context.ContextRepository.resolve_conteudo_foco_id", AsyncMock(return_value=125)
    )
    fontes = "app.repositories.fontes_personalizacao.FontesPersonalizacaoRepository"
    monkeypatch.setattr(f"{fontes}.seed_from_class_content", AsyncMock(return_value={"total": 0}))
    monkeypatch.setattr(f"{fontes}.listar_para_contexto", AsyncMock(return_value=[]))
    monkeypatch.setattr(f"{repo}.buscar_topico", AsyncMock(return_value={"id": 117, "nome": "Redes"}))
    monkeypatch.setattr(f"{repo}.buscar_conteudos_topico", AsyncMock(return_value=[]))
    monkeypatch.setattr(f"{repo}.buscar_atividades_topico", AsyncMock(return_value=[]))
    monkeypatch.setattr(f"{repo}.buscar_questoes_topico", AsyncMock(return_value=[]))
    monkeypatch.setattr(f"{repo}.buscar_cards_topico", AsyncMock(return_value=[]))
    arco = AsyncMock(return_value=f"  {ARCO} ")
    monkeypatch.setattr(f"{repo}.buscar_arco_narrativo", arco)
    monkeypatch.setattr(personalizacao_service, "_hydrate_source_materials_content", AsyncMock(return_value=[]))
    monkeypatch.setattr(personalizacao_service, "_persist_hydrated_sources_into_fontes", AsyncMock())

    ctx = await personalizacao_service.fetch_personalizacao_context(
        aluno_id=None,
        classe_id=32,
        topico_id=117,
        conteudo_id=None,
        settings=Settings(openai_api_key=None, gemini_api_key=None, supabase_url=None),
        session=object(),
        include_student_sources=False,
    )

    arco.assert_awaited_once_with(32)
    assert ctx["arco_narrativo"] == ARCO
    assert ctx["source_hash"] == personalizacao_service._build_source_hash(
        classe_id=32, topico_id=117, conteudo_id=None, materiais_origem=[], arco_narrativo=ARCO
    )


# --------------------------------------------------------------------------- microservice


def _cliente_http(mock_client_cls) -> AsyncMock:
    contrato = {
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
        "presentation_engine_version": PRESENTATION_ENGINE_VERSION,
        "presentation_design_version": PRESENTATION_DESIGN_VERSION,
        "content_enrichment_provider": CONTENT_ENRICHMENT_PROVIDER,
    }
    saude = MagicMock(status_code=200)
    saude.json.return_value = {"status": "ok", **contrato}
    resposta = MagicMock(status_code=200, text='{"status":"completed"}')
    resposta.json.return_value = {"status": "completed", **contrato}
    cliente = AsyncMock()
    cliente.__aenter__ = AsyncMock(return_value=cliente)
    cliente.__aexit__ = AsyncMock(return_value=None)
    cliente.get = AsyncMock(return_value=saude)
    cliente.post = AsyncMock(return_value=resposta)
    mock_client_cls.return_value = cliente
    return cliente


@pytest.mark.asyncio
@pytest.mark.parametrize(("arco", "esperado"), [(ARCO, ARCO), (None, None), ("  ", None)])
async def test_disparo_manda_o_arco_como_class_story_arc(arco, esperado) -> None:
    settings = Settings()
    settings.brainhex_api_url = "http://brainhex.local"
    with patch("httpx.AsyncClient") as mock_client_cls:
        cliente = _cliente_http(mock_client_cls)
        assert await disparar_brainhex_async(
            settings=settings,
            perfil="seeker",
            fontes=[],
            content_blocks=[{"id": "bloco-01"}],
            personalizacao_id=257,
            wait_for_completion=True,
            arco_narrativo=arco,
        )
    assert cliente.post.await_args.kwargs["json"]["class_story_arc"] == esperado


@pytest.mark.asyncio
async def test_capitulo_granular_manda_o_arco() -> None:
    with patch("app.services.media_agents._regenerar_via_brainhex", AsyncMock(return_value={})) as chamada:
        await gerar_capitulo_bloco_brainhex(
            settings=Settings(), content_blocks=[{"id": "b1"}], profile="Seeker", arco_narrativo=ARCO
        )
    assert chamada.await_args.kwargs["json_payload"]["class_story_arc"] == ARCO


def test_todo_disparo_do_worker_leva_o_arco() -> None:
    fonte = inspect.getsource(jobs_module)
    chamadas = fonte.split("await disparar_brainhex_async(")[1:]
    assert len(chamadas) == 3
    for chamada in chamadas:
        # Até o `)` que fecha a chamada: todo argumento termina em vírgula.
        assert "arco_narrativo=" in chamada.split(")\n", 1)[0]
    assert "gerar_capitulo_bloco_brainhex,\n                        arco_narrativo=ctx.get(\"arco_narrativo\")" in fonte


# --------------------------------------------------------------------------- caminho Python (grafo)


def test_estado_do_grafo_declara_o_arco() -> None:
    # Chave fora do TrailUpState é descartada em silêncio na entrada do LangGraph.
    assert "arco_narrativo_turma" in TrailUpState.__annotations__


@pytest.mark.asyncio
async def test_estado_inicial_le_o_arco_e_nao_derruba_o_ciclo() -> None:
    class Repo:
        def __init__(self, resultado: Any) -> None:
            self.resultado = resultado

        async def fetch_arco_narrativo(self, *, classe_id: int | None) -> str | None:
            if isinstance(self.resultado, Exception):
                raise self.resultado
            return self.resultado

    assert await state_builder._arco_narrativo(Repo(ARCO), classe_id=32) == ARCO
    assert await state_builder._arco_narrativo(Repo(RuntimeError("caiu")), classe_id=32) is None
    assert await state_builder._arco_narrativo(object(), classe_id=32) is None
    assert "\"arco_narrativo_turma\": arco_narrativo" in inspect.getsource(state_builder.build_initial_state)


@pytest.mark.asyncio
async def test_pipeline_por_etapas_manda_o_arco_junto_da_assinatura_do_perfil(monkeypatch) -> None:
    payloads: list[dict[str, Any]] = []

    async def capturar(**kwargs: Any) -> dict[str, Any]:
        payloads.append(kwargs["context_payload"])
        return {"formato": kwargs["formato"], "etapa": kwargs["stage"], "payload": kwargs["fallback_payload"]}

    monkeypatch.setattr(personalizacao_service, "_invoke_media_stage_llm", capturar)
    state = {
        "perfil_brainhex": [{"perfil": "Seeker", "afinidade": 1.0}],
        "topico_contexto": {"nome": "Redes", "descricao": "Camadas"},
        "conteudos_topico": [{"id": 1, "titulo": "Camadas", "conteudo": "Modelo OSI"}],
        "arco_narrativo_turma": f" {ARCO} ",
    }
    await personalizacao_service._invoke_multistage_materiais_por_formato(
        settings=Settings(openai_api_key=None, gemini_api_key=None),
        state=state,
        formatos=["markdown"],
        plano={"formatos": ["markdown"]},
        perfil_dominante="Seeker",
        source_chunks=[{"texto": "Modelo OSI"}],
        fallback_payloads={"markdown": {"conteudo": "# Redes"}},
    )
    assert payloads
    for payload in payloads:
        assert payload["arco_narrativo_turma"] == ARCO
        assert payload["perfil_editorial"]["perfil_dominante"] == "Seeker"


def test_os_dois_prompts_python_explicam_o_arco() -> None:
    for nome in ("gerador_conteudo.txt", "pipeline_midia_etapas.txt"):
        texto = " ".join((PROMPTS / nome).read_text(encoding="utf-8").split())
        assert "`arco_narrativo_turma`" in texto, nome
        # O arco é moldura; a voz continua a da assinatura editorial do perfil.
        assert "o arco diz ONDE e POR QUE" in texto, nome
        assert re.search(r"ausente|vazio", texto), nome
        # Nenhum placeholder novo entre chaves: o texto não depende de formatação.
        assert "{arco" not in texto, nome
