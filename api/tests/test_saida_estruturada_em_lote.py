"""Geração em lote com schema nativo: plano, cards e tema do mapa."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from typing import Any, get_args

import pytest

from app.core.settings import Settings
from app.schemas.geracao_estruturada import (
    CardsGerados,
    FormatoDoPlano,
    PaletaDoMapa,
    PlanoGerado,
    TemaDoMapaGerado,
)
from app.services import classe_mapa_tema, personalizacao
from app.services import llm as llm_module
from app.services.llm import JsonLLMService


def _settings() -> Settings:
    return Settings(
        supabase_jwt_secret="x", admin_panel_password="x", cors_allow_origins=["https://a"],
        llm_provider="gemini", gemini_api_key="chave", openai_api_key="",
    )


class _Cliente:
    """`estruturado` é o que sai com schema; `livre`, o texto do caminho sem schema."""

    def __init__(self, estruturado: Any, livre: str = "{}") -> None:
        self.estruturado, self.livre = estruturado, livre
        self.schemas: list[dict] = []
        self.chamadas_livres = 0

    def with_structured_output(self, schema: dict) -> Any:
        self.schemas.append(schema)

        async def ainvoke(_mensagens: Any) -> Any:
            if isinstance(self.estruturado, Exception):
                raise self.estruturado
            return self.estruturado

        return SimpleNamespace(ainvoke=ainvoke)

    async def ainvoke(self, _mensagens: Any) -> Any:
        self.chamadas_livres += 1
        return SimpleNamespace(content=self.livre)


@pytest.fixture
def servico(monkeypatch: pytest.MonkeyPatch):
    llm_module.reset_gemini_llm_circuit()
    monkeypatch.setattr(llm_module, "load_prompt", lambda _nome: "instrucoes")

    def montar(cliente: _Cliente) -> JsonLLMService:
        monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", lambda **_opcoes: cliente)
        return JsonLLMService(_settings())

    return montar


_CARDS = {"cards": [{"frente": "f", "verso": "v", "icone": "i", "dificuldade": "facil", "xp": 10}]}


def _gerar(servico: JsonLLMService, **extras: Any) -> dict:
    return asyncio.run(
        servico.ainvoke_json(prompt_name="x.txt", payload={}, schema=CardsGerados, fallback_factory=lambda: {"f": 1}, **extras)
    )


def test_com_schema_a_saida_vem_restrita_pelo_provedor(servico) -> None:
    cliente = _Cliente(_CARDS)

    assert _gerar(servico(cliente)) == _CARDS
    assert cliente.schemas == [CardsGerados.model_json_schema()]
    assert cliente.chamadas_livres == 0


def test_schema_recusado_volta_ao_json_livre(servico) -> None:
    cliente = _Cliente(RuntimeError("Error calling model 'm' (INVALID_ARGUMENT): 400"), livre=json.dumps(_CARDS))

    assert _gerar(servico(cliente)) == _CARDS
    assert cliente.chamadas_livres == 1


def test_provedor_fora_do_ar_vai_ao_fallback_sem_chamar_de_novo(servico) -> None:
    cliente = _Cliente(RuntimeError("deu ruim"))

    assert _gerar(servico(cliente)) == {"f": 1}
    assert cliente.chamadas_livres == 0


def test_saida_fora_do_schema_vai_ao_fallback(servico) -> None:
    cliente = _Cliente({"cards": [{"frente": "sem o resto"}]})

    assert _gerar(servico(cliente)) == {"f": 1}
    assert cliente.chamadas_livres == 0


def test_campo_nulo_some_do_dicionario(servico) -> None:
    # `result.get("formatos", padrao)` só cai no padrão se a chave faltar; com None quebraria.
    from pydantic import BaseModel

    class Parcial(BaseModel):
        texto: str
        opcional: str | None = None

    saida = asyncio.run(servico(_Cliente({"texto": "a"})).ainvoke_json(prompt_name="x.txt", payload={}, schema=Parcial))

    assert saida == {"texto": "a"}


def test_formatos_do_schema_sao_os_que_o_pipeline_gera() -> None:
    assert set(get_args(FormatoDoPlano)) == personalizacao._ALL_FORMATOS


def test_prompt_do_plano_so_oferece_formato_que_existe() -> None:
    prompt = llm_module.load_prompt("planejador_conteudo.txt")

    for formato in ("pdf", "documento", "imagem", "quiz", "video"):
        assert formato not in prompt


def test_paleta_do_schema_e_a_do_mapa() -> None:
    assert set(PaletaDoMapa.model_fields) == set(classe_mapa_tema._DEFAULT_PALETTE)


@pytest.mark.parametrize("schema", [PlanoGerado, CardsGerados, TemaDoMapaGerado])
def test_schema_nao_tem_chave_dinamica(schema) -> None:
    # Sem propriedade nomeada, nada obriga o modelo a preencher: viria vazio e iria ao fallback calado.
    assert "additionalProperties" not in json.dumps(schema.model_json_schema())


@pytest.mark.parametrize("schema", [PlanoGerado, CardsGerados, TemaDoMapaGerado])
def test_todo_campo_e_obrigatorio_no_schema(schema) -> None:
    # Chave fora de "required" o modelo pode omitir (#761).
    gerado = schema.model_json_schema()
    for definicao in [gerado, *gerado.get("$defs", {}).values()]:
        assert set(definicao["required"]) == set(definicao["properties"])


def test_paises_em_lista_viram_mapa_por_topico() -> None:
    contexto = {"classe_id": 1, "topicos": [{"id": 7, "nome": "Frações"}, {"id": 8, "nome": "Razões"}]}
    pais = {"nodeId": "7", "topicId": 7, "topicTitle": "Frações", "countryName": "Terra das Partes",
            "capitalName": "Meia", "lore": "Tudo se divide.", "emblem": "e", "biome": "b"}

    tema = classe_mapa_tema._normalize_theme({"world_name": "Mundo", "countries": [pais]}, contexto)

    assert tema["countries"]["7"]["countryName"] == "Terra das Partes"
    assert tema["countries"]["8"]["countryName"] == "Reino de Razões"
